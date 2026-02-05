import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRUCK_TYPES = ["3T", "5T", "10T", "15T", "20T", "30T", "45T", "60T"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const currentWeek = getWeekNumber(now);

    console.log(`Processing vendor performance for Week ${currentWeek}, ${currentMonth}/${currentYear}`);

    // Fetch all targets for current month
    const { data: targets, error: targetsError } = await supabase
      .from("vendor_truck_targets")
      .select(`
        id,
        vendor_id,
        truck_type,
        target_trips,
        partners!inner(company_name, contact_email)
      `)
      .eq("target_month", currentMonth)
      .eq("target_year", currentYear);

    if (targetsError) throw targetsError;

    if (!targets || targets.length === 0) {
      return new Response(
        JSON.stringify({ message: "No targets found for current period" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch actuals
    const targetIds = targets.map((t) => t.id);
    const { data: actuals, error: actualsError } = await supabase
      .from("vendor_truck_actuals")
      .select("target_id, trips_count")
      .in("target_id", targetIds);

    if (actualsError) throw actualsError;

    // Aggregate actuals by target
    const actualsMap: Record<string, number> = {};
    actuals?.forEach((a) => {
      actualsMap[a.target_id] = (actualsMap[a.target_id] || 0) + (a.trips_count || 1);
    });

    // Group by vendor
    const vendorData: Record<string, any> = {};
    targets.forEach((target: any) => {
      const vendorId = target.vendor_id;
      if (!vendorData[vendorId]) {
        vendorData[vendorId] = {
          vendorId,
          vendorName: target.partners?.company_name || "Unknown",
          vendorEmail: target.partners?.contact_email,
          targets: {},
          actuals: {},
        };
      }
      vendorData[vendorId].targets[target.truck_type] = target.target_trips;
      vendorData[vendorId].actuals[target.truck_type] = actualsMap[target.id] || 0;
    });

    const emailsSent: string[] = [];
    const errors: string[] = [];

    // Process each vendor
    for (const vendor of Object.values(vendorData) as any[]) {
      const targetsSummary: Record<string, number> = {};
      const actualsSummary: Record<string, number> = {};
      const balanceSummary: Record<string, number> = {};

      let totalTarget = 0;
      let totalActual = 0;

      TRUCK_TYPES.forEach((type) => {
        const target = vendor.targets[type] || 0;
        const actual = vendor.actuals[type] || 0;
        targetsSummary[type] = target;
        actualsSummary[type] = actual;
        balanceSummary[type] = Math.max(0, target - actual);
        totalTarget += target;
        totalActual += actual;
      });

      const overallPercentage = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

      // Save snapshot
      const { error: snapshotError } = await supabase
        .from("vendor_performance_snapshots")
        .upsert({
          vendor_id: vendor.vendorId,
          snapshot_week: currentWeek,
          snapshot_year: currentYear,
          snapshot_month: currentMonth,
          targets_summary: targetsSummary,
          actuals_summary: actualsSummary,
          balance_summary: balanceSummary,
          email_sent: false,
        }, {
          onConflict: "vendor_id,snapshot_week,snapshot_year",
        });

      if (snapshotError) {
        console.error("Snapshot error:", snapshotError);
      }

      // Send email if Resend API key is configured
      if (resendApiKey && vendor.vendorEmail) {
        try {
          const emailHtml = generateEmailHtml(
            vendor.vendorName,
            currentWeek,
            currentMonth,
            currentYear,
            targetsSummary,
            actualsSummary,
            balanceSummary,
            overallPercentage
          );

          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Glyde Services <noreply@support.glydeservicesng.com>",
              to: vendor.vendorEmail,
              subject: `Weekly Performance Report - Week ${currentWeek} | ${vendor.vendorName}`,
              html: emailHtml,
            }),
          });

          if (emailResponse.ok) {
            emailsSent.push(vendor.vendorEmail);
            
            // Update snapshot to mark email as sent
            await supabase
              .from("vendor_performance_snapshots")
              .update({ email_sent: true, email_sent_at: new Date().toISOString() })
              .eq("vendor_id", vendor.vendorId)
              .eq("snapshot_week", currentWeek)
              .eq("snapshot_year", currentYear);
          } else {
            const errorText = await emailResponse.text();
            errors.push(`Failed to send to ${vendor.vendorEmail}: ${errorText}`);
          }
        } catch (emailError: any) {
          errors.push(`Email error for ${vendor.vendorEmail}: ${emailError.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        vendorsProcessed: Object.keys(vendorData).length,
        emailsSent: emailsSent.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function generateEmailHtml(
  vendorName: string,
  week: number,
  month: number,
  year: number,
  targets: Record<string, number>,
  actuals: Record<string, number>,
  balance: Record<string, number>,
  overallPercentage: number
): string {
  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long" });

  const getStatusEmoji = (target: number, actual: number) => {
    if (target === 0) return "—";
    const pct = (actual / target) * 100;
    if (pct >= 80) return "✅";
    if (pct >= 50) return "⚠️";
    return "❌";
  };

  let tableRows = "";
  TRUCK_TYPES.forEach((type) => {
    const target = targets[type] || 0;
    const actual = actuals[type] || 0;
    const bal = balance[type] || 0;
    const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
    const status = getStatusEmoji(target, actual);

    if (target > 0) {
      tableRows += `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${type}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${target}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${actual}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${bal}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${pct}% ${status}</td>
        </tr>
      `;
    }
  });

  const performanceMessage = overallPercentage >= 80
    ? "Great job! You're on track to meet your targets this month. Keep up the excellent work!"
    : overallPercentage >= 50
    ? "You're making progress, but there's room for improvement. Focus on the truck types marked with ⚠️ to meet your monthly targets."
    : "Your performance needs attention. Please prioritize increasing deployments on the truck types marked with ❌ to meet your commitments.";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Weekly Performance Report</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Week ${week} of ${monthName} ${year}</p>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px;">Dear <strong>${vendorName}</strong>,</p>
        
        <p>Here is your weekly truck deployment performance summary:</p>
        
        <div style="background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 12px; text-align: left;">Truck Type</th>
                <th style="padding: 12px; text-align: center;">Target</th>
                <th style="padding: 12px; text-align: center;">Actual</th>
                <th style="padding: 12px; text-align: center;">Balance</th>
                <th style="padding: 12px; text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="5" style="padding: 20px; text-align: center;">No targets set</td></tr>'}
            </tbody>
          </table>
        </div>
        
        <div style="background: ${overallPercentage >= 80 ? '#dcfce7' : overallPercentage >= 50 ? '#fef3c7' : '#fee2e2'}; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; font-size: 18px; font-weight: 600;">
            Overall Performance: <span style="color: ${overallPercentage >= 80 ? '#16a34a' : overallPercentage >= 50 ? '#d97706' : '#dc2626'}">${overallPercentage}%</span>
          </p>
        </div>
        
        <p style="margin-top: 20px;">${performanceMessage}</p>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          This is an automated weekly report. For any questions, please contact your account manager.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          RouteAce Logistics Platform<br>
          © ${year} All rights reserved
        </p>
      </div>
    </body>
    </html>
  `;
}
