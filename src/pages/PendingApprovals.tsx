import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Package,
  Users,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format } from "date-fns";

interface PendingDispatch {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  status: string;
  priority: string;
  created_at: string;
  created_by_role: string | null;
  customers?: { company_name: string } | null;
  drivers?: { full_name: string } | null;
  vehicles?: { registration_number: string } | null;
}

interface PendingDriver {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  license_number: string | null;
  created_at: string;
  created_by_role: string | null;
}

interface PendingVehicle {
  id: string;
  registration_number: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
  capacity_kg: number | null;
  created_at: string;
  created_by_role: string | null;
}

const PendingApprovalsPage = () => {
  const [dispatches, setDispatches] = useState<PendingDispatch[]>([]);
  const [drivers, setDrivers] = useState<PendingDriver[]>([]);
  const [vehicles, setVehicles] = useState<PendingVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectItem, setRejectItem] = useState<{ type: string; id: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { toast } = useToast();
  const { logChange } = useAuditLog();

  const fetchPendingItems = async () => {
    setLoading(true);
    try {
      // Fetch pending dispatches
      const { data: dispatchData } = await supabase
        .from("dispatches")
        .select(`
          id, dispatch_number, pickup_address, delivery_address, status, priority, created_at, created_by_role,
          customers(company_name),
          drivers(full_name),
          vehicles(registration_number)
        `)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });

      // Fetch pending drivers
      const { data: driverData } = await supabase
        .from("drivers")
        .select("id, full_name, email, phone, license_number, created_at, created_by_role")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });

      // Fetch pending vehicles
      const { data: vehicleData } = await supabase
        .from("vehicles")
        .select("id, registration_number, vehicle_type, make, model, capacity_kg, created_at, created_by_role")
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });

      setDispatches(dispatchData || []);
      setDrivers(driverData || []);
      setVehicles(vehicleData || []);
    } catch (error) {
      console.error("Error fetching pending items:", error);
      toast({
        title: "Error",
        description: "Failed to fetch pending items",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingItems();
  }, []);

  const handleApprove = async (type: string, id: string) => {
    setActionLoading(id);
    try {
      const table = type === "dispatch" ? "dispatches" : type === "driver" ? "drivers" : "vehicles";

      const { error } = await supabase
        .from(table)
        .update({ approval_status: "approved" })
        .eq("id", id);

      if (error) throw error;

      await logChange({
        table_name: table,
        record_id: id,
        action: "update",
        new_data: { approval_status: "approved" },
      });

      toast({
        title: "Approved",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} has been approved`,
      });
      fetchPendingItems();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectItem) return;

    setActionLoading(rejectItem.id);
    try {
      const table = rejectItem.type === "dispatch" ? "dispatches" : rejectItem.type === "driver" ? "drivers" : "vehicles";

      const { error } = await supabase
        .from(table)
        .update({ approval_status: "rejected" })
        .eq("id", rejectItem.id);

      if (error) throw error;

      await logChange({
        table_name: table,
        record_id: rejectItem.id,
        action: "update",
        new_data: { approval_status: "rejected", reject_reason: rejectReason },
      });

      toast({
        title: "Rejected",
        description: `${rejectItem.type.charAt(0).toUpperCase() + rejectItem.type.slice(1)} has been rejected`,
      });
      setRejectDialogOpen(false);
      setRejectItem(null);
      setRejectReason("");
      fetchPendingItems();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const openRejectDialog = (type: string, id: string) => {
    setRejectItem({ type, id });
    setRejectDialogOpen(true);
  };

  const totalPending = dispatches.length + drivers.length + vehicles.length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-semibold text-foreground">
              Pending Approvals
            </h1>
            <p className="text-muted-foreground">
              Review and approve items created by Operations team
            </p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            <Clock className="w-4 h-4 mr-2" />
            {totalPending} Pending
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-muted-foreground">Loading pending items...</span>
            </div>
          </div>
        ) : totalPending === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
              <p className="text-muted-foreground">No pending items require approval</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="dispatches" className="space-y-4">
            <TabsList>
              <TabsTrigger value="dispatches" className="gap-2">
                <Package className="w-4 h-4" />
                Dispatches ({dispatches.length})
              </TabsTrigger>
              <TabsTrigger value="drivers" className="gap-2">
                <Users className="w-4 h-4" />
                Drivers ({drivers.length})
              </TabsTrigger>
              <TabsTrigger value="vehicles" className="gap-2">
                <Truck className="w-4 h-4" />
                Vehicles ({vehicles.length})
              </TabsTrigger>
            </TabsList>

            {/* Dispatches Tab */}
            <TabsContent value="dispatches" className="space-y-4">
              {dispatches.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No pending dispatches
                  </CardContent>
                </Card>
              ) : (
                dispatches.map((dispatch) => (
                  <Card key={dispatch.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{dispatch.dispatch_number}</span>
                            <Badge variant="outline" className="text-xs">
                              {dispatch.priority}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Created by: {dispatch.created_by_role || "Unknown"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {dispatch.pickup_address?.split(",")[0]} → {dispatch.delivery_address?.split(",")[0]}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Customer: {dispatch.customers?.company_name || "N/A"}</span>
                            <span>Driver: {dispatch.drivers?.full_name || "Not assigned"}</span>
                            <span>Vehicle: {dispatch.vehicles?.registration_number || "Not assigned"}</span>
                            <span>Created: {format(new Date(dispatch.created_at), "MMM d, yyyy")}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openRejectDialog("dispatch", dispatch.id)}
                            disabled={actionLoading === dispatch.id}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove("dispatch", dispatch.id)}
                            disabled={actionLoading === dispatch.id}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Drivers Tab */}
            <TabsContent value="drivers" className="space-y-4">
              {drivers.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No pending drivers
                  </CardContent>
                </Card>
              ) : (
                drivers.map((driver) => (
                  <Card key={driver.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{driver.full_name}</span>
                            <Badge variant="secondary" className="text-xs">
                              Created by: {driver.created_by_role || "Unknown"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{driver.phone}</span>
                            {driver.email && <span>{driver.email}</span>}
                            {driver.license_number && <span>License: {driver.license_number}</span>}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Created: {format(new Date(driver.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openRejectDialog("driver", driver.id)}
                            disabled={actionLoading === driver.id}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove("driver", driver.id)}
                            disabled={actionLoading === driver.id}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Vehicles Tab */}
            <TabsContent value="vehicles" className="space-y-4">
              {vehicles.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No pending vehicles
                  </CardContent>
                </Card>
              ) : (
                vehicles.map((vehicle) => (
                  <Card key={vehicle.id}>
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{vehicle.registration_number}</span>
                            <Badge variant="outline" className="text-xs">
                              {vehicle.vehicle_type}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              Created by: {vehicle.created_by_role || "Unknown"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {vehicle.make && vehicle.model && (
                              <span>{vehicle.make} {vehicle.model}</span>
                            )}
                            {vehicle.capacity_kg && (
                              <span>Capacity: {vehicle.capacity_kg}T</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Created: {format(new Date(vehicle.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openRejectDialog("vehicle", vehicle.id)}
                            disabled={actionLoading === vehicle.id}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleApprove("vehicle", vehicle.id)}
                            disabled={actionLoading === vehicle.id}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Reject {rejectItem?.type}
              </DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this {rejectItem?.type}. This will be logged for audit purposes.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder="Enter rejection reason (optional)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={actionLoading !== null}
              >
                Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default PendingApprovalsPage;
