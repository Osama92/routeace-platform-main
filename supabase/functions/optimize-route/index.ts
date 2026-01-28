import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Waypoint {
  address: string;
  latitude?: number;
  longitude?: number;
}

interface OptimizedRoute {
  optimizedOrder: number[];
  waypoints: Waypoint[];
  totalDistanceKm: number;
  totalDurationHours: number;
  legs: {
    from: string;
    to: string;
    distanceKm: number;
    durationHours: number;
  }[];
  savingsPercent: number;
}

async function geocodeAddress(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );
    const data = await response.json();
    
    if (data.status === 'OK' && data.results?.[0]) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

async function getOptimizedRoute(
  origin: Waypoint,
  destination: Waypoint,
  waypoints: Waypoint[],
  apiKey: string
): Promise<OptimizedRoute | null> {
  try {
    // Build waypoints string with optimization
    const waypointsStr = waypoints
      .map((wp) => wp.latitude && wp.longitude 
        ? `${wp.latitude},${wp.longitude}`
        : encodeURIComponent(wp.address)
      )
      .join('|');

    const originStr = origin.latitude && origin.longitude
      ? `${origin.latitude},${origin.longitude}`
      : encodeURIComponent(origin.address);
    
    const destStr = destination.latitude && destination.longitude
      ? `${destination.latitude},${destination.longitude}`
      : encodeURIComponent(destination.address);

    // Request with waypoint optimization
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&waypoints=optimize:true|${waypointsStr}&key=${apiKey}`;
    
    console.log('Requesting optimized route...');
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Directions API error:', data.status, data.error_message);
      return null;
    }

    const route = data.routes[0];
    const optimizedOrder = route.waypoint_order || [];
    
    // Calculate total distance and duration
    let totalDistanceKm = 0;
    let totalDurationHours = 0;
    const legs: OptimizedRoute['legs'] = [];

    const allPoints = [origin, ...waypoints, destination];
    const optimizedPoints = [
      origin,
      ...optimizedOrder.map((i: number) => waypoints[i]),
      destination
    ];

    route.legs.forEach((leg: any, index: number) => {
      const distanceKm = leg.distance.value / 1000;
      const durationHours = leg.duration.value / 3600;
      
      totalDistanceKm += distanceKm;
      totalDurationHours += durationHours;
      
      legs.push({
        from: optimizedPoints[index]?.address || leg.start_address,
        to: optimizedPoints[index + 1]?.address || leg.end_address,
        distanceKm: Math.round(distanceKm * 10) / 10,
        durationHours: Math.round(durationHours * 100) / 100,
      });
    });

    // Calculate savings by comparing with original order
    const originalUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&waypoints=${waypointsStr}&key=${apiKey}`;
    const originalResponse = await fetch(originalUrl);
    const originalData = await originalResponse.json();
    
    let originalDistance = 0;
    if (originalData.status === 'OK') {
      originalData.routes[0].legs.forEach((leg: any) => {
        originalDistance += leg.distance.value / 1000;
      });
    }

    const savingsPercent = originalDistance > 0 
      ? Math.round((1 - totalDistanceKm / originalDistance) * 100)
      : 0;

    return {
      optimizedOrder,
      waypoints: optimizedPoints,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      totalDurationHours: Math.round(totalDurationHours * 100) / 100,
      legs,
      savingsPercent: Math.max(0, savingsPercent),
    };
  } catch (error) {
    console.error('Route optimization error:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { origin, destination, waypoints } = await req.json();

    if (!origin?.address || !destination?.address) {
      return new Response(
        JSON.stringify({ error: 'Origin and destination addresses are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Google Maps API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Geocode addresses if coordinates not provided
    const geocodedWaypoints: Waypoint[] = [];
    
    for (const wp of waypoints || []) {
      if (!wp.latitude || !wp.longitude) {
        const coords = await geocodeAddress(wp.address, apiKey);
        geocodedWaypoints.push({
          address: wp.address,
          latitude: coords?.lat,
          longitude: coords?.lng,
        });
      } else {
        geocodedWaypoints.push(wp);
      }
    }

    // Geocode origin and destination if needed
    let geocodedOrigin = origin;
    let geocodedDestination = destination;

    if (!origin.latitude || !origin.longitude) {
      const coords = await geocodeAddress(origin.address, apiKey);
      geocodedOrigin = { ...origin, latitude: coords?.lat, longitude: coords?.lng };
    }

    if (!destination.latitude || !destination.longitude) {
      const coords = await geocodeAddress(destination.address, apiKey);
      geocodedDestination = { ...destination, latitude: coords?.lat, longitude: coords?.lng };
    }

    // Get optimized route
    const result = await getOptimizedRoute(
      geocodedOrigin,
      geocodedDestination,
      geocodedWaypoints,
      apiKey
    );

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Failed to optimize route' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Route optimized successfully:', {
      totalDistance: result.totalDistanceKm,
      savings: result.savingsPercent,
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in optimize-route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});