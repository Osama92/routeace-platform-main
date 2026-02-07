-- Add initial customer list
-- These customers will be fully updatable and deletable through the platform

INSERT INTO public.customers (company_name, status, notes)
VALUES
  ('Blume Distribution Limited', 'active', 'Initial customer setup'),
  ('KC-Evacuation', 'active', 'Initial customer setup'),
  ('Bhojson Group Plc', 'active', 'Initial customer setup'),
  ('Fushion Logistics Nigeria Limited', 'active', 'Initial customer setup'),
  ('TGI Group', 'active', 'Initial customer setup'),
  ('Kyosk Digital Services Ltd', 'active', 'Initial customer setup'),
  ('Primera Foods Limited Agbara', 'active', 'Initial customer setup'),
  ('FMCG DISTRIBUTIONS', 'active', 'Initial customer setup'),
  ('GB Foods', 'active', 'Initial customer setup'),
  ('Primera Foods Limited Ojota', 'active', 'Initial customer setup'),
  ('Sonia Foods', 'active', 'Initial customer setup'),
  ('General House Hold', 'active', 'Initial customer setup'),
  ('Uno agro', 'active', 'Initial customer setup'),
  ('Euro Mega Atlantic Nigeria Ltd', 'active', 'Initial customer setup'),
  ('Cap plc', 'active', 'Initial customer setup')
ON CONFLICT (company_name) DO NOTHING;
