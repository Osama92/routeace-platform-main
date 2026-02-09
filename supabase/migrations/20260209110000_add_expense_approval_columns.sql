-- Add two-tier approval workflow columns to expenses table
-- Mirrors the invoice approval pattern exactly

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft'
    CHECK (approval_status IN ('draft','pending_first_approval','pending_second_approval','approved','rejected')),
  ADD COLUMN IF NOT EXISTS first_approver_id UUID,
  ADD COLUMN IF NOT EXISTS first_approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS second_approver_id UUID,
  ADD COLUMN IF NOT EXISTS second_approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS submitted_by UUID;

CREATE INDEX IF NOT EXISTS idx_expenses_approval_status ON public.expenses(approval_status);

-- Existing expenses become 'approved' so they remain syncable to Zoho
UPDATE public.expenses SET approval_status = 'approved' WHERE approval_status IS NULL OR approval_status = 'draft';
