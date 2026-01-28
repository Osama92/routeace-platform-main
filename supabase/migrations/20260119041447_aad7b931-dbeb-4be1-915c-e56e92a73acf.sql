-- Part 1: Auto-approve founding admin accounts

-- 1.1 Update existing profiles to approved status
UPDATE public.profiles 
SET approval_status = 'approved', 
    is_active = true, 
    approved_at = now()
WHERE email IN ('shilaymindz@gmail.com', 'danielolashile@gmail.com');

-- 1.2 Insert admin roles for both users (if not already assigned)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'admin'::app_role 
FROM public.profiles 
WHERE email IN ('shilaymindz@gmail.com', 'danielolashile@gmail.com')
ON CONFLICT DO NOTHING;

-- 1.3 Create auto-approval trigger function for founding admins
CREATE OR REPLACE FUNCTION public.auto_approve_founding_admins()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if email is a founding admin
  IF NEW.email IN ('shilaymindz@gmail.com', 'danielolashile@gmail.com') THEN
    -- Auto-approve and activate
    NEW.approval_status := 'approved';
    NEW.is_active := true;
    NEW.approved_at := now();
    
    -- Also assign admin role (done after insert via separate trigger)
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.4 Create trigger on profiles table for INSERT
DROP TRIGGER IF EXISTS trigger_auto_approve_founding_admins ON public.profiles;
CREATE TRIGGER trigger_auto_approve_founding_admins
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_founding_admins();

-- 1.5 Create trigger for UPDATE
DROP TRIGGER IF EXISTS trigger_auto_approve_founding_admins_update ON public.profiles;
CREATE TRIGGER trigger_auto_approve_founding_admins_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.approval_status IS DISTINCT FROM 'approved' 
        AND NEW.email IN ('shilaymindz@gmail.com', 'danielolashile@gmail.com'))
  EXECUTE FUNCTION public.auto_approve_founding_admins();

-- 1.6 Create function to auto-assign admin role after profile insert
CREATE OR REPLACE FUNCTION public.auto_assign_founding_admin_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IN ('shilaymindz@gmail.com', 'danielolashile@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'admin'::app_role)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1.7 Create trigger for auto-assigning admin role
DROP TRIGGER IF EXISTS trigger_auto_assign_founding_admin_role ON public.profiles;
CREATE TRIGGER trigger_auto_assign_founding_admin_role
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_founding_admin_role();

-- Part 2: Fix Trip Rate Configuration errors

-- 2.1 Add missing columns to trip_rate_config
ALTER TABLE public.trip_rate_config
ADD COLUMN IF NOT EXISTS driver_type TEXT DEFAULT 'owned' CHECK (driver_type IN ('owned', 'vendor')),
ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2.2 Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_trip_rate_config_driver_type ON public.trip_rate_config(driver_type);
CREATE INDEX IF NOT EXISTS idx_trip_rate_config_partner ON public.trip_rate_config(partner_id);
CREATE INDEX IF NOT EXISTS idx_trip_rate_config_customer ON public.trip_rate_config(customer_id);

-- 2.3 Add missing columns to trip_rate_history
ALTER TABLE public.trip_rate_history
ADD COLUMN IF NOT EXISTS driver_type TEXT,
ADD COLUMN IF NOT EXISTS partner_id UUID,
ADD COLUMN IF NOT EXISTS customer_id UUID;