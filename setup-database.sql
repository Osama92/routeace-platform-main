-- ============================================
-- RouteAce Platform - Complete Database Setup
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- Go to: Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ============================================

-- ============================================
-- PART 1: ENUMS AND CORE TYPES
-- ============================================

-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'operations', 'support', 'dispatcher', 'driver');

-- Create expense categories enum
CREATE TYPE expense_category AS ENUM (
  'fuel',
  'maintenance',
  'driver_salary',
  'insurance',
  'tolls',
  'parking',
  'repairs',
  'administrative',
  'marketing',
  'utilities',
  'rent',
  'equipment',
  'cogs',
  'other'
);

-- ============================================
-- PART 2: CORE TABLES
-- ============================================

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'suspended', 'rejected')),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID,
  suspended_at TIMESTAMP WITH TIME ZONE,
  suspended_by UUID,
  suspension_reason TEXT,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Nigeria',
  tin_number TEXT,
  head_office_address TEXT,
  head_office_lat NUMERIC,
  head_office_lng NUMERIC,
  factory_address TEXT,
  factory_lat NUMERIC,
  factory_lng NUMERIC,
  email_delivery_updates BOOLEAN DEFAULT true,
  email_invoice_reminders BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create partners/vendors table
CREATE TABLE public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  partner_type TEXT NOT NULL CHECK (partner_type IN ('transporter', 'vendor', '3pl')),
  cac_number TEXT,
  tin_number TEXT,
  director_name TEXT,
  director_phone TEXT,
  director_nin TEXT,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'Nigeria',
  bank_name TEXT,
  bank_account_number TEXT,
  bank_account_name TEXT,
  is_verified BOOLEAN DEFAULT false,
  approval_status TEXT DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create drivers table
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  license_number TEXT,
  license_expiry DATE,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'on_trip', 'off_duty', 'suspended')),
  rating DECIMAL(2,1) DEFAULT 5.0,
  total_trips INTEGER DEFAULT 0,
  documents_verified BOOLEAN DEFAULT false,
  driver_type TEXT DEFAULT 'owned' CHECK (driver_type IN ('owned', 'third_party')),
  salary_type TEXT DEFAULT 'per_trip' CHECK (salary_type IN ('per_trip', 'bi_monthly', 'monthly')),
  base_salary NUMERIC DEFAULT 0,
  tax_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create vehicles table
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  registration_number TEXT NOT NULL UNIQUE,
  vehicle_type TEXT NOT NULL,
  truck_type TEXT CHECK (truck_type IN ('5t', '10t', '15t', '20t', 'trailer')),
  make TEXT,
  model TEXT,
  year INTEGER,
  capacity_kg DECIMAL(10,2),
  fuel_type TEXT DEFAULT 'diesel',
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
  current_fuel_level INTEGER DEFAULT 100,
  last_maintenance DATE,
  next_maintenance DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create routes table
CREATE TABLE public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  origin TEXT NOT NULL,
  origin_lat DECIMAL(10,7),
  origin_lng DECIMAL(10,7),
  destination TEXT NOT NULL,
  destination_lat DECIMAL(10,7),
  destination_lng DECIMAL(10,7),
  waypoints JSONB DEFAULT '[]'::jsonb,
  distance_km DECIMAL(10,2),
  estimated_duration_hours DECIMAL(5,2),
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create dispatches/shipments table
CREATE TABLE public.dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  driver_id UUID REFERENCES public.drivers(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  route_id UUID REFERENCES public.routes(id),
  pickup_address TEXT NOT NULL,
  pickup_lat DECIMAL(10,7),
  pickup_lng DECIMAL(10,7),
  delivery_address TEXT NOT NULL,
  delivery_lat DECIMAL(10,7),
  delivery_lng DECIMAL(10,7),
  cargo_description TEXT,
  cargo_weight_kg DECIMAL(10,2),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  scheduled_pickup TIMESTAMPTZ,
  scheduled_delivery TIMESTAMPTZ,
  actual_pickup TIMESTAMPTZ,
  actual_delivery TIMESTAMPTZ,
  distance_km DECIMAL(10,2),
  return_distance_km DECIMAL(10,2),
  total_distance_km DECIMAL(10,2),
  suggested_fuel_liters DECIMAL(10,2),
  actual_fuel_liters DECIMAL(10,2),
  fuel_variance DECIMAL(10,2),
  cost DECIMAL(12,2),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create delivery status updates table
CREATE TABLE public.delivery_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL,
  location TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  notes TEXT,
  photo_url TEXT,
  updated_by UUID REFERENCES auth.users(id),
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) NOT NULL,
  dispatch_id UUID REFERENCES public.dispatches(id),
  amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'sent', 'paid', 'overdue', 'cancelled')),
  tax_type TEXT DEFAULT 'none' CHECK (tax_type IN ('none', 'inclusive', 'exclusive')),
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  zoho_invoice_id VARCHAR(100),
  zoho_synced_at TIMESTAMP WITH TIME ZONE,
  status_updated_at TIMESTAMP WITH TIME ZONE,
  approval_status TEXT DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_first_approval', 'pending_second_approval', 'approved', 'rejected')),
  first_approver_id UUID,
  first_approved_at TIMESTAMP WITH TIME ZONE,
  second_approver_id UUID,
  second_approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  submitted_by UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- PART 3: SUPPORTING TABLES
