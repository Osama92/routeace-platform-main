import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Filter,
  MapPin,
  Package,
  Truck,
  MoreVertical,
  Calendar,
  User,
  RefreshCw,
  Fuel,
  Pencil,
  DollarSign,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import FuelPlanningCard from "@/components/dispatch/FuelPlanningCard";
import { useAuditLog } from "@/hooks/useAuditLog";
import MultipleDropoffs from "@/components/dispatch/MultipleDropoffs";
import DispatchMapView from "@/components/dispatch/DispatchMapView";
import { AddressAutocomplete } from "@/components/shared/AddressAutocomplete";
import FinancialDetailsForm from "@/components/transactions/FinancialDetailsForm";

interface Dropoff {
  id: string;
  address: string;
  notes: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface DispatchDropoff {
  id: string;
  dispatch_id: string | null;
  address: string;
  notes: string | null;
  sequence_order: number;
  latitude?: number | null;
  longitude?: number | null;
}

interface Dispatch {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  status: string;
  priority: string;
  scheduled_pickup: string | null;
  cargo_description: string | null;
  cargo_weight_kg: number | null;
  distance_km: number | null;
  return_distance_km: number | null;
  total_distance_km: number | null;
  suggested_fuel_liters: number | null;
  actual_fuel_liters: number | null;
  fuel_variance: number | null;
  vehicle_id: string | null;
  driver_id: string | null;
  created_at: string;
  drivers?: { full_name: string } | null;
  vehicles?: {
    registration_number: string;
    vehicle_type: string;
    capacity_kg: number | null;
    fleet_type?: string | null;
    vendor_id?: string | null;
    vendor?: { id: string; company_name: string } | null;
  } | null;
  customers?: { company_name: string } | null;
}

interface Driver {
  id: string;
  full_name: string;
  status: string;
}

interface Customer {
  id: string;
  company_name: string;
  factory_address: string | null;
  factory_lat: number | null;
  factory_lng: number | null;
}

interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_type: string;
  capacity_kg: number | null;
  status: string | null;
}

interface DieselRate {
  id: string;
  origin: string;
  destination: string;
  truck_type: string;
  diesel_liters_agreed: number;
  diesel_cost_per_liter: number | null;
}

const statusColors: Record<string, string> = {
  pending: "status-pending",
  assigned: "status-transit",
  picked_up: "status-transit",
  in_transit: "status-transit",
  delivered: "status-delivered",
  cancelled: "status-delayed",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  normal: "bg-info/15 text-info",
  high: "bg-warning/15 text-warning",
  urgent: "bg-destructive/15 text-destructive",
};

