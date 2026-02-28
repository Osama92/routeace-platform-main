import { useEffect, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Filter,
  Navigation,
  Truck,
  Phone,
  RefreshCw,
  Layers,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface TrackedVehicle {
  id: string;
  driverId: string | null;
  driverName: string;
  driverPhone: string | null;
  vehicleNumber: string;
  dispatchId: string | null;
  origin: string;
  destination: string;
  status: "active" | "idle" | "offline";
  lat: number | null;
  lng: number | null;
  lastUpdate: string;
  scheduledDelivery: string | null;
  distanceKm: number | null;
}

const statusConfig = {
  active: { label: "Active", color: "bg-success text-success-foreground" },
  idle: { label: "Idle", color: "bg-warning text-warning-foreground" },
  offline: { label: "Offline", color: "bg-muted text-muted-foreground" },
};

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

const TrackingPage = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const mapsRef = useRef<typeof google.maps | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedVehicle, setSelectedVehicle] = useState<TrackedVehicle | null>(null);

  // Fetch real vehicle and dispatch data
  const { data: trackedVehicles = [], isLoading, refetch } = useQuery({
    queryKey: ["tracking-vehicles"],
    queryFn: async () => {
      // Get all vehicles with their current status and location
      const { data: vehicles, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, registration_number, status, current_lat, current_lng, location_updated_at");

      if (vehicleError) {
        console.error("Vehicle fetch error:", vehicleError);
        throw vehicleError;
      }

      // Get active dispatches
      const { data: activeDispatches, error: dispatchError } = await supabase
        .from("dispatches")
        .select("id, status, pickup_address, delivery_address, scheduled_pickup, distance_km, vehicle_id, driver_id, updated_at")
        .in("status", ["assigned", "in_transit", "pending"]);

      if (dispatchError) {
        console.error("Dispatch fetch error:", dispatchError);
        throw dispatchError;
      }

      // Get drivers separately
      const driverIds = (activeDispatches || [])
        .map(d => d.driver_id)
        .filter((id): id is string => id !== null);

      let driversMap = new Map<string, { full_name: string; phone: string | null }>();

      if (driverIds.length > 0) {
        const { data: drivers } = await supabase
          .from("drivers")
          .select("id, full_name, phone")
          .in("id", driverIds);

        (drivers || []).forEach(d => {
          driversMap.set(d.id, { full_name: d.full_name, phone: d.phone });
        });
      }

      // Create vehicle lookup map
      const vehicleLookup = new Map<string, any>();
      (vehicles || []).forEach(v => vehicleLookup.set(v.id, v));

      // Build tracked vehicles list
      const vehicleMap = new Map<string, TrackedVehicle>();

      // First, add all vehicles
      (vehicles || []).forEach((v) => {
        const isInUse = v.status === "in_use";
        const isMaintenance = v.status === "maintenance";
        vehicleMap.set(v.id, {
          id: v.id,
          driverId: null,
          driverName: "Unassigned",
          driverPhone: null,
          vehicleNumber: v.registration_number,
          dispatchId: null,
          origin: "-",
          destination: "-",
          status: isInUse ? "active" : isMaintenance ? "offline" : "idle",
          lat: v.current_lat,
          lng: v.current_lng,
          lastUpdate: v.location_updated_at
            ? formatDistanceToNow(new Date(v.location_updated_at), { addSuffix: true })
            : "No location data",
          scheduledDelivery: null,
          distanceKm: null,
        });
      });

      // Update with active dispatch information
      (activeDispatches || []).forEach((d) => {
        if (d.vehicle_id) {
          const driver = d.driver_id ? driversMap.get(d.driver_id) : null;
          const vehicle = vehicleLookup.get(d.vehicle_id);

          const isInTransit = d.status === "in_transit";

          vehicleMap.set(d.vehicle_id, {
            id: d.vehicle_id,
            driverId: d.driver_id,
            driverName: driver?.full_name || "Unassigned",
            driverPhone: driver?.phone || null,
            vehicleNumber: vehicle?.registration_number || "Unknown",
            dispatchId: d.id,
            origin: d.pickup_address || "-",
            destination: d.delivery_address || "-",
            status: isInTransit ? "active" : "idle",
            lat: vehicle?.current_lat || null,
            lng: vehicle?.current_lng || null,
            lastUpdate: vehicle?.location_updated_at
              ? formatDistanceToNow(new Date(vehicle.location_updated_at), { addSuffix: true })
              : d.updated_at
              ? formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })
              : "No update",
            scheduledDelivery: d.scheduled_pickup,
            distanceKm: d.distance_km,
          });
        }
      });

      return Array.from(vehicleMap.values());
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Set first vehicle as selected when data loads
  useEffect(() => {
    if (trackedVehicles.length > 0 && !selectedVehicle) {
      setSelectedVehicle(trackedVehicles[0]);
    }
  }, [trackedVehicles, selectedVehicle]);

  const filteredVehicles = trackedVehicles.filter((vehicle) => {
    const matchesSearch =
      vehicle.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.origin.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.destination.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || vehicle.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = trackedVehicles.filter((v) => v.status === "active").length;
  const idleCount = trackedVehicles.filter((v) => v.status === "idle").length;

  // Initialize Google Map once
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

  // Update markers when tracked vehicles change
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const maps = gm();

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const infoWindow = new maps.InfoWindow();

    trackedVehicles.forEach((vehicle) => {
      if (!vehicle.lat || !vehicle.lng) return;

      const color =
        vehicle.status === "active" ? "#f97316"
        : vehicle.status === "idle" ? "#f59e0b"
        : "#6b7280";

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
        <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2.5"/>
        <rect x="5" y="9" width="13" height="9" rx="1.5" fill="white" opacity="0.9"/>
        <polygon points="18 11 23 11 25 14 25 18 18 18" fill="white" opacity="0.9"/>
        <circle cx="9" cy="20" r="2" fill="${color}" stroke="white" stroke-width="1"/>
        <circle cx="21" cy="20" r="2" fill="${color}" stroke="white" stroke-width="1"/>
      </svg>`;

      const icon: google.maps.Icon = {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
        scaledSize: new maps.Size(32, 32),
        anchor: new maps.Point(16, 16),
      };

      const marker = new maps.Marker({
        map: mapRef.current!,
        position: { lat: vehicle.lat, lng: vehicle.lng },
        icon,
        title: vehicle.vehicleNumber,
      });

      marker.addListener("click", () => {
        setSelectedVehicle(vehicle);
        infoWindow.setContent(`
          <div style="padding:8px;min-width:150px">
            <p style="font-weight:600;font-size:13px;margin:0 0 2px">${vehicle.vehicleNumber}</p>
            <p style="font-size:12px;color:#555;margin:0">${vehicle.driverName}</p>
            <p style="font-size:11px;color:#888;margin:4px 0 0">${vehicle.status === "active" ? "In Transit" : vehicle.status === "idle" ? "Idle" : "Offline"}</p>
          </div>
        `);
        infoWindow.open(mapRef.current, marker);
      });

      markersRef.current.push(marker);
    });
  }, [trackedVehicles, mapReady]);

  // Format ETA from scheduled delivery
  const formatEta = (scheduledDelivery: string | null): string => {
    if (!scheduledDelivery) return "-";
    const scheduled = new Date(scheduledDelivery);
    const now = new Date();
    if (scheduled <= now) return "Overdue";

    const diffMs = scheduled.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 24) {
      const days = Math.floor(diffHours / 24);
      return `${days}d ${diffHours % 24}h`;
    }
    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    }
    return `${diffMinutes}m`;
  };

  return (
    <DashboardLayout
      title="Live Tracking"
      subtitle="Real-time fleet location and status monitoring"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Vehicle List */}
        <div className="tracking-vehicle-list glass-card p-4 overflow-hidden flex flex-col">
          <div className="space-y-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search vehicles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary/50 border-border/50"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-secondary/50 border-border/50">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Vehicles</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredVehicles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No vehicles found</p>
              </div>
            ) : (
              filteredVehicles.map((vehicle, index) => (
                <motion.div
                  key={vehicle.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  onClick={() => setSelectedVehicle(vehicle)}
                  className={`p-4 rounded-lg cursor-pointer transition-all ${
                    selectedVehicle?.id === vehicle.id
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-secondary/30 hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-primary" />
                      <span className="font-medium text-foreground">
                        {vehicle.vehicleNumber}
                      </span>
                    </div>
                    <Badge className={statusConfig[vehicle.status].color}>
                      {statusConfig[vehicle.status].label}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground mb-2">
                    {vehicle.driverName}
                  </p>

                  {vehicle.dispatchId && (
                    <>
                      <div className="text-xs text-muted-foreground mb-2">
                        <span className="text-foreground">{vehicle.origin}</span> →{" "}
                        <span className="text-foreground">{vehicle.destination}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">
                          ETA: {formatEta(vehicle.scheduledDelivery)}
                        </span>
                        {vehicle.distanceKm && (
                          <span className="text-primary">{vehicle.distanceKm} km</span>
                        )}
                      </div>
                    </>
                  )}

                  {!vehicle.dispatchId && (
                    <div className="text-xs text-muted-foreground">
                      No active dispatch
                    </div>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Map */}
        <div className="tracking-map-container lg:col-span-2 glass-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="font-heading font-semibold text-foreground">
                Fleet Map
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Active ({activeCount})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  Idle ({idleCount})
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {GOOGLE_MAPS_API_KEY ? (
            <div ref={mapContainer} className="flex-1 rounded-lg overflow-hidden" />
          ) : (
            <div className="flex-1 bg-secondary/30 rounded-lg flex items-center justify-center">
              <div className="text-center p-8">
                <Layers className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">Map Preview</p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Configure Google Maps API key to enable live GPS tracking
                </p>
              </div>
            </div>
          )}

          {/* Selected Vehicle Details */}
          {selectedVehicle && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-secondary/30 rounded-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <Truck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">
                      {selectedVehicle.vehicleNumber}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {selectedVehicle.driverName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedVehicle.driverPhone && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`tel:${selectedVehicle.driverPhone}`)}
                    >
                      <Phone className="w-4 h-4 mr-1" />
                      Contact
                    </Button>
                  )}
                  {selectedVehicle.lat && selectedVehicle.lng && (
                    <Button
                      size="sm"
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/dir/?api=1&destination=${selectedVehicle.lat},${selectedVehicle.lng}`,
                          "_blank"
                        )
                      }
                    >
                      <Navigation className="w-4 h-4 mr-1" />
                      Navigate
                    </Button>
                  )}
                </div>
              </div>

              {selectedVehicle.dispatchId && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Route</p>
                    <p className="text-sm font-semibold text-foreground truncate" title={`${selectedVehicle.origin} → ${selectedVehicle.destination}`}>
                      {selectedVehicle.origin.substring(0, 15)}...
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ETA</p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatEta(selectedVehicle.scheduledDelivery)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedVehicle.distanceKm ? `${selectedVehicle.distanceKm} km` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Update</p>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedVehicle.lastUpdate}
                    </p>
                  </div>
                </div>
              )}

              {!selectedVehicle.dispatchId && (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground">
                    This vehicle has no active dispatch. Last updated: {selectedVehicle.lastUpdate}
                  </p>
                  {selectedVehicle.lat && selectedVehicle.lng && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Location: {selectedVehicle.lat.toFixed(4)}, {selectedVehicle.lng.toFixed(4)}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TrackingPage;
