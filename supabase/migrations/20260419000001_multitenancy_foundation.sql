-- ============================================================
-- PHASE 1: Multi-Tenancy Foundation
-- ============================================================
-- Safe, non-breaking migration:
--   1. Creates organizations + org_members tables
--   2. Creates current_org_id() helper (used by future RLS updates)
--   3. Adds org_id column to all 40+ business tables
--   4. Creates default org for existing data (Tenant 1)
--   5. Migrates user_roles → org_members
--   6. Backfills every table with default org_id
--   7. Makes org_id NOT NULL with DEFAULT (existing app inserts still work)
--
-- RLS policies are NOT changed in this migration — the app continues
-- to work exactly as before. RLS org-scoping is Phase 2.
-- ============================================================

-- ── 1. organizations ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        UNIQUE NOT NULL,
  logo_url    TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  settings    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. org_members ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  org_id      UUID        NOT NULL REFERENCES public.organizations ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('admin','operations','support','dispatcher','driver')),
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  invited_by  UUID        REFERENCES auth.users,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- RLS for organizations and org_members (both tables must exist first)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can view their org"
  ON public.organizations FOR SELECT
  USING (id IN (
    SELECT org_id FROM public.org_members
    WHERE user_id = auth.uid() AND is_active = true
  ));

CREATE POLICY "org admins can update their org"
  ON public.organizations FOR UPDATE
  USING (id IN (
    SELECT org_id FROM public.org_members
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
  ));

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view their own membership"
  ON public.org_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "org admins can view all members"
  ON public.org_members FOR SELECT
  USING (org_id IN (
    SELECT org_id FROM public.org_members
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
  ));

CREATE POLICY "org admins can manage members"
  ON public.org_members FOR ALL
  USING (org_id IN (
    SELECT org_id FROM public.org_members m2
    WHERE m2.user_id = auth.uid() AND m2.role = 'admin' AND m2.is_active = true
  ));

-- ── 3. current_org_id() helper ──────────────────────────────
-- Returns the org_id for the currently authenticated user.
-- Used in all future RLS policies for automatic tenant scoping.
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.org_members
  WHERE user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
$$;

-- ── 4. org_integrations (per-tenant Zoho credentials) ───────
CREATE TABLE IF NOT EXISTS public.org_integrations (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID        NOT NULL UNIQUE REFERENCES public.organizations ON DELETE CASCADE,
  zoho_client_id        TEXT,
  zoho_client_secret    TEXT,
  zoho_refresh_token    TEXT,
  zoho_organization_id  TEXT,
  zoho_region           TEXT        NOT NULL DEFAULT 'com',
  connected_at          TIMESTAMPTZ,
  connected_by          UUID        REFERENCES auth.users,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org admins can manage integrations"
  ON public.org_integrations FOR ALL
  USING (org_id IN (
    SELECT org_id FROM public.org_members
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
  ));

-- ── 5. Default org (Tenant 1 — existing data) ───────────────
INSERT INTO public.organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Company', 'default')
ON CONFLICT (id) DO NOTHING;

-- ── 6. Migrate user_roles → org_members ─────────────────────
INSERT INTO public.org_members (user_id, org_id, role, is_active)
SELECT
  ur.user_id,
  '00000000-0000-0000-0000-000000000001',
  ur.role,
  COALESCE(p.is_active, true)
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.user_id = ur.user_id
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ── 7. Add org_id to all business tables ────────────────────
-- Using ALTER TABLE ... ADD COLUMN IF NOT EXISTS with DEFAULT so
-- existing INSERT statements (without org_id) continue to work.
-- The DEFAULT is a transitional measure removed after Phase 2.

-- Core logistics
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.dispatches
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.route_waypoints
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.dispatch_dropoffs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.delivery_updates
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.tracking_tokens
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- Financial
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.driver_salaries
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.vendor_payables
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.financial_targets
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.target_approvals
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.historical_invoice_data
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- Configuration
ALTER TABLE public.trip_rate_config
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.trip_rate_history
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.diesel_rate_config
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.driver_bonus_config
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.driver_bonuses
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.approval_roles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.rate_change_recipients
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- Documents
ALTER TABLE public.driver_documents
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.vehicle_documents
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- Communications
ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.email_notifications
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- Analytics & Monitoring
ALTER TABLE public.sla_breach_alerts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.vendor_performance_snapshots
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.vendor_truck_targets
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.vendor_truck_actuals
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.fuel_suggestions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.zoho_sync_logs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.user_access_log
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.session_alerts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.product_metrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations
  DEFAULT '00000000-0000-0000-0000-000000000001';

-- ── 8. Backfill all existing rows with default org ───────────
UPDATE public.customers              SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.dispatches             SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.drivers                SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.vehicles               SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.partners               SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.routes                 SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.route_waypoints        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.dispatch_dropoffs      SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.delivery_updates       SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.tracking_tokens        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.invoices               SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.expenses               SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.bills                  SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_salaries        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.vendor_payables        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.financial_targets      SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.target_approvals       SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.historical_invoice_data SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.trip_rate_config       SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.trip_rate_history      SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.diesel_rate_config     SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_bonus_config    SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_bonuses         SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.approval_roles         SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.rate_change_recipients SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.integrations           SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.driver_documents       SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.vehicle_documents      SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.email_templates        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.email_notifications    SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.sla_breach_alerts      SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.vendor_performance_snapshots SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.vendor_truck_targets   SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.vendor_truck_actuals   SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.fuel_suggestions       SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.zoho_sync_logs         SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.audit_logs             SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.user_sessions          SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.user_access_log        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.session_alerts         SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.product_metrics        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- ── 9. Make org_id NOT NULL (DEFAULT stays for now) ─────────
-- The DEFAULT ensures existing app code (which doesn't pass org_id yet)
-- continues to work. Removed in Phase 2 once all inserts pass org_id.
ALTER TABLE public.customers              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.dispatches             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.drivers                ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.vehicles               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.partners               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.routes                 ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.route_waypoints        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.dispatch_dropoffs      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.delivery_updates       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.tracking_tokens        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.invoices               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.expenses               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.bills                  ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.driver_salaries        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.vendor_payables        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.financial_targets      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.target_approvals       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.historical_invoice_data ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.trip_rate_config       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.trip_rate_history      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.diesel_rate_config     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.driver_bonus_config    ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.driver_bonuses         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.approval_roles         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.rate_change_recipients ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.integrations           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.driver_documents       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.vehicle_documents      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.email_templates        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.email_notifications    ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.sla_breach_alerts      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.vendor_performance_snapshots ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.vendor_truck_targets   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.vendor_truck_actuals   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.fuel_suggestions       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.zoho_sync_logs         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.audit_logs             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.user_sessions          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.user_access_log        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.session_alerts         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.product_metrics        ALTER COLUMN org_id SET NOT NULL;

-- ── 10. Indexes for performance ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_members_user_id  ON public.org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id   ON public.org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_id     ON public.customers(org_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_org_id    ON public.dispatches(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org_id      ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_id      ON public.expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_bills_org_id         ON public.bills(org_id);
CREATE INDEX IF NOT EXISTS idx_drivers_org_id       ON public.drivers(org_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_org_id      ON public.vehicles(org_id);
CREATE INDEX IF NOT EXISTS idx_partners_org_id      ON public.partners(org_id);
