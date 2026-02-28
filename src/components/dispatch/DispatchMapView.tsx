import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { motion } from "framer-motion";
import { Expand, Map, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Location {
  address: string;
  lat?: number | null;
  lng?: number | null;
  type: "pickup" | "dropoff" | "delivery";
  label?: string;
}

interface DispatchMapViewProps {
  pickup: Location;
  delivery: Location;
  dropoffs?: Location[];
  className?: string;
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// Load the Maps API once (idempotent — subsequent calls are no-ops)
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

function circleIcon(color: string, label: string): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="${color}" stroke="white" stroke-width="2.5"/>
    <text x="18" y="23" text-anchor="middle" font-size="14" font-weight="bold" fill="white" font-family="Arial,sans-serif">${label}</text>
  </svg>`;
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new gm().Size(36, 36),
    anchor: new gm().Point(18, 36),
  };
}

/** Geocode an address via the REST Geocoding API */
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await res.json();
    if (data.status === "OK" && data.results?.[0]) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}

async function resolveLatLng(loc: Location): Promise<{ lat: number; lng: number } | null> {
  if (loc.lat && loc.lng) return { lat: loc.lat, lng: loc.lng };
  if (!loc.address) return null;
  return geocodeAddress(loc.address);
}

const markerColors = {
  pickup: "#22c55e",
  dropoff: "#f59e0b",
  delivery: "#ef4444",
};

const DispatchMapView = ({
  pickup,
  delivery,
  dropoffs = [],
  className = "",
}: DispatchMapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || !GOOGLE_MAPS_API_KEY) return;

    let cancelled = false;

    (async () => {
      await loadMapsApi();
      if (cancelled || !mapContainer.current) return;

      const maps = gm();

      const gMap = new maps.Map(mapContainer.current, {
        center: { lat: 9.082, lng: 8.6753 },
        zoom: 7,
        mapTypeId: "roadmap",
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });

      const infoWindow = new maps.InfoWindow();
      const bounds = new maps.LatLngBounds();

      const addMarker = (
        pos: { lat: number; lng: number },
        loc: Location,
        color: string,
        number: string,
        title: string,
        emoji: string
      ) => {
        bounds.extend(pos);
        const marker = new maps.Marker({
          map: gMap,
          position: pos,
          icon: circleIcon(color, number),
          title,
        });
        marker.addListener("click", () => {
          infoWindow.setContent(`
            <div style="padding:8px;min-width:160px">
              <p style="font-weight:600;font-size:13px;margin:0 0 4px">${emoji} ${title}</p>
              <p style="font-size:12px;color:#555;margin:0">${loc.address}</p>
              ${loc.label ? `<p style="font-size:11px;color:#999;margin:4px 0 0">${loc.label}</p>` : ""}
            </div>
          `);
          infoWindow.open(gMap, marker);
        });
      };

      // Geocode all locations in parallel
      const allLocs = [pickup, ...dropoffs, delivery];
      const resolved = await Promise.all(allLocs.map(resolveLatLng));
      if (cancelled) return;

      const routePoints: { lat: number; lng: number }[] = [];

      if (resolved[0]) {
        addMarker(resolved[0], pickup, markerColors.pickup, "1", "Pickup", "📍");
        routePoints.push(resolved[0]);
      }

      dropoffs.forEach((d, i) => {
        const pos = resolved[i + 1];
        if (pos) {
          addMarker(pos, d, markerColors.dropoff, (i + 2).toString(), `Stop ${i + 1}`, "📦");
          routePoints.push(pos);
        }
      });

      const deliveryPos = resolved[resolved.length - 1];
      if (deliveryPos) {
        addMarker(deliveryPos, delivery, markerColors.delivery, (dropoffs.length + 2).toString(), "Final Delivery", "🏁");
        routePoints.push(deliveryPos);
      }

      if (routePoints.length > 1) {
        gMap.fitBounds(bounds, 60);
      } else if (routePoints.length === 1) {
        gMap.setCenter(routePoints[0]);
        gMap.setZoom(12);
      }

      if (routePoints.length > 1) {
        new maps.Polyline({
          path: routePoints,
          geodesic: true,
          strokeColor: "#f97316",
          strokeOpacity: 0.85,
          strokeWeight: 3,
          map: gMap,
        });
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.address, delivery.address, dropoffs.length]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass-card p-6 ${className}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-semibold text-lg text-foreground">Route Map</h3>
            <p className="text-sm text-muted-foreground">{dropoffs.length + 2} locations</p>
          </div>
        </div>
        <div className="h-64 bg-secondary/30 rounded-lg flex items-center justify-center">
          <div className="text-center p-8">
            <Map className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Map unavailable</p>
          </div>
        </div>
        <LocationList pickup={pickup} dropoffs={dropoffs} delivery={delivery} />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-6 ${isExpanded ? "fixed inset-4 z-50" : className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-semibold text-lg text-foreground">Route Map</h3>
          <p className="text-sm text-muted-foreground">{dropoffs.length + 2} locations</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
        </Button>
      </div>

      <div
        ref={mapContainer}
        className={`rounded-lg overflow-hidden ${isExpanded ? "h-[calc(100%-80px)]" : "h-64"}`}
      />

      <div className="flex items-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-success" />
          <span className="text-muted-foreground">Pickup</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-warning" />
          <span className="text-muted-foreground">Drop-offs</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-destructive" />
          <span className="text-muted-foreground">Delivery</span>
        </div>
      </div>
    </motion.div>
  );
};

function LocationList({
  pickup,
  dropoffs,
  delivery,
}: {
  pickup: Location;
  dropoffs: Location[];
  delivery: Location;
}) {
  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg">
        <span className="w-6 h-6 rounded-full bg-success text-success-foreground flex items-center justify-center text-xs font-bold">1</span>
        <span className="text-sm truncate">{pickup.address}</span>
      </div>
      {dropoffs.map((d, i) => (
        <div key={i} className="flex items-center gap-3 p-3 bg-warning/10 rounded-lg">
          <span className="w-6 h-6 rounded-full bg-warning text-warning-foreground flex items-center justify-center text-xs font-bold">{i + 2}</span>
          <span className="text-sm truncate">{d.address}</span>
        </div>
      ))}
      <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-lg">
        <span className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold">{dropoffs.length + 2}</span>
        <span className="text-sm truncate">{delivery.address}</span>
      </div>
    </div>
  );
}

export default DispatchMapView;
