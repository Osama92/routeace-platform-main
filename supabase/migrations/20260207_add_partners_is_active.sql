-- Add is_active column to partners table for activate/deactivate functionality
ALTER TABLE public.partners
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Update any existing partners to be active by default
UPDATE public.partners SET is_active = true WHERE is_active IS NULL;
