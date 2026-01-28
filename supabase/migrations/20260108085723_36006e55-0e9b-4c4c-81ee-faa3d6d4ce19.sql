-- Fix the permissive INSERT policy for email_notifications
DROP POLICY IF EXISTS "System can insert email notifications" ON public.email_notifications;

-- Allow staff to create email notifications
CREATE POLICY "Staff can insert email notifications" 
ON public.email_notifications 
FOR INSERT 
WITH CHECK (has_any_role(auth.uid()));