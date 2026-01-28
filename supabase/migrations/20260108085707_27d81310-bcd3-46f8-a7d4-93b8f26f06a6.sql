-- Fix customers RLS policy to allow admin, operations, and support to insert
DROP POLICY IF EXISTS "Support can insert customers" ON public.customers;
CREATE POLICY "Admin/Operations/Support can insert customers" 
ON public.customers 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operations'::app_role) OR 
  has_role(auth.uid(), 'support'::app_role)
);

-- Add partner approval workflow columns
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending';
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS approved_by uuid;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS director_nin text;

-- Create driver documents table
CREATE TABLE IF NOT EXISTS public.driver_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  document_type text NOT NULL, -- license, vehicle_papers, insurance, etc.
  document_name text NOT NULL,
  document_url text,
  expiry_date date,
  is_verified boolean DEFAULT false,
  verified_by uuid,
  verified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view driver documents" 
ON public.driver_documents 
FOR SELECT 
USING (true);

CREATE POLICY "Admin/Operations/Dispatcher can manage driver documents" 
ON public.driver_documents 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operations'::app_role) OR 
  has_role(auth.uid(), 'dispatcher'::app_role)
);

-- Create vehicle documents table
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  document_type text NOT NULL, -- registration, insurance, roadworthiness, etc.
  document_name text NOT NULL,
  document_url text,
  expiry_date date,
  is_verified boolean DEFAULT false,
  verified_by uuid,
  verified_at timestamp with time zone,
  alert_sent boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vehicle documents" 
ON public.vehicle_documents 
FOR SELECT 
USING (true);

CREATE POLICY "Admin/Operations can manage vehicle documents" 
ON public.vehicle_documents 
FOR ALL 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operations'::app_role)
);

-- Create settings/integrations table
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  type text NOT NULL, -- zoho, resend, mapbox, google_maps
  api_key text,
  api_secret text,
  is_enabled boolean DEFAULT false,
  config jsonb DEFAULT '{}'::jsonb,
  last_sync_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage integrations" 
ON public.integrations 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create email notifications log table
CREATE TABLE IF NOT EXISTS public.email_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id uuid REFERENCES public.dispatches(id),
  recipient_email text NOT NULL,
  recipient_type text NOT NULL, -- customer, leadership, support
  subject text NOT NULL,
  body text,
  status text DEFAULT 'pending', -- pending, sent, failed
  sent_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view email notifications" 
ON public.email_notifications 
FOR SELECT 
USING (has_any_role(auth.uid()));

CREATE POLICY "System can insert email notifications" 
ON public.email_notifications 
FOR INSERT 
WITH CHECK (true);

-- Add triggers for updated_at
CREATE TRIGGER update_driver_documents_updated_at
BEFORE UPDATE ON public.driver_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vehicle_documents_updated_at
BEFORE UPDATE ON public.vehicle_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();