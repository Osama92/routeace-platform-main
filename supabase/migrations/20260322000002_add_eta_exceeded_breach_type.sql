-- Extend the breach_type allowed values to include eta_exceeded
-- (matches the Partner Performance OTD logic)
ALTER TABLE public.sla_breach_alerts
  DROP CONSTRAINT IF EXISTS sla_breach_alerts_breach_type_check;

ALTER TABLE public.sla_breach_alerts
  ADD CONSTRAINT sla_breach_alerts_breach_type_check
  CHECK (breach_type IN ('delivery_delay', 'waypoint_delay', 'pickup_delay', 'eta_exceeded'));
