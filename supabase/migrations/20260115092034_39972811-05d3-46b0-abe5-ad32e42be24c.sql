-- Drop the old status check constraint
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

-- Add new constraint including 'pending' status
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (status = ANY (ARRAY['draft'::text, 'pending'::text, 'sent'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text]));

-- Add tax_type column to invoices for tracking tax calculation method
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_type text DEFAULT 'none' CHECK (tax_type = ANY (ARRAY['none'::text, 'inclusive'::text, 'exclusive'::text]));