import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { motion } from "framer-motion";
import { Expand, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

interface Vehicle {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "active" | "idle";
}

interface LiveMapProps {
  className?: string;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

let mapsApiLoaded = false;
async function loadMapsApi(): Promise<void> {
  if (mapsApiLoaded) return;
  setOptions({ key: GOOGLE_MAPS_API_KEY, version: "weekly" });
  await importLibrary("maps");
  mapsApiLoaded = true;
}
function gm(): typeof google.maps {
  return (window as any).google.maps;
}

function truckSvgIcon(color: string): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
    <rect x="5" y="9" width="13" height="9" rx="1.5" fill="white" opacity="0.9"/>
    <polygon points="18 11 23 11 25 14 25 18 18 18" fill="white" opacity="0.9"/>
    <circle cx="9" cy="20" r="2" fill="${color}" stroke="white" stroke-width="1"/>
    <circle cx="21" cy="20" r="2" fill="${color}" stroke="white" stroke-width="1"/>
  </svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new gm().Size(32, 32),
    anchor: new gm().Point(16, 16),
  };
}

const LiveMap = ({ className = "" }: LiveMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapsRef = useRef<typeof google.maps | null>(null);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["live-map-vehicles"],
    queryFn: async () => {
      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, registration_number, current_lat, current_lng, status, location_updated_at")
        .not("current_lat", "is", null)
        .not("current_lng", "is", null);

      if (vehicleError) throw vehicleError;

      const { data: activeDispatches, error: dispatchError } = await supabase
        .from("dispatches")
        .select(`id, status, vehicles:vehicle_id (id, registration_number, current_lat, current_lng)`)
        .in("status", ["assigned", "in_transit"]);

      if (dispatchError) throw dispatchError;

      const vehicleMap = new Map<string, Vehicle>();

      (vehicleData || []).forEach((v) => {
        if (v.current_lat && v.current_lng) {
          vehicleMap.set(v.id, {
            id: v.id,
            name: v.registration_number,
            lat: v.current_lat,
            lng: v.current_lng,
            status: v.status === "in_use" ? "active" : "idle",
          });
        }
      });

      (activeDispatches || []).forEach((d) => {
        if (d.vehicles && d.vehicles.id) {
          const existing = vehicleMap.get(d.vehicles.id);
          if (existing) {
            existing.status = d.status === "in_transit" ? "active" : "idle";
          } else if (d.vehicles.current_lat && d.vehicles.current_lng) {
            vehicleMap.set(d.vehicles.id, {
              id: d.vehicles.id,
              name: d.vehicles.registration_number,
              lat: d.vehicles.current_lat,
              lng: d.vehicles.current_lng,
              status: d.status === "in_transit" ? "active" : "idle",
            });
          }
        }
      });

      return Array.from(vehicleMap.values());
    },
    refetchInterval: 30000,
  });

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || !GOOGLE_MAPS_API_KEY) return;

    let cancelled = false;
    (async () => {
      await loadMapsApi();
      if (cancelled || !mapContainer.current) return;
      const maps = gm();
      mapsRef.current = maps;
      const gMap = new maps.Map(mapContainer.current, {
        center: { lat: 9.082, lng: 8.6753 },
        zoom: 5.5,
        mapTypeId: "roadmap",
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });
      mapRef.current = gMap;
      setMapReady(true);
    })();

    return () => { cancelled = true; };
  }, []);

  // Update markers when vehicles change
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const maps = gm();

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const infoWindow = new maps.InfoWindow();

    vehicles.forEach((vehicle) => {
      const color = vehicle.status === "active" ? "#f97316" : "#f59e0b";
      const marker = new maps.Marker({
        map: mapRef.current!,
        position: { lat: vehicle.lat, lng: vehicle.lng },
        icon: truckSvgIcon(color),
        title: vehicle.name,
      });

      marker.addListener("click", () => {
        infoWindow.setContent(`
          <div style="padding:8px;min-width:140px">
            <p style="font-weight:600;font-size:13px;margin:0 0 2px">${vehicle.name}</p>
            <p style="font-size:12px;color:#777;margin:0">${vehicle.status === "active" ? "In Transit" : "Idle"}</p>
          </div>
        `);
        infoWindow.open(mapRef.current, marker);
      });

      markersRef.current.push(marker);
    });
  }, [vehicles, mapReady]);

  const noApiKey = !GOOGLE_MAPS_API_KEY;

  const emptyState = (
    <div className="h-80 bg-secondary/30 rounded-lg flex items-center justify-center">
      <div className="text-center p-8">
        <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No vehicle locations available</p>
        <p className="text-sm text-muted-foreground mt-2">
          Update vehicle locations in Fleet Management to see them here
        </p>
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className={`glass-card p-6 ${isExpanded ? "fixed inset-4 z-50" : className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-semibold text-lg text-foreground">Live Fleet Tracking</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading..." : `${vehicles.filter((v) => v.status === "active").length} active vehicles`}
          </p>
        </div>
        {!noApiKey && vehicles.length > 0 && (
          <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
            <Expand className="w-4 h-4" />
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="h-80 bg-secondary/30 rounded-lg flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : noApiKey ? (
        vehicles.length === 0 ? emptyState : (
          <>
            <div className="h-60 bg-secondary/30 rounded-lg flex items-center justify-center mb-4">
              <div className="text-center p-8">
                <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">Google Maps API key not configured</p>
              </div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full ${vehicle.status === "active" ? "bg-success" : "bg-warning"}`} />
                    <span className="text-sm font-medium text-foreground">{vehicle.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )
      ) : vehicles.length === 0 ? emptyState : (
        <div
          ref={mapContainer}
          className={`rounded-lg overflow-hidden ${isExpanded ? "h-[calc(100%-80px)]" : "h-80"}`}
        />
      )}
    </motion.div>
  );
};

export default LiveMap;
