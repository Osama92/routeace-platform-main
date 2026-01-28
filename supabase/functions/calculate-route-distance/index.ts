import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WaypointInput {
  location_name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  sla_hours?: number;
}

interface RouteCalculationResult {
  total_distance_km: number;
  total_duration_hours: number;
  waypoints: Array<{
    location_name: string;
    address: string;
    latitude: number;
    longitude: number;
    distance_from_previous_km: number;
    duration_from_previous_hours: number;
  }>;
}

async function getPlaceDetails(address: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
    const response = await fetch(geocodeUrl);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
    console.error('Geocoding failed for:', address, data.status);
    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

async function getDistanceMatrix(
  origins: Array<{ lat: number; lng: number }>,
  destinations: Array<{ lat: number; lng: number }>,
  apiKey: string
): Promise<Array<{ distance_km: number; duration_hours: number }>> {
  try {
    const originsStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
    const destinationsStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsStr}&destinations=${destinationsStr}&key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Distance Matrix API error:', data.status);
      return [];
    }

    const results: Array<{ distance_km: number; duration_hours: number }> = [];
    
    for (let i = 0; i < data.rows.length; i++) {
      const element = data.rows[i].elements[0];
      if (element.status === 'OK') {
        results.push({
          distance_km: element.distance.value / 1000,
          duration_hours: element.duration.value / 3600,
        });
      } else {
        results.push({ distance_km: 0, duration_hours: 0 });
      }
    }

    return results;
  } catch (error) {
    console.error('Error getting distance matrix:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    const { origin, destination, waypoints = [] }: { 
      origin: WaypointInput; 
      destination: WaypointInput;
      waypoints?: WaypointInput[];
    } = await req.json();

    console.log('Calculating route distance:', { origin, destination, waypointsCount: waypoints.length });

    // Build list of all points in order
    const allPoints: WaypointInput[] = [origin, ...waypoints, destination];
    
    // Geocode any points that don't have coordinates
    const geocodedPoints: Array<WaypointInput & { latitude: number; longitude: number }> = [];
    
    for (const point of allPoints) {
      if (point.latitude && point.longitude) {
        geocodedPoints.push({
          ...point,
          latitude: point.latitude,
          longitude: point.longitude,
        });
      } else {
        const coords = await getPlaceDetails(point.address, apiKey);
        if (coords) {
          geocodedPoints.push({
            ...point,
            latitude: coords.lat,
            longitude: coords.lng,
          });
        } else {
          throw new Error(`Could not geocode address: ${point.address}`);
        }
      }
    }

    // Calculate distances between consecutive points
    let totalDistance = 0;
    let totalDuration = 0;
    const resultWaypoints: RouteCalculationResult['waypoints'] = [];

    for (let i = 0; i < geocodedPoints.length; i++) {
      const point = geocodedPoints[i];
      
      if (i === 0) {
        // Origin - no previous point
        resultWaypoints.push({
          location_name: point.location_name,
          address: point.address,
          latitude: point.latitude,
          longitude: point.longitude,
          distance_from_previous_km: 0,
          duration_from_previous_hours: 0,
        });
      } else {
        // Calculate distance from previous point
        const prevPoint = geocodedPoints[i - 1];
        const distances = await getDistanceMatrix(
          [{ lat: prevPoint.latitude, lng: prevPoint.longitude }],
          [{ lat: point.latitude, lng: point.longitude }],
          apiKey
        );

        const distanceData = distances[0] || { distance_km: 0, duration_hours: 0 };
        totalDistance += distanceData.distance_km;
        totalDuration += distanceData.duration_hours;

        resultWaypoints.push({
          location_name: point.location_name,
          address: point.address,
          latitude: point.latitude,
          longitude: point.longitude,
          distance_from_previous_km: Math.round(distanceData.distance_km * 100) / 100,
          duration_from_previous_hours: Math.round(distanceData.duration_hours * 100) / 100,
        });
      }
    }

    const result: RouteCalculationResult = {
      total_distance_km: Math.round(totalDistance * 100) / 100,
      total_duration_hours: Math.round(totalDuration * 100) / 100,
      waypoints: resultWaypoints,
    };

    console.log('Route calculation complete:', { 
      total_distance_km: result.total_distance_km, 
      total_duration_hours: result.total_duration_hours,
      waypoints_count: result.waypoints.length
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Route calculation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