const DispatchPage = () => {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFinancialFormOpen, setIsFinancialFormOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [detailDropoffs, setDetailDropoffs] = useState<Dropoff[]>([]);
  const [dieselRates, setDieselRates] = useState<DieselRate[]>([]);
  const [matchedDieselRate, setMatchedDieselRate] = useState<DieselRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, userRole, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const [formData, setFormData] = useState({
    customer_id: "",
    pickup_address: "",
    delivery_address: "",
    cargo_description: "",
    cargo_weight_kg: "",
    priority: "normal",
    scheduled_pickup: "",
    vehicle_id: "",
    driver_id: "",
    distance_km: "",
  });

  // Coordinates for distance calculation
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  const [statusUpdate, setStatusUpdate] = useState({
    status: "",
    location: "",
    notes: "",
  });

  const [dropoffs, setDropoffs] = useState<Dropoff[]>([]);
  
  // Edit form state
  const [editFormData, setEditFormData] = useState({
    customer_id: "",
    pickup_address: "",
    delivery_address: "",
    cargo_description: "",
    cargo_weight_kg: "",
    priority: "normal",
    scheduled_pickup: "",
    vehicle_id: "",
    driver_id: "",
    distance_km: "",
  });
  const [editDropoffs, setEditDropoffs] = useState<Dropoff[]>([]);

  const canManage = hasAnyRole(["admin", "operations", "dispatcher"]);
  const canUpdateStatus = hasAnyRole(["admin", "operations", "dispatcher", "support"]);

  const fetchData = async () => {
    try {
      const [dispatchesRes, driversRes, customersRes, vehiclesRes] = await Promise.all([
        supabase
          .from("dispatches")
          .select(`
            *,
            drivers (full_name),
            vehicles (registration_number, vehicle_type, capacity_kg, fleet_type, vendor_id, vendor:vendor_id (id, company_name)),
            customers (company_name)
          `)
          .order("created_at", { ascending: false }),
        supabase.from("drivers").select("id, full_name, status").eq("status", "available"),
        supabase.from("customers").select("id, company_name, factory_address, factory_lat, factory_lng"),
        supabase.from("vehicles").select("id, registration_number, vehicle_type, capacity_kg, status").eq("status", "available"),
      ]);

      if (dispatchesRes.error) throw dispatchesRes.error;
      if (driversRes.error) throw driversRes.error;
      if (customersRes.error) throw customersRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;

      setDispatches(dispatchesRes.data || []);
      setDrivers(driversRes.data || []);
      setCustomers(customersRes.data || []);
      setVehicles(vehiclesRes.data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDieselRates = async () => {
    try {
      const { data, error } = await (supabase
        .from("diesel_rate_config" as any)
        .select("id, origin, destination, truck_type, diesel_liters_agreed, diesel_cost_per_liter")
        .eq("is_active", true) as any);

      if (error) throw error;
      setDieselRates((data as DieselRate[]) || []);
    } catch (error) {
      console.error("Failed to fetch diesel rates:", error);
    }
  };

  // Normalize truck type for matching
  const normalizeTruckType = (vehicleType: string | null): string => {
    if (!vehicleType) return '10t';
    const type = vehicleType.toLowerCase();
    if (type.includes('trailer')) return 'trailer';
    if (type.includes('20') || type.includes('twenty')) return '20t';
    if (type.includes('15') || type.includes('fifteen')) return '15t';
    if (type.includes('5') || type.includes('five')) return '5t';
    return '10t';
  };

  // Find matching diesel rate based on pickup, delivery, and truck type
  const findMatchingDieselRate = (
    pickup: string,
    delivery: string,
    truckType: string
  ): DieselRate | null => {
    const pickupLower = pickup.toLowerCase();
    const deliveryLower = delivery.toLowerCase();
    
    return dieselRates.find(rate => {
      const originMatch = pickupLower.includes(rate.origin.toLowerCase()) || 
                          rate.origin.toLowerCase().includes(pickupLower.split(',')[0].trim());
      const destMatch = deliveryLower.includes(rate.destination.toLowerCase()) ||
                        rate.destination.toLowerCase().includes(deliveryLower.split(',')[0].trim());
      const truckMatch = rate.truck_type === truckType;
      
      return originMatch && destMatch && truckMatch;
    }) || null;
  };

  useEffect(() => {
    fetchData();
    fetchDieselRates();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("dispatches-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatches" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-update matched diesel rate when form changes
  useEffect(() => {
    if (formData.pickup_address && formData.delivery_address && formData.vehicle_id) {
      const vehicle = vehicles.find(v => v.id === formData.vehicle_id);
      const truckType = normalizeTruckType(vehicle?.vehicle_type || null);
      const matched = findMatchingDieselRate(
        formData.pickup_address,
        formData.delivery_address,
        truckType
      );
      setMatchedDieselRate(matched);
    } else {
      setMatchedDieselRate(null);
    }
  }, [formData.pickup_address, formData.delivery_address, formData.vehicle_id, dieselRates, vehicles]);

  const filteredDispatches = dispatches.filter((dispatch) => {
    const matchesSearch =
      dispatch.dispatch_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dispatch.pickup_address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      dispatch.delivery_address.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || dispatch.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle customer selection - auto-fill pickup address from factory address
  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    setFormData(prev => ({
      ...prev,
      customer_id: customerId,
      pickup_address: customer?.factory_address || prev.pickup_address,
    }));

    // Set pickup coordinates if available
    if (customer?.factory_lat && customer?.factory_lng) {
      setPickupCoords({ lat: customer.factory_lat, lng: customer.factory_lng });
    } else {
      setPickupCoords(null);
    }
  };

  // Handle delivery address selection from autocomplete
  const handleDeliveryPlaceSelect = (details: { formattedAddress: string; lat: number; lng: number }) => {
    setFormData(prev => ({ ...prev, delivery_address: details.formattedAddress }));
    setDeliveryCoords({ lat: details.lat, lng: details.lng });
  };

  // Calculate distance when both coordinates are available
  const calculateDistance = async () => {
    if (!pickupCoords || !deliveryCoords) return;

    setIsCalculatingDistance(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-distance-matrix', {
        body: {
          origins: `${pickupCoords.lat},${pickupCoords.lng}`,
          destinations: `${deliveryCoords.lat},${deliveryCoords.lng}`,
        },
      });

      if (error) throw error;

      if (data?.distance_km) {
        setFormData(prev => ({ ...prev, distance_km: data.distance_km.toString() }));
        toast({
          title: "Distance Calculated",
          description: `Distance: ${data.distance_km} km`,
        });
      }
    } catch (error) {
      console.error('Error calculating distance:', error);
      toast({
        title: "Distance Calculation Failed",
        description: "Could not calculate distance. You can enter it manually.",
        variant: "destructive",
      });
    } finally {
      setIsCalculatingDistance(false);
    }
  };

  // Auto-calculate distance when both coordinates are available
  useEffect(() => {
    if (pickupCoords && deliveryCoords && !formData.distance_km) {
      calculateDistance();
    }
  }, [pickupCoords, deliveryCoords]);

  // Calculate suggested fuel based on vehicle and distance
  const calculateSuggestedFuel = (vehicleId: string, distanceKm: number) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return 0;
    
    const tonnage = (vehicle.capacity_kg || 0) / 1000;
    let factor = 0.35;
    if (tonnage >= 45) factor = 0.55;
    else if (tonnage >= 25) factor = 0.47;
    else if (tonnage >= 15) factor = 0.35;
    
    return distanceKm * 2 * factor; // To and fro
  };

  // Auto-sync to Google Sheets if configured
  const syncToGoogleSheets = async () => {
    try {
      // Check if there's an active Google Sheets config
      const { data: configs } = await supabase
        .from("google_sheets_configs")
        .select("*")
        .eq("data_type", "dispatches")
        .eq("is_active", true)
        .limit(1);

      if (configs && configs.length > 0) {
        const config = configs[0];
        // Trigger sync in background (don't wait for it)
        supabase.functions.invoke('google-sheets-sync', {
          body: {
            action: 'export_dispatches',
            config: {
              spreadsheet_id: config.spreadsheet_id,
              sheet_name: config.sheet_name || 'Sheet1',
            },
          },
        }).then(({ error }) => {
          if (error) {
            console.error('Auto-sync to Google Sheets failed:', error);
          } else {
            console.log('Auto-synced to Google Sheets');
          }
        });
      }
    } catch (error) {
      console.error('Error checking Google Sheets config:', error);
    }
  };

  const handleCreateDispatch = async () => {
    if (!formData.customer_id || !formData.pickup_address || !formData.delivery_address) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const distanceKm = formData.distance_km ? parseFloat(formData.distance_km) : null;
      const suggestedFuel = formData.vehicle_id && distanceKm 
        ? calculateSuggestedFuel(formData.vehicle_id, distanceKm) 
        : null;

      // Set approval_status based on role - Operations requires admin approval
      const needsApproval = userRole === "operations";

      const insertData = {
        dispatch_number: `DSP-${Date.now()}`,
        customer_id: formData.customer_id,
        pickup_address: formData.pickup_address,
        delivery_address: formData.delivery_address,
        cargo_description: formData.cargo_description || null,
        cargo_weight_kg: formData.cargo_weight_kg ? parseFloat(formData.cargo_weight_kg) : null,
        priority: formData.priority as "low" | "normal" | "high" | "urgent",
        scheduled_pickup: formData.scheduled_pickup || null,
        vehicle_id: formData.vehicle_id || null,
        driver_id: formData.driver_id || null,
        distance_km: distanceKm,
        return_distance_km: distanceKm,
        total_distance_km: distanceKm ? distanceKm * 2 : null,
        suggested_fuel_liters: suggestedFuel,
        created_by: user?.id,
        approval_status: needsApproval ? "pending" : "approved",
        created_by_role: userRole,
      };

      const { data, error } = await supabase.from("dispatches").insert([insertData]).select().single();

      if (error) throw error;

      // Insert dropoffs if any
      if (data && dropoffs.length > 0) {
        const dropoffsToInsert = dropoffs.map((d, index) => ({
          dispatch_id: data.id,
          address: d.address,
          sequence_order: index + 1,
          notes: d.notes || null,
        }));

        await supabase.from("dispatch_dropoffs").insert(dropoffsToInsert);
      }

      // Log the creation
      if (data) {
        await logChange({
          table_name: "dispatches",
          record_id: data.id,
          action: "insert",
          new_data: { ...insertData, dropoffs: dropoffs.length },
        });
      }

      // Auto-sync to Google Sheets (runs in background)
      syncToGoogleSheets();

      toast({
        title: needsApproval ? "Dispatch Submitted" : "Success",
        description: needsApproval
          ? "Dispatch created and pending admin approval"
          : "Dispatch created successfully",
      });
      setIsDialogOpen(false);
      setFormData({
        customer_id: "",
        pickup_address: "",
        delivery_address: "",
        cargo_description: "",
        cargo_weight_kg: "",
        priority: "normal",
        scheduled_pickup: "",
        vehicle_id: "",
        driver_id: "",
        distance_km: "",
      });
      setDropoffs([]);
      setPickupCoords(null);
      setDeliveryCoords(null);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create dispatch",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!selectedDispatch || !statusUpdate.status) {
      toast({
        title: "Error",
        description: "Please select a status",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Call edge function to update status and send email
      const { data, error } = await supabase.functions.invoke("update-delivery-status", {
        body: {
          dispatch_id: selectedDispatch.id,
          status: statusUpdate.status,
          location: statusUpdate.location || null,
          notes: statusUpdate.notes || null,
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: data.email_sent 
          ? "Status updated and customer notified via email" 
          : "Status updated successfully",
      });
      setIsStatusDialogOpen(false);
      setSelectedDispatch(null);
      setStatusUpdate({ status: "", location: "", notes: "" });
      fetchData();
    } catch (error: any) {
      // Fallback to direct update if edge function fails
      try {
        const oldStatus = selectedDispatch.status;
        const { error: updateError } = await supabase
          .from("dispatches")
          .update({ status: statusUpdate.status })
          .eq("id", selectedDispatch.id);

        if (updateError) throw updateError;

        // Log the status update
        await logChange({
          table_name: "dispatches",
          record_id: selectedDispatch.id,
          action: "update",
          old_data: { status: oldStatus },
          new_data: { status: statusUpdate.status },
        });

        toast({
          title: "Success",
          description: "Status updated (email notification pending)",
        });
        setIsStatusDialogOpen(false);
        fetchData();
      } catch (fallbackError: any) {
        toast({
          title: "Error",
          description: fallbackError.message || "Failed to update status",
          variant: "destructive",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  // Fetch dropoffs for a specific dispatch
  const fetchDispatchDropoffs = async (dispatchId: string): Promise<Dropoff[]> => {
    const { data, error } = await supabase
      .from("dispatch_dropoffs")
      .select("*")
      .eq("dispatch_id", dispatchId)
      .order("sequence_order", { ascending: true });

    if (error) {
      console.error("Error fetching dropoffs:", error);
      return [];
    }

    return (data || []).map((d: DispatchDropoff) => ({
      id: d.id,
      address: d.address,
      notes: d.notes || "",
      latitude: d.latitude,
      longitude: d.longitude,
    }));
  };

  // Open edit dialog with dispatch data
  const handleOpenEditDialog = async (dispatch: Dispatch) => {
    setSelectedDispatch(dispatch);
    
    // Populate edit form with existing data
    setEditFormData({
      customer_id: dispatch.customers ? customers.find(c => c.company_name === dispatch.customers?.company_name)?.id || "" : "",
      pickup_address: dispatch.pickup_address,
      delivery_address: dispatch.delivery_address,
      cargo_description: dispatch.cargo_description || "",
      cargo_weight_kg: dispatch.cargo_weight_kg?.toString() || "",
      priority: dispatch.priority || "normal",
      scheduled_pickup: dispatch.scheduled_pickup 
        ? new Date(dispatch.scheduled_pickup).toISOString().slice(0, 16) 
        : "",
      vehicle_id: dispatch.vehicle_id || "",
      driver_id: dispatch.driver_id || "",
      distance_km: dispatch.distance_km?.toString() || "",
    });

    // Fetch existing dropoffs
    const existingDropoffs = await fetchDispatchDropoffs(dispatch.id);
    setEditDropoffs(existingDropoffs);
    
    setIsEditDialogOpen(true);
  };

  // Handle edit input changes
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Save edited dispatch
  const handleEditDispatch = async () => {
    if (!selectedDispatch) return;

    if (!editFormData.pickup_address || !editFormData.delivery_address) {
      toast({
        title: "Validation Error",
        description: "Please fill in pickup and delivery addresses",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const distanceKm = editFormData.distance_km ? parseFloat(editFormData.distance_km) : null;
      const suggestedFuel = editFormData.vehicle_id && distanceKm 
        ? calculateSuggestedFuel(editFormData.vehicle_id, distanceKm) 
        : selectedDispatch.suggested_fuel_liters;

      const oldData = {
        pickup_address: selectedDispatch.pickup_address,
        delivery_address: selectedDispatch.delivery_address,
        cargo_description: selectedDispatch.cargo_description,
        cargo_weight_kg: selectedDispatch.cargo_weight_kg,
        priority: selectedDispatch.priority,
        vehicle_id: selectedDispatch.vehicle_id,
        driver_id: selectedDispatch.driver_id,
        distance_km: selectedDispatch.distance_km,
      };

      const updateData = {
        pickup_address: editFormData.pickup_address,
        delivery_address: editFormData.delivery_address,
        cargo_description: editFormData.cargo_description || null,
        cargo_weight_kg: editFormData.cargo_weight_kg ? parseFloat(editFormData.cargo_weight_kg) : null,
        priority: editFormData.priority,
        scheduled_pickup: editFormData.scheduled_pickup || null,
        vehicle_id: editFormData.vehicle_id || null,
        driver_id: editFormData.driver_id || null,
        distance_km: distanceKm,
        return_distance_km: distanceKm,
        total_distance_km: distanceKm ? distanceKm * 2 : null,
        suggested_fuel_liters: suggestedFuel,
      };

      // Update dispatch
      const { error: updateError } = await supabase
        .from("dispatches")
        .update(updateData)
        .eq("id", selectedDispatch.id);

      if (updateError) throw updateError;

      // Sync dropoffs: delete existing and insert new
      await supabase
        .from("dispatch_dropoffs")
        .delete()
        .eq("dispatch_id", selectedDispatch.id);

      if (editDropoffs.length > 0) {
        const dropoffsToInsert = editDropoffs.map((d, index) => ({
          dispatch_id: selectedDispatch.id,
          address: d.address,
          sequence_order: index + 1,
          notes: d.notes || null,
          latitude: d.latitude || null,
          longitude: d.longitude || null,
        }));

        await supabase.from("dispatch_dropoffs").insert(dropoffsToInsert);
      }

      // Log the update
      await logChange({
        table_name: "dispatches",
        record_id: selectedDispatch.id,
        action: "update",
        old_data: oldData,
        new_data: { ...updateData, dropoffs_count: editDropoffs.length },
      });

      // Auto-sync to Google Sheets (runs in background)
      syncToGoogleSheets();

      toast({
        title: "Success",
        description: "Dispatch updated successfully",
      });
      setIsEditDialogOpen(false);
      setSelectedDispatch(null);
      setEditDropoffs([]);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update dispatch",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="Dispatch Management"
      subtitle="Create and manage shipment dispatches"
    >
      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-8">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search dispatches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="picked_up">Picked Up</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                New Dispatch
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] sm:max-w-[600px] max-h-[90vh] flex flex-col">
              <DialogHeader className="flex-shrink-0">
                <DialogTitle className="font-heading">Create New Dispatch</DialogTitle>
                <DialogDescription>
                  Fill in the details to create a new shipment dispatch.
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 overflow-y-auto pr-2 -mr-2">
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="customer_id">Customer *</Label>
                  <Select
                    value={formData.customer_id}
                    onValueChange={handleCustomerChange}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pickup_address">Pickup Address *</Label>
                    <Input
                      id="pickup_address"
                      name="pickup_address"
                      value={formData.pickup_address}
                      onChange={handleInputChange}
                      placeholder="Pickup location (auto-filled from customer)"
                      className="bg-secondary/50"
                      disabled={!!formData.customer_id && !!customers.find(c => c.id === formData.customer_id)?.factory_address}
                    />
                    {formData.customer_id && pickupCoords && (
                      <p className="text-xs text-muted-foreground">Coordinates: {pickupCoords.lat.toFixed(4)}, {pickupCoords.lng.toFixed(4)}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery_address">Delivery Address *</Label>
                    <AddressAutocomplete
                      value={formData.delivery_address}
                      onChange={(value) => setFormData(prev => ({ ...prev, delivery_address: value }))}
                      onPlaceSelect={handleDeliveryPlaceSelect}
                      placeholder="Start typing delivery location..."
                      className="bg-secondary/50"
                    />
                    {deliveryCoords && (
                      <p className="text-xs text-muted-foreground">Coordinates: {deliveryCoords.lat.toFixed(4)}, {deliveryCoords.lng.toFixed(4)}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cargo_description">Cargo Description</Label>
                    <Input
                      id="cargo_description"
                      name="cargo_description"
                      value={formData.cargo_description}
                      onChange={handleInputChange}
                      placeholder="e.g., Electronics"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cargo_weight_kg">Weight (kg)</Label>
                    <Input
                      id="cargo_weight_kg"
                      name="cargo_weight_kg"
                      type="number"
                      value={formData.cargo_weight_kg}
                      onChange={handleInputChange}
                      placeholder="e.g., 2500"
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}
                    >
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduled_pickup">Scheduled Pickup</Label>
                    <Input
                      id="scheduled_pickup"
                      name="scheduled_pickup"
                      type="datetime-local"
                      value={formData.scheduled_pickup}
                      onChange={handleInputChange}
                      className="bg-secondary/50"
                    />
                  </div>
                </div>

                {/* Vehicle & Driver Assignment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vehicle</Label>
                    <Select
                      value={formData.vehicle_id}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, vehicle_id: value }))}
                    >
                      <SelectTrigger className="bg-secondary/50">
                        <Truck className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Assign vehicle" />
                      </SelectTrigger>
                      <SelectContent>
                        {vehicles.map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.id}>
                            {vehicle.registration_number} ({vehicle.vehicle_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Driver</Label>
                    <Select
                      value={formData.driver_id}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, driver_id: value }))}
                    >
                      <SelectTrigger className="bg-secondary/50">
                        <User className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Assign driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Distance & Fuel Planning */}
                <div className="space-y-2">
                  <Label htmlFor="distance_km">One-Way Distance (km)</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        id="distance_km"
                        name="distance_km"
                        type="number"
                        value={formData.distance_km}
                        onChange={handleInputChange}
                        placeholder={isCalculatingDistance ? "Calculating..." : "e.g., 450"}
                        className="bg-secondary/50"
                        disabled={isCalculatingDistance}
                      />
                      {isCalculatingDistance && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    {pickupCoords && deliveryCoords && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={calculateDistance}
                        disabled={isCalculatingDistance}
                        className="shrink-0"
                      >
                        <RefreshCw className={`w-4 h-4 ${isCalculatingDistance ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                  </div>
                  {pickupCoords && deliveryCoords && (
                    <p className="text-xs text-muted-foreground">Distance will be auto-calculated from coordinates</p>
                  )}
                </div>

                {formData.vehicle_id && formData.distance_km && (
                  <div className="p-4 bg-primary/10 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Fuel className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">Fuel Estimation</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total Distance (To & Fro)</p>
                        <p className="font-semibold">{(parseFloat(formData.distance_km) * 2).toFixed(0)} km</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Suggested Diesel</p>
                        <p className="font-semibold text-success">
                          {calculateSuggestedFuel(formData.vehicle_id, parseFloat(formData.distance_km)).toFixed(1)} L
                        </p>
                      </div>
                    </div>
                    {matchedDieselRate && (
                      <div className="mt-3 pt-3 border-t border-primary/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">Diesel Agreed (from Rate Config)</p>
                            <p className="font-bold text-lg text-amber-600">{matchedDieselRate.diesel_liters_agreed}L</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>{matchedDieselRate.origin} → {matchedDieselRate.destination}</p>
                            <p>₦{(matchedDieselRate.diesel_cost_per_liter || 950).toLocaleString()}/L</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Multiple Drop-off Points */}
                <MultipleDropoffs dropoffs={dropoffs} onChange={setDropoffs} />
              </div>
              </div>
              <DialogFooter className="flex-shrink-0 flex-col sm:flex-row gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={handleCreateDispatch} disabled={saving} className="w-full sm:w-auto">
                  {saving ? "Creating..." : "Create Dispatch"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Dispatch Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <span className="text-muted-foreground">Loading dispatches...</span>
          </div>
        </div>
      ) : filteredDispatches.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No dispatches found</p>
          <p className="text-sm text-muted-foreground/70">Create your first dispatch to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredDispatches.map((dispatch, index) => (
            <motion.div
              key={dispatch.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="glass-card p-6 hover:border-primary/30 transition-all duration-300"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-semibold text-foreground">
                      {dispatch.dispatch_number} | {dispatch.vehicles?.registration_number || "—"}
                    </span>
                    <span className={`status-badge ${priorityColors[dispatch.priority] || priorityColors.normal}`}>
                      {dispatch.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {dispatch.pickup_address?.split(",")[0]} → {dispatch.delivery_address?.split(",")[0]}
                  </p>
                  <span className={`status-badge ${statusColors[dispatch.status] || statusColors.pending} mt-2`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {dispatch.status.replace("_", " ")}
                  </span>
                </div>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>

              {/* Customer */}
              {dispatch.customers && (
                <p className="text-sm text-muted-foreground mb-3">
                  <span className="text-foreground font-medium">{dispatch.customers.company_name}</span>
                </p>
              )}

              {/* Route */}
              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-success/20 flex items-center justify-center mt-0.5">
                    <MapPin className="w-3 h-3 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pickup</p>
                    <p className="text-sm font-medium text-foreground">{dispatch.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-destructive/20 flex items-center justify-center mt-0.5">
                    <MapPin className="w-3 h-3 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Delivery</p>
                    <p className="text-sm font-medium text-foreground">{dispatch.delivery_address}</p>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground truncate">
                    {dispatch.drivers?.full_name || "Unassigned"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {dispatch.vehicles?.registration_number || "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {dispatch.cargo_weight_kg ? `${dispatch.cargo_weight_kg} kg` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {dispatch.scheduled_pickup
                      ? new Date(dispatch.scheduled_pickup).toLocaleDateString()
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[100px]"
                  onClick={async () => {
                    setSelectedDispatch(dispatch);
                    // Fetch dropoffs for this dispatch
                    const dropoffsData = await fetchDispatchDropoffs(dispatch.id);
                    setDetailDropoffs(dropoffsData);
                    setIsDetailDialogOpen(true);
                  }}
                >
                  View Details
                </Button>
                {canManage && dispatch.status !== "delivered" && dispatch.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditDialog(dispatch)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                {canUpdateStatus && dispatch.status !== "delivered" && dispatch.status !== "cancelled" && dispatch.approval_status === "approved" && (
                  <Button
                    size="sm"
                    className="flex-1 min-w-[120px]"
                    onClick={() => {
                      setSelectedDispatch(dispatch);
                      setStatusUpdate({ status: "", location: "", notes: "" });
                      setIsStatusDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Update Status
                  </Button>
                )}
                {/* Add Financial Details button for delivered dispatches - Admin only */}
                {hasAnyRole(["admin"]) && dispatch.status === "delivered" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1 min-w-[140px]"
                    onClick={() => {
                      setSelectedDispatch(dispatch);
                      setIsFinancialFormOpen(true);
                    }}
                  >
                    <DollarSign className="w-4 h-4 mr-1" />
                    Add Financials
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Status Update Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="font-heading">Update Delivery Status</DialogTitle>
            <DialogDescription>
              Update status for {selectedDispatch?.dispatch_number}. Customer will be notified via email.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select
                value={statusUpdate.status}
                onValueChange={(value) => setStatusUpdate((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">Assigned to Driver</SelectItem>
                  <SelectItem value="picked_up">Picked Up</SelectItem>
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Current Location</Label>
              <Input
                value={statusUpdate.location}
                onChange={(e) => setStatusUpdate((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Lagos-Ibadan Expressway"
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={statusUpdate.notes}
                onChange={(e) => setStatusUpdate((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional notes..."
                className="bg-secondary/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStatusUpdate} disabled={saving}>
              {saving ? "Updating..." : "Update Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch Detail Dialog with Fuel Planning */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {selectedDispatch?.dispatch_number} | {selectedDispatch?.vehicles?.registration_number || "No Vehicle"} | {selectedDispatch?.pickup_address?.split(",")[0]} → {selectedDispatch?.delivery_address?.split(",")[0]}
            </DialogTitle>
            <DialogDescription>
              View dispatch information and fuel planning
            </DialogDescription>
          </DialogHeader>
          
          {selectedDispatch && (
            <div className="grid gap-6 py-4">
              {/* Dispatch Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedDispatch.customers?.company_name || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{selectedDispatch.status?.replace("_", " ")}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pickup</p>
                  <p className="text-sm">{selectedDispatch.pickup_address}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Delivery</p>
                  <p className="text-sm">{selectedDispatch.delivery_address}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Driver</p>
                  <p className="font-medium">{selectedDispatch.drivers?.full_name || "Unassigned"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Vehicle</p>
                  <p className="font-medium">{selectedDispatch.vehicles?.registration_number || "—"}</p>
                </div>
              </div>

              {/* Route Map View */}
              <DispatchMapView
                pickup={{
                  address: selectedDispatch.pickup_address,
                  type: "pickup",
                }}
                delivery={{
                  address: selectedDispatch.delivery_address,
                  type: "delivery",
                }}
                dropoffs={detailDropoffs.map((d, i) => ({
                  address: d.address,
                  latitude: d.latitude || undefined,
                  longitude: d.longitude || undefined,
                  type: "dropoff" as const,
                  label: `Stop ${i + 1}`,
                }))}
                mapboxToken={import.meta.env.VITE_MAPBOX_TOKEN}
              />

              {/* Fuel Planning Card */}
              <FuelPlanningCard
                dispatchId={selectedDispatch.id}
                distanceKm={selectedDispatch.distance_km || 0}
                vehicleId={selectedDispatch.vehicle_id || undefined}
                pickupAddress={selectedDispatch.pickup_address}
                deliveryAddress={selectedDispatch.delivery_address}
                onUpdate={() => fetchData()}
                onSaveComplete={() => {
                  setIsDetailDialogOpen(false);
                  fetchData();
                }}
                readOnly={true}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dispatch Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="font-heading">
              Edit Dispatch - {selectedDispatch?.dispatch_number}
            </DialogTitle>
            <DialogDescription>
              Modify dispatch details and drop-off points.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_pickup_address">Pickup Address *</Label>
                <Input
                  id="edit_pickup_address"
                  name="pickup_address"
                  value={editFormData.pickup_address}
                  onChange={handleEditInputChange}
                  placeholder="Pickup location"
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_delivery_address">Delivery Address *</Label>
                <Input
                  id="edit_delivery_address"
                  name="delivery_address"
                  value={editFormData.delivery_address}
                  onChange={handleEditInputChange}
                  placeholder="Delivery location"
                  className="bg-secondary/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_cargo_description">Cargo Description</Label>
                <Input
                  id="edit_cargo_description"
                  name="cargo_description"
                  value={editFormData.cargo_description}
                  onChange={handleEditInputChange}
                  placeholder="e.g., Electronics"
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_cargo_weight_kg">Weight (kg)</Label>
                <Input
                  id="edit_cargo_weight_kg"
                  name="cargo_weight_kg"
                  type="number"
                  value={editFormData.cargo_weight_kg}
                  onChange={handleEditInputChange}
                  placeholder="e.g., 2500"
                  className="bg-secondary/50"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={editFormData.priority}
                  onValueChange={(value) => setEditFormData((prev) => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_scheduled_pickup">Scheduled Pickup</Label>
                <Input
                  id="edit_scheduled_pickup"
                  name="scheduled_pickup"
                  type="datetime-local"
                  value={editFormData.scheduled_pickup}
                  onChange={handleEditInputChange}
                  className="bg-secondary/50"
                />
              </div>
            </div>

            {/* Vehicle & Driver Assignment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vehicle</Label>
                <Select
                  value={editFormData.vehicle_id || "none"}
                  onValueChange={(value) => setEditFormData((prev) => ({ ...prev, vehicle_id: value === "none" ? "" : value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <Truck className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Assign vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Vehicle</SelectItem>
                    {vehicles.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={vehicle.id}>
                        {vehicle.registration_number} ({vehicle.vehicle_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select
                  value={editFormData.driver_id || "none"}
                  onValueChange={(value) => setEditFormData((prev) => ({ ...prev, driver_id: value === "none" ? "" : value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <User className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Assign driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {drivers.map((driver) => (
                      <SelectItem key={driver.id} value={driver.id}>
                        {driver.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Distance */}
            <div className="space-y-2">
              <Label htmlFor="edit_distance_km">One-Way Distance (km)</Label>
              <Input
                id="edit_distance_km"
                name="distance_km"
                type="number"
                value={editFormData.distance_km}
                onChange={handleEditInputChange}
                placeholder="e.g., 450"
                className="bg-secondary/50"
              />
            </div>

            {editFormData.vehicle_id && editFormData.distance_km && (
              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Fuel className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">Fuel Estimation</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Distance (To & Fro)</p>
                    <p className="font-semibold">{(parseFloat(editFormData.distance_km) * 2).toFixed(0)} km</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Suggested Diesel</p>
                    <p className="font-semibold text-success">
                      {calculateSuggestedFuel(editFormData.vehicle_id, parseFloat(editFormData.distance_km)).toFixed(1)} L
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Multiple Drop-off Points */}
            <MultipleDropoffs dropoffs={editDropoffs} onChange={setEditDropoffs} />
          </div>
          </div>
          <DialogFooter className="flex-shrink-0 flex-col sm:flex-row gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={handleEditDispatch} disabled={saving} className="w-full sm:w-auto">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Financial Details Form for completed dispatches */}
      <FinancialDetailsForm
        open={isFinancialFormOpen}
        onOpenChange={setIsFinancialFormOpen}
        dispatch={selectedDispatch ? {
          id: selectedDispatch.id,
          dispatch_number: selectedDispatch.dispatch_number,
          pickup_address: selectedDispatch.pickup_address,
          delivery_address: selectedDispatch.delivery_address,
          distance_km: selectedDispatch.distance_km,
          cargo_weight_kg: selectedDispatch.cargo_weight_kg,
          customers: selectedDispatch.customers ? { id: "", company_name: selectedDispatch.customers.company_name } : null,
          drivers: selectedDispatch.drivers ? { id: "", full_name: selectedDispatch.drivers.full_name } : null,
          vehicles: selectedDispatch.vehicles ? { id: "", registration_number: selectedDispatch.vehicles.registration_number } : null,
        } : null}
        onSuccess={() => {
          toast({
            title: "Success",
            description: "Financial details saved and will sync to Google Sheets",
          });
          fetchData();
        }}
      />
    </DashboardLayout>
  );
};

export default DispatchPage;
