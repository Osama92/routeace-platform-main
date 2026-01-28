-- Add approval_status and created_by_role columns to dispatches table
ALTER TABLE dispatches
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS created_by_role TEXT;

-- Add approval_status and created_by_role columns to drivers table
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS created_by_role TEXT;

-- Add approval_status and created_by_role columns to vehicles table
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved',
ADD COLUMN IF NOT EXISTS created_by_role TEXT;

-- Add current_location fields to vehicles for position tracking
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS current_location TEXT,
ADD COLUMN IF NOT EXISTS current_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS current_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

-- Create index for faster approval status queries
CREATE INDEX IF NOT EXISTS idx_dispatches_approval_status ON dispatches(approval_status);
CREATE INDEX IF NOT EXISTS idx_drivers_approval_status ON drivers(approval_status);
CREATE INDEX IF NOT EXISTS idx_vehicles_approval_status ON vehicles(approval_status);

-- Update existing records to have 'approved' status
UPDATE dispatches SET approval_status = 'approved' WHERE approval_status IS NULL;
UPDATE drivers SET approval_status = 'approved' WHERE approval_status IS NULL;
UPDATE vehicles SET approval_status = 'approved' WHERE approval_status IS NULL;
