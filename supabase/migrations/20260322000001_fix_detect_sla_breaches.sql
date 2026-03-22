-- Extend breach_type constraint to include eta_exceeded
ALTER TABLE public.sla_breach_alerts
  DROP CONSTRAINT IF EXISTS sla_breach_alerts_breach_type_check;

ALTER TABLE public.sla_breach_alerts
  ADD CONSTRAINT sla_breach_alerts_breach_type_check
  CHECK (breach_type IN ('delivery_delay', 'waypoint_delay', 'pickup_delay', 'eta_exceeded'));

-- Update detect_sla_breaches to match Partner Performance logic:
-- Catches late deliveries via EITHER:
--   (a) actual_delivery > scheduled_delivery  [explicit deadline breach]
--   (b) actual transit time > route estimated hours (or 48h default) [ETA breach]
-- This ensures both systems show the same breaches.

CREATE OR REPLACE FUNCTION public.detect_sla_breaches()
RETURNS INTEGER AS $$
DECLARE
  breach_count INTEGER := 0;
  dispatch_rec RECORD;
  target_hours NUMERIC;
  transit_hours NUMERIC;
  breach_type_val TEXT;
  expected_time_val TIMESTAMPTZ;
  actual_time_val TIMESTAMPTZ;
  delay_val NUMERIC;
BEGIN
  FOR dispatch_rec IN
    SELECT
      d.id AS dispatch_id,
      d.actual_pickup,
      d.actual_delivery,
      d.scheduled_pickup,
      d.scheduled_delivery,
      COALESCE(r.estimated_duration_hours, 48) AS route_eta_hours
    FROM public.dispatches d
    LEFT JOIN public.routes r ON r.id = d.route_id
    WHERE
      d.status = 'delivered'
      AND d.actual_delivery IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.sla_breach_alerts a
        WHERE a.dispatch_id = d.id
      )
  LOOP
    breach_type_val := NULL;
    expected_time_val := NULL;
    actual_time_val := dispatch_rec.actual_delivery;
    delay_val := NULL;

    -- Check (a): explicit scheduled_delivery breach
    IF dispatch_rec.scheduled_delivery IS NOT NULL
       AND dispatch_rec.actual_delivery > dispatch_rec.scheduled_delivery THEN
      breach_type_val := 'delivery_delay';
      expected_time_val := dispatch_rec.scheduled_delivery;
      delay_val := EXTRACT(EPOCH FROM (dispatch_rec.actual_delivery - dispatch_rec.scheduled_delivery)) / 3600;

    -- Check (b): transit time exceeded route ETA (mirrors Partner Performance)
    ELSIF dispatch_rec.actual_pickup IS NOT NULL OR dispatch_rec.scheduled_pickup IS NOT NULL THEN
      DECLARE
        trip_start TIMESTAMPTZ;
      BEGIN
        trip_start := COALESCE(dispatch_rec.actual_pickup, dispatch_rec.scheduled_pickup);
        transit_hours := EXTRACT(EPOCH FROM (dispatch_rec.actual_delivery - trip_start)) / 3600;
        target_hours := dispatch_rec.route_eta_hours;
        IF transit_hours > target_hours THEN
          breach_type_val := 'eta_exceeded';
          expected_time_val := trip_start + (target_hours * INTERVAL '1 hour');
          delay_val := transit_hours - target_hours;
        END IF;
      END;
    END IF;

    -- Insert if a breach was detected
    IF breach_type_val IS NOT NULL THEN
      INSERT INTO public.sla_breach_alerts (
        dispatch_id,
        breach_type,
        expected_time,
        actual_time,
        delay_hours
      ) VALUES (
        dispatch_rec.dispatch_id,
        breach_type_val,
        expected_time_val,
        actual_time_val,
        delay_val
      );
      breach_count := breach_count + 1;
    END IF;
  END LOOP;

  RETURN breach_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
