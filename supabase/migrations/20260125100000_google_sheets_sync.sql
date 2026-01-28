-- Google Sheets Sync Configuration and Logs
-- This migration creates tables for managing Google Sheets integration

-- Table to store sync configurations
CREATE TABLE IF NOT EXISTS google_sheets_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  spreadsheet_url TEXT,
  data_type TEXT NOT NULL CHECK (data_type IN ('dispatches', 'customers', 'drivers', 'vehicles', 'invoices', 'expenses')),
  sheet_name TEXT NOT NULL DEFAULT 'Sheet1',
  sync_direction TEXT NOT NULL DEFAULT 'export' CHECK (sync_direction IN ('export', 'import', 'both')),
  is_active BOOLEAN DEFAULT true,
  auto_sync BOOLEAN DEFAULT false,
  sync_interval_minutes INTEGER DEFAULT 60,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Table to store sync logs/history
CREATE TABLE IF NOT EXISTS google_sheets_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES google_sheets_configs(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  spreadsheet_id TEXT,
  sheet_name TEXT,
  data_type TEXT,
  direction TEXT CHECK (direction IN ('export', 'import')),
  records_processed INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'success', 'failed')),
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sheets_configs_data_type ON google_sheets_configs(data_type);
CREATE INDEX IF NOT EXISTS idx_sheets_configs_active ON google_sheets_configs(is_active);
CREATE INDEX IF NOT EXISTS idx_sheets_sync_logs_config ON google_sheets_sync_logs(config_id);
CREATE INDEX IF NOT EXISTS idx_sheets_sync_logs_status ON google_sheets_sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sheets_sync_logs_created ON google_sheets_sync_logs(started_at DESC);

-- Enable RLS
ALTER TABLE google_sheets_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_sheets_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for configs - only admins can manage
CREATE POLICY "Admins can manage sheets configs"
  ON google_sheets_configs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for logs - admins can view all, others can view their own
CREATE POLICY "Admins can view all sync logs"
  ON google_sheets_sync_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view their own sync logs"
  ON google_sheets_sync_logs
  FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "Authenticated users can insert sync logs"
  ON google_sheets_sync_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sheets_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS sheets_config_updated_at ON google_sheets_configs;
CREATE TRIGGER sheets_config_updated_at
  BEFORE UPDATE ON google_sheets_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_sheets_config_updated_at();

-- Add comments for documentation
COMMENT ON TABLE google_sheets_configs IS 'Stores Google Sheets sync configurations';
COMMENT ON TABLE google_sheets_sync_logs IS 'Logs all Google Sheets sync operations';
COMMENT ON COLUMN google_sheets_configs.data_type IS 'Type of data being synced: dispatches, customers, drivers, vehicles, invoices, expenses';
COMMENT ON COLUMN google_sheets_configs.sync_direction IS 'Direction of sync: export (to sheets), import (from sheets), or both';
