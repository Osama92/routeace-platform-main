import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
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
  MapPin,
  Clock,
  Truck,
  Phone,
  RefreshCw,
  Layers,
} from "lucide-react";

interface TrackedVehicle {
  id: string;
  driverId: string;
  driverName: string;
  vehicleNumber: string;
  shipmentId: string;
  origin: string;
  destination: string;
  status: "active" | "idle" | "offline";
  lat: number;
  lng: number;
  speed: number;
  lastUpdate: string;
  eta: string;
  progress: number;
}

const trackedVehicles: TrackedVehicle[] = [
  {
    id: "TRK-001",
    driverId: "DRV-001",
    driverName: "Michael Okonkwo",
    vehicleNumber: "LAG-234-XY",
    shipmentId: "SHP-001",
    origin: "Lagos Warehouse",
    destination: "Abuja Distribution",
    status: "active",
    lat: 7.3775,
    lng: 3.9470,
    speed: 85,
    lastUpdate: "1 min ago",
    eta: "2h 45m",
    progress: 65,
  },
  {
    id: "TRK-002",
    driverId: "DRV-003",
    driverName: "Chidi Eze",
    vehicleNumber: "ABJ-890-CD",
    shipmentId: "SHP-003",
    origin: "Ibadan Hub",
    destination: "Lagos Warehouse",
    status: "active",
    lat: 7.1293,
    lng: 3.3581,
    speed: 72,
    lastUpdate: "2 min ago",
    eta: "45m",
    progress: 82,
  },
  {
    id: "TRK-003",
    driverId: "DRV-002",
    driverName: "Ahmed Ibrahim",
    vehicleNumber: "KAN-567-AB",
    shipmentId: "Awaiting",
    origin: "Kano Depot",
    destination: "-",
    status: "idle",
    lat: 12.0022,
    lng: 8.5919,
    speed: 0,
    lastUpdate: "15 min ago",
    eta: "-",
    progress: 0,
  },
  {
    id: "TRK-004",
    driverId: "DRV-004",
    driverName: "Emeka Nwachukwu",
    vehicleNumber: "CAL-456-GH",
    shipmentId: "SHP-004",
    origin: "Calabar Port",
    destination: "Enugu Center",
    status: "active",
    lat: 5.9631,
    lng: 7.4859,
    speed: 45,
    lastUpdate: "3 min ago",
    eta: "1h 20m",
    progress: 48,
  },
  {
    id: "TRK-005",
    driverId: "DRV-005",
    driverName: "Yusuf Abubakar",
    vehicleNumber: "KAD-123-EF",
    shipmentId: "SHP-005",
    origin: "Kaduna Depot",
    destination: "Jos Terminal",
    status: "idle",
    lat: 10.5264,
    lng: 7.4388,
    speed: 0,
    lastUpdate: "8 min ago",
    eta: "Awaiting dispatch",
    progress: 0,
  },
];

const statusConfig = {
  active: { label: "Active", color: "bg-success text-success-foreground" },
  idle: { label: "Idle", color: "bg-warning text-warning-foreground" },
  offline: { label: "Offline", color: "bg-muted text-muted-foreground" },
};

const TrackingPage = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedVehicle, setSelectedVehicle] = useState<TrackedVehicle | null>(
    trackedVehicles[0]
  );
  const [mapboxToken] = useState<string>("");

  const filteredVehicles = trackedVehicles.filter((vehicle) => {
    const matchesSearch =
      vehicle.driverName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vehicle.shipmentId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || vehicle.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

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

    trackedVehicles.forEach((vehicle) => {
      const el = document.createElement("div");
      el.className = `w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${
        vehicle.status === "active"
          ? "bg-success"
          : vehicle.status === "idle"
          ? "bg-warning"
          : "bg-muted"
      }`;
      el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>`;

      el.onclick = () => setSelectedVehicle(vehicle);

      new mapboxgl.Marker(el).setLngLat([vehicle.lng, vehicle.lat]).addTo(map.current!);
    });

    return () => map.current?.remove();
  }, [mapboxToken]);

  return (
    <DashboardLayout
      title="Live Tracking"
      subtitle="Real-time fleet location and status monitoring"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Vehicle List */}
        <div className="glass-card p-4 overflow-hidden flex flex-col">
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
            {filteredVehicles.map((vehicle, index) => (
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

                {vehicle.status === "active" && (
                  <>
                    <div className="text-xs text-muted-foreground mb-2">
                      <span className="text-foreground">{vehicle.origin}</span> →{" "}
                      <span className="text-foreground">{vehicle.destination}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        ETA: {vehicle.eta}
                      </span>
                      <span className="text-primary">{vehicle.speed} km/h</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${vehicle.progress}%` }}
                      />
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="lg:col-span-2 glass-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h3 className="font-heading font-semibold text-foreground">
                Fleet Map
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Active ({trackedVehicles.filter((v) => v.status === "active").length})
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  Idle ({trackedVehicles.filter((v) => v.status === "idle").length})
                </span>
              </div>
            </div>
            <Button variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          {mapboxToken ? (
            <div ref={mapContainer} className="flex-1 rounded-lg overflow-hidden" />
          ) : (
            <div className="flex-1 bg-secondary/30 rounded-lg flex items-center justify-center">
              <div className="text-center p-8">
                <Layers className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">
                  Map Preview
                </p>
                <p className="text-sm text-muted-foreground max-w-md">
                  Configure Mapbox token to enable live GPS tracking with real-time
                  vehicle positions
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
                  <Button variant="outline" size="sm">
                    <Phone className="w-4 h-4 mr-1" />
                    Contact
                  </Button>
                  <Button size="sm">
                    <Navigation className="w-4 h-4 mr-1" />
                    Navigate
                  </Button>
                </div>
              </div>

              {selectedVehicle.status === "active" && (
                <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-border/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Speed</p>
                    <p className="text-lg font-semibold text-foreground">
                      {selectedVehicle.speed} km/h
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">ETA</p>
                    <p className="text-lg font-semibold text-foreground">
                      {selectedVehicle.eta}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Progress</p>
                    <p className="text-lg font-semibold text-foreground">
                      {selectedVehicle.progress}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last Update</p>
                    <p className="text-lg font-semibold text-foreground">
                      {selectedVehicle.lastUpdate}
                    </p>
                  </div>
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