-- ============================================

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  vendor_id UUID REFERENCES public.partners(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  driver_id UUID REFERENCES public.drivers(id),
  dispatch_id UUID REFERENCES public.dispatches(id),
  customer_id UUID REFERENCES public.customers(id),
  receipt_url TEXT,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT false,
  is_cogs BOOLEAN DEFAULT false,
  cogs_vendor_id UUID REFERENCES public.partners(id),
  zoho_expense_id VARCHAR(100),
  zoho_synced_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create driver documents table
CREATE TABLE public.driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_url TEXT,
  expiry_date DATE,
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create vehicle documents table
CREATE TABLE public.vehicle_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_url TEXT,
  expiry_date DATE,
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID,
  verified_at TIMESTAMP WITH TIME ZONE,
  alert_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create integrations table
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  api_key TEXT,
  api_secret TEXT,
  is_enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create email notifications log table
CREATE TABLE public.email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES public.dispatches(id),
  recipient_email TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  notification_type TEXT DEFAULT 'status_update',
  sla_deadline TIMESTAMP WITH TIME ZONE,
  sla_met BOOLEAN DEFAULT true,
  sla_response_time_minutes INTEGER DEFAULT 0,
  sent_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create tracking tokens table
CREATE TABLE public.tracking_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(dispatch_id)
);

-- Create route_waypoints table
CREATE TABLE public.route_waypoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  location_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  sequence_order INTEGER NOT NULL DEFAULT 0,
  distance_from_previous_km NUMERIC(10, 2),
  duration_from_previous_hours NUMERIC(6, 2),
  sla_hours NUMERIC(6, 2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create financial_targets table
CREATE TABLE public.financial_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type TEXT NOT NULL CHECK (target_type IN ('monthly', 'annual')),
  target_month INTEGER CHECK (target_month >= 1 AND target_month <= 12),
  target_year INTEGER NOT NULL,
  revenue_target NUMERIC NOT NULL DEFAULT 0,
  expense_target NUMERIC NOT NULL DEFAULT 0,
  profit_target NUMERIC NOT NULL DEFAULT 0,
  cogs_target NUMERIC NOT NULL DEFAULT 0,
  expense_input_type TEXT DEFAULT 'number' CHECK (expense_input_type IN ('number', 'percentage')),
  cogs_input_type TEXT DEFAULT 'number' CHECK (cogs_input_type IN ('number', 'percentage')),
  profit_input_type TEXT DEFAULT 'number' CHECK (profit_input_type IN ('number', 'percentage')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(target_type, target_month, target_year)
);

-- Create target_approvals table
CREATE TABLE public.target_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID NOT NULL REFERENCES public.financial_targets(id) ON DELETE CASCADE,
  approver_id UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create SLA breach alerts table
CREATE TABLE public.sla_breach_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  waypoint_id UUID REFERENCES public.route_waypoints(id) ON DELETE SET NULL,
  breach_type TEXT NOT NULL CHECK (breach_type IN ('delivery_delay', 'waypoint_delay', 'pickup_delay')),
  expected_time TIMESTAMP WITH TIME ZONE,
  actual_time TIMESTAMP WITH TIME ZONE,
  delay_hours NUMERIC,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  alert_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit_logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID,
  user_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_sessions table
CREATE TABLE public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  login_at TIMESTAMPTZ DEFAULT now(),
  logout_at TIMESTAMPTZ,
  session_duration_minutes INTEGER,
  ip_address TEXT,
  user_agent TEXT
);

