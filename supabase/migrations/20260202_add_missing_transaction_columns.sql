-- Migration: Add missing columns to historical_invoice_data table
-- Purpose: Support all 51 Google Sheet columns for full sync capability

-- Add missing columns to historical_invoice_data
ALTER TABLE public.historical_invoice_data
ADD COLUMN IF NOT EXISTS month_name TEXT,
ADD COLUMN IF NOT EXISTS pick_off TEXT,
ADD COLUMN IF NOT EXISTS waybill_number TEXT,
ADD COLUMN IF NOT EXISTS total_amount NUMERIC,
ADD COLUMN IF NOT EXISTS wht_deducted NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS bank_payment_received TEXT,
ADD COLUMN IF NOT EXISTS bank_debited TEXT,
ADD COLUMN IF NOT EXISTS invoice_amount_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_owed NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS gap_in_payment INTEGER,
ADD COLUMN IF NOT EXISTS invoice_ageing INTEGER,
ADD COLUMN IF NOT EXISTS vendor_invoice_submission_date DATE,
ADD COLUMN IF NOT EXISTS invoice_age_for_interest INTEGER,
ADD COLUMN IF NOT EXISTS daily_rate NUMERIC,
ADD COLUMN IF NOT EXISTS interest_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS interest_not_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS dispatch_id UUID REFERENCES dispatches(id);

-- Add index for dispatch_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_historical_invoice_data_dispatch_id
ON public.historical_invoice_data(dispatch_id);

-- Add index for period filtering
CREATE INDEX IF NOT EXISTS idx_historical_invoice_data_period
ON public.historical_invoice_data(period_year, period_month);

-- Add index for customer filtering
CREATE INDEX IF NOT EXISTS idx_historical_invoice_data_customer
ON public.historical_invoice_data(customer_name);

-- Comment on table for documentation
COMMENT ON TABLE public.historical_invoice_data IS 'Stores all transaction data synced with Google Sheets (51 columns). Combines operator dispatch data with admin financial data.';

-- Comments on new columns
COMMENT ON COLUMN public.historical_invoice_data.month_name IS 'Full month name (e.g., January, February)';
COMMENT ON COLUMN public.historical_invoice_data.pick_off IS 'Pickup location alias';
COMMENT ON COLUMN public.historical_invoice_data.waybill_number IS 'Single waybill number (legacy compatibility)';
COMMENT ON COLUMN public.historical_invoice_data.total_amount IS 'Total transaction amount';
COMMENT ON COLUMN public.historical_invoice_data.wht_deducted IS 'Withholding tax amount deducted';
COMMENT ON COLUMN public.historical_invoice_data.bank_payment_received IS 'Bank where payment was received';
COMMENT ON COLUMN public.historical_invoice_data.bank_debited IS 'Bank that was debited for payment';
COMMENT ON COLUMN public.historical_invoice_data.invoice_amount_paid IS 'Amount paid on invoice';
COMMENT ON COLUMN public.historical_invoice_data.balance_owed IS 'Outstanding balance on invoice';
COMMENT ON COLUMN public.historical_invoice_data.gap_in_payment IS 'Days between due date and payment';
COMMENT ON COLUMN public.historical_invoice_data.invoice_ageing IS 'Days since invoice was issued';
COMMENT ON COLUMN public.historical_invoice_data.vendor_invoice_submission_date IS 'Date vendor submitted their invoice';
COMMENT ON COLUMN public.historical_invoice_data.invoice_age_for_interest IS 'Days used for interest calculation';
COMMENT ON COLUMN public.historical_invoice_data.daily_rate IS 'Daily interest rate';
COMMENT ON COLUMN public.historical_invoice_data.interest_paid IS 'Interest amount already paid';
COMMENT ON COLUMN public.historical_invoice_data.interest_not_paid IS 'Interest amount still owed';
COMMENT ON COLUMN public.historical_invoice_data.dispatch_id IS 'Link to original dispatch record';
