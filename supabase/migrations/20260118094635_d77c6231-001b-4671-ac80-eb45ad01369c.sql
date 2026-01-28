-- Add approval status columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' 
  CHECK (approval_status IN ('pending', 'approved', 'suspended', 'rejected')),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS approved_by UUID,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS suspended_by UUID,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;

-- Create user access log table for audit trail
CREATE TABLE IF NOT EXISTS public.user_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'suspended', 'reactivated', 'role_assigned', 'role_removed')),
  performed_by UUID NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  previous_role TEXT,
  new_role TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on user_access_log
ALTER TABLE public.user_access_log ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all access logs
CREATE POLICY "Admins can view all access logs"
ON public.user_access_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Admins can insert access logs
CREATE POLICY "Admins can insert access logs"
ON public.user_access_log
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update profiles RLS to allow admins to update approval fields
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile basic fields"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Admins can update any profile (including approval status)
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_approval_status ON public.profiles(approval_status);
CREATE INDEX IF NOT EXISTS idx_user_access_log_user_id ON public.user_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_log_created_at ON public.user_access_log(created_at DESC);