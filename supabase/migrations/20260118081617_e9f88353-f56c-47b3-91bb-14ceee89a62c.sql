-- Create email templates table for configurable notifications
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read templates
CREATE POLICY "Authenticated users can read email templates"
ON public.email_templates
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can modify templates
CREATE POLICY "Admins can insert email templates"
ON public.email_templates
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update email templates"
ON public.email_templates
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete email templates"
ON public.email_templates
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default templates
INSERT INTO public.email_templates (template_type, template_name, subject_template, body_template, variables) VALUES
('delivery_update', 'Delivery Status Update', 
 'Shipment Update - {{dispatch_number}} | {{truck_number}} | {{pickup}} → {{delivery}}',
 '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">Delivery Update</h1>
   </div>
   <div style="padding: 30px; background: #f7fafc;">
     <p>Dear {{customer_name}},</p>
     <p>Your shipment <strong>{{dispatch_number}}</strong> has been updated.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Status:</strong> {{status}}</p>
       <p><strong>Truck:</strong> {{truck_number}}</p>
       <p><strong>Route:</strong> {{pickup}} → {{delivery}}</p>
     </div>
     <p>Best regards,<br>RouteAce Logistics</p>
   </div>
 </div>',
 '["dispatch_number", "truck_number", "status", "customer_name", "pickup", "delivery"]'::jsonb),

('sla_breach', 'SLA Breach Alert',
 'SLA Breach Alert - {{dispatch_number}} | {{delay_hours}}h Delay',
 '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #c53030 0%, #9b2c2c 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">⚠️ SLA Breach Alert</h1>
   </div>
   <div style="padding: 30px; background: #fff5f5;">
     <p><strong>Dispatch:</strong> {{dispatch_number}}</p>
     <p><strong>Breach Type:</strong> {{breach_type}}</p>
     <p><strong>Delay:</strong> {{delay_hours}} hours</p>
     <p><strong>Customer:</strong> {{customer_name}}</p>
     <p style="color: #c53030; font-weight: bold;">Immediate action required.</p>
   </div>
 </div>',
 '["dispatch_number", "breach_type", "delay_hours", "customer_name", "expected_time", "actual_time"]'::jsonb),

('invoice_first_approval', 'Invoice First Approval',
 'Invoice {{invoice_number}} - First Approval Complete',
 '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #2b6cb0 0%, #2c5282 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">First Approval Complete</h1>
   </div>
   <div style="padding: 30px; background: #ebf8ff;">
     <p>Invoice <strong>{{invoice_number}}</strong> has received first approval.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Customer:</strong> {{customer_name}}</p>
       <p><strong>Amount:</strong> {{amount}}</p>
     </div>
     <p>Awaiting second approval.</p>
   </div>
 </div>',
 '["invoice_number", "customer_name", "amount", "approver_name"]'::jsonb),

('invoice_second_approval', 'Invoice Final Approval',
 'Invoice {{invoice_number}} - Approved! ✓',
 '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #276749 0%, #22543d 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">✓ Invoice Approved</h1>
   </div>
   <div style="padding: 30px; background: #f0fff4;">
     <p>Great news! Invoice <strong>{{invoice_number}}</strong> has been fully approved.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Customer:</strong> {{customer_name}}</p>
       <p><strong>Amount:</strong> {{amount}}</p>
     </div>
     <p>The invoice is now ready for processing.</p>
   </div>
 </div>',
 '["invoice_number", "customer_name", "amount", "approver_name"]'::jsonb),

('invoice_rejected', 'Invoice Rejected',
 'Invoice {{invoice_number}} - Rejected',
 '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #c53030 0%, #9b2c2c 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">Invoice Rejected</h1>
   </div>
   <div style="padding: 30px; background: #fff5f5;">
     <p>Invoice <strong>{{invoice_number}}</strong> has been rejected.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Customer:</strong> {{customer_name}}</p>
       <p><strong>Amount:</strong> {{amount}}</p>
       <p><strong>Reason:</strong> {{rejection_reason}}</p>
     </div>
     <p>Please review and resubmit.</p>
   </div>
 </div>',
 '["invoice_number", "customer_name", "amount", "rejection_reason", "approver_name"]'::jsonb);