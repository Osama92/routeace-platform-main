-- Create expense categories enum
CREATE TYPE expense_category AS ENUM (
  'fuel',
  'maintenance', 
  'driver_salary',
  'insurance',
  'tolls',
  'parking',
  'repairs',
  'administrative',
  'marketing',
  'utilities',
  'rent',
  'equipment',
  'other'
);

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  vendor_id UUID REFERENCES public.partners(id),
  vehicle_id UUID REFERENCES public.vehicles(id),
  driver_id UUID REFERENCES public.drivers(id),
  dispatch_id UUID REFERENCES public.dispatches(id),
  customer_id UUID REFERENCES public.customers(id),
  receipt_url TEXT,
  notes TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for expenses
CREATE POLICY "Expenses are viewable by authenticated users with roles"
ON public.expenses FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'operations') OR
  public.has_role(auth.uid(), 'support')
);

CREATE POLICY "Expenses can be created by admin and operations"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'operations')
);

CREATE POLICY "Expenses can be updated by admin and operations"
ON public.expenses FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'operations')
);

CREATE POLICY "Expenses can be deleted by admin only"
ON public.expenses FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_expenses_category ON public.expenses(category);
CREATE INDEX idx_expenses_expense_date ON public.expenses(expense_date);
CREATE INDEX idx_expenses_vendor_id ON public.expenses(vendor_id);
CREATE INDEX idx_expenses_vehicle_id ON public.expenses(vehicle_id);