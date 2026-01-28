-- Add email notification preferences to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS email_delivery_updates BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS email_invoice_reminders BOOLEAN DEFAULT true;

-- Create vendor_payables table for tracking payables to vendors/partners
CREATE TABLE IF NOT EXISTS public.vendor_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) NOT NULL,
  dispatch_id UUID REFERENCES public.dispatches(id),
  expense_id UUID REFERENCES public.expenses(id),
  invoice_number TEXT,
  amount DECIMAL(12, 2) NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'cancelled')),
  paid_amount DECIMAL(12, 2) DEFAULT 0,
  paid_date TIMESTAMPTZ,
  payment_reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on vendor_payables
ALTER TABLE public.vendor_payables ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for vendor_payables (using correct function signature: _user_id, _role)
CREATE POLICY "Users with roles can view vendor payables" ON public.vendor_payables
  FOR SELECT USING (public.has_any_role(auth.uid()));

CREATE POLICY "Admin and operations can manage vendor payables" ON public.vendor_payables
  FOR ALL USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR 
    public.has_role(auth.uid(), 'operations'::app_role)
  );

-- Add target_input_type to financial_targets for flexible % or number input
ALTER TABLE public.financial_targets
ADD COLUMN IF NOT EXISTS expense_input_type TEXT DEFAULT 'number' CHECK (expense_input_type IN ('number', 'percentage')),
ADD COLUMN IF NOT EXISTS cogs_input_type TEXT DEFAULT 'number' CHECK (cogs_input_type IN ('number', 'percentage')),
ADD COLUMN IF NOT EXISTS profit_input_type TEXT DEFAULT 'number' CHECK (profit_input_type IN ('number', 'percentage'));

-- Add fuel planning columns to dispatches
ALTER TABLE public.dispatches
ADD COLUMN IF NOT EXISTS return_distance_km DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS total_distance_km DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS suggested_fuel_liters DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS actual_fuel_liters DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS fuel_variance DECIMAL(10,2);

-- Add zoho sync log table for tracking sync status
CREATE TABLE IF NOT EXISTS public.zoho_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  records_synced INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  triggered_by UUID
);

-- Enable RLS on zoho_sync_logs  
ALTER TABLE public.zoho_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sync logs" ON public.zoho_sync_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert sync logs" ON public.zoho_sync_logs
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at on new tables
CREATE TRIGGER update_vendor_payables_updated_at
  BEFORE UPDATE ON public.vendor_payables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_vendor_payables_partner ON public.vendor_payables(partner_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payables_status ON public.vendor_payables(status);
CREATE INDEX IF NOT EXISTS idx_zoho_sync_logs_started ON public.zoho_sync_logs(started_at DESC);