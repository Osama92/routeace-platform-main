import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalNotificationRequest {
  invoice_id: string;
  action: "first_approval" | "second_approval" | "rejected";
  rejection_reason?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ success: false, error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";

    // Validate caller is authenticated
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await authedClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only admin can send approval notifications
    const { data: roleRow } = await authedClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    const role = (roleRow as any)?.role as string | undefined;
    if (role !== "admin") {
      return new Response(JSON.stringify({ success: false, error: "Forbidden - Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: ApprovalNotificationRequest = await req.json();
    if (!payload.invoice_id || !payload.action) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Get invoice details with customer info
    const { data: invoice, error: invoiceErr } = await serviceClient
      .from("invoices")
      .select(`
        *,
        customers(company_name)
      `)
      .eq("id", payload.invoice_id)
      .single();

    if (invoiceErr || !invoice) {
      return new Response(JSON.stringify({ success: false, error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get submitter's email from profiles
    let submitterEmail: string | null = null;
    if (invoice.submitted_by) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("email")
        .eq("user_id", invoice.submitted_by)
        .single();
      submitterEmail = profile?.email || null;
    }

    if (!submitterEmail) {
      return new Response(JSON.stringify({ success: false, error: "Submitter email not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendApiKey);

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("en-NG", {
        style: "currency",
        currency: "NGN",
        minimumFractionDigits: 0,
      }).format(amount);
    };

    let subject = "";
    let body = "";
    const invoiceNum = invoice.invoice_number;
    const customerName = invoice.customers?.company_name || "Unknown Customer";
    const totalAmount = formatCurrency(invoice.total_amount);

    switch (payload.action) {
      case "first_approval":
        subject = `🔄 Invoice ${invoiceNum} - First Approval Complete`;
        body = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Invoice First Approval Complete</h2>
            <p>Your invoice has passed the first level of approval and is now pending final approval.</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Invoice Number:</strong> ${invoiceNum}</p>
              <p><strong>Customer:</strong> ${customerName}</p>
              <p><strong>Amount:</strong> ${totalAmount}</p>
              <p><strong>Status:</strong> <span style="color: #3b82f6;">Pending Second Approval</span></p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">You will receive another notification once the final approval is complete.</p>
          </div>
        `;
        break;

      case "second_approval":
        subject = `✅ Invoice ${invoiceNum} - Approved!`;
        body = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">Invoice Fully Approved!</h2>
            <p>Congratulations! Your invoice has been fully approved and is now active in the system.</p>
            <div style="background: #ecfdf5; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #10b981;">
              <p><strong>Invoice Number:</strong> ${invoiceNum}</p>
              <p><strong>Customer:</strong> ${customerName}</p>
              <p><strong>Amount:</strong> ${totalAmount}</p>
              <p><strong>Status:</strong> <span style="color: #10b981; font-weight: bold;">Approved</span></p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">The invoice is now pending payment from the customer.</p>
          </div>
        `;
        break;

      case "rejected":
        subject = `❌ Invoice ${invoiceNum} - Rejected`;
        body = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ef4444;">Invoice Rejected</h2>
            <p>Unfortunately, your invoice has been rejected. Please review the feedback below and make necessary corrections.</p>
            <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #ef4444;">
              <p><strong>Invoice Number:</strong> ${invoiceNum}</p>
              <p><strong>Customer:</strong> ${customerName}</p>
              <p><strong>Amount:</strong> ${totalAmount}</p>
              <p><strong>Status:</strong> <span style="color: #ef4444; font-weight: bold;">Rejected</span></p>
            </div>
            <div style="background: #fff7ed; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #f97316;">
              <p><strong>Reason for Rejection:</strong></p>
              <p style="margin: 8px 0;">${payload.rejection_reason || "No reason provided"}</p>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Please update the invoice and resubmit for approval.</p>
          </div>
        `;
        break;
    }

    let status: "sent" | "failed" = "sent";
    let errorMessage: string | null = null;

    try {
      const emailResponse = await resend.emails.send({
        from: "RouteAce <onboarding@resend.dev>",
        to: [submitterEmail],
        subject,
        html: body,
      });
      console.log("Approval notification email sent:", emailResponse);
    } catch (e: any) {
      status = "failed";
      errorMessage = e?.message ?? "Failed to send";
      console.error("Approval notification email send failed:", e);
    }

    // Log the notification
    await serviceClient.from("email_notifications").insert({
      dispatch_id: null,
      recipient_email: submitterEmail,
      recipient_type: "submitter",
      subject,
      body,
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      error_message: errorMessage,
      notification_type: `invoice_${payload.action}`,
      sent_by: userData.user.id,
    });

    return new Response(JSON.stringify({ success: status === "sent", status, error: errorMessage }), {
      status: status === "sent" ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("send-approval-notification error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
