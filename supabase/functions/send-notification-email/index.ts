import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendNotificationEmailRequest {
  dispatch_id?: string | null;
  recipient_email: string;
  recipient_type: string; // customer, leadership, support, etc.
  subject: string;
  body: string;
  notification_type?: string | null;
  include_dispatch_details?: boolean; // If true, fetch truck & locations for subject
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

    // Basic role gate (admin/support/operations)
    const { data: roleRow } = await authedClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    const role = (roleRow as any)?.role as string | undefined;
    const allowed = new Set(["admin", "support", "operations"]);
    if (!role || !allowed.has(role)) {
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body with error handling
    let payload: SendNotificationEmailRequest;
    try {
      const bodyText = await req.text();
      if (!bodyText || bodyText.trim() === "") {
        return new Response(JSON.stringify({ success: false, error: "Request body is empty" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      payload = JSON.parse(bodyText);
    } catch (parseError: any) {
      console.error("JSON parse error:", parseError);
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payload.recipient_email || !payload.subject || !payload.body) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields: recipient_email, subject, and body are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resend = new Resend(resendApiKey);
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    // Build enhanced subject with truck and locations if dispatch_id provided
    let finalSubject = payload.subject;
    if (payload.dispatch_id && payload.include_dispatch_details !== false) {
      const { data: dispatchData } = await serviceClient
        .from("dispatches")
        .select(`
          dispatch_number,
          pickup_address,
          delivery_address,
          vehicles(registration_number)
        `)
        .eq("id", payload.dispatch_id)
        .single();

      if (dispatchData) {
        const truckNumber = (dispatchData.vehicles as any)?.registration_number || "N/A";
        const pickup = dispatchData.pickup_address?.split(",")[0] || "Origin";
        const delivery = dispatchData.delivery_address?.split(",")[0] || "Destination";
        finalSubject = `[${truckNumber}] ${pickup} → ${delivery} - ${payload.subject}`;
      }
    }

    let status: "sent" | "failed" = "sent";
    let errorMessage: string | null = null;

    try {
      const emailResponse = await resend.emails.send({
        from: "Glyde Services <onboarding@resend.dev>",
        to: [payload.recipient_email],
        subject: finalSubject,
        html: payload.body.replace(/\n/g, "<br/>"),
      });
      console.log("Notification email sent:", emailResponse);
    } catch (e: any) {
      status = "failed";
      errorMessage = e?.message ?? "Failed to send";
      console.error("Notification email send failed:", e);
    }

    // Always log with the enhanced subject
    await serviceClient.from("email_notifications").insert({
      dispatch_id: payload.dispatch_id ?? null,
      recipient_email: payload.recipient_email,
      recipient_type: payload.recipient_type,
      subject: finalSubject,
      body: payload.body,
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      error_message: errorMessage,
      notification_type: payload.notification_type ?? "manual",
      sent_by: userData.user.id,
      sla_met: status === "sent" ? true : null,
      sla_response_time_minutes: status === "sent" ? 0 : null,
    });

    return new Response(JSON.stringify({ success: status === "sent", status, error: errorMessage }), {
      status: status === "sent" ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("send-notification-email error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
