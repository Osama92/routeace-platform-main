-- Add structured resolution fields to sla_breach_alerts
ALTER TABLE public.sla_breach_alerts
  ADD COLUMN IF NOT EXISTS resolution_category TEXT,
  ADD COLUMN IF NOT EXISTS resolution_action TEXT,
  ADD COLUMN IF NOT EXISTS resolution_days NUMERIC,
  ADD COLUMN IF NOT EXISTS resolution_contact TEXT;
