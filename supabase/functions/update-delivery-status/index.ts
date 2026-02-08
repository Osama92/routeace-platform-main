import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DeliveryUpdateRequest {
  dispatch_id: string;
  status: string;
  location?: string;
  notes?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth gate (must be logged in)
    const authHeader = req.headers.get("Authorization") ?? "";
    const authedClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await authedClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { dispatch_id, status, location, notes }: DeliveryUpdateRequest = await req.json();

    // Get dispatch details with customer and vehicle info
    const { data: dispatch, error: dispatchError } = await supabase
      .from("dispatches")
      .select(
        `
        id,
        dispatch_number,
        pickup_address,
        delivery_address,
        customers (
          company_name,
          contact_name,
          email
        ),
        vehicles (
          registration_number
        )
      `
      )
      .eq("id", dispatch_id)
      .single();

    if (dispatchError || !dispatch) {
      throw new Error("Dispatch not found");
    }

    // Update dispatch status
    const { error: updateError } = await supabase
      .from("dispatches")
      .update({
        status,
        ...(status === "picked_up" && { actual_pickup: new Date().toISOString() }),
        ...(status === "delivered" && { actual_delivery: new Date().toISOString() }),
      })
      .eq("id", dispatch_id);

    if (updateError) throw updateError;

    // Create delivery update record
    const { error: insertError } = await supabase.from("delivery_updates").insert({
      dispatch_id,
      status,
      location,
      notes,
      email_sent: false,
    });

    if (insertError) throw insertError;

    // Prepare email content
    const statusMessages: Record<string, string> = {
      assigned: "Your shipment has been assigned to a driver and will be picked up soon.",
      picked_up: "Your shipment has been picked up and is on its way.",
      in_transit: "Your shipment is currently in transit.",
      delivered: "Your shipment has been successfully delivered!",
      cancelled: "Your shipment has been cancelled.",
    };

    const customerEmail = (dispatch as any).customers?.email as string | undefined;
    const customerName =
      (dispatch as any).customers?.contact_name || (dispatch as any).customers?.company_name;

    let emailSent = false;

    if (customerEmail) {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.warn("RESEND_API_KEY not configured; cannot send status update email");
      } else {
        const resend = new Resend(resendApiKey);

        const vehicleReg = (dispatch as any).vehicles?.registration_number || "";
        const pickupShort = (dispatch as any).pickup_address?.split(",")[0] || (dispatch as any).pickup_address;
        const deliveryShort = (dispatch as any).delivery_address?.split(",")[0] || (dispatch as any).delivery_address;

        // Subject format: [VEHICLE] Pickup -- Delivery - Delivery Update - DSP-XXX
        const subject = vehicleReg
          ? `[${vehicleReg}] ${pickupShort} -- ${deliveryShort} - Delivery Update - ${(dispatch as any).dispatch_number}`
          : `${pickupShort} -- ${deliveryShort} - Delivery Update - ${(dispatch as any).dispatch_number}`;

        const body = `Dear ${customerName || "Customer"},\n\n${
          statusMessages[status] || `Status updated to: ${status}`
        } Thank you for choosing us!\n\nDispatch Number: ${(dispatch as any).dispatch_number}\nPickup: ${(dispatch as any).pickup_address}\nDelivery: ${(dispatch as any).delivery_address}\n\nThank you for your business.\n\nBest regards,\nLogistics Team`;

        try {
          const emailResponse = await resend.emails.send({
            from: "Glyde Services <noreply@support.glydeservicesng.com>",
            to: [customerEmail],
            subject,
            html: body.replace(/\n/g, "<br/>") ,
          });
          console.log("Status update email sent:", emailResponse);
          emailSent = true;

          // Mark delivery update email as sent
          await supabase
            .from("delivery_updates")
            .update({ email_sent: true })
            .eq("dispatch_id", dispatch_id)
            .eq("status", status)
            .order("created_at", { ascending: false })
            .limit(1);

          // Log email
          await supabase.from("email_notifications").insert({
            dispatch_id,
            recipient_email: customerEmail,
            recipient_type: "customer",
            subject,
            body,
            status: "sent",
            sent_at: new Date().toISOString(),
            notification_type: "status_update",
            sent_by: userData.user.id,
            sla_met: true,
            sla_response_time_minutes: 0,
          });
        } catch (e: any) {
          console.error("Failed to send status update email:", e);
          await supabase.from("email_notifications").insert({
            dispatch_id,
            recipient_email: customerEmail,
            recipient_type: "customer",
            subject: `Shipment Update - ${(dispatch as any).dispatch_number}`,
            body: `Failed to send. Intended body:\n\n${body}`,
            status: "failed",
            error_message: e?.message ?? "Failed to send",
            notification_type: "status_update",
            sent_by: userData.user.id,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Status updated to ${status}`,
        email_sent: emailSent,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in update-delivery-status function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
