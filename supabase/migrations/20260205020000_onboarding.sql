-- Add onboarding tracking columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tour_progress JSONB DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN profiles.onboarding_completed IS 'Whether the user has completed the product tour';
COMMENT ON COLUMN profiles.onboarding_completed_at IS 'Timestamp when the user completed the product tour';
COMMENT ON COLUMN profiles.onboarding_skipped IS 'Whether the user skipped the product tour';
COMMENT ON COLUMN profiles.tour_progress IS 'JSON object tracking which tour sections have been completed';
