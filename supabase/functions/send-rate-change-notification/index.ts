import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RateChangeNotificationRequest {
  truck_type: string;
  zone: string;
  old_rate: number | null;
  new_rate: number;
  change_type: 'create' | 'update' | 'delete' | 'bulk_update';
  changed_by_email: string;
  driver_type?: 'owned' | 'vendor';
  partner_name?: string;
  customer_name?: string;
  notes?: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.log("Resend API key not configured, skipping email notification");
      return new Response(
        JSON.stringify({ success: true, message: "Email service not configured, notification skipped" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: RateChangeNotificationRequest = await req.json();
    console.log("Rate change notification payload:", payload);

    const resend = new Resend(resendApiKey);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Fetch active notification recipients
    const { data: recipients, error: recipientsError } = await serviceClient
      .from("rate_change_recipients")
      .select("email")
      .eq("is_active", true);

    if (recipientsError) {
      console.error("Failed to fetch recipients:", recipientsError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to fetch recipients" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!recipients || recipients.length === 0) {
      console.log("No active notification recipients configured");
      return new Response(
        JSON.stringify({ success: true, message: "No recipients configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build email content
    const zoneLabel = payload.zone === 'within_ibadan' ? 'Within Zone' : 'Outside Zone';
    const driverTypeLabel = payload.driver_type === 'vendor' ? '3rd Party Vendor' : 'Owned Driver';
    
    let changeDescription = '';
    let rateChange = '';
    
    switch (payload.change_type) {
      case 'create':
        changeDescription = 'New rate created';
        rateChange = `New rate: ${formatCurrency(payload.new_rate)}`;
        break;
      case 'delete':
        changeDescription = 'Rate deleted';
        rateChange = `Previous rate: ${formatCurrency(payload.old_rate || 0)}`;
        break;
      case 'bulk_update':
        changeDescription = 'Bulk rate update';
        rateChange = payload.old_rate 
          ? `${formatCurrency(payload.old_rate)} → ${formatCurrency(payload.new_rate)}`
          : `New rate: ${formatCurrency(payload.new_rate)}`;
        break;
      default:
        changeDescription = 'Rate updated';
        rateChange = payload.old_rate 
          ? `${formatCurrency(payload.old_rate)} → ${formatCurrency(payload.new_rate)}`
          : `New rate: ${formatCurrency(payload.new_rate)}`;
    }

    // Calculate percentage change if applicable
    let percentChange = '';
    if (payload.old_rate && payload.old_rate > 0 && payload.change_type !== 'delete') {
      const change = ((payload.new_rate - payload.old_rate) / payload.old_rate) * 100;
      percentChange = change >= 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;
    }

    const subject = `[RouteAce] Trip Rate ${payload.change_type === 'delete' ? 'Deleted' : 'Changed'}: ${payload.truck_type.toUpperCase()} - ${zoneLabel}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Trip Rate ${changeDescription}</h1>
        </div>
        
        <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold; width: 140px;">Truck Type:</td>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${payload.truck_type.toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Zone:</td>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                <span style="background: ${payload.zone === 'within_ibadan' ? '#dbeafe' : '#fed7aa'}; 
                             color: ${payload.zone === 'within_ibadan' ? '#1d4ed8' : '#c2410c'}; 
                             padding: 4px 12px; border-radius: 4px; font-size: 13px;">
                  ${zoneLabel}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Driver Type:</td>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${driverTypeLabel}</td>
            </tr>
            ${payload.partner_name ? `
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Vendor:</td>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${payload.partner_name}</td>
            </tr>
            ` : ''}
            ${payload.customer_name ? `
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Customer:</td>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${payload.customer_name}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Rate Change:</td>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
                <span style="font-size: 16px; font-weight: bold; color: ${payload.change_type === 'delete' ? '#dc2626' : '#16a34a'};">
                  ${rateChange}
                </span>
                ${percentChange ? `<span style="margin-left: 8px; color: #6b7280;">(${percentChange})</span>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Changed By:</td>
              <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">${payload.changed_by_email}</td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: bold;">Changed At:</td>
              <td style="padding: 12px;">${new Date().toLocaleString('en-NG', { dateStyle: 'full', timeStyle: 'short' })}</td>
            </tr>
            ${payload.notes ? `
            <tr>
              <td style="padding: 12px; font-weight: bold; vertical-align: top;">Notes:</td>
              <td style="padding: 12px; color: #6b7280;">${payload.notes}</td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        <div style="background: #f1f5f9; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
          <p style="margin: 0; color: #64748b; font-size: 13px;">
            This is an automated notification from RouteAce. Rate changes will apply to future payroll calculations.
          </p>
        </div>
      </div>
    `;

    // Send email to all recipients
    const recipientEmails = recipients.map(r => r.email);
    let successCount = 0;
    let failCount = 0;

    for (const email of recipientEmails) {
      try {
        await resend.emails.send({
          from: "RouteAce <onboarding@resend.dev>",
          to: [email],
          subject,
          html: htmlBody,
        });
        successCount++;
        console.log(`Rate change notification sent to: ${email}`);
      } catch (e: any) {
        failCount++;
        console.error(`Failed to send to ${email}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Notifications sent: ${successCount} success, ${failCount} failed`,
        sent: successCount,
        failed: failCount
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("send-rate-change-notification error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
