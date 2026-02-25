-- Migration: Add Stripe fields to profiles table
-- Description: Fields for Stripe customer and subscription tracking

-- Add Stripe fields if they don't exist
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription_period_end BIGINT;

-- Index for webhook lookup by customer_id
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);

-- Comment for documentation
COMMENT ON COLUMN profiles.subscription_status IS 'free, active, canceled, past_due, incomplete';
COMMENT ON COLUMN profiles.subscription_tier IS 'free, pro, enterprise';
