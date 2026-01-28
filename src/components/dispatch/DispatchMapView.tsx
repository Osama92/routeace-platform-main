import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
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
  mapboxToken?: string;
  className?: string;
}

const DispatchMapView = ({
  pickup,
  delivery,
  dropoffs = [],
  mapboxToken,
  className = "",
}: DispatchMapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Default coordinates for Nigeria if not provided
  const defaultCenter: [number, number] = [8.6753, 9.082];

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    // Calculate center and bounds
    const allLocations = [pickup, ...dropoffs, delivery].filter(
      (loc) => loc.lat && loc.lng
    );

    const center: [number, number] =
      allLocations.length > 0
        ? [
            allLocations.reduce((sum, loc) => sum + (loc.lng || 0), 0) /
              allLocations.length,
            allLocations.reduce((sum, loc) => sum + (loc.lat || 0), 0) /
              allLocations.length,
          ]
        : defaultCenter;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center,
      zoom: 8,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add markers
    const markerColors = {
      pickup: "#22c55e", // green
      dropoff: "#f59e0b", // amber
      delivery: "#ef4444", // red
    };

    const markerIcons = {
      pickup: "▶",
      dropoff: "●",
      delivery: "◆",
    };

    const allPoints: [number, number][] = [];

    // Add pickup marker
    if (pickup.lat && pickup.lng) {
      allPoints.push([pickup.lng, pickup.lat]);
      const el = createMarkerElement(markerColors.pickup, "1", "Pickup");
      new mapboxgl.Marker(el)
        .setLngLat([pickup.lng, pickup.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2 bg-background text-foreground">
              <p class="font-semibold text-sm text-green-600">📍 Pickup</p>
              <p class="text-xs mt-1">${pickup.address}</p>
            </div>
          `)
        )
        .addTo(map.current!);
    }

    // Add dropoff markers
    dropoffs.forEach((dropoff, index) => {
      if (dropoff.lat && dropoff.lng) {
        allPoints.push([dropoff.lng, dropoff.lat]);
        const el = createMarkerElement(
          markerColors.dropoff,
          (index + 2).toString(),
          `Stop ${index + 1}`
        );
        new mapboxgl.Marker(el)
          .setLngLat([dropoff.lng, dropoff.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(`
              <div class="p-2 bg-background text-foreground">
                <p class="font-semibold text-sm text-amber-600">📦 Stop ${index + 1}</p>
                <p class="text-xs mt-1">${dropoff.address}</p>
                ${dropoff.label ? `<p class="text-xs text-gray-500">${dropoff.label}</p>` : ""}
              </div>
            `)
          )
          .addTo(map.current!);
      }
    });

    // Add delivery marker
    if (delivery.lat && delivery.lng) {
      allPoints.push([delivery.lng, delivery.lat]);
      const el = createMarkerElement(
        markerColors.delivery,
        (dropoffs.length + 2).toString(),
        "Final Delivery"
      );
      new mapboxgl.Marker(el)
        .setLngLat([delivery.lng, delivery.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(`
            <div class="p-2 bg-background text-foreground">
              <p class="font-semibold text-sm text-red-600">🏁 Final Delivery</p>
              <p class="text-xs mt-1">${delivery.address}</p>
            </div>
          `)
        )
        .addTo(map.current!);
    }

    // Fit bounds to show all points
    if (allPoints.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      allPoints.forEach((point) => bounds.extend(point));
      map.current.fitBounds(bounds, { padding: 50 });
    }

    // Draw route line
    map.current.on("load", () => {
      if (allPoints.length > 1 && map.current) {
        map.current.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: allPoints,
            },
          },
        });

        map.current.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "hsl(var(--primary))",
            "line-width": 3,
            "line-dasharray": [2, 1],
          },
        });
      }
    });

    return () => {
      map.current?.remove();
    };
  }, [mapboxToken, pickup, delivery, dropoffs]);

  const createMarkerElement = (
    color: string,
    number: string,
    _label: string
  ): HTMLDivElement => {
    const el = document.createElement("div");
    el.className = "dispatch-marker";
    el.innerHTML = `
      <div style="
        width: 32px;
        height: 32px;
        background: ${color};
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        border: 2px solid white;
      ">
        ${number}
      </div>
    `;
    return el;
  };

  if (!mapboxToken) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass-card p-6 ${className}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-heading font-semibold text-lg text-foreground">
              Route Map
            </h3>
            <p className="text-sm text-muted-foreground">
              {dropoffs.length + 2} locations
            </p>
          </div>
        </div>

        <div className="h-64 bg-secondary/30 rounded-lg flex items-center justify-center">
          <div className="text-center p-8">
            <Map className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Map preview</p>
            <p className="text-sm text-muted-foreground mt-2">
              Configure Mapbox token to view route
            </p>
          </div>
        </div>

        {/* Location list fallback */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg">
            <span className="w-6 h-6 rounded-full bg-success text-success-foreground flex items-center justify-center text-xs font-bold">
              1
            </span>
            <span className="text-sm truncate">{pickup.address}</span>
          </div>
          {dropoffs.map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 bg-warning/10 rounded-lg"
            >
              <span className="w-6 h-6 rounded-full bg-warning text-warning-foreground flex items-center justify-center text-xs font-bold">
                {i + 2}
              </span>
              <span className="text-sm truncate">{d.address}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 p-3 bg-destructive/10 rounded-lg">
            <span className="w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs font-bold">
              {dropoffs.length + 2}
            </span>
            <span className="text-sm truncate">{delivery.address}</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-6 ${
        isExpanded ? "fixed inset-4 z-50" : className
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-heading font-semibold text-lg text-foreground">
            Route Map
          </h3>
          <p className="text-sm text-muted-foreground">
            {dropoffs.length + 2} locations
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Expand className="w-4 h-4" />
          )}
        </Button>
      </div>

      <div
        ref={mapContainer}
        className={`rounded-lg overflow-hidden ${
          isExpanded ? "h-[calc(100%-80px)]" : "h-64"
        }`}
      />

      {/* Legend */}
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

export default DispatchMapView;
