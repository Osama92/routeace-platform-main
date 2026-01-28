import { useQuery } from "@tanstack/react-query";
import { MapPin, Clock, Truck, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

type DispatchStatus = "pending" | "assigned" | "in_transit" | "delivered" | "cancelled";

interface Dispatch {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  status: DispatchStatus;
  scheduled_delivery: string | null;
  distance_km: number | null;
  drivers: { full_name: string } | null;
}

const statusLabels: Record<DispatchStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const statusMap: Record<DispatchStatus, string> = {
  pending: "pending",
  assigned: "pending",
  in_transit: "transit",
  delivered: "delivered",
  cancelled: "delayed",
};

const RecentShipments = () => {
  const { data: shipments, isLoading } = useQuery({
    queryKey: ["recent-shipments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select(`
          id,
          dispatch_number,
          pickup_address,
          delivery_address,
          status,
          scheduled_delivery,
          distance_km,
          drivers:driver_id (full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data as Dispatch[];
    },
  });

  const getEtaDisplay = (dispatch: Dispatch) => {
    if (dispatch.status === "delivered") return "Completed";
    if (dispatch.status === "cancelled") return "Cancelled";
    if (!dispatch.scheduled_delivery) return "Not scheduled";

    const scheduledDate = new Date(dispatch.scheduled_delivery);
    const now = new Date();

    if (scheduledDate < now && dispatch.status !== "delivered") {
      return "Overdue";
    }

    return formatDistanceToNow(scheduledDate, { addSuffix: false });
  };

  // Mobile card view component
  const MobileShipmentCard = ({ shipment }: { shipment: Dispatch }) => (
    <div className="p-4 border-b border-border/50 last:border-b-0">
      <div className="flex items-start justify-between mb-2">
        <span className="font-medium text-foreground">{shipment.dispatch_number}</span>
        <span className={`status-badge status-${statusMap[shipment.status]}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {statusLabels[shipment.status]}
        </span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate">{shipment.pickup_address || "—"}</p>
            <p className="text-muted-foreground truncate">→ {shipment.delivery_address || "—"}</p>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">{shipment.drivers?.full_name || "Unassigned"}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="w-4 h-4" />
            {getEtaDisplay(shipment)}
          </div>
        </div>
        {shipment.distance_km && (
          <p className="text-muted-foreground">{shipment.distance_km} km</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-semibold text-base sm:text-lg text-foreground">
              Recent Shipments
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 hidden sm:block">
              Track your latest dispatch activities
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dispatch">View All</Link>
          </Button>
        </div>
      </div>

      {/* Mobile view: Card layout */}
      <div className="md:hidden">
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading shipments...</div>
        ) : !shipments || shipments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No recent shipments</div>
        ) : (
          shipments.map((shipment) => (
            <MobileShipmentCard key={shipment.id} shipment={shipment} />
          ))
        )}
      </div>

      {/* Desktop view: Table layout */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-secondary/30">
            <tr>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Shipment
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Route
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Driver
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                ETA
              </th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Distance
              </th>
              <th className="text-right py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading shipments...
                </td>
              </tr>
            ) : !shipments || shipments.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  No recent shipments
                </td>
              </tr>
            ) : (
              shipments.map((shipment) => (
                <tr key={shipment.id} className="data-table-row">
                  <td className="py-3 px-4">
                    <span className="font-medium text-foreground">
                      {shipment.dispatch_number}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                      <div className="text-sm min-w-0">
                        <p className="text-foreground truncate max-w-[160px]">
                          {shipment.pickup_address || "—"}
                        </p>
                        <p className="text-muted-foreground truncate max-w-[160px]">
                          → {shipment.delivery_address || "—"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm text-foreground">
                        {shipment.drivers?.full_name || "Unassigned"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`status-badge status-${statusMap[shipment.status]}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {statusLabels[shipment.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="w-4 h-4 flex-shrink-0" />
                      {getEtaDisplay(shipment)}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-foreground">
                      {shipment.distance_km ? `${shipment.distance_km} km` : "—"}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentShipments;