-- Create fuel_suggestions table
CREATE TABLE public.fuel_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  vehicle_type TEXT,
  tonnage_category TEXT,
  average_actual_fuel NUMERIC,
  trip_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create dispatch_dropoffs table
CREATE TABLE public.dispatch_dropoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  sequence_order INTEGER NOT NULL,
  estimated_arrival TIMESTAMPTZ,
  actual_arrival TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create product_metrics table
CREATE TABLE public.product_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL UNIQUE,
  daily_active_users INTEGER DEFAULT 0,
  total_dispatches INTEGER DEFAULT 0,
  total_invoices_raised NUMERIC DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  average_session_duration_minutes NUMERIC DEFAULT 0,
  feature_usage JSONB,
  error_count INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create vendor_payables table
CREATE TABLE public.vendor_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID REFERENCES public.partners(id) NOT NULL,
  dispatch_id UUID REFERENCES public.dispatches(id),
  expense_id UUID REFERENCES public.expenses(id),
  invoice_number TEXT,
  amount DECIMAL(12, 2) NOT NULL,
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'cancelled')),
  paid_amount DECIMAL(12, 2) DEFAULT 0,
  paid_date TIMESTAMPTZ,
  payment_reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create zoho_sync_logs table
CREATE TABLE public.zoho_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  records_synced INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  triggered_by UUID
);

-- Create driver_salaries table
CREATE TABLE public.driver_salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE NOT NULL,
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  salary_type TEXT NOT NULL CHECK (salary_type IN ('per_trip', 'bi_monthly', 'monthly')),
  gross_amount NUMERIC NOT NULL DEFAULT 0,
  taxable_income NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  period_start DATE,
  period_end DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  approved_by UUID
);

-- Create session_alerts table
CREATE TABLE public.session_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('idle_warning', 'unusual_login', 'long_session', 'suspicious_activity')),
  message TEXT NOT NULL,
  session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_presence table
CREATE TABLE public.user_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'away', 'offline')),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  current_page TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create email_templates table
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- Create trip_rate_config table
CREATE TABLE public.trip_rate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_type TEXT NOT NULL,
  zone TEXT NOT NULL,
  rate_amount NUMERIC NOT NULL DEFAULT 0,
  is_net BOOLEAN DEFAULT true,
  pickup_location TEXT,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  driver_type TEXT DEFAULT 'owned' CHECK (driver_type IN ('owned', 'vendor')),
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(truck_type, zone)
);

-- Create driver_bonus_config table
CREATE TABLE public.driver_bonus_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bonus_type TEXT NOT NULL,
  metric TEXT NOT NULL,
  threshold NUMERIC NOT NULL,
  bonus_amount NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create driver_bonuses table
CREATE TABLE public.driver_bonuses (
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

-- Create trip_rate_history table
CREATE TABLE public.trip_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_config_id UUID REFERENCES public.trip_rate_config(id) ON DELETE SET NULL,
  truck_type TEXT NOT NULL,
  zone TEXT NOT NULL,
  old_rate_amount NUMERIC,
  new_rate_amount NUMERIC NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete', 'bulk_update')),
  changed_by UUID REFERENCES auth.users(id),
  changed_by_email TEXT,
  driver_type TEXT,
  partner_id UUID,
  customer_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create rate_change_recipients table
CREATE TABLE public.rate_change_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create diesel_rate_config table
CREATE TABLE public.diesel_rate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Create historical_invoice_data table
CREATE TABLE public.historical_invoice_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  transaction_type TEXT,
  transaction_date DATE,
  week_num INTEGER,
  drop_point TEXT,
  route_cluster TEXT,
  km_covered NUMERIC,
  tonnage_loaded NUMERIC,
  driver_name TEXT,
  truck_number TEXT,
  waybill_numbers TEXT[],
  num_deliveries INTEGER,
  amount_vatable NUMERIC,
  amount_not_vatable NUMERIC,
  extra_dropoffs INTEGER,
  extra_dropoff_cost NUMERIC,
  total_vendor_cost NUMERIC,
  sub_total NUMERIC,
  vat_amount NUMERIC,
  invoice_number TEXT,
  gross_profit NUMERIC,
  wht_status TEXT,
  vendor_bill_number TEXT,
  vendor_invoice_status TEXT,
  customer_payment_status TEXT,
  invoice_status TEXT,
  payment_receipt_date DATE,
  invoice_date DATE,
  payment_terms_days INTEGER,
  due_date DATE,
  invoice_paid_date DATE,
  notes TEXT,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_file TEXT
);

