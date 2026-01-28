-- Add truck_type to vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS truck_type TEXT CHECK (truck_type IN ('5t', '10t', '15t', '20t', 'trailer'));

-- Create trip rate configuration table
CREATE TABLE IF NOT EXISTS public.trip_rate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_type TEXT NOT NULL,
  zone TEXT NOT NULL,
  rate_amount NUMERIC NOT NULL DEFAULT 0,
  is_net BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(truck_type, zone)
);

-- Enable RLS
ALTER TABLE public.trip_rate_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for trip_rate_config
CREATE POLICY "Anyone can read trip rates" ON public.trip_rate_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage trip rates" ON public.trip_rate_config FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'operations'))
);

-- Seed the rates as specified by user
INSERT INTO public.trip_rate_config (truck_type, zone, rate_amount) VALUES
-- Standard trucks (5T, 10T, 15T, 20T) - same rates
('5t', 'within_ibadan', 20000),
('5t', 'outside_ibadan', 30000),
('10t', 'within_ibadan', 20000),
('10t', 'outside_ibadan', 30000),
('15t', 'within_ibadan', 20000),
('15t', 'outside_ibadan', 30000),
('20t', 'within_ibadan', 20000),
('20t', 'outside_ibadan', 30000),
-- Trailers - different rates
('trailer', 'within_ibadan', 30000),
('trailer', 'outside_ibadan', 70000)
ON CONFLICT (truck_type, zone) DO UPDATE SET rate_amount = EXCLUDED.rate_amount;

-- Create driver bonus configuration table
CREATE TABLE IF NOT EXISTS public.driver_bonus_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_type TEXT NOT NULL,
  metric TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  bonus_amount NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_bonus_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for driver_bonus_config
CREATE POLICY "Anyone can read bonus config" ON public.driver_bonus_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage bonus config" ON public.driver_bonus_config FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'operations'))
);

-- Seed default bonus rules
INSERT INTO public.driver_bonus_config (bonus_type, metric, threshold, bonus_amount) VALUES
('trip_completion', 'trip_count', 20, 5000),
('on_time_delivery', 'on_time_rate', 95, 10000),
('rating_bonus', 'rating', 4.8, 7500),
('zero_breach', 'sla_breaches', 0, 15000)
ON CONFLICT DO NOTHING;

-- Create driver bonuses table
CREATE TABLE IF NOT EXISTS public.driver_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id) ON DELETE CASCADE,
  bonus_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  period_start DATE,
  period_end DATE,
  metrics JSONB,
  status TEXT DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_bonuses ENABLE ROW LEVEL SECURITY;

-- RLS policies for driver_bonuses
CREATE POLICY "Anyone can read bonuses" ON public.driver_bonuses FOR SELECT USING (true);
CREATE POLICY "Admins can manage bonuses" ON public.driver_bonuses FOR ALL USING (
  EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'operations'))
);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_rate_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_bonus_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_bonuses;