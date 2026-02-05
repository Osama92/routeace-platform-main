import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SLABreachPayload {
  breachId: string;
  dispatchNumber: string;
  customerName: string;
  customerEmail?: string;
  breachType: string;
  delayHours: number;
  expectedTime?: string;
  actualTime?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const resend = new Resend(resendApiKey);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: SLABreachPayload = await req.json();
    console.log('Processing SLA breach email:', payload);

    // Get admin emails from integrations config
    const { data: integrationData } = await supabase
      .from('integrations')
      .select('name, config')
      .in('name', ['notifications', 'sms_notifications']);

    const notificationsConfig = integrationData?.find(i => i.name === 'notifications')?.config as Record<string, any> | null;
    const smsConfig = integrationData?.find(i => i.name === 'sms_notifications')?.config as Record<string, any> | null;

    const adminEmails = Array.isArray(notificationsConfig?.admin_emails) ? notificationsConfig.admin_emails : [];
    const slaEmails = Array.isArray(notificationsConfig?.sla_notification_emails) ? notificationsConfig.sla_notification_emails : [];
    const leadershipEmail = typeof notificationsConfig?.leadership_email === 'string' ? [notificationsConfig.leadership_email] : [];
    const supportEmail = typeof notificationsConfig?.support_email === 'string' ? [notificationsConfig.support_email] : [];

    const allRecipients = [...new Set([...adminEmails, ...slaEmails, ...leadershipEmail, ...supportEmail].filter(Boolean))];

    if (allRecipients.length === 0) {
      console.log('No notification recipients configured');
      return new Response(
        JSON.stringify({ success: true, message: 'No recipients configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get SMS recipients from sms_notifications config
    const smsRecipientsRaw = smsConfig?.sla_sms_recipients || '';
    const smsRecipients = typeof smsRecipientsRaw === 'string' 
      ? smsRecipientsRaw.split(',').map((p: string) => p.trim()).filter(Boolean)
      : [];

    const breachTypeLabel = payload.breachType.replace(/_/g, ' ').toUpperCase();
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
          .alert-box { background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
          .detail-label { font-weight: bold; color: #6b7280; }
          .footer { text-align: center; padding: 15px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⚠️ SLA Breach Alert</h1>
            <p style="margin: 5px 0 0 0;">Immediate Attention Required</p>
          </div>
          <div class="content">
            <div class="alert-box">
              <strong>Breach Type:</strong> ${breachTypeLabel}<br>
              <strong>Delay:</strong> ${payload.delayHours.toFixed(1)} hours
            </div>
            
            <div class="detail-row">
              <span class="detail-label">Dispatch Number:</span>
              <span>${payload.dispatchNumber}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Customer:</span>
              <span>${payload.customerName}</span>
            </div>
            ${payload.expectedTime ? `
            <div class="detail-row">
              <span class="detail-label">Expected Time:</span>
              <span>${new Date(payload.expectedTime).toLocaleString()}</span>
            </div>
            ` : ''}
            ${payload.actualTime ? `
            <div class="detail-row">
              <span class="detail-label">Actual Time:</span>
              <span>${new Date(payload.actualTime).toLocaleString()}</span>
            </div>
            ` : ''}
            
            <p style="margin-top: 20px;">
              Please take immediate action to resolve this SLA breach. 
              Log into the dashboard for more details and to update the breach status.
            </p>
          </div>
          <div class="footer">
            <p>RouteAce Logistics Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: 'Glyde Services <noreply@support.glydeservicesng.com>',
      to: allRecipients,
      subject: `🚨 SLA Breach Alert: ${payload.dispatchNumber} - ${breachTypeLabel}`,
      html: emailHtml,
    });

    console.log('Email sent successfully:', emailResponse);

    // Send SMS notification if recipients are configured
    if (smsRecipients.length > 0) {
      try {
        const smsMessage = `SLA BREACH ALERT: ${payload.dispatchNumber} - ${breachTypeLabel}. Delay: ${payload.delayHours.toFixed(1)}hrs. Customer: ${payload.customerName}. Check dashboard for details.`;
        
        const smsResponse = await fetch(`${supabaseUrl}/functions/v1/send-sms-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            phoneNumbers: smsRecipients,
            message: smsMessage,
            type: 'sla_breach',
          }),
        });
        
        const smsResult = await smsResponse.json();
        console.log('SMS notification result:', smsResult);
      } catch (smsError) {
        console.error('SMS notification failed (non-blocking):', smsError);
      }
    }

    // Mark alert as sent
    await supabase
      .from('sla_breach_alerts')
      .update({ alert_sent: true })
      .eq('id', payload.breachId);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error sending SLA breach email:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
