-- Migration: Create user_credits table for credit management
-- Description: Track user credits for AI generation runs

CREATE TABLE IF NOT EXISTS user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_runs_remaining INTEGER DEFAULT 10,
  extra_credits INTEGER DEFAULT 0,
  last_plan_reset BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- RLS Policies
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

-- Users can view their own credits
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do anything (for Edge Functions and admin)
CREATE POLICY "Service role full access user_credits" ON user_credits
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- AUTO-CREATE CREDITS ON USER SIGNUP
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, plan_runs_remaining, extra_credits, created_at, updated_at)
  VALUES (NEW.id, 10, 0, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_credits();

-- ============================================================================
-- HELPER FUNCTION: Deduct credit
-- Returns true if credit was deducted, false if no credits available
-- ============================================================================

CREATE OR REPLACE FUNCTION deduct_user_credit(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_plan_remaining INTEGER;
  v_extra INTEGER;
BEGIN
  -- Get current credits with row lock
  SELECT plan_runs_remaining, extra_credits 
  INTO v_plan_remaining, v_extra
  FROM user_credits 
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  -- No record found, create one
  IF NOT FOUND THEN
    INSERT INTO user_credits (user_id, plan_runs_remaining, extra_credits, created_at, updated_at)
    VALUES (p_user_id, 9, 0, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000);
    RETURN TRUE;
  END IF;
  
  -- Try to deduct from plan first
  IF v_plan_remaining > 0 THEN
    UPDATE user_credits 
    SET plan_runs_remaining = plan_runs_remaining - 1,
        updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;
  
  -- Try extra credits
  IF v_extra > 0 THEN
    UPDATE user_credits 
    SET extra_credits = extra_credits - 1,
        updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;
  
  -- No credits available
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Check if user has credits
-- ============================================================================

CREATE OR REPLACE FUNCTION user_has_credits(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_total INTEGER;
BEGIN
  SELECT COALESCE(plan_runs_remaining, 0) + COALESCE(extra_credits, 0)
  INTO v_total
  FROM user_credits 
  WHERE user_id = p_user_id;
  
  -- If no record, they get default 10 credits
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;
  
  RETURN v_total > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Refund credit (for failed runs)
-- ============================================================================

CREATE OR REPLACE FUNCTION refund_user_credit(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE user_credits 
  SET plan_runs_remaining = plan_runs_remaining + 1,
      updated_at = EXTRACT(EPOCH FROM NOW()) * 1000
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