-- Create user_access_log table
CREATE TABLE public.user_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'suspended', 'reactivated', 'role_assigned', 'role_removed')),
  performed_by UUID NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  previous_role TEXT,
  new_role TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create vendor_truck_targets table
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

-- Create vendor_truck_actuals table
CREATE TABLE public.vendor_truck_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id UUID REFERENCES public.vendor_truck_targets(id) ON DELETE CASCADE NOT NULL,
  dispatch_id UUID REFERENCES public.dispatches(id) ON DELETE SET NULL,
  week_number INTEGER NOT NULL,
  trips_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create vendor_performance_snapshots table
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

-- ============================================
-- PART 4: SEQUENCES
-- ============================================

CREATE SEQUENCE IF NOT EXISTS dispatch_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- ============================================
-- PART 5: ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_waypoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_breach_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_dropoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoho_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_rate_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_bonus_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_change_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diesel_rate_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_invoice_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_truck_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_truck_actuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_performance_snapshots ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 6: HELPER FUNCTIONS
-- ============================================

-- Check if user has specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Check if user has any role
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
  )
$$;

-- Get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Generate dispatch number
CREATE OR REPLACE FUNCTION public.generate_dispatch_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dispatch_number := 'DSP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('dispatch_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('invoice_number_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Check invoice overdue
CREATE OR REPLACE FUNCTION public.check_invoice_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NOT NULL
     AND NEW.due_date < CURRENT_DATE
     AND NEW.status = 'pending' THEN
    NEW.status := 'overdue';
    NEW.status_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Mark overdue invoices
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.invoices
  SET
    status = 'overdue',
    status_updated_at = now()
  WHERE
    due_date < CURRENT_DATE
    AND status = 'pending';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Detect SLA breaches
CREATE OR REPLACE FUNCTION public.detect_sla_breaches()
RETURNS INTEGER AS $$
DECLARE
  breach_count INTEGER := 0;
  dispatch_rec RECORD;
BEGIN
  FOR dispatch_rec IN
    SELECT
      d.id as dispatch_id,
      d.scheduled_delivery,
      d.actual_delivery,
      EXTRACT(EPOCH FROM (d.actual_delivery - d.scheduled_delivery)) / 3600 as delay_hours
    FROM public.dispatches d
    WHERE
      d.actual_delivery IS NOT NULL
      AND d.scheduled_delivery IS NOT NULL
      AND d.actual_delivery > d.scheduled_delivery
      AND NOT EXISTS (
        SELECT 1 FROM public.sla_breach_alerts a
        WHERE a.dispatch_id = d.id AND a.breach_type = 'delivery_delay'
      )
  LOOP
    INSERT INTO public.sla_breach_alerts (
      dispatch_id,
      breach_type,
      expected_time,
      actual_time,
      delay_hours
    ) VALUES (
      dispatch_rec.dispatch_id,
      'delivery_delay',
      dispatch_rec.scheduled_delivery,
      dispatch_rec.actual_delivery,
      dispatch_rec.delay_hours
    );
    breach_count := breach_count + 1;
  END LOOP;

  RETURN breach_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Capture vendor truck deployment
CREATE OR REPLACE FUNCTION public.capture_vendor_truck_deployment()
RETURNS TRIGGER AS $$
DECLARE
  v_partner_id UUID;
  v_truck_type TEXT;
  v_target_id UUID;
  v_week_number INTEGER;
BEGIN
  SELECT d.partner_id, v.truck_type INTO v_partner_id, v_truck_type
  FROM drivers d
  LEFT JOIN vehicles v ON v.id = NEW.vehicle_id
  WHERE d.id = NEW.driver_id
    AND d.driver_type = 'vendor';

  IF v_partner_id IS NOT NULL AND v_truck_type IS NOT NULL THEN
    SELECT id INTO v_target_id
    FROM public.vendor_truck_targets
    WHERE vendor_id = v_partner_id
      AND truck_type = v_truck_type
      AND target_month = EXTRACT(MONTH FROM NEW.created_at)::INTEGER
      AND target_year = EXTRACT(YEAR FROM NEW.created_at)::INTEGER;

    v_week_number := EXTRACT(WEEK FROM NEW.created_at)::INTEGER;

    IF v_target_id IS NOT NULL THEN
      INSERT INTO public.vendor_truck_actuals (target_id, dispatch_id, week_number)
      VALUES (v_target_id, NEW.id, v_week_number);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- PART 7: TRIGGERS
-- ============================================

-- New user trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_partners_updated_at BEFORE UPDATE ON public.partners FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON public.drivers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_dispatches_updated_at BEFORE UPDATE ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_driver_documents_updated_at BEFORE UPDATE ON public.driver_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicle_documents_updated_at BEFORE UPDATE ON public.vehicle_documents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_route_waypoints_updated_at BEFORE UPDATE ON public.route_waypoints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financial_targets_updated_at BEFORE UPDATE ON public.financial_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_target_approvals_updated_at BEFORE UPDATE ON public.target_approvals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendor_payables_updated_at BEFORE UPDATE ON public.vendor_payables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_driver_salaries_updated_at BEFORE UPDATE ON public.driver_salaries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_presence_updated_at BEFORE UPDATE ON public.user_presence FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_diesel_rate_config_updated_at BEFORE UPDATE ON public.diesel_rate_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vendor_truck_targets_updated_at BEFORE UPDATE ON public.vendor_truck_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fuel_suggestions_updated_at BEFORE UPDATE ON public.fuel_suggestions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate numbers
CREATE TRIGGER set_dispatch_number BEFORE INSERT ON public.dispatches FOR EACH ROW WHEN (NEW.dispatch_number IS NULL) EXECUTE FUNCTION public.generate_dispatch_number();
CREATE TRIGGER set_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW WHEN (NEW.invoice_number IS NULL) EXECUTE FUNCTION public.generate_invoice_number();

-- Invoice overdue check
CREATE TRIGGER check_invoice_overdue_trigger BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.check_invoice_overdue();

-- Vendor deployment capture
CREATE TRIGGER trigger_capture_vendor_deployment AFTER INSERT ON public.dispatches FOR EACH ROW EXECUTE FUNCTION public.capture_vendor_truck_deployment();

-- ============================================
-- PART 8: RLS POLICIES
-- ============================================

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile basic fields" ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins and operations can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- User_roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Customers policies
CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Operations can manage customers" ON public.customers FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Admin/Operations/Support can insert customers" ON public.customers FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations') OR public.has_role(auth.uid(), 'support'));

-- Partners policies
CREATE POLICY "Authenticated users can view partners" ON public.partners FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Operations can manage partners" ON public.partners FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Drivers policies
CREATE POLICY "Authenticated users can view drivers" ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Operations/Dispatcher can manage drivers" ON public.drivers FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "Drivers can update their own record" ON public.drivers FOR UPDATE USING (auth.uid() = user_id);

-- Vehicles policies
CREATE POLICY "Authenticated users can view vehicles" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Operations can manage vehicles" ON public.vehicles FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Routes policies
CREATE POLICY "Authenticated users can view routes" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Operations can manage routes" ON public.routes FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Dispatches policies
CREATE POLICY "Authenticated users can view dispatches" ON public.dispatches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Operations/Dispatcher can manage dispatches" ON public.dispatches FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "Support can update dispatch status" ON public.dispatches FOR UPDATE USING (public.has_role(auth.uid(), 'support'));

-- Delivery updates policies
CREATE POLICY "Authenticated users can view delivery updates" ON public.delivery_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "All staff can create delivery updates" ON public.delivery_updates FOR INSERT TO authenticated WITH CHECK (public.has_any_role(auth.uid()));

-- Invoices policies
CREATE POLICY "Authenticated users can view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Operations can manage invoices" ON public.invoices FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Expenses policies
CREATE POLICY "Expenses are viewable by authenticated users with roles" ON public.expenses FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations') OR public.has_role(auth.uid(), 'support'));
CREATE POLICY "Expenses can be created by admin and operations" ON public.expenses FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Expenses can be updated by admin and operations" ON public.expenses FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Expenses can be deleted by admin only" ON public.expenses FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Driver documents policies
CREATE POLICY "Authenticated users can view driver documents" ON public.driver_documents FOR SELECT USING (true);
CREATE POLICY "Admin/Operations/Dispatcher can manage driver documents" ON public.driver_documents FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations') OR public.has_role(auth.uid(), 'dispatcher'));

-- Vehicle documents policies
CREATE POLICY "Authenticated users can view vehicle documents" ON public.vehicle_documents FOR SELECT USING (true);
CREATE POLICY "Admin/Operations can manage vehicle documents" ON public.vehicle_documents FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Integrations policies
CREATE POLICY "Admin can manage integrations" ON public.integrations FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Email notifications policies
CREATE POLICY "Staff can view email notifications" ON public.email_notifications FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "Staff can insert email notifications" ON public.email_notifications FOR INSERT WITH CHECK (public.has_any_role(auth.uid()));

-- Tracking tokens policies
CREATE POLICY "Public can view tracking tokens" ON public.tracking_tokens FOR SELECT USING (true);
CREATE POLICY "Staff can manage tracking tokens" ON public.tracking_tokens FOR ALL USING (public.has_any_role(auth.uid()));

-- Route waypoints policies
CREATE POLICY "Users with any role can view waypoints" ON public.route_waypoints FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "Admins and operations can manage waypoints" ON public.route_waypoints FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Financial targets policies
CREATE POLICY "Authenticated users can view targets" ON public.financial_targets FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admins can create targets" ON public.financial_targets FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update targets" ON public.financial_targets FOR UPDATE USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- Target approvals policies
CREATE POLICY "Admins can view approvals" ON public.target_approvals FOR SELECT USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can create approvals" ON public.target_approvals FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update their approvals" ON public.target_approvals FOR UPDATE USING (approver_id = auth.uid());

-- SLA breach alerts policies
CREATE POLICY "Authenticated users can view SLA alerts" ON public.sla_breach_alerts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "System can create SLA alerts" ON public.sla_breach_alerts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admins can update SLA alerts" ON public.sla_breach_alerts FOR UPDATE USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'operations')));

-- Audit logs policies
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- User sessions policies
CREATE POLICY "Admins can view all sessions" ON public.user_sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can manage own sessions" ON public.user_sessions FOR ALL TO authenticated USING (user_id = auth.uid());

-- Fuel suggestions policies
CREATE POLICY "Operations can view fuel suggestions" ON public.fuel_suggestions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations') OR public.has_role(auth.uid(), 'dispatcher'));
CREATE POLICY "Operations can manage fuel suggestions" ON public.fuel_suggestions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Dispatch dropoffs policies
CREATE POLICY "Authenticated users can view dropoffs" ON public.dispatch_dropoffs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operations can manage dropoffs" ON public.dispatch_dropoffs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations') OR public.has_role(auth.uid(), 'dispatcher'));

-- Product metrics policies
CREATE POLICY "Admins can view product metrics" ON public.product_metrics FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage product metrics" ON public.product_metrics FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Vendor payables policies
CREATE POLICY "Users with roles can view vendor payables" ON public.vendor_payables FOR SELECT USING (public.has_any_role(auth.uid()));
CREATE POLICY "Admin and operations can manage vendor payables" ON public.vendor_payables FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Zoho sync logs policies
CREATE POLICY "Admins can view sync logs" ON public.zoho_sync_logs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert sync logs" ON public.zoho_sync_logs FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Driver salaries policies
CREATE POLICY "Admins and operations can view all salaries" ON public.driver_salaries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Admins and operations can insert salaries" ON public.driver_salaries FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "Admins can update salaries" ON public.driver_salaries FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Session alerts policies
CREATE POLICY "Admins can view all session alerts" ON public.session_alerts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage session alerts" ON public.session_alerts FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- User presence policies
CREATE POLICY "Authenticated users can view presence" ON public.user_presence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own presence" ON public.user_presence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own presence status" ON public.user_presence FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Email templates policies
CREATE POLICY "Authenticated users can read email templates" ON public.email_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can insert email templates" ON public.email_templates FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update email templates" ON public.email_templates FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete email templates" ON public.email_templates FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Trip rate config policies
CREATE POLICY "Anyone can read trip rates" ON public.trip_rate_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage trip rates" ON public.trip_rate_config FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'operations')));

-- Driver bonus config policies
CREATE POLICY "Anyone can read bonus config" ON public.driver_bonus_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage bonus config" ON public.driver_bonus_config FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'operations')));

-- Driver bonuses policies
CREATE POLICY "Anyone can read bonuses" ON public.driver_bonuses FOR SELECT USING (true);
CREATE POLICY "Admins can manage bonuses" ON public.driver_bonuses FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'operations')));

