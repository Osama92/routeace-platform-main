-- Add head_office_address and factory_address columns to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS head_office_address text,
ADD COLUMN IF NOT EXISTS head_office_lat numeric,
ADD COLUMN IF NOT EXISTS head_office_lng numeric,
ADD COLUMN IF NOT EXISTS factory_address text,
ADD COLUMN IF NOT EXISTS factory_lat numeric,
ADD COLUMN IF NOT EXISTS factory_lng numeric;