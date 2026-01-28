import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSPayload {
  phoneNumbers: string[];
  message: string;
  type?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('AFRICASTALKING_API_KEY');
    const username = Deno.env.get('AFRICASTALKING_USERNAME');

    if (!apiKey || !username) {
      console.error('Africa\'s Talking credentials not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'SMS service not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const payload: SMSPayload = await req.json();
    console.log('Processing SMS notification:', { 
      recipientCount: payload.phoneNumbers?.length, 
      type: payload.type,
      messageLength: payload.message?.length 
    });

    if (!payload.phoneNumbers || payload.phoneNumbers.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No phone numbers provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!payload.message) {
      return new Response(
        JSON.stringify({ success: false, error: 'No message provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Format phone numbers (ensure they start with +)
    const formattedNumbers = payload.phoneNumbers
      .filter(Boolean)
      .map(num => {
        const cleaned = num.replace(/\s/g, '');
        if (cleaned.startsWith('+')) return cleaned;
        if (cleaned.startsWith('234')) return `+${cleaned}`;
        if (cleaned.startsWith('0')) return `+234${cleaned.slice(1)}`;
        return `+234${cleaned}`;
      });

    if (formattedNumbers.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid phone numbers after formatting' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Sending SMS to:', formattedNumbers);

    // Africa's Talking API endpoint
    const atUrl = 'https://api.africastalking.com/version1/messaging';
    
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('to', formattedNumbers.join(','));
    formData.append('message', payload.message);
    formData.append('from', 'RouteAce'); // Short code or sender ID

    const smsResponse = await fetch(atUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': apiKey,
      },
      body: formData.toString(),
    });

    const smsResult = await smsResponse.json();
    console.log('Africa\'s Talking response:', smsResult);

    if (!smsResponse.ok) {
      throw new Error(smsResult.message || 'Failed to send SMS');
    }

    // Log SMS to database for tracking
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Log each SMS recipient
    const logEntries = formattedNumbers.map(phone => ({
      recipient_email: phone, // Reusing email_notifications table
      recipient_type: 'sms',
      notification_type: payload.type || 'sms_alert',
      subject: 'SMS Notification',
      body: payload.message,
      status: 'sent',
      sent_at: new Date().toISOString(),
    }));

    await supabase.from('email_notifications').insert(logEntries);

    return new Response(
      JSON.stringify({ 
        success: true, 
        result: smsResult,
        recipientCount: formattedNumbers.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error sending SMS:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