-- Trip rate history policies
CREATE POLICY "Admins can view rate history" ON public.trip_rate_history FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert rate history" ON public.trip_rate_history FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rate change recipients policies
CREATE POLICY "Admins can view rate change recipients" ON public.rate_change_recipients FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert rate change recipients" ON public.rate_change_recipients FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update rate change recipients" ON public.rate_change_recipients FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete rate change recipients" ON public.rate_change_recipients FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Diesel rate config policies
CREATE POLICY "diesel_rate_config_select_policy" ON public.diesel_rate_config FOR SELECT USING (true);
CREATE POLICY "diesel_rate_config_insert_policy" ON public.diesel_rate_config FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "diesel_rate_config_update_policy" ON public.diesel_rate_config FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "diesel_rate_config_delete_policy" ON public.diesel_rate_config FOR DELETE USING (auth.uid() IS NOT NULL);

-- Historical invoice data policies
CREATE POLICY "historical_data_select_policy" ON public.historical_invoice_data FOR SELECT USING (true);
CREATE POLICY "historical_data_insert_policy" ON public.historical_invoice_data FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "historical_data_update_policy" ON public.historical_invoice_data FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "historical_data_delete_policy" ON public.historical_invoice_data FOR DELETE USING (auth.uid() IS NOT NULL);

