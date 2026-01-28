import { useQuery } from "@tanstack/react-query";
import { MapPin, Navigation, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface ActiveDispatch {
  id: string;
  status: string;
  pickup_address: string;
  updated_at: string;
  drivers: {
    id: string;
    full_name: string;
  } | null;
  vehicles: {
    registration_number: string;
  } | null;
}

type DriverStatus = "active" | "idle";

interface DriverDisplay {
  id: string;
  name: string;
  vehicle: string;
  location: string;
  status: DriverStatus;
  lastUpdate: string;
}

const statusColors = {
  active: "bg-success",
  idle: "bg-warning",
  offline: "bg-muted-foreground",
};

const ActiveDrivers = () => {
  const { data: activeDispatches, isLoading } = useQuery({
    queryKey: ["active-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select(`
          id,
          status,
          pickup_address,
          updated_at,
          drivers:driver_id (id, full_name),
          vehicles:vehicle_id (registration_number)
        `)
        .in("status", ["assigned", "in_transit"])
        .order("updated_at", { ascending: false })
        .limit(6);

      if (error) throw error;
      return data as ActiveDispatch[];
    },
  });

  const drivers: DriverDisplay[] = (activeDispatches || []).map((dispatch) => ({
    id: dispatch.drivers?.id || dispatch.id,
    name: dispatch.drivers?.full_name || "Unknown Driver",
    vehicle: dispatch.vehicles?.registration_number || "No vehicle",
    location: dispatch.status === "in_transit"
      ? dispatch.pickup_address || "In transit"
      : "Awaiting pickup",
    status: dispatch.status === "in_transit" ? "active" : "idle",
    lastUpdate: formatDistanceToNow(new Date(dispatch.updated_at), { addSuffix: true }),
  }));

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-heading font-semibold text-lg text-foreground">
            Active Drivers
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time driver status
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span className="text-xs text-muted-foreground">In Transit</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning" />
            <span className="text-xs text-muted-foreground">Assigned</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading drivers...
          </div>
        ) : drivers.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No active drivers
          </div>
        ) : (
          drivers.map((driver) => (
            <div
              key={driver.id}
              className="flex items-center gap-4 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors duration-150"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-primary" />
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card ${
                    statusColors[driver.status]
                  }`}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground truncate">
                    {driver.name}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {driver.vehicle}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">
                    {driver.location}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs text-muted-foreground">
                  {driver.lastUpdate}
                </span>
                {driver.status === "active" && (
                  <div className="flex items-center gap-1 mt-0.5 text-primary justify-end">
                    <Navigation className="w-3 h-3" />
                    <span className="text-xs">Live</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActiveDrivers;
