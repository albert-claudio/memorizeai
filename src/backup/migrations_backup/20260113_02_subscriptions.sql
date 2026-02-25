-- Migration: Create subscriptions table for audit history
-- Description: Track subscription history and details from Stripe

-- Generate unique ID function (if not exists)
CREATE OR REPLACE FUNCTION generate_subscription_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'sub_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24);
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY DEFAULT generate_subscription_id(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  price_id TEXT,
  status TEXT NOT NULL DEFAULT 'incomplete', -- active, canceled, past_due, incomplete
  current_period_start BIGINT,
  current_period_end BIGINT,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
  updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);

-- RLS Policies
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do anything (for webhooks and admin)
CREATE POLICY "Service role full access subscriptions" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- Comment for documentation
COMMENT ON TABLE subscriptions IS 'Subscription history from Stripe for audit and reference';
