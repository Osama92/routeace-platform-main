-- Update delivery_update email template to include current_location variable and fix branding
UPDATE email_templates
SET
  body_template = '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   <div style="background: linear-gradient(135deg, #1a365d 0%, #2d3748 100%); padding: 30px; text-align: center;">
     <h1 style="color: white; margin: 0;">Delivery Update</h1>
   </div>
   <div style="padding: 30px; background: #f7fafc;">
     <p>Dear {{customer_name}},</p>
     <p>Your shipment <strong>{{dispatch_number}}</strong> has been updated.</p>
     <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
       <p><strong>Status:</strong> {{status}}</p>
       <p><strong>Truck:</strong> {{truck_number}}</p>
       <p><strong>Route:</strong> {{pickup}} &rarr; {{delivery}}</p>
       <p><strong>Current Location:</strong> {{current_location}}</p>
     </div>
     <p>Best regards,<br>Glyde Systems</p>
   </div>
 </div>',
  variables = '["dispatch_number", "truck_number", "status", "customer_name", "pickup", "delivery", "current_location"]',
  updated_at = now()
WHERE template_type = 'delivery_update';
