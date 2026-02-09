-- Add status tracking fields to dispatch_dropoffs table
ALTER TABLE dispatch_dropoffs
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_notes TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN dispatch_dropoffs.status IS 'Status of this dropoff point: pending, arrived, completed, skipped';
COMMENT ON COLUMN dispatch_dropoffs.status_updated_at IS 'When the status was last updated';
COMMENT ON COLUMN dispatch_dropoffs.status_notes IS 'Notes for this specific dropoff status update';
COMMENT ON COLUMN dispatch_dropoffs.completed_at IS 'When the dropoff was marked as completed';
