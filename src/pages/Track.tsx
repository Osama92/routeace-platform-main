import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Package,
  MapPin,
  Truck,
  CheckCircle,
  Clock,
  Search,
  ArrowRight,
  Building2,
  Phone,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TrackingResult {
  dispatch_number: string;
  status: string;
  pickup_address: string;
  delivery_address: string;
  scheduled_pickup: string | null;
  scheduled_delivery: string | null;
  actual_pickup: string | null;
  actual_delivery: string | null;
  cargo_description: string | null;
  customer: {
    company_name: string;
  } | null;
  updates: {
    status: string;
    location: string | null;
    notes: string | null;
    created_at: string;
  }[];
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  assigned: { icon: Package, color: "text-info", label: "Assigned" },
  picked_up: { icon: Package, color: "text-primary", label: "Picked Up" },
  in_transit: { icon: Truck, color: "text-warning", label: "In Transit" },
  delivered: { icon: CheckCircle, color: "text-success", label: "Delivered" },
  cancelled: { icon: XCircle, color: "text-destructive", label: "Cancelled" },
};

const Track = () => {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTrack = async () => {
    if (!trackingNumber.trim()) {
      toast({
        title: "Error",
        description: "Please enter a tracking number",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Fetch dispatch by tracking number
      const { data: dispatch, error: dispatchError } = await supabase
        .from("dispatches")
        .select(`
          dispatch_number,
          status,
          pickup_address,
          delivery_address,
          scheduled_pickup,
          scheduled_delivery,
          actual_pickup,
          actual_delivery,
          cargo_description,
          customers (
            company_name
          )
        `)
        .eq("dispatch_number", trackingNumber.toUpperCase())
        .single();

      if (dispatchError || !dispatch) {
        setError("Tracking number not found. Please check and try again.");
        return;
      }

      // Fetch delivery updates
      const { data: updates } = await supabase
        .from("delivery_updates")
        .select("status, location, notes, created_at")
        .eq("dispatch_id", dispatch.dispatch_number)
        .order("created_at", { ascending: false });

      setResult({
        ...dispatch,
        customer: dispatch.customers,
        updates: updates || [],
      });
    } catch (err: any) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusProgress = (status: string) => {
    const statuses = ["pending", "assigned", "picked_up", "in_transit", "delivered"];
    const index = statuses.indexOf(status);
    return ((index + 1) / statuses.length) * 100;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-xl text-foreground">LogiFlow</h1>
              <p className="text-xs text-muted-foreground">Shipment Tracking</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto"
        >
          {/* Search Card */}
          <Card className="mb-8">
            <CardHeader className="text-center">
              <CardTitle className="font-heading text-2xl">Track Your Shipment</CardTitle>
              <CardDescription>
                Enter your tracking number to get real-time updates on your delivery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder="Enter tracking number (e.g., DSP-20260108-0001)"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTrack()}
                    className="pl-10 h-12 text-lg"
                  />
                </div>
                <Button onClick={handleTrack} disabled={loading} className="h-12 px-6">
                  {loading ? "Tracking..." : "Track"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Error State */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="py-8 text-center">
                  <XCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
                  <p className="text-foreground font-medium">{error}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Make sure you've entered the correct tracking number
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Result */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Status Card */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="font-heading">{result.dispatch_number}</CardTitle>
                      <CardDescription>
                        {result.customer?.company_name || "Customer"}
                      </CardDescription>
                    </div>
                    <div className={`flex items-center gap-2 ${statusConfig[result.status]?.color}`}>
                      {(() => {
                        const StatusIcon = statusConfig[result.status]?.icon || Clock;
                        return <StatusIcon className="w-5 h-5" />;
                      })()}
                      <span className="font-semibold text-lg">
                        {statusConfig[result.status]?.label || result.status}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${getStatusProgress(result.status)}%` }}
                        transition={{ duration: 0.5 }}
                        className="h-full bg-gradient-primary"
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                      <span>Pending</span>
                      <span>Assigned</span>
                      <span>Picked Up</span>
                      <span>In Transit</span>
                      <span>Delivered</span>
                    </div>
                  </div>

                  {/* Addresses */}
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-2 text-success mb-2">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium">Pickup</span>
                      </div>
                      <p className="text-foreground">{result.pickup_address}</p>
                      {result.actual_pickup && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Picked up: {new Date(result.actual_pickup).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="p-4 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-2 text-destructive mb-2">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium">Delivery</span>
                      </div>
                      <p className="text-foreground">{result.delivery_address}</p>
                      {result.actual_delivery && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Delivered: {new Date(result.actual_delivery).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Cargo Info */}
                  {result.cargo_description && (
                    <div className="mt-4 p-4 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">Cargo Details</span>
                      </div>
                      <p className="text-muted-foreground">{result.cargo_description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Timeline */}
              {result.updates.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-heading text-lg">Delivery Updates</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {result.updates.map((update, index) => {
                        const UpdateIcon = statusConfig[update.status]?.icon || Clock;
                        return (
                          <div key={index} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${statusConfig[update.status]?.color} bg-secondary`}>
                                <UpdateIcon className="w-4 h-4" />
                              </div>
                              {index < result.updates.length - 1 && (
                                <div className="w-0.5 h-full bg-border mt-2" />
                              )}
                            </div>
                            <div className="flex-1 pb-4">
                              <p className="font-medium text-foreground">
                                {statusConfig[update.status]?.label || update.status}
                              </p>
                              {update.location && (
                                <p className="text-sm text-muted-foreground">{update.location}</p>
                              )}
                              {update.notes && (
                                <p className="text-sm text-muted-foreground mt-1">{update.notes}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(update.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </motion.div>
          )}

          {/* Help Section */}
          <div className="mt-12 text-center">
            <p className="text-muted-foreground mb-2">Need help with your shipment?</p>
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="sm">
                <Phone className="w-4 h-4 mr-2" />
                Contact Support
              </Button>
              <Button variant="outline" size="sm">
                <Building2 className="w-4 h-4 mr-2" />
                Visit Us
              </Button>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Track;
