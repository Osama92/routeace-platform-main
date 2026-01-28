-- Part 1: Create storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for profile pictures
CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view profile pictures"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-pictures');

CREATE POLICY "Users can update their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'profile-pictures' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Part 2: Vendor truck deployment targets
CREATE TABLE public.vendor_truck_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  truck_type TEXT NOT NULL CHECK (truck_type IN ('3T', '5T', '10T', '15T', '20T', '30T', '45T', '60T')),
  target_month INTEGER NOT NULL CHECK (target_month BETWEEN 1 AND 12),
  target_year INTEGER NOT NULL,
  target_trips INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, truck_type, target_month, target_year)
);

-- Track actual trips captured from dispatches
CREATE TABLE public.vendor_truck_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID REFERENCES public.vendor_truck_targets(id) ON DELETE CASCADE NOT NULL,
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  week_number INTEGER NOT NULL,
  trips_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly performance snapshots for email notifications
CREATE TABLE public.vendor_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES public.partners(id) ON DELETE CASCADE NOT NULL,
  snapshot_week INTEGER NOT NULL,
  snapshot_year INTEGER NOT NULL,
  snapshot_month INTEGER NOT NULL,
  targets_summary JSONB NOT NULL DEFAULT '{}',
  actuals_summary JSONB NOT NULL DEFAULT '{}',
  balance_summary JSONB NOT NULL DEFAULT '{}',
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(vendor_id, snapshot_week, snapshot_year)
);

-- Enable RLS on new tables
ALTER TABLE public.vendor_truck_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_truck_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_performance_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS for vendor_truck_targets: admins and operations can manage
CREATE POLICY "Admins can manage vendor targets"
ON public.vendor_truck_targets FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operations'::app_role));

-- RLS for vendor_truck_actuals: read for admins/ops
CREATE POLICY "Admins can view actuals"
ON public.vendor_truck_actuals FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operations'::app_role));

CREATE POLICY "System can insert actuals"
ON public.vendor_truck_actuals FOR INSERT
WITH CHECK (true);

-- RLS for snapshots
CREATE POLICY "Admins can view snapshots"
ON public.vendor_performance_snapshots FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'operations'::app_role));

-- Indexes for performance
CREATE INDEX idx_vendor_truck_targets_vendor ON public.vendor_truck_targets(vendor_id);
CREATE INDEX idx_vendor_truck_targets_period ON public.vendor_truck_targets(target_year, target_month);
CREATE INDEX idx_vendor_truck_actuals_target ON public.vendor_truck_actuals(target_id);
CREATE INDEX idx_vendor_performance_snapshots_vendor ON public.vendor_performance_snapshots(vendor_id);

-- Function to capture vendor truck deployment from dispatches
CREATE OR REPLACE FUNCTION public.capture_vendor_truck_deployment()
RETURNS TRIGGER AS $$
DECLARE
  v_partner_id UUID;
  v_truck_type TEXT;
  v_target_id UUID;
  v_week_number INTEGER;
BEGIN
  -- Get driver's partner_id (vendor) and vehicle truck type
  SELECT d.partner_id, v.truck_type INTO v_partner_id, v_truck_type
  FROM drivers d
  LEFT JOIN vehicles v ON v.id = NEW.vehicle_id
  WHERE d.id = NEW.driver_id
    AND d.driver_type = 'vendor';

  -- Only process if this is a vendor dispatch with valid truck type
  IF v_partner_id IS NOT NULL AND v_truck_type IS NOT NULL THEN
    -- Find matching target
    SELECT id INTO v_target_id
    FROM public.vendor_truck_targets
    WHERE vendor_id = v_partner_id
      AND truck_type = v_truck_type
      AND target_month = EXTRACT(MONTH FROM NEW.created_at)::INTEGER
      AND target_year = EXTRACT(YEAR FROM NEW.created_at)::INTEGER;

    -- Calculate week number
    v_week_number := EXTRACT(WEEK FROM NEW.created_at)::INTEGER;

    -- Insert actual record if target exists
    IF v_target_id IS NOT NULL THEN
      INSERT INTO public.vendor_truck_actuals (target_id, dispatch_id, week_number)
      VALUES (v_target_id, NEW.id, v_week_number);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on dispatch creation
CREATE TRIGGER trigger_capture_vendor_deployment
  AFTER INSERT ON public.dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_vendor_truck_deployment();

-- Update updated_at trigger for vendor_truck_targets
CREATE TRIGGER update_vendor_truck_targets_updated_at
  BEFORE UPDATE ON public.vendor_truck_targets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();