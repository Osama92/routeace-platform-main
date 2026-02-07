-- Add status column and additional fields to customers table
-- Status allows marking customers as active/inactive

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS tin_number TEXT,
ADD COLUMN IF NOT EXISTS head_office_address TEXT,
ADD COLUMN IF NOT EXISTS head_office_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS head_office_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS factory_address TEXT,
ADD COLUMN IF NOT EXISTS factory_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS factory_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS email_delivery_updates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_invoice_reminders BOOLEAN DEFAULT true;

-- Update any existing customers without status to be active
UPDATE public.customers SET status = 'active' WHERE status IS NULL;

-- Add unique constraint on company_name if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_company_name_key'
  ) THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_company_name_key UNIQUE (company_name);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);
