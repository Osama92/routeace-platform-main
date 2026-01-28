import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { origins, destinations } = await req.json();

    if (!origins || !destinations) {
      return new Response(
        JSON.stringify({ error: 'Origins and destinations are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      console.error('GOOGLE_MAPS_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Google Maps API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Google Distance Matrix API
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', origins);
    url.searchParams.set('destinations', destinations);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('units', 'metric');

    console.log('Fetching distance matrix for:', { origins, destinations });
    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Google Distance Matrix API error:', data);
      return new Response(
        JSON.stringify({ error: data.error_message || 'Failed to calculate distance' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract distance and duration from the response
    const element = data.rows?.[0]?.elements?.[0];

    if (!element || element.status !== 'OK') {
      return new Response(
        JSON.stringify({ error: 'No route found between the locations' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = {
      distance_meters: element.distance?.value || 0,
      distance_km: element.distance?.value ? Math.round(element.distance.value / 1000) : 0,
      distance_text: element.distance?.text || '',
      duration_seconds: element.duration?.value || 0,
      duration_text: element.duration?.text || '',
      origin_address: data.origin_addresses?.[0] || origins,
      destination_address: data.destination_addresses?.[0] || destinations,
    };

    console.log('Returning distance result:', result);
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in google-distance-matrix:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
