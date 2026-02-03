-- Complete Google Sheets Integration - Add all 50+ fields for full coverage
-- This migration adds missing fields to support the complete Google Sheets header set

-- ============================================
-- PART 1: Historical Invoice Data - Add Missing Fields
-- ============================================
ALTER TABLE public.historical_invoice_data
ADD COLUMN IF NOT EXISTS month_name TEXT,
ADD COLUMN IF NOT EXISTS pick_off TEXT,
ADD COLUMN IF NOT EXISTS wht_deducted NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS bank_payment_received_date DATE,
ADD COLUMN IF NOT EXISTS bank_debited_date DATE,
ADD COLUMN IF NOT EXISTS invoice_amount_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS balance_owed NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS gap_in_payment INTEGER,
ADD COLUMN IF NOT EXISTS invoice_ageing INTEGER,
ADD COLUMN IF NOT EXISTS vendor_invoice_submission_date DATE,
ADD COLUMN IF NOT EXISTS invoice_age_for_interest INTEGER,
ADD COLUMN IF NOT EXISTS daily_rate NUMERIC,
ADD COLUMN IF NOT EXISTS interest_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS interest_not_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS bank_payment_received TEXT,
ADD COLUMN IF NOT EXISTS bank_debited TEXT;

-- ============================================
-- PART 2: Invoices Table - Add Financial Tracking Fields
-- ============================================
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS amount_vatable NUMERIC,
ADD COLUMN IF NOT EXISTS amount_not_vatable NUMERIC,
ADD COLUMN IF NOT EXISTS wht_deducted NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS wht_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS vendor_bill_number TEXT,
ADD COLUMN IF NOT EXISTS vendor_invoice_status TEXT,
ADD COLUMN IF NOT EXISTS customer_payment_status TEXT DEFAULT 'unpaid',
ADD COLUMN IF NOT EXISTS bank_payment_received_date DATE,
ADD COLUMN IF NOT EXISTS bank_debited_date DATE,
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS vendor_invoice_submission_date DATE,
ADD COLUMN IF NOT EXISTS interest_rate_daily NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS interest_paid NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS interest_unpaid NUMERIC DEFAULT 0;

-- ============================================
-- PART 3: Dispatches Table - Add Vendor & Delivery Fields
-- ============================================
ALTER TABLE public.dispatches
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.partners(id),
ADD COLUMN IF NOT EXISTS tonnage TEXT,
ADD COLUMN IF NOT EXISTS tonnage_loaded NUMERIC,
ADD COLUMN IF NOT EXISTS route_cluster TEXT,
ADD COLUMN IF NOT EXISTS waybill_number TEXT,
ADD COLUMN IF NOT EXISTS num_deliveries INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS extra_dropoffs INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_dropoff_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS vendor_cost NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS amount_vatable NUMERIC,
ADD COLUMN IF NOT EXISTS amount_not_vatable NUMERIC;

-- ============================================
-- PART 4: Indexes for Performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_historical_invoice_number ON public.historical_invoice_data(invoice_number);
CREATE INDEX IF NOT EXISTS idx_historical_transaction_date ON public.historical_invoice_data(transaction_date);
CREATE INDEX IF NOT EXISTS idx_historical_invoice_status ON public.historical_invoice_data(invoice_status);
CREATE INDEX IF NOT EXISTS idx_historical_customer_payment ON public.historical_invoice_data(customer_payment_status);

