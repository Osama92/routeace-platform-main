-- Create table for rate change notification recipients
CREATE TABLE IF NOT EXISTS public.rate_change_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.rate_change_recipients ENABLE ROW LEVEL SECURITY;

-- RLS policies for rate_change_recipients (using correct function signature: user_id first, then role)
CREATE POLICY "Admins can view rate change recipients" 
ON public.rate_change_recipients 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert rate change recipients" 
ON public.rate_change_recipients 
FOR INSERT 
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update rate change recipients" 
ON public.rate_change_recipients 
FOR UPDATE 
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete rate change recipients" 
ON public.rate_change_recipients 
FOR DELETE 
USING (public.has_role(auth.uid(), 'admin'::public.app_role));