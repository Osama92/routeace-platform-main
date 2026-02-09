-- ============================================
-- Invoice Approval Roles Migration
-- ============================================
-- This migration adds a table for managing which users
-- can perform first level and second level invoice approvals
-- ============================================

-- Create approval_roles table to assign users to approval levels
CREATE TABLE IF NOT EXISTS public.approval_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  approval_level TEXT NOT NULL CHECK (approval_level IN ('first_level', 'second_level')),
  assigned_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, approval_level)
);

-- Add comment for documentation
COMMENT ON TABLE public.approval_roles IS 'Tracks which users are authorized to perform first or second level invoice approvals';
COMMENT ON COLUMN public.approval_roles.approval_level IS 'first_level = can do first approval, second_level = can do final approval';

-- Enable RLS
ALTER TABLE public.approval_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for approval_roles
-- Everyone can view approval roles (for UI display)
CREATE POLICY "Authenticated users can view approval roles"
  ON public.approval_roles FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage approval roles
CREATE POLICY "Admins can manage approval roles"
  ON public.approval_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX idx_approval_roles_user_id ON public.approval_roles(user_id);
CREATE INDEX idx_approval_roles_level ON public.approval_roles(approval_level);

-- Add trigger for updated_at
CREATE TRIGGER approval_roles_updated_at
  BEFORE UPDATE ON public.approval_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
