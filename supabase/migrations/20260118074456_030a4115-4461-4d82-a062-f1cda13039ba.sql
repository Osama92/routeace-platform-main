-- Driver Salary System
-- Add salary fields to drivers table
ALTER TABLE public.drivers 
ADD COLUMN IF NOT EXISTS driver_type TEXT DEFAULT 'owned' CHECK (driver_type IN ('owned', 'third_party')),
ADD COLUMN IF NOT EXISTS salary_type TEXT DEFAULT 'per_trip' CHECK (salary_type IN ('per_trip', 'bi_monthly', 'monthly')),
ADD COLUMN IF NOT EXISTS base_salary NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_id TEXT;

-- Create driver salary records table
CREATE TABLE IF NOT EXISTS public.driver_salaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  salary_type TEXT NOT NULL CHECK (salary_type IN ('per_trip', 'bi_monthly', 'monthly')),
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  taxable_income NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  period_start DATE,
  period_end DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  approved_by UUID
);

-- Enable RLS on driver_salaries
ALTER TABLE public.driver_salaries ENABLE ROW LEVEL SECURITY;

-- RLS policies for driver_salaries
CREATE POLICY "Admins and operations can view all salaries"
ON public.driver_salaries FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

CREATE POLICY "Admins and operations can insert salaries"
ON public.driver_salaries FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

CREATE POLICY "Admins can update salaries"
ON public.driver_salaries FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Invoice Approval System
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_first_approval', 'pending_second_approval', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS first_approver_id UUID,
ADD COLUMN IF NOT EXISTS first_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS second_approver_id UUID,
ADD COLUMN IF NOT EXISTS second_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS submitted_by UUID;

-- Session Alerts Table
CREATE TABLE IF NOT EXISTS public.session_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('idle_warning', 'unusual_login', 'long_session', 'suspicious_activity')),
  message TEXT NOT NULL,
  session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on session_alerts
ALTER TABLE public.session_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for session_alerts
CREATE POLICY "Admins can view all session alerts"
ON public.session_alerts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage session alerts"
ON public.session_alerts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- User Presence Table for real-time tracking
CREATE TABLE IF NOT EXISTS public.user_presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  current_page TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on user_presence
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_presence
CREATE POLICY "Authenticated users can view presence"
ON public.user_presence FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update own presence"
ON public.user_presence FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own presence status"
ON public.user_presence FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Enable realtime for user_presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;

-- Trigger to update updated_at
CREATE OR REPLACE TRIGGER update_driver_salaries_updated_at
BEFORE UPDATE ON public.driver_salaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_user_presence_updated_at
BEFORE UPDATE ON public.user_presence
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();