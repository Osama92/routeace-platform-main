-- Migration: Add historical dispatch support
-- This allows importing historical dispatches from Google Sheets
-- Historical dispatches have read-only financials and cannot be edited

-- Add columns to dispatches table for historical tracking
ALTER TABLE dispatches
ADD COLUMN IF NOT EXISTS is_historical BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS historical_transaction_id UUID REFERENCES historical_invoice_data(id),
ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT NULL;

-- Create index for efficient filtering of historical dispatches
CREATE INDEX IF NOT EXISTS idx_dispatches_is_historical ON dispatches(is_historical);
CREATE INDEX IF NOT EXISTS idx_dispatches_historical_transaction_id ON dispatches(historical_transaction_id);

-- Add comment for documentation
COMMENT ON COLUMN dispatches.is_historical IS 'True if this dispatch was imported from historical data (e.g., Google Sheets)';
COMMENT ON COLUMN dispatches.historical_transaction_id IS 'Reference to the historical_invoice_data record this dispatch was created from';
COMMENT ON COLUMN dispatches.import_source IS 'Source of the import (e.g., google_sheets)';