-- User access log policies
CREATE POLICY "Admins can view all access logs" ON public.user_access_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert access logs" ON public.user_access_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Vendor truck targets policies
CREATE POLICY "Admins can manage vendor targets" ON public.vendor_truck_targets FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- Vendor truck actuals policies
CREATE POLICY "Admins can view actuals" ON public.vendor_truck_actuals FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));
CREATE POLICY "System can insert actuals" ON public.vendor_truck_actuals FOR INSERT WITH CHECK (true);

-- Vendor performance snapshots policies
CREATE POLICY "Admins can view snapshots" ON public.vendor_performance_snapshots FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operations'));

-- ============================================
-- PART 9: INDEXES
-- ============================================

CREATE INDEX idx_expenses_category ON public.expenses(category);
CREATE INDEX idx_expenses_expense_date ON public.expenses(expense_date);
CREATE INDEX idx_expenses_vendor_id ON public.expenses(vendor_id);
CREATE INDEX idx_expenses_vehicle_id ON public.expenses(vehicle_id);
CREATE INDEX idx_route_waypoints_route_id ON public.route_waypoints(route_id);
CREATE INDEX idx_route_waypoints_sequence ON public.route_waypoints(route_id, sequence_order);
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_login_at ON public.user_sessions(login_at DESC);
CREATE INDEX idx_fuel_suggestions_addresses ON public.fuel_suggestions(pickup_address, delivery_address);
CREATE INDEX idx_dispatch_dropoffs_dispatch_id ON public.dispatch_dropoffs(dispatch_id);
CREATE INDEX idx_product_metrics_date ON public.product_metrics(metric_date DESC);
CREATE INDEX idx_vendor_payables_partner ON public.vendor_payables(partner_id);
CREATE INDEX idx_vendor_payables_status ON public.vendor_payables(status);
CREATE INDEX idx_zoho_sync_logs_started ON public.zoho_sync_logs(started_at DESC);
CREATE INDEX idx_trip_rate_history_rate_config_id ON public.trip_rate_history(rate_config_id);
CREATE INDEX idx_trip_rate_history_created_at ON public.trip_rate_history(created_at DESC);
CREATE INDEX idx_trip_rate_config_route ON public.trip_rate_config(route_id);
CREATE INDEX idx_trip_rate_config_driver_type ON public.trip_rate_config(driver_type);
CREATE INDEX idx_trip_rate_config_partner ON public.trip_rate_config(partner_id);
CREATE INDEX idx_trip_rate_config_customer ON public.trip_rate_config(customer_id);
CREATE INDEX idx_diesel_rate_route ON public.diesel_rate_config(route_id);
CREATE INDEX idx_diesel_rate_origin_dest ON public.diesel_rate_config(origin, destination);
CREATE INDEX idx_diesel_rate_truck ON public.diesel_rate_config(truck_type);
CREATE INDEX idx_historical_period ON public.historical_invoice_data(period_year, period_month);
CREATE INDEX idx_historical_customer ON public.historical_invoice_data(customer_id);
CREATE INDEX idx_historical_vendor ON public.historical_invoice_data(vendor_id);
CREATE INDEX idx_profiles_approval_status ON public.profiles(approval_status);
CREATE INDEX idx_user_access_log_user_id ON public.user_access_log(user_id);
CREATE INDEX idx_user_access_log_created_at ON public.user_access_log(created_at DESC);
CREATE INDEX idx_vendor_truck_targets_vendor ON public.vendor_truck_targets(vendor_id);
CREATE INDEX idx_vendor_truck_targets_period ON public.vendor_truck_targets(target_year, target_month);
CREATE INDEX idx_vendor_truck_actuals_target ON public.vendor_truck_actuals(target_id);
CREATE INDEX idx_vendor_performance_snapshots_vendor ON public.vendor_performance_snapshots(vendor_id);

