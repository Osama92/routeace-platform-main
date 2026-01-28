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
    const { placeId, sessionToken } = await req.json();
    
    if (!placeId) {
      return new Response(
        JSON.stringify({ error: 'Place ID is required' }),
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

    // Call Google Places Details API
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('fields', 'formatted_address,geometry,address_components');
    if (sessionToken) {
      url.searchParams.set('sessiontoken', sessionToken);
    }

    console.log('Fetching place details for:', placeId);
    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Google Places API error:', data);
      return new Response(
        JSON.stringify({ error: data.error_message || 'Failed to fetch place details' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = data.result;
    const addressComponents = result.address_components || [];
    
    // Extract city and state from address components
    const getComponent = (types: string[]) => {
      const comp = addressComponents.find((c: any) => 
        types.some(t => c.types.includes(t))
      );
      return comp?.long_name || '';
    };

    const placeDetails = {
      formattedAddress: result.formatted_address,
      lat: result.geometry?.location?.lat,
      lng: result.geometry?.location?.lng,
      city: getComponent(['locality', 'administrative_area_level_2']),
      state: getComponent(['administrative_area_level_1']),
      country: getComponent(['country']),
    };

    console.log('Returning place details:', placeDetails);
    return new Response(
      JSON.stringify(placeDetails),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in google-places-details:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
