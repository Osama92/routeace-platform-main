-- Create storage bucket for expense receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for expense receipts
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'expense-receipts' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can view receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'expense-receipts');

CREATE POLICY "Users can update their own receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'expense-receipts' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'expense-receipts' AND auth.role() = 'authenticated');

-- Create financial_targets table for monthly/annual targets
CREATE TABLE public.financial_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('monthly', 'annual')),
  target_month INTEGER CHECK (target_month >= 1 AND target_month <= 12),
  target_year INTEGER NOT NULL,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  expense_target NUMERIC NOT NULL DEFAULT 0,
  profit_target NUMERIC NOT NULL DEFAULT 0,
  cogs_target NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(target_type, target_month, target_year)
);

-- Enable RLS on financial_targets
ALTER TABLE public.financial_targets ENABLE ROW LEVEL SECURITY;

-- RLS policies for financial_targets
CREATE POLICY "Authenticated users can view targets"
ON public.financial_targets FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can create targets"
ON public.financial_targets FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Admins can update targets"
ON public.financial_targets FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create target_approvals table for approval workflow
CREATE TABLE public.target_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_id UUID NOT NULL REFERENCES public.financial_targets(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on target_approvals
ALTER TABLE public.target_approvals ENABLE ROW LEVEL SECURITY;

-- RLS policies for target_approvals
CREATE POLICY "Admins can view approvals"
ON public.target_approvals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Admins can create approvals"
ON public.target_approvals FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

CREATE POLICY "Admins can update their approvals"
ON public.target_approvals FOR UPDATE
USING (approver_id = auth.uid());

-- Create SLA breach alerts table
CREATE TABLE public.sla_breach_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  waypoint_id UUID REFERENCES public.route_waypoints(id) ON DELETE SET NULL,
  breach_type TEXT NOT NULL CHECK (breach_type IN ('delivery_delay', 'waypoint_delay', 'pickup_delay')),
  expected_time TIMESTAMP WITH TIME ZONE,
  actual_time TIMESTAMP WITH TIME ZONE,
  delay_hours NUMERIC,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  alert_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on sla_breach_alerts
ALTER TABLE public.sla_breach_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for sla_breach_alerts
CREATE POLICY "Authenticated users can view SLA alerts"
ON public.sla_breach_alerts FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "System can create SLA alerts"
ON public.sla_breach_alerts FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can update SLA alerts"
ON public.sla_breach_alerts FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'operations')
  )
);

-- Add is_cogs column to expenses for cost of goods sold tracking
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_cogs BOOLEAN DEFAULT false;

-- Add cogs_vendor_id to track 3rd party vendor COGS
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cogs_vendor_id UUID REFERENCES public.partners(id);

-- Create function to automatically mark invoices as overdue
CREATE OR REPLACE FUNCTION public.check_invoice_overdue()
RETURNS TRIGGER AS $$
BEGIN
  -- If due date is past and status is pending, mark as overdue
  IF NEW.due_date IS NOT NULL 
     AND NEW.due_date < CURRENT_DATE 
     AND NEW.status = 'pending' THEN
    NEW.status := 'overdue';
    NEW.status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for invoice overdue check on update
DROP TRIGGER IF EXISTS check_invoice_overdue_trigger ON public.invoices;
CREATE TRIGGER check_invoice_overdue_trigger
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.check_invoice_overdue();

-- Create function to update invoices to overdue status (for scheduled runs)
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.invoices
  SET 
    status = 'overdue',
    status_updated_at = now()
  WHERE 
    due_date < CURRENT_DATE
    AND status = 'pending';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to check SLA breaches
CREATE OR REPLACE FUNCTION public.detect_sla_breaches()
RETURNS INTEGER AS $$
DECLARE
  breach_count INTEGER := 0;
  dispatch_rec RECORD;
BEGIN
  -- Check dispatches that exceeded their scheduled delivery time
  FOR dispatch_rec IN
    SELECT 
      d.id as dispatch_id,
      d.scheduled_delivery,
      d.actual_delivery,
      EXTRACT(EPOCH FROM (d.actual_delivery - d.scheduled_delivery)) / 3600 as delay_hours
    FROM public.dispatches d
    WHERE 
      d.actual_delivery IS NOT NULL
      AND d.scheduled_delivery IS NOT NULL
      AND d.actual_delivery > d.scheduled_delivery
      AND NOT EXISTS (
        SELECT 1 FROM public.sla_breach_alerts a 
        WHERE a.dispatch_id = d.id AND a.breach_type = 'delivery_delay'
      )
  LOOP
    INSERT INTO public.sla_breach_alerts (
      dispatch_id,
      breach_type,
      expected_time,
      actual_time,
      delay_hours
    ) VALUES (
      dispatch_rec.dispatch_id,
      'delivery_delay',
      dispatch_rec.scheduled_delivery,
      dispatch_rec.actual_delivery,
      dispatch_rec.delay_hours
    );
    breach_count := breach_count + 1;
  END LOOP;

  RETURN breach_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create updated_at trigger for new tables
CREATE TRIGGER update_financial_targets_updated_at
  BEFORE UPDATE ON public.financial_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_target_approvals_updated_at
  BEFORE UPDATE ON public.target_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();