-- Allow Operations role to read Google Sheets configs for auto-sync
-- This enables dispatches created by Operations to sync to Google Sheets

-- Add read-only policy for operations users
CREATE POLICY "Operations can read active sheets configs"
  ON google_sheets_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'operations'
    )
    AND is_active = true
  );

-- Also allow support users to read for future features
CREATE POLICY "Support can read active sheets configs"
  ON google_sheets_configs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'support'
    )
    AND is_active = true
  );

-- Add comments
COMMENT ON POLICY "Operations can read active sheets configs" ON google_sheets_configs IS 'Allow operations users to read active configs for auto-sync when creating dispatches';
COMMENT ON POLICY "Support can read active sheets configs" ON google_sheets_configs IS 'Allow support users to read active configs for future auto-sync features';