CREATE INDEX IF NOT EXISTS idx_invoices_wht_status ON public.invoices(wht_status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_payment ON public.invoices(customer_payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor_bill ON public.invoices(vendor_bill_number);

CREATE INDEX IF NOT EXISTS idx_dispatches_vendor ON public.dispatches(vendor_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_waybill ON public.dispatches(waybill_number);

-- ============================================
-- PART 5: Function to Auto-Sync Dispatch to Historical Data
-- ============================================
CREATE OR REPLACE FUNCTION public.sync_dispatch_to_historical()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_name TEXT;
  v_vendor_name TEXT;
  v_driver_name TEXT;
  v_truck_number TEXT;
  v_month_num INTEGER;
  v_year_num INTEGER;
  v_week_num INTEGER;
BEGIN
  -- Only sync when dispatch is completed (delivered)
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    -- Get related data
    SELECT company_name INTO v_customer_name FROM public.customers WHERE id = NEW.customer_id;
    SELECT company_name INTO v_vendor_name FROM public.partners WHERE id = NEW.vendor_id;
    SELECT full_name INTO v_driver_name FROM public.drivers WHERE id = NEW.driver_id;
    SELECT registration_number INTO v_truck_number FROM public.vehicles WHERE id = NEW.vehicle_id;

    -- Calculate period values
    v_month_num := EXTRACT(MONTH FROM COALESCE(NEW.actual_delivery, NEW.scheduled_delivery, now()));
    v_year_num := EXTRACT(YEAR FROM COALESCE(NEW.actual_delivery, NEW.scheduled_delivery, now()));
    v_week_num := EXTRACT(WEEK FROM COALESCE(NEW.actual_delivery, NEW.scheduled_delivery, now()));

    -- Insert into historical data
    INSERT INTO public.historical_invoice_data (
      customer_id,
      customer_name,
      vendor_id,
      vendor_name,
      period_year,
      period_month,
      month_name,
      week_num,
      transaction_type,
      transaction_date,
      pick_off,
      drop_point,
      route_cluster,
      km_covered,
      tonnage,
      tonnage_loaded,
      driver_name,
      truck_number,
      waybill_numbers,
      num_deliveries,
      extra_dropoffs,
      extra_dropoff_cost,
      total_vendor_cost,
      amount_vatable,
      amount_not_vatable,
      total_revenue,
      total_cost,
      vat_amount,
      sub_total,
      notes,
      source_file
    ) VALUES (
      NEW.customer_id,
      v_customer_name,
      NEW.vendor_id,
      v_vendor_name,
      v_year_num,
      v_month_num,
      TO_CHAR(TO_DATE(v_month_num::TEXT, 'MM'), 'Month'),
      v_week_num,
      'Dispatch',
      COALESCE(NEW.actual_delivery, NEW.scheduled_delivery, now())::DATE,
      NEW.pickup_address,
      NEW.delivery_address,
      NEW.route_cluster,
      NEW.distance_km,
      NEW.tonnage,
      NEW.tonnage_loaded,
      v_driver_name,
      v_truck_number,
      CASE WHEN NEW.waybill_number IS NOT NULL THEN ARRAY[NEW.waybill_number] ELSE NULL END,
      NEW.num_deliveries,
      NEW.extra_dropoffs,
      NEW.extra_dropoff_cost,
      NEW.vendor_cost,
      NEW.amount_vatable,
      NEW.amount_not_vatable,
      NEW.cost,
      NEW.vendor_cost,
      NEW.vat_amount,
      NEW.cost - COALESCE(NEW.vat_amount, 0),
      NEW.notes,
      'Platform Auto-Sync'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for auto-sync
DROP TRIGGER IF EXISTS trigger_sync_dispatch_to_historical ON public.dispatches;
CREATE TRIGGER trigger_sync_dispatch_to_historical
  AFTER UPDATE ON public.dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_dispatch_to_historical();

-- ============================================
-- PART 6: Function to Auto-Sync Invoice Updates
-- ============================================
CREATE OR REPLACE FUNCTION public.sync_invoice_to_historical()
RETURNS TRIGGER AS $$
BEGIN
  -- When invoice is paid, update corresponding historical record
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    UPDATE public.historical_invoice_data
    SET
      invoice_status = 'Paid',
      customer_payment_status = 'Paid',
      invoice_paid_date = COALESCE(NEW.paid_date, CURRENT_DATE),
      invoice_amount_paid = NEW.total_amount,
      balance_owed = 0,
      gap_in_payment = EXTRACT(DAY FROM (COALESCE(NEW.paid_date, CURRENT_DATE) - NEW.due_date))::INTEGER
    WHERE invoice_number = NEW.invoice_number;
  END IF;

  -- Update payment tracking fields
  IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount THEN
    UPDATE public.historical_invoice_data
    SET
      invoice_amount_paid = NEW.paid_amount,
      balance_owed = NEW.total_amount - COALESCE(NEW.paid_amount, 0)
    WHERE invoice_number = NEW.invoice_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for invoice sync
DROP TRIGGER IF EXISTS trigger_sync_invoice_to_historical ON public.invoices;
CREATE TRIGGER trigger_sync_invoice_to_historical
  AFTER UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_to_historical();

-- ============================================
-- PART 7: View for Complete Transaction Data with Computed Fields
-- ============================================
CREATE OR REPLACE VIEW public.v_transactions_full AS
SELECT
  h.*,
  -- Computed fields
  CASE
    WHEN h.month_name IS NULL AND h.period_month IS NOT NULL
    THEN TO_CHAR(TO_DATE(h.period_month::TEXT, 'MM'), 'Month')
    ELSE h.month_name
  END AS computed_month_name,
  COALESCE(h.total_revenue, 0) - COALESCE(h.invoice_amount_paid, 0) AS computed_balance_owed,
  CASE
    WHEN h.invoice_paid_date IS NOT NULL AND h.due_date IS NOT NULL
    THEN EXTRACT(DAY FROM (h.invoice_paid_date - h.due_date))::INTEGER
    ELSE h.gap_in_payment
  END AS computed_gap_in_payment,
  CASE
    WHEN h.invoice_status != 'Paid' AND h.due_date IS NOT NULL
    THEN GREATEST(0, EXTRACT(DAY FROM (CURRENT_DATE - h.due_date))::INTEGER)
    ELSE 0
  END AS computed_invoice_ageing,
  CASE
    WHEN h.invoice_date IS NOT NULL
    THEN EXTRACT(DAY FROM (CURRENT_DATE - h.invoice_date))::INTEGER
    ELSE h.invoice_age_for_interest
  END AS computed_invoice_age_for_interest,
  CASE
    WHEN h.daily_rate IS NOT NULL AND h.invoice_date IS NOT NULL
    THEN (COALESCE(h.total_revenue, 0) - COALESCE(h.invoice_amount_paid, 0)) * h.daily_rate * EXTRACT(DAY FROM (CURRENT_DATE - h.invoice_date))
    ELSE 0
  END AS computed_interest
FROM public.historical_invoice_data h;

-- Grant access to the view
GRANT SELECT ON public.v_transactions_full TO authenticated;
