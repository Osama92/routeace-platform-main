-- Create trip rate history table for audit logging
CREATE TABLE public.trip_rate_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rate_config_id UUID REFERENCES public.trip_rate_config(id) ON DELETE SET NULL,
  truck_type TEXT NOT NULL,
  zone TEXT NOT NULL,
  old_rate_amount NUMERIC,
  new_rate_amount NUMERIC NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'bulk_update')),
  changed_by UUID REFERENCES auth.users(id),
  changed_by_email TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trip_rate_history ENABLE ROW LEVEL SECURITY;

-- Create policies - admins can view all history
CREATE POLICY "Admins can view rate history"
ON public.trip_rate_history
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Admins can insert history records
CREATE POLICY "Admins can insert rate history"
ON public.trip_rate_history
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Create index for faster queries
CREATE INDEX idx_trip_rate_history_rate_config_id ON public.trip_rate_history(rate_config_id);
CREATE INDEX idx_trip_rate_history_created_at ON public.trip_rate_history(created_at DESC);