import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { motion } from "framer-motion";
import { Expand, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Vehicle {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: "active" | "idle";
}

const vehicles: Vehicle[] = [
  { id: "1", name: "Truck LAG-234", lat: 6.5244, lng: 3.3792, status: "active" },
  { id: "2", name: "Truck ABJ-890", lat: 9.0765, lng: 7.3986, status: "active" },
  { id: "3", name: "Truck KAN-567", lat: 12.0022, lng: 8.5919, status: "idle" },
  { id: "4", name: "Truck PHC-123", lat: 4.8156, lng: 7.0498, status: "active" },
];

interface LiveMapProps {
  mapboxToken?: string;
  className?: string;
}

const LiveMap = ({ mapboxToken, className = "" }: LiveMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [8.6753, 9.082],
      zoom: 5.5,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add vehicle markers
    vehicles.forEach((vehicle) => {
      const el = document.createElement("div");
      el.className = "vehicle-marker";
      el.innerHTML = `
        <div class="w-8 h-8 rounded-full ${
          vehicle.status === "active" ? "bg-primary" : "bg-warning"
        } flex items-center justify-center shadow-lg border-2 border-background animate-pulse-slow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-primary-foreground">
            <rect x="1" y="3" width="15" height="13" rx="2" ry="2"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
          </svg>
        </div>
      `;

      new mapboxgl.Marker(el)
        .setLngLat([vehicle.lng, vehicle.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2">
              <p class="font-semibold text-sm">${vehicle.name}</p>
              <p class="text-xs text-gray-500">${
                vehicle.status === "active" ? "In Transit" : "Idle"
              }</p>
            </div>
          `)
        )
        .addTo(map.current!);
    });

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken]);

  if (!mapboxToken) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className={`glass-card p-6 ${className}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-semibold text-lg text-foreground">
              Live Fleet Tracking
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time vehicle locations
            </p>
          </div>
        </div>

        <div className="h-80 bg-secondary/30 rounded-lg flex items-center justify-center">
          <div className="text-center p-8">
            <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Map preview</p>
            <p className="text-sm text-muted-foreground mt-2">
              Configure Mapbox token to enable live tracking
            </p>
          </div>
        </div>

        {/* Vehicle list fallback */}
        <div className="mt-4 space-y-2">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.id}
              className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-2 h-2 rounded-full ${
                    vehicle.status === "active" ? "bg-success" : "bg-warning"
                  }`}
                />
                <span className="text-sm font-medium text-foreground">
                  {vehicle.name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {vehicle.lat.toFixed(4)}, {vehicle.lng.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className={`glass-card p-6 ${isExpanded ? "fixed inset-4 z-50" : className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-semibold text-lg text-foreground">
            Live Fleet Tracking
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {vehicles.filter((v) => v.status === "active").length} active vehicles
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <Expand className="w-4 h-4" />
        </Button>
      </div>

      <div
        ref={mapContainer}
        className={`rounded-lg overflow-hidden ${isExpanded ? "h-[calc(100%-80px)]" : "h-80"}`}
      />
    </motion.div>
  );
};

export default LiveMap;
