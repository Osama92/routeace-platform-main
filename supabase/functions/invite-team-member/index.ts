import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) throw new Error('Not authenticated');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { email, orgId, role } = await req.json();
    if (!email || !orgId || !role) throw new Error('Missing required fields: email, orgId, role');

    // Verify the caller is an admin in this org
    const { data: membership } = await adminClient
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .eq('is_active', true)
      .single();

    if (!membership || membership.role !== 'admin') {
      throw new Error('Only org admins can invite team members');
    }

    // Fetch org name for the invite email
    const { data: org } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single();

    const orgName = org?.name || 'your organization';

    // Send invite — Supabase will email the user a magic link
    const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { invited_org_id: orgId, invited_role: role },
        redirectTo: `${Deno.env.get('SITE_URL') || 'http://localhost:5173'}/accept-invite?org_id=${orgId}&role=${role}`,
      }
    );

    if (inviteErr) throw inviteErr;

    // If the user already exists, also check if they are already in the org
    // and if not, create a pending org_members row
    const invitedUserId = inviteData?.user?.id;
    if (invitedUserId) {
      // Check if already a member
      const { data: existing } = await adminClient
        .from('org_members')
        .select('id')
        .eq('user_id', invitedUserId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!existing) {
        await adminClient.from('org_members').insert({
          user_id: invitedUserId,
          org_id: orgId,
          role,
          is_active: false, // Inactive until they accept
          invited_by: user.id,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invite sent to ${email}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('Invite error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
