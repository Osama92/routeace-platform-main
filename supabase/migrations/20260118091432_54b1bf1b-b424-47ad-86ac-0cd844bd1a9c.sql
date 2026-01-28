-- Phase 1: Complete trip_rate_config migration
ALTER TABLE public.trip_rate_config 
ADD COLUMN IF NOT EXISTS pickup_location TEXT,
ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL;

-- Add index for route lookup
CREATE INDEX IF NOT EXISTS idx_trip_rate_config_route ON public.trip_rate_config(route_id);

-- Phase 1.2: Create Diesel Rate Configuration Table for owned drivers
CREATE TABLE IF NOT EXISTS public.diesel_rate_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  route_name TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  distance_km NUMERIC,
  truck_type TEXT NOT NULL,
  diesel_liters_agreed NUMERIC NOT NULL,
  diesel_cost_per_liter NUMERIC DEFAULT 950,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create indexes for diesel rate lookups
CREATE INDEX IF NOT EXISTS idx_diesel_rate_route ON public.diesel_rate_config(route_id);
CREATE INDEX IF NOT EXISTS idx_diesel_rate_origin_dest ON public.diesel_rate_config(origin, destination);
CREATE INDEX IF NOT EXISTS idx_diesel_rate_truck ON public.diesel_rate_config(truck_type);

-- Enable RLS
ALTER TABLE public.diesel_rate_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for diesel_rate_config
CREATE POLICY "diesel_rate_config_select_policy" ON public.diesel_rate_config
  FOR SELECT USING (true);

CREATE POLICY "diesel_rate_config_insert_policy" ON public.diesel_rate_config
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "diesel_rate_config_update_policy" ON public.diesel_rate_config
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "diesel_rate_config_delete_policy" ON public.diesel_rate_config
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Phase 1.3: Create Historical Invoice Data Table
CREATE TABLE IF NOT EXISTS public.historical_invoice_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  vendor_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  vendor_name TEXT,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  tonnage TEXT,
  truck_type TEXT,
  route TEXT,
  pickup_location TEXT,
  delivery_location TEXT,
  trips_count INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  profit_margin NUMERIC DEFAULT 0,
  notes TEXT,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_file TEXT
);

-- Create indexes for historical data queries
CREATE INDEX IF NOT EXISTS idx_historical_period ON public.historical_invoice_data(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_historical_customer ON public.historical_invoice_data(customer_id);
CREATE INDEX IF NOT EXISTS idx_historical_vendor ON public.historical_invoice_data(vendor_id);

-- Enable RLS
ALTER TABLE public.historical_invoice_data ENABLE ROW LEVEL SECURITY;

-- RLS policies for historical_invoice_data
CREATE POLICY "historical_data_select_policy" ON public.historical_invoice_data
  FOR SELECT USING (true);

CREATE POLICY "historical_data_insert_policy" ON public.historical_invoice_data
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "historical_data_update_policy" ON public.historical_invoice_data
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "historical_data_delete_policy" ON public.historical_invoice_data
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Create trigger for diesel_rate_config updated_at
CREATE OR REPLACE TRIGGER update_diesel_rate_config_updated_at
BEFORE UPDATE ON public.diesel_rate_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();