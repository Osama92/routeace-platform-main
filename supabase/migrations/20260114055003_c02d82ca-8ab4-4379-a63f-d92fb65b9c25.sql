-- Add missing columns to email_notifications table
ALTER TABLE public.email_notifications
ADD COLUMN IF NOT EXISTS notification_type TEXT DEFAULT 'status_update',
ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sla_met BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sla_response_time_minutes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sent_by UUID;