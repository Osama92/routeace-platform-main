-- Create route_waypoints table for multi-drop routes
CREATE TABLE public.route_waypoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  location_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  sequence_order INTEGER NOT NULL DEFAULT 0,
  distance_from_previous_km NUMERIC(10, 2),
  duration_from_previous_hours NUMERIC(6, 2),
  sla_hours NUMERIC(6, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.route_waypoints ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users with any role can view waypoints" 
ON public.route_waypoints 
FOR SELECT 
USING (has_any_role(auth.uid()));

CREATE POLICY "Admins and operations can manage waypoints" 
ON public.route_waypoints 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'operations'::app_role));

-- Update trigger for updated_at
CREATE TRIGGER update_route_waypoints_updated_at
BEFORE UPDATE ON public.route_waypoints
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add zoho_invoice_id to invoices table for sync
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zoho_invoice_id VARCHAR(100);
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS zoho_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP WITH TIME ZONE;

-- Add zoho_expense_id to expenses table for sync
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS zoho_expense_id VARCHAR(100);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS zoho_synced_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster route waypoint queries
CREATE INDEX idx_route_waypoints_route_id ON public.route_waypoints(route_id);
CREATE INDEX idx_route_waypoints_sequence ON public.route_waypoints(route_id, sequence_order);