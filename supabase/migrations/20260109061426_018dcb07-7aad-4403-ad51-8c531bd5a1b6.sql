-- Add TIN number to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tin_number TEXT;

-- Create tracking tokens table for customer portal access
CREATE TABLE IF NOT EXISTS public.tracking_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_id UUID NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(dispatch_id)
);

-- Enable RLS on tracking tokens
ALTER TABLE public.tracking_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read tracking tokens (for public tracking portal)
CREATE POLICY "Public can view tracking tokens" 
ON public.tracking_tokens 
FOR SELECT 
USING (true);

-- Staff can manage tracking tokens
CREATE POLICY "Staff can manage tracking tokens" 
ON public.tracking_tokens 
FOR ALL 
USING (has_any_role(auth.uid()));