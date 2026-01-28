-- Fix user_presence RLS policies to allow proper upsert operations

-- Drop existing policies
DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users can update own presence status" ON public.user_presence;

-- Create unified insert/update policy for users
CREATE POLICY "Users can manage own presence"
ON public.user_presence
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Ensure select policy exists for all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view presence" ON public.user_presence;
CREATE POLICY "Authenticated users can view presence"
ON public.user_presence
FOR SELECT
TO authenticated
USING (true);

-- Add index for faster queries on status and last_active_at
CREATE INDEX IF NOT EXISTS idx_user_presence_status_active
ON public.user_presence(status, last_active_at DESC);

-- Clean up old offline/stale presence records (optional - can be scheduled)
-- DELETE FROM public.user_presence
-- WHERE status = 'offline'
--   AND last_active_at < NOW() - INTERVAL '1 day';
