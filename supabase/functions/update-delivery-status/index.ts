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

    // Get dispatch details with customer, vehicle, and driver info
    const { data: dispatch, error: dispatchError } = await supabase
      .from("dispatches")
      .select(
        `
        id,
        dispatch_number,
        pickup_address,
        delivery_address,
        driver_id,
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

    // Increment driver's total_trips when dispatch is delivered
    if (status === "delivered" && (dispatch as any).driver_id) {
      const driverId = (dispatch as any).driver_id;
      // Count all delivered dispatches for this driver to set accurate total
      const { count } = await supabase
        .from("dispatches")
        .select("id", { count: "exact", head: true })
        .eq("driver_id", driverId)
        .eq("status", "delivered");

      await supabase
        .from("drivers")
        .update({ total_trips: count || 0 })
        .eq("id", driverId);
    }

    // Create delivery update record
    const { error: insertError } = await supabase.from("delivery_updates").insert({
      dispatch_id,
      status,
      location,
      notes,
      email_sent: false,
    });

    if (insertError) throw insertError;

    // Fetch all delivery updates for timeline
    const { data: allUpdates } = await supabase
      .from("delivery_updates")
      .select("status, location, notes, created_at")
      .eq("dispatch_id", dispatch_id)
      .order("created_at", { ascending: true });

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

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured; cannot send status update email");
    } else {
      const resend = new Resend(resendApiKey);

      const vehicleReg = (dispatch as any).vehicles?.registration_number || "";
      const pickupShort = (dispatch as any).pickup_address?.split(",")[0] || (dispatch as any).pickup_address;
      const deliveryShort = (dispatch as any).delivery_address?.split(",")[0] || (dispatch as any).delivery_address;
      const currentLocation = location || "Not yet reported";

      // Build shipment journey timeline HTML for emails
      const statusLabels: Record<string, string> = {
        assigned: "Assigned",
        picked_up: "Picked Up",
        in_transit: "In Transit",
        delivered: "Delivered",
        cancelled: "Cancelled",
      };
      const statusDotColors: Record<string, string> = {
        delivered: "#10b981",
        in_transit: "#f59e0b",
        picked_up: "#3b82f6",
        assigned: "#6366f1",
        cancelled: "#ef4444",
      };
      const timelineHtml = (allUpdates && allUpdates.length > 0) ? `
        <div style="margin: 20px 0;">
          <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #374151;">Shipment Journey</h3>
          ${allUpdates.map((u: any, i: number) => {
            const label = statusLabels[u.status] || u.status.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            const dateStr = new Date(u.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
            const locationStr = u.location ? `<br/><span style="color:#6b7280;">📍 ${u.location}</span>` : "";
            const notesStr = u.notes ? `<br/><span style="color:#6b7280;">📝 ${u.notes}</span>` : "";
            const dotColor = statusDotColors[u.status] || "#9ca3af";
            const line = i < allUpdates.length - 1 ? `<div style="width:2px;height:20px;background:#e5e7eb;margin:4px auto 0;"></div>` : "";
            return `<div style="display:flex;gap:12px;margin-bottom:4px;">
              <div style="display:flex;flex-direction:column;align-items:center;min-width:16px;">
                <div style="width:12px;height:12px;border-radius:50%;background:${dotColor};flex-shrink:0;margin-top:4px;"></div>
                ${line}
              </div>
              <div style="padding-bottom:8px;">
                <strong style="color:#111827;">${label}</strong>${locationStr}${notesStr}
                <br/><span style="font-size:12px;color:#9ca3af;">${dateStr}</span>
              </div>
            </div>`;
          }).join("")}
        </div>` : "";

      // Try to fetch the delivery_update email template from DB
      const { data: emailTemplate } = await supabase
        .from("email_templates")
        .select("subject_template, body_template")
        .eq("template_type", "delivery_update")
        .eq("is_active", true)
        .maybeSingle();

      let subject: string;
      let body: string;

      if (emailTemplate) {
        // Use DB template — replace variables
        const statusFormatted = status.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
        const templateVars: Record<string, string> = {
          dispatch_number: (dispatch as any).dispatch_number,
          truck_number: vehicleReg || "N/A",
          status: statusFormatted,
          customer_name: customerName || "Customer",
          pickup: (dispatch as any).pickup_address,
          delivery: (dispatch as any).delivery_address,
          current_location: currentLocation,
          shipment_timeline: timelineHtml,
        };

        subject = emailTemplate.subject_template;
        body = emailTemplate.body_template;

        for (const [key, value] of Object.entries(templateVars)) {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
          subject = subject.replace(regex, value);
          body = body.replace(regex, value);
        }

        // If the DB template doesn't contain {{current_location}}, inject it before the closing card div
        if (!emailTemplate.body_template.includes("{{current_location}}")) {
          const locationHtml = `<p><strong>Current Location:</strong> ${currentLocation}</p>`;
          body = body.replace(
            /(<\/div>\s*<p>Best regards)/i,
            `${locationHtml}</div>\n     <p>Best regards`
          );
        }

        // If the DB template doesn't contain {{shipment_timeline}}, inject timeline before "Best regards"
        if (!emailTemplate.body_template.includes("{{shipment_timeline}}") && timelineHtml) {
          body = body.replace(
            /(<p>Best regards)/i,
            `${timelineHtml}\n$1`
          );
        }

        // Fix branding
        body = body.replace(/RouteAce Logistics/g, "Glyde Systems");
      } else {
        // Fallback: plain text email
        subject = vehicleReg
          ? `[${vehicleReg}] ${pickupShort} -- ${deliveryShort} - Delivery Update - ${(dispatch as any).dispatch_number}`
          : `${pickupShort} -- ${deliveryShort} - Delivery Update - ${(dispatch as any).dispatch_number}`;

        const truckLine = vehicleReg ? `\nTruck: ${vehicleReg}` : "";
        const locationLine = location
          ? `\nCurrent Vehicle Location: ${location}`
          : "";

        // Build plain text timeline
        const textTimeline = (allUpdates && allUpdates.length > 0) ? "\n\n--- Shipment Journey ---\n" + allUpdates.map((u: any) => {
          const label = statusLabels[u.status] || u.status.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
          const dateStr = new Date(u.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
          const loc = u.location ? ` | ${u.location}` : "";
          return `• ${label}${loc} — ${dateStr}`;
        }).join("\n") : "";

        body = `Dear ${customerName || "Customer"},\n\n${
          statusMessages[status] || `Status updated to: ${status}`
        }\n\nDispatch Number: ${(dispatch as any).dispatch_number}${truckLine}\nPickup: ${(dispatch as any).pickup_address}\nDelivery: ${(dispatch as any).delivery_address}${locationLine}${textTimeline}\n\nThank you for your business.\n\nBest regards,\nGlyde Systems`;
      }

      const htmlBody = emailTemplate ? body : body.replace(/\n/g, "<br/>");

      // --- Send to CUSTOMER ---
      if (customerEmail) {
        try {
          const emailResponse = await resend.emails.send({
            from: "Glyde Services <noreply@support.glydeservicesng.com>",
            to: [customerEmail],
            subject,
            html: htmlBody,
          });
          console.log("Status update email sent to customer:", emailResponse);
          emailSent = true;

          await supabase
            .from("delivery_updates")
            .update({ email_sent: true })
            .eq("dispatch_id", dispatch_id)
            .eq("status", status)
            .order("created_at", { ascending: false })
            .limit(1);

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
          console.error("Failed to send status update email to customer:", e);
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

      // --- Send to LEADERSHIP & SUPPORT ---
      const { data: integrationData } = await supabase
        .from("integrations")
        .select("name, config")
        .eq("name", "notifications")
        .maybeSingle();

      const notificationsConfig = (integrationData?.config as Record<string, any>) || {};
      const leadershipEmail = typeof notificationsConfig.leadership_email === "string" && notificationsConfig.leadership_email
        ? notificationsConfig.leadership_email : null;
      const supportEmailAddr = typeof notificationsConfig.support_email === "string" && notificationsConfig.support_email
        ? notificationsConfig.support_email : null;

      // Build unique list of internal recipients (exclude customer to avoid duplicates)
      const internalRecipients: { email: string; type: string }[] = [];
      if (leadershipEmail && leadershipEmail !== customerEmail) {
        internalRecipients.push({ email: leadershipEmail, type: "leadership" });
      }
      if (supportEmailAddr && supportEmailAddr !== customerEmail && supportEmailAddr !== leadershipEmail) {
        internalRecipients.push({ email: supportEmailAddr, type: "support" });
      }

      const internalSubject = `[INTERNAL] ${subject}`;

      for (const recipient of internalRecipients) {
        try {
          const internalResponse = await resend.emails.send({
            from: "Glyde Services <noreply@support.glydeservicesng.com>",
            to: [recipient.email],
            subject: internalSubject,
            html: htmlBody,
          });
          console.log(`Status update email sent to ${recipient.type}:`, internalResponse);

          await supabase.from("email_notifications").insert({
            dispatch_id,
            recipient_email: recipient.email,
            recipient_type: recipient.type,
            subject: internalSubject,
            body,
            status: "sent",
            sent_at: new Date().toISOString(),
            notification_type: "status_update",
            sent_by: userData.user.id,
            sla_met: true,
            sla_response_time_minutes: 0,
          });
        } catch (e: any) {
          console.error(`Failed to send status update email to ${recipient.type}:`, e);
          await supabase.from("email_notifications").insert({
            dispatch_id,
            recipient_email: recipient.email,
            recipient_type: recipient.type,
            subject: internalSubject,
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
