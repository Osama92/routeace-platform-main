-- Add fleet_type to vehicles to distinguish internal fleet from 3PL vendors
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS fleet_type TEXT DEFAULT 'internal' CHECK (fleet_type IN ('internal', '3pl'));

-- Add vendor_id to vehicles for 3PL vehicles
ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.partners(id);

-- Create index for vendor lookup
CREATE INDEX IF NOT EXISTS idx_vehicles_vendor_id ON public.vehicles(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_fleet_type ON public.vehicles(fleet_type);

-- Insert 3PL vendors into partners table
-- Only insert if they don't already exist (based on company_name)
INSERT INTO public.partners (company_name, contact_name, contact_email, contact_phone, partner_type, approval_status, is_verified)
SELECT company_name, contact_name, contact_email, contact_phone, partner_type, approval_status, is_verified
FROM (VALUES
  ('Malex', 'Malex Contact', 'contact@malex.com', '+234800000001', 'transporter', 'approved', true),
  ('360 Integrated Systems', '360 Contact', 'contact@360integrated.com', '+234800000002', 'transporter', 'approved', true),
  ('Szenaz', 'Szenaz Contact', 'contact@szenaz.com', '+234800000003', 'transporter', 'approved', true),
  ('One man Truck', 'OMT Contact', 'contact@onemantruck.com', '+234800000004', 'transporter', 'approved', true),
  ('Kaya picks', 'Kaya Contact', 'contact@kayapicks.com', '+234800000005', 'transporter', 'approved', true),
  ('Millenium deliveries', 'Millenium Contact', 'contact@millenium.com', '+234800000006', 'transporter', 'approved', true),
  ('Dan Tati', 'Dan Tati Contact', 'contact@dantati.com', '+234800000007', 'transporter', 'approved', true),
  ('Pachomo', 'Pachomo Contact', 'contact@pachomo.com', '+234800000008', 'transporter', 'approved', true),
  ('Abu Ibrahim', 'Abu Ibrahim Contact', 'contact@abuibrahim.com', '+234800000009', 'transporter', 'approved', true),
  ('Graceshore', 'Graceshore Contact', 'contact@graceshore.com', '+234800000010', 'transporter', 'approved', true),
  ('Baba Emma', 'Baba Emma Contact', 'contact@babaemma.com', '+234800000011', 'transporter', 'approved', true),
  ('Aslant', 'Aslant Contact', 'contact@aslant.com', '+234800000012', 'transporter', 'approved', true),
  ('Dare Trucker', 'Dare Contact', 'contact@daretrucker.com', '+234800000013', 'transporter', 'approved', true),
  ('Baba Basirat', 'Baba Basirat Contact', 'contact@bababasirat.com', '+234800000014', 'transporter', 'approved', true),
  ('Alh. Daodu', 'Alh. Daodu Contact', 'contact@alhdaodu.com', '+234800000015', 'transporter', 'approved', true),
  ('Awilo Transport', 'Awilo Contact', 'contact@awilotransport.com', '+234800000016', 'transporter', 'approved', true),
  ('Henjibs Global', 'Henjibs Contact', 'contact@henjibsglobal.com', '+234800000017', 'transporter', 'approved', true),
  ('Navya Blue Logistics', 'Navya Contact', 'contact@navyablue.com', '+234800000018', 'transporter', 'approved', true),
  ('Graceshore/Zeefex Enterprise', 'Graceshore Zeefex Contact', 'contact@graceshorezeefex.com', '+234800000019', 'transporter', 'approved', true),
  ('Blue Navya Logistics', 'Blue Navya Contact', 'contact@bluenavya.com', '+234800000020', 'transporter', 'approved', true),
  ('Dare Hiab', 'Dare Hiab Contact', 'contact@darehiab.com', '+234800000021', 'transporter', 'approved', true),
  ('DD Haul', 'DD Haul Contact', 'contact@ddhaul.com', '+234800000022', 'transporter', 'approved', true),
  ('Navyablue', 'Navyablue Contact', 'contact@navyablue2.com', '+234800000023', 'transporter', 'approved', true),
  ('Alh Abu', 'Alh Abu Contact', 'contact@alhabu.com', '+234800000024', 'transporter', 'approved', true),
  ('Alfa lifemate', 'Alfa Lifemate Contact', 'contact@alfalifemate.com', '+234800000025', 'transporter', 'approved', true),
  ('Alfa Dauda', 'Alfa Dauda Contact', 'contact@alfadauda.com', '+234800000026', 'transporter', 'approved', true),
  ('Okanlawon', 'Okanlawon Contact', 'contact@okanlawon.com', '+234800000027', 'transporter', 'approved', true),
  ('Happiness Foam', 'Happiness Contact', 'contact@happinessfoam.com', '+234800000028', 'transporter', 'approved', true),
  ('EDTOB', 'EDTOB Contact', 'contact@edtob.com', '+234800000029', 'transporter', 'approved', true),
  ('Roadrunner', 'Roadrunner Contact', 'contact@roadrunner.com', '+234800000030', 'transporter', 'approved', true),
  ('GSS', 'GSS Contact', 'contact@gss.com', '+234800000031', 'transporter', 'approved', true),
  ('Equator Logistics', 'Equator Contact', 'contact@equatorlogistics.com', '+234800000032', 'transporter', 'approved', true),
  ('Zeefex', 'Zeefex Contact', 'contact@zeefex.com', '+234800000033', 'transporter', 'approved', true)
) AS v(company_name, contact_name, contact_email, contact_phone, partner_type, approval_status, is_verified)
WHERE NOT EXISTS (
  SELECT 1 FROM public.partners p WHERE p.company_name = v.company_name
);

-- Add comment explaining the relationship
COMMENT ON COLUMN public.vehicles.fleet_type IS 'Type of fleet: internal (owned) or 3pl (third-party logistics vendor)';
COMMENT ON COLUMN public.vehicles.vendor_id IS 'Reference to partners table for 3PL vehicles';