-- ============================================
-- PART 10: REALTIME SUBSCRIPTIONS
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_rate_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_bonus_config;
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_bonuses;

-- ============================================
-- PART 11: SEED DATA
-- ============================================

-- Default trip rates
INSERT INTO public.trip_rate_config (truck_type, zone, rate_amount) VALUES
('5t', 'within_ibadan', 20000),
('5t', 'outside_ibadan', 30000),
('10t', 'within_ibadan', 20000),
('10t', 'outside_ibadan', 30000),
('15t', 'within_ibadan', 20000),
('15t', 'outside_ibadan', 30000),
('20t', 'within_ibadan', 20000),
('20t', 'outside_ibadan', 30000),
('trailer', 'within_ibadan', 30000),
('trailer', 'outside_ibadan', 70000)
ON CONFLICT (truck_type, zone) DO UPDATE SET rate_amount = EXCLUDED.rate_amount;

-- Default bonus rules
INSERT INTO public.driver_bonus_config (bonus_type, metric, threshold, bonus_amount) VALUES
('trip_completion', 'trip_count', 20, 5000),
('on_time_delivery', 'on_time_rate', 95, 10000),
('rating_bonus', 'rating', 4.8, 7500),
('zero_breach', 'sla_breaches', 0, 15000)
ON CONFLICT DO NOTHING;

