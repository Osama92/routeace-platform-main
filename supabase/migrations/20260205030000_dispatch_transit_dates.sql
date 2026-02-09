-- Add transit date fields to dispatches table
ALTER TABLE dispatches
ADD COLUMN IF NOT EXISTS date_loaded TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_commenced_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN dispatches.date_loaded IS 'Date when cargo was loaded onto the vehicle';
COMMENT ON COLUMN dispatches.delivery_commenced_at IS 'Date when delivery journey commenced';
