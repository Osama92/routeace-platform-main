-- Create audit_logs table for tracking all edits
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID,
  user_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_sessions table for login tracking
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  login_at TIMESTAMPTZ DEFAULT now(),
  logout_at TIMESTAMPTZ,
  session_duration_minutes INTEGER,
  ip_address TEXT,
  user_agent TEXT
);

-- Create fuel_suggestions table for learning from past dispatches
CREATE TABLE public.fuel_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  vehicle_type TEXT,
  tonnage_category TEXT,
  average_actual_fuel NUMERIC,
  trip_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create dispatch_dropoffs table for multiple locations
CREATE TABLE public.dispatch_dropoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  sequence_order INTEGER NOT NULL,
  estimated_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create product_metrics table for admin metrics tracking
CREATE TABLE public.product_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL UNIQUE,
  daily_active_users INTEGER DEFAULT 0,
  total_dispatches INTEGER DEFAULT 0,
  total_invoices_raised NUMERIC DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  average_session_duration_minutes NUMERIC DEFAULT 0,
  feature_usage JSONB,
  error_count INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add RLS policies for all new tables
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_dropoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_metrics ENABLE ROW LEVEL SECURITY;

-- Policies for audit_logs - admin only
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs 
FOR SELECT TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert audit logs" ON public.audit_logs 
FOR INSERT TO authenticated 
WITH CHECK (true);

-- Policies for user_sessions
CREATE POLICY "Admins can view all sessions" ON public.user_sessions 
FOR SELECT TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage own sessions" ON public.user_sessions 
FOR ALL TO authenticated 
USING (user_id = auth.uid());

-- Policies for fuel_suggestions - operations and admin
CREATE POLICY "Operations can view fuel suggestions" ON public.fuel_suggestions 
FOR SELECT TO authenticated 
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'dispatcher'::app_role)
);

CREATE POLICY "Operations can manage fuel suggestions" ON public.fuel_suggestions 
FOR ALL TO authenticated 
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role)
);

-- Policies for dispatch_dropoffs - follow dispatch access
CREATE POLICY "Authenticated users can view dropoffs" ON public.dispatch_dropoffs 
FOR SELECT TO authenticated 
USING (true);

CREATE POLICY "Operations can manage dropoffs" ON public.dispatch_dropoffs 
FOR ALL TO authenticated 
USING (
  public.has_role(auth.uid(), 'admin'::app_role) OR
  public.has_role(auth.uid(), 'operations'::app_role) OR
  public.has_role(auth.uid(), 'dispatcher'::app_role)
);

-- Policies for product_metrics - admin only
CREATE POLICY "Admins can view product metrics" ON public.product_metrics 
FOR SELECT TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage product metrics" ON public.product_metrics 
FOR ALL TO authenticated 
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_login_at ON public.user_sessions(login_at DESC);
CREATE INDEX idx_fuel_suggestions_addresses ON public.fuel_suggestions(pickup_address, delivery_address);
CREATE INDEX idx_dispatch_dropoffs_dispatch_id ON public.dispatch_dropoffs(dispatch_id);
CREATE INDEX idx_product_metrics_date ON public.product_metrics(metric_date DESC);

-- Enable realtime for audit_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;