-- Default email templates
INSERT INTO public.email_templates (template_type, template_name, subject_template, body_template, variables) VALUES
('delivery_update', 'Delivery Status Update',
 'Shipment Update - {{dispatch_number}} | {{truck_number}} | {{pickup}} -> {{delivery}}',
 '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">Delivery Update</h1>
   </div>
   <div style="padding: 30px; background: #f7fafc;">
     <p>Dear {{customer_name}},</p>
     <p>Your shipment <strong>{{dispatch_number}}</strong> has been updated.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Status:</strong> {{status}}</p>
       <p><strong>Truck:</strong> {{truck_number}}</p>
       <p><strong>Route:</strong> {{pickup}} -> {{delivery}}</p>
     </div>
     <p>Best regards,<br>RouteAce Logistics</p>
   </div>
 </div>',
 '["dispatch_number", "truck_number", "status", "customer_name", "pickup", "delivery"]'::jsonb),

('sla_breach', 'SLA Breach Alert',
 'SLA Breach Alert - {{dispatch_number}} | {{delay_hours}}h Delay',
 '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #c53030 0%, #9b2c2c 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">SLA Breach Alert</h1>
   </div>
   <div style="padding: 30px; background: #fff5f5;">
     <p><strong>Dispatch:</strong> {{dispatch_number}}</p>
     <p><strong>Breach Type:</strong> {{breach_type}}</p>
     <p><strong>Delay:</strong> {{delay_hours}} hours</p>
     <p><strong>Customer:</strong> {{customer_name}}</p>
     <p style="color: #c53030; font-weight: bold;">Immediate action required.</p>
   </div>
 </div>',
 '["dispatch_number", "breach_type", "delay_hours", "customer_name", "expected_time", "actual_time"]'::jsonb)
ON CONFLICT (template_type) DO NOTHING;

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next steps:
-- 1. Create storage buckets: profile-pictures, expense-receipts
-- 2. Sign up in the app
-- 3. Manually set your user as admin in the database
-- ============================================
