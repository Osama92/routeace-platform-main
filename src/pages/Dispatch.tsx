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
  History,
  CalendarRange,
  Trash2,
  Eye,
  FileText,
  Route,
  Clock,
  CheckCircle,
  XCircle,
  Save,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import FuelPlanningCard from "@/components/dispatch/FuelPlanningCard";
import { useAuditLog } from "@/hooks/useAuditLog";
import MultipleDropoffs from "@/components/dispatch/MultipleDropoffs";
import DispatchMapView from "@/components/dispatch/DispatchMapView";
import { AddressAutocomplete } from "@/components/shared/AddressAutocomplete";
import FinancialDetailsForm from "@/components/transactions/FinancialDetailsForm";
import HistoricalDataView, { HistoricalInvoiceData } from "@/components/dispatch/HistoricalDataView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

const PRE_TRIP_CHECKLIST = [
  { section: "Driver & Documents", items: ["Valid driver's licence", "Vehicle registration & insurance", "Waybill / delivery documents", "Roadworthiness certificate", "Trip authorization"] },
  { section: "Engine Compartment", items: ["Engine oil level", "Coolant level", "Brake fluid", "Power steering fluid", "No oil/fuel/coolant leaks", "Belts & hoses secure"] },
  { section: "Exterior & Body", items: ["No visible body damage", "Mirrors properly adjusted", "Windshield clean, no cracks", "Wipers functional", "Number plates intact", "Diesel tank and cover"] },
  { section: "Tyres & Wheels", items: ["Tyre pressure (all tyres)", "Adequate tread depth", "No cuts/bulges/exposed cords", "Wheel nuts tight", "Spare tyre available and inflated"] },
  { section: "Lights & Electrical", items: ["Headlights (high & low beam)", "Tail lights", "Brake lights", "Indicators / hazard lights", "Reverse lights", "Horn functional"] },
  { section: "Braking System", items: ["Service brakes working", "Hand/parking brake holding", "Air pressure (air brake systems)", "No unusual noises"] },
  { section: "Fuel System", items: ["Fuel level sufficient for trip", "Fuel cap secure", "No leaks"] },
  { section: "Load & Cargo", items: ["Load properly secured", "Tarpaulin/cover in place", "Weight within legal limit", "Doors and locks secure"] },
  { section: "Safety Equipment", items: ["Fire extinguisher", "Reflective triangles", "First aid kit", "Wheel chocks", "Warning jacket"] },
  { section: "Cab Interior", items: ["Seat and seatbelt functional", "Dashboard warning lights normal", "Speedometer & gauges working", "Steering free and responsive"] },
];

const POST_TRIP_CHECKLIST = [
  { section: "Vehicle Condition", items: ["New dents, scratches, or damage", "Windshield condition", "Mirrors intact"] },
  { section: "Tyres & Wheels", items: ["Tyre wear or damage during trip", "Missing wheel nuts", "Spare tyre condition"] },
  { section: "Brakes & Suspension", items: ["Brake performance during trip", "Unusual vibrations or pulling", "Suspension issues noticed"] },
  { section: "Engine & Fluids", items: ["Oil or fluid leaks noticed", "Engine overheating during trip", "Warning lights observed"] },
  { section: "Lights & Electrical", items: ["Any failed bulbs", "Electrical faults noticed"] },
  { section: "Load & Delivery", items: ["Delivery completed successfully", "Load condition on arrival", "Any cargo damage or shortage", "Proof of delivery obtained"] },
  { section: "Fuel & Mileage", items: ["Fuel remaining", "Mileage recorded", "Fuel consumption issues"] },
  { section: "Incidents & Remarks", items: ["Accidents or near misses", "Road or security challenges", "Mechanical complaints", "Recommendations for repair"] },
];

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
  status?: string | null;
  status_notes?: string | null;
  status_updated_at?: string | null;
  completed_at?: string | null;
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
  is_historical?: boolean | null;
  historical_transaction_id?: string | null;
  import_source?: string | null;
  actual_delivery?: string | null;
  date_loaded?: string | null;
  delivery_commenced_at?: string | null;
  actual_pickup?: string | null;
  scheduled_pickup?: string | null;
  route_id?: string | null;
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
  routes?: { name: string; estimated_duration_hours: number | null } | null;
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

interface RouteWaypoint {
  id?: string;
  location_name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  sequence_order: number;
  distance_from_previous_km?: number;
  duration_from_previous_hours?: number;
  sla_hours?: number;
}

interface RouteData {
  id: string;
  name: string;
  origin: string;
  origin_lat: number | null;
  origin_lng: number | null;
  destination: string;
  destination_lat: number | null;
  destination_lng: number | null;
  distance_km: number | null;
  estimated_duration_hours: number | null;
  is_active: boolean;
  waypoints?: RouteWaypoint[];
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

const deliveryStatusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
  assigned: { icon: Package, color: "text-info", label: "Assigned" },
  picked_up: { icon: Package, color: "text-primary", label: "Picked Up" },
  in_transit: { icon: Truck, color: "text-warning", label: "In Transit" },
  delivered: { icon: CheckCircle, color: "text-success", label: "Delivered" },
  cancelled: { icon: XCircle, color: "text-destructive", label: "Cancelled" },
};

interface TripChecklistPanelProps {
  sections: { section: string; items: string[] }[];
  checklistState: Record<string, boolean>;
  setChecklistState: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  notes: string;
  setNotes: (v: string) => void;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}

const TripChecklistPanel = ({
  sections,
  checklistState,
  setChecklistState,
  notes,
  setNotes,
  saved,
  saving,
  onSave,
}: TripChecklistPanelProps) => {
  const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0);
  const checkedItems = Object.values(checklistState).filter(Boolean).length;
  const pct = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={pct} className="flex-1 h-2" />
        <span className="text-sm font-medium text-muted-foreground">{checkedItems}/{totalItems}</span>
        {saved && (
          <Badge variant="outline" className="text-success border-success text-xs">Saved</Badge>
        )}
      </div>
      <ScrollArea className="h-[400px] pr-2">
        <Accordion type="multiple" defaultValue={sections.map(s => s.section)} className="space-y-1">
          {sections.map(sec => (
            <AccordionItem value={sec.section} key={sec.section} className="border rounded-md px-3">
              <AccordionTrigger className="text-sm font-semibold py-2 hover:no-underline">
                <span className="flex items-center gap-2">
                  {sec.section}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({sec.items.filter(item => checklistState[`${sec.section}::${item}`]).length}/{sec.items.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pb-2">
                  {sec.items.map(item => {
                    const key = `${sec.section}::${item}`;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={key}
                          checked={!!checklistState[key]}
                          onCheckedChange={(v) =>
                            setChecklistState(prev => ({ ...prev, [key]: v === true }))
                          }
                        />
                        <label htmlFor={key} className="text-sm cursor-pointer leading-tight">
                          {item}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </ScrollArea>
      <Textarea
        placeholder="Additional notes or remarks..."
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        className="resize-none"
      />
      <Button onClick={onSave} disabled={saving} className="w-full">
        {saving ? (
          <><span className="w-4 h-4 mr-2 animate-spin border-2 border-current border-t-transparent rounded-full inline-block" />Saving...</>
        ) : (
          <><Save className="w-4 h-4 mr-2" />Save Checklist</>
        )}
      </Button>
    </div>
  );
};

const DispatchPage = () => {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "regular" | "historical">("all");
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: null,
    to: null,
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFinancialFormOpen, setIsFinancialFormOpen] = useState(false);
  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [detailDropoffs, setDetailDropoffs] = useState<Dropoff[]>([]);
  const [deliveryUpdates, setDeliveryUpdates] = useState<{
    status: string;
    location: string | null;
    notes: string | null;
    created_at: string;
  }[]>([]);
  const [dieselRates, setDieselRates] = useState<DieselRate[]>([]);
  const [matchedDieselRate, setMatchedDieselRate] = useState<DieselRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, userRole, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");

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
    date_loaded: "",
    delivery_commenced_at: "",
  });

  // Coordinates for distance calculation
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  const [statusUpdate, setStatusUpdate] = useState({
    status: "",
    location: "",
    notes: "",
    delay_reason: "",
    selectedDropoffId: "", // For updating specific dropoff
  });
  const [statusDropoffs, setStatusDropoffs] = useState<DispatchDropoff[]>([]);
  const [editingDelayReason, setEditingDelayReason] = useState(false);
  const [delayReasonEdit, setDelayReasonEdit] = useState("");
  const [savingDelayReason, setSavingDelayReason] = useState(false);

  const [dropoffs, setDropoffs] = useState<Dropoff[]>([]);

  // Historical data state
  const [historicalData, setHistoricalData] = useState<HistoricalInvoiceData | null>(null);
  const [loadingHistorical, setLoadingHistorical] = useState(false);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dispatchToDelete, setDispatchToDelete] = useState<Dispatch | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    date_loaded: "",
    delivery_commenced_at: "",
  });
  const [editDropoffs, setEditDropoffs] = useState<Dropoff[]>([]);
  const [selectedEditRouteId, setSelectedEditRouteId] = useState<string>("");
  const [preInspection, setPreInspection] = useState<Record<string, boolean>>({});
  const [postInspection, setPostInspection] = useState<Record<string, boolean>>({});
  const [preInspectionNotes, setPreInspectionNotes] = useState("");
  const [postInspectionNotes, setPostInspectionNotes] = useState("");
  const [preInspectionSaved, setPreInspectionSaved] = useState(false);
  const [postInspectionSaved, setPostInspectionSaved] = useState(false);
  const [savingInspection, setSavingInspection] = useState(false);

  const canManage = hasAnyRole(["admin", "operations", "dispatcher"]);
  const canUpdateStatus = hasAnyRole(["admin", "operations", "dispatcher", "support"]);

  const fetchData = async () => {
    try {
      const [dispatchesRes, driversRes, customersRes, vehiclesRes, routesRes] = await Promise.all([
        supabase
          .from("dispatches")
          .select(`
            *,
            drivers (full_name),
            vehicles (registration_number, vehicle_type, capacity_kg, fleet_type, vendor_id, vendor:vendor_id (id, company_name)),
            customers (company_name),
            routes:route_id (name, estimated_duration_hours)
          `)
          .order("created_at", { ascending: false }),
        supabase.from("drivers").select("id, full_name, status").eq("status", "available"),
        supabase.from("customers").select("id, company_name, factory_address, factory_lat, factory_lng"),
        supabase.from("vehicles").select("id, registration_number, vehicle_type, capacity_kg, status").eq("status", "available"),
        supabase.from("routes").select("*").eq("is_active", true).order("name"),
      ]);

      if (dispatchesRes.error) throw dispatchesRes.error;
      if (driversRes.error) throw driversRes.error;
      if (customersRes.error) throw customersRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;

      setDispatches(dispatchesRes.data || []);
      setDrivers(driversRes.data || []);
      setCustomers(customersRes.data || []);
      setVehicles(vehiclesRes.data || []);

      // Fetch waypoints for each route
      if (!routesRes.error && routesRes.data) {
        const routesWithWaypoints = await Promise.all(
          routesRes.data.map(async (route) => {
            const { data: waypointsData } = await supabase
              .from("route_waypoints")
              .select("*")
              .eq("route_id", route.id)
              .order("sequence_order");
            return { ...route, waypoints: waypointsData || [] } as RouteData;
          })
        );
        setRoutes(routesWithWaypoints);
      }
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

    // Source filter (historical vs regular)
    const matchesSource =
      sourceFilter === "all" ||
      (sourceFilter === "historical" && dispatch.is_historical === true) ||
      (sourceFilter === "regular" && !dispatch.is_historical);

    // Date range filter — always use created_at so it matches Analytics page
    let matchesDateRange = true;
    if (dateRange.from || dateRange.to) {
      // Exclude dispatches with no created_at — they have no date to compare
      if (!dispatch.created_at) return false;
      // When a date filter is active, exclude historical dispatches (they use import dates,
      // not real operation dates, so they skew the count)
      if (dispatch.is_historical) return false;
      const dispatchDate = new Date(dispatch.created_at);
      if (dateRange.from && dispatchDate < dateRange.from) {
        matchesDateRange = false;
      }
      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        if (dispatchDate > endOfDay) {
          matchesDateRange = false;
        }
      }
    }

    return matchesSearch && matchesStatus && matchesSource && matchesDateRange;
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

  // Handle route selection - auto-fill addresses and dropoffs from route
  const handleRouteChange = (routeId: string) => {
    setSelectedRouteId(routeId);

    const route = routes.find(r => r.id === routeId);
    if (!route) return;

    // Auto-fill pickup (origin) and delivery (destination) from route
    setFormData(prev => ({
      ...prev,
      pickup_address: route.origin,
      delivery_address: route.destination,
      distance_km: route.distance_km ? route.distance_km.toString() : prev.distance_km,
    }));

    // Set coordinates
    if (route.origin_lat && route.origin_lng) {
      setPickupCoords({ lat: route.origin_lat, lng: route.origin_lng });
    }
    if (route.destination_lat && route.destination_lng) {
      setDeliveryCoords({ lat: route.destination_lat, lng: route.destination_lng });
    }

    // Auto-fill dropoffs from route waypoints
    if (route.waypoints && route.waypoints.length > 0) {
      const routeDropoffs: Dropoff[] = route.waypoints.map((wp, index) => ({
        id: `wp-${index}-${Date.now()}`,
        address: wp.address,
        notes: wp.location_name || "",
        latitude: wp.latitude || null,
        longitude: wp.longitude || null,
      }));
      setDropoffs(routeDropoffs);
    } else {
      setDropoffs([]);
    }

    toast({
      title: "Route Applied",
      description: `Loaded "${route.name}" — ${route.origin.split(",")[0]} to ${route.destination.split(",")[0]}${route.waypoints?.length ? ` with ${route.waypoints.length} stop(s)` : ""}`,
    });
  };

  // Handle route selection in edit form
  const handleEditRouteChange = (routeId: string) => {
    setSelectedEditRouteId(routeId);
    const route = routes.find(r => r.id === routeId);
    if (!route) return;
    setEditFormData(prev => ({
      ...prev,
      pickup_address: route.origin,
      delivery_address: route.destination,
      distance_km: route.distance_km ? route.distance_km.toString() : prev.distance_km,
    }));
    if (route.waypoints && route.waypoints.length > 0) {
      setEditDropoffs(route.waypoints.map((wp, i) => ({
        id: `wp-${i}-${Date.now()}`,
        address: wp.address,
        notes: wp.location_name || "",
        latitude: wp.latitude || null,
        longitude: wp.longitude || null,
      })));
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

    // Note: capacity_kg field actually stores tonnage in tons
    const tonnage = vehicle.capacity_kg || 0;
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
        date_loaded: formData.date_loaded || null,
        delivery_commenced_at: formData.delivery_commenced_at || null,
        route_id: selectedRouteId && selectedRouteId !== "none" ? selectedRouteId : null,
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
        date_loaded: "",
        delivery_commenced_at: "",
      });
      setDropoffs([]);
      setPickupCoords(null);
      setDeliveryCoords(null);
      setSelectedRouteId("");
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

  const handleSaveDelayReason = async () => {
    if (!selectedDispatch) return;
    setSavingDelayReason(true);
    try {
      const { error } = await supabase
        .from("dispatches")
        .update({ delay_reason: delayReasonEdit === "none" ? null : delayReasonEdit })
        .eq("id", selectedDispatch.id);
      if (error) throw error;
      setSelectedDispatch({ ...selectedDispatch, delay_reason: delayReasonEdit === "none" ? null : delayReasonEdit } as any);
      setEditingDelayReason(false);
      fetchData();
      toast({ title: "Saved", description: "Delay reason updated successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingDelayReason(false);
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
          delay_reason: statusUpdate.delay_reason || null,
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
      setStatusUpdate({ status: "", location: "", notes: "", delay_reason: "", selectedDropoffId: "" });
      setStatusDropoffs([]);
      fetchData();
    } catch (error: any) {
      // Fallback to direct update if edge function fails
      try {
        const oldStatus = selectedDispatch.status;
        const updatePayload: any = { status: statusUpdate.status };
        if (statusUpdate.delay_reason) updatePayload.delay_reason = statusUpdate.delay_reason;
        const { error: updateError } = await supabase
          .from("dispatches")
          .update(updatePayload)
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

  // Handle saving pre/post trip inspection checklists
  const handleSaveInspection = async (type: "pre" | "post") => {
    if (!selectedDispatch) return;
    setSavingInspection(true);
    try {
      const checklist = type === "pre" ? preInspection : postInspection;
      const notes = type === "pre" ? preInspectionNotes : postInspectionNotes;
      const { data: existing } = await (supabase as any)
        .from("vehicle_inspections")
        .select("id")
        .eq("dispatch_id", selectedDispatch.id)
        .eq("type", type)
        .maybeSingle();
      if (existing) {
        await (supabase as any)
          .from("vehicle_inspections")
          .update({ checklist, notes, submitted_by: user?.id, submitted_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await (supabase as any)
          .from("vehicle_inspections")
          .insert([{ dispatch_id: selectedDispatch.id, type, checklist, notes, submitted_by: user?.id }]);
      }
      if (type === "pre") setPreInspectionSaved(true);
      else setPostInspectionSaved(true);
      toast({ title: `${type === "pre" ? "Pre" : "Post"}-trip checklist saved successfully` });
    } catch {
      toast({ title: "Failed to save checklist", variant: "destructive" });
    } finally {
      setSavingInspection(false);
    }
  };

  // Handle dispatch deletion
  const handleDeleteDispatch = async () => {
    if (!dispatchToDelete) return;

    setDeleting(true);
    try {
      // Delete all related records before deleting the dispatch
      await supabase.from("dispatch_dropoffs").delete().eq("dispatch_id", dispatchToDelete.id);
      await (supabase as any).from("vehicle_inspections").delete().eq("dispatch_id", dispatchToDelete.id);
      await supabase.from("delivery_updates").delete().eq("dispatch_id", dispatchToDelete.id);
      await (supabase as any).from("email_notifications").delete().eq("dispatch_id", dispatchToDelete.id);

      // If this is a historical dispatch, also delete the linked historical_invoice_data
      if (dispatchToDelete.is_historical && dispatchToDelete.historical_transaction_id) {
        await supabase
          .from("historical_invoice_data")
          .delete()
          .eq("id", dispatchToDelete.historical_transaction_id);
      }

      // Delete the dispatch
      const { error } = await supabase
        .from("dispatches")
        .delete()
        .eq("id", dispatchToDelete.id);

      if (error) throw error;

      // Log the deletion
      await logChange({
        table_name: "dispatches",
        record_id: dispatchToDelete.id,
        action: "delete",
        old_data: {
          dispatch_number: dispatchToDelete.dispatch_number,
          customer: dispatchToDelete.customers?.company_name,
          status: dispatchToDelete.status,
        },
        new_data: null,
      });

      toast({
        title: "Dispatch Deleted",
        description: `Dispatch ${dispatchToDelete.dispatch_number} has been deleted successfully.`,
      });

      setDeleteDialogOpen(false);
      setDispatchToDelete(null);
      fetchData();
    } catch (error: any) {
      console.error("Error deleting dispatch:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete dispatch",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Fetch dropoffs for a specific dispatch (full data including status)
  const fetchDispatchDropoffsFull = async (dispatchId: string): Promise<DispatchDropoff[]> => {
    const { data, error } = await supabase
      .from("dispatch_dropoffs")
      .select("*")
      .eq("dispatch_id", dispatchId)
      .order("sequence_order", { ascending: true });

    if (error) {
      console.error("Error fetching dropoffs:", error);
      return [];
    }

    return data || [];
  };

  // Fetch dropoffs for a specific dispatch (simplified for form editing)
  const fetchDispatchDropoffs = async (dispatchId: string): Promise<Dropoff[]> => {
    const data = await fetchDispatchDropoffsFull(dispatchId);
    return data.map((d: DispatchDropoff) => ({
      id: d.id,
      address: d.address,
      notes: d.notes || "",
      latitude: d.latitude,
      longitude: d.longitude,
    }));
  };

  // Fetch historical invoice data for a dispatch
  const fetchHistoricalData = async (transactionId: string): Promise<HistoricalInvoiceData | null> => {
    try {
      setLoadingHistorical(true);
      const { data, error } = await supabase
        .from("historical_invoice_data")
        .select("*")
        .eq("id", transactionId)
        .single();

      if (error) {
        console.error("Error fetching historical data:", error);
        return null;
      }

      return data as HistoricalInvoiceData;
    } catch (err) {
      console.error("Error fetching historical data:", err);
      return null;
    } finally {
      setLoadingHistorical(false);
    }
  };

  // Update dropoff status
  const handleDropoffStatusUpdate = async (dropoffId: string, newStatus: string, notes?: string) => {
    setSaving(true);
    try {
      const updateData: any = {
        status: newStatus,
        status_updated_at: new Date().toISOString(),
        status_notes: notes || null,
      };

      // If marking as completed, set completed_at timestamp
      if (newStatus === "completed") {
        updateData.completed_at = new Date().toISOString();
        updateData.actual_arrival = new Date().toISOString();
      }

      const { error } = await supabase
        .from("dispatch_dropoffs")
        .update(updateData)
        .eq("id", dropoffId);

      if (error) throw error;

      // Log the change
      await logChange({
        table_name: "dispatch_dropoffs",
        record_id: dropoffId,
        action: "update",
        new_data: { status: newStatus, notes },
      });

      toast({
        title: "Drop-off Updated",
        description: `Drop-off marked as ${newStatus}`,
      });

      // Refresh dropoffs list
      if (selectedDispatch) {
        const updatedDropoffs = await fetchDispatchDropoffsFull(selectedDispatch.id);
        setStatusDropoffs(updatedDropoffs);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update drop-off status",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
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
      date_loaded: dispatch.date_loaded
        ? new Date(dispatch.date_loaded).toISOString().slice(0, 16)
        : "",
      delivery_commenced_at: dispatch.delivery_commenced_at
        ? new Date(dispatch.delivery_commenced_at).toISOString().slice(0, 16)
        : "",
    });

    // Fetch existing dropoffs
    const existingDropoffs = await fetchDispatchDropoffs(dispatch.id);
    setEditDropoffs(existingDropoffs);
    setSelectedEditRouteId(dispatch.route_id || "");
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

      const updateData: Record<string, any> = {
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
        date_loaded: editFormData.date_loaded || null,
        delivery_commenced_at: editFormData.delivery_commenced_at || null,
      };

      // Include customer_id if admin changed it
      if (editFormData.customer_id) {
        updateData.customer_id = editFormData.customer_id;
      }

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
      <div className="dispatch-actions-bar flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-8">
        <div className="dispatch-status-filters flex gap-4 flex-1">
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

          {/* Source Filter (Historical/Regular) */}
          <Select value={sourceFilter} onValueChange={(v: "all" | "regular" | "historical") => setSourceFilter(v)}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <History className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Dispatches</SelectItem>
              <SelectItem value="regular">Regular Only</SelectItem>
              <SelectItem value="historical">Historical Only</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-auto bg-secondary/50 border-border/50">
                <CalendarRange className="w-4 h-4 mr-2" />
                {dateRange.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                    </>
                  ) : (
                    format(dateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  "Date Range"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                initialFocus
                mode="range"
                defaultMonth={dateRange.from || new Date()}
                selected={{ from: dateRange.from || undefined, to: dateRange.to || undefined }}
                onSelect={(range) => setDateRange({ from: range?.from || null, to: range?.to || null })}
                numberOfMonths={2}
              />
              {(dateRange.from || dateRange.to) && (
                <div className="p-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setDateRange({ from: null, to: null })}
                  >
                    Clear Date Filter
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
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
                {/* Route Selection */}
                <div className="space-y-2">
                  <Label>Route *</Label>
                  <Select
                    value={selectedRouteId || ""}
                    onValueChange={handleRouteChange}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <Route className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Select a route..." />
                    </SelectTrigger>
                    <SelectContent>
                      {routes.map((route) => (
                        <SelectItem key={route.id} value={route.id}>
                          {route.name} ({route.origin.split(",")[0]} → {route.destination.split(",")[0]})
                          {route.waypoints?.length ? ` • ${route.waypoints.length} stop(s)` : ""}
                          {route.distance_km ? ` • ${route.distance_km} km` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedRouteId && (
                    <p className="text-xs text-muted-foreground">
                      Addresses and drop-off points have been auto-filled from the selected route.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pickup Address</Label>
                    <Input
                      value={formData.pickup_address}
                      readOnly
                      placeholder="Auto-filled from selected route"
                      className="bg-secondary/50 text-muted-foreground cursor-default"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Delivery Address</Label>
                    <Input
                      value={formData.delivery_address}
                      readOnly
                      placeholder="Auto-filled from selected route"
                      className="bg-secondary/50 text-muted-foreground cursor-default"
                    />
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
                    <Label htmlFor="cargo_weight_kg">Tonnage (T)</Label>
                    <Input
                      id="cargo_weight_kg"
                      name="cargo_weight_kg"
                      type="number"
                      step="0.01"
                      value={formData.cargo_weight_kg}
                      onChange={handleInputChange}
                      placeholder="e.g., 12.75"
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

                {/* Transit Date Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date_loaded">Date Loaded</Label>
                    <Input
                      id="date_loaded"
                      name="date_loaded"
                      type="datetime-local"
                      value={formData.date_loaded}
                      onChange={handleInputChange}
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="delivery_commenced_at">Date Delivery Commenced</Label>
                    <Input
                      id="delivery_commenced_at"
                      name="delivery_commenced_at"
                      type="datetime-local"
                      value={formData.delivery_commenced_at}
                      onChange={handleInputChange}
                      className="bg-secondary/50"
                    />
                  </div>
                </div>

                {/* Days in Transit Calculator */}
                {formData.date_loaded && formData.delivery_commenced_at && (
                  <div className="p-3 bg-info/10 rounded-lg border border-info/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Days in Transit</span>
                      <span className="font-semibold text-info">
                        {Math.ceil(
                          (new Date(formData.delivery_commenced_at).getTime() - new Date(formData.date_loaded).getTime()) /
                          (1000 * 60 * 60 * 24)
                        )} day(s)
                      </span>
                    </div>
                  </div>
                )}

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

      {/* Dispatch count summary */}
      {!loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <span className="font-medium text-foreground">{filteredDispatches.length}</span>
          <span>
            {filteredDispatches.length === 1 ? "dispatch" : "dispatches"}
            {(dateRange.from || dateRange.to) && (
              <> in {dateRange.from ? format(dateRange.from, "MMM d") : ""}
              {dateRange.from && dateRange.to ? " – " : ""}
              {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : ""}</>
            )}
            {statusFilter !== "all" && <> · {statusFilter}</>}
            {sourceFilter !== "all" && !(dateRange.from || dateRange.to) && <> · {sourceFilter}</>}
          </span>
        </div>
      )}

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
        <div className="dispatch-list grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-semibold text-foreground">
                      {dispatch.dispatch_number} | {dispatch.vehicles?.registration_number || "—"}
                    </span>
                    <span className={`status-badge ${priorityColors[dispatch.priority] || priorityColors.normal}`}>
                      {dispatch.priority}
                    </span>
                    {dispatch.is_historical && (
                      <Badge variant="secondary" className="text-xs">
                        <History className="w-3 h-3 mr-1" />
                        Historical
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {dispatch.pickup_address?.split(",")[0]} → {dispatch.delivery_address?.split(",")[0]}
                  </p>
                  <span className={`status-badge ${statusColors[dispatch.status] || statusColors.pending} mt-2`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    {dispatch.status.replace("_", " ")}
                  </span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={async () => {
                        setSelectedDispatch(dispatch);
                        const dropoffsData = await fetchDispatchDropoffs(dispatch.id);
                        setDetailDropoffs(dropoffsData);
                        if (dispatch.is_historical && dispatch.historical_transaction_id) {
                          const histData = await fetchHistoricalData(dispatch.historical_transaction_id);
                          setHistoricalData(histData);
                        } else {
                          setHistoricalData(null);
                        }
                        // Fetch delivery updates timeline
                        const { data: updates } = await supabase
                          .from("delivery_updates")
                          .select("status, location, notes, created_at")
                          .eq("dispatch_id", dispatch.id)
                          .order("created_at", { ascending: false });
                        setDeliveryUpdates(updates || []);
                        // Fetch existing inspections
                        const { data: inspections } = await (supabase as any)
                          .from("vehicle_inspections")
                          .select("type, checklist, notes")
                          .eq("dispatch_id", dispatch.id);
                        const preInsp = inspections?.find((i: any) => i.type === "pre");
                        const postInsp = inspections?.find((i: any) => i.type === "post");
                        setPreInspection(preInsp?.checklist || {});
                        setPreInspectionNotes(preInsp?.notes || "");
                        setPreInspectionSaved(!!preInsp);
                        setPostInspection(postInsp?.checklist || {});
                        setPostInspectionNotes(postInsp?.notes || "");
                        setPostInspectionSaved(!!postInsp);
                        setIsDetailDialogOpen(true);
                      }}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </DropdownMenuItem>
                    {hasAnyRole(["admin"]) && dispatch.status !== "cancelled" && (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedDispatch(dispatch);
                          setIsFinancialFormOpen(true);
                        }}
                      >
                        <DollarSign className="w-4 h-4 mr-2" />
                        Financials
                      </DropdownMenuItem>
                    )}
                    {canManage && dispatch.status !== "delivered" && dispatch.status !== "cancelled" && !dispatch.is_historical && (
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedDispatch(dispatch);
                          setEditFormData({
                            customer_id: dispatch.customer_id || "",
                            pickup_address: dispatch.pickup_address || "",
                            delivery_address: dispatch.delivery_address || "",
                            cargo_description: dispatch.cargo_description || "",
                            cargo_weight_kg: dispatch.cargo_weight_kg?.toString() || "",
                            priority: dispatch.priority || "normal",
                            scheduled_pickup: dispatch.scheduled_pickup || "",
                            vehicle_id: dispatch.vehicle_id || "",
                            driver_id: dispatch.driver_id || "",
                            distance_km: dispatch.distance_km?.toString() || "",
                            date_loaded: dispatch.date_loaded || "",
                            delivery_commenced_at: dispatch.delivery_commenced_at || "",
                          });
                          fetchDispatchDropoffs(dispatch.id).then(setEditDropoffs);
                          setSelectedEditRouteId(dispatch.route_id || "");
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setDispatchToDelete(dispatch);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                    {dispatch.cargo_weight_kg ? `${dispatch.cargo_weight_kg}T` : "—"}
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

              {/* Late delivery — missing delay reason prompt */}
              {(() => {
                if ((dispatch as any).status !== "delivered") return null;
                const startDate = (dispatch as any).actual_pickup || (dispatch as any).scheduled_pickup || dispatch.created_at;
                const endDate = (dispatch as any).actual_delivery;
                if (!startDate || !endDate) return null;
                const hoursInTransit = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60);
                const eta = (dispatch as any).routes?.estimated_duration_hours ?? 2;
                const isLate = hoursInTransit > eta * 24;
                const hasReason = !!(dispatch as any).delay_reason;
                if (!isLate) return null;
                return (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-2 ${hasReason ? "bg-success/10 text-success" : "bg-warning/10 text-warning border border-warning/30"}`}>
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {hasReason
                      ? `Delay reason recorded: ${(dispatch as any).delay_reason.replace(/_/g, " ")}`
                      : "Late delivery — delay reason not recorded. Click View to add."}
                  </div>
                );
              })()}

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

                    // Fetch historical data if this is a historical dispatch
                    if (dispatch.is_historical && dispatch.historical_transaction_id) {
                      const histData = await fetchHistoricalData(dispatch.historical_transaction_id);
                      setHistoricalData(histData);
                    } else {
                      setHistoricalData(null);
                    }

                    // Fetch delivery updates timeline
                    const { data: updates } = await supabase
                      .from("delivery_updates")
                      .select("status, location, notes, created_at")
                      .eq("dispatch_id", dispatch.id)
                      .order("created_at", { ascending: false });
                    setDeliveryUpdates(updates || []);
                    // Fetch existing inspections
                    const { data: inspections } = await (supabase as any)
                      .from("vehicle_inspections")
                      .select("type, checklist, notes")
                      .eq("dispatch_id", dispatch.id);
                    const preInsp = inspections?.find((i: any) => i.type === "pre");
                    const postInsp = inspections?.find((i: any) => i.type === "post");
                    setPreInspection(preInsp?.checklist || {});
                    setPreInspectionNotes(preInsp?.notes || "");
                    setPreInspectionSaved(!!preInsp);
                    setPostInspection(postInsp?.checklist || {});
                    setPostInspectionNotes(postInsp?.notes || "");
                    setPostInspectionSaved(!!postInsp);

                    setIsDetailDialogOpen(true);
                  }}
                >
                  View Details
                </Button>
                {canManage && dispatch.status !== "delivered" && dispatch.status !== "cancelled" && !dispatch.is_historical && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditDialog(dispatch)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
                {canUpdateStatus && dispatch.status !== "delivered" && dispatch.status !== "cancelled" && dispatch.approval_status === "approved" && !dispatch.is_historical && (
                  <Button
                    size="sm"
                    className="flex-1 min-w-[120px]"
                    onClick={async () => {
                      setSelectedDispatch(dispatch);
                      setStatusUpdate({ status: "", location: "", notes: "", selectedDropoffId: "" });
                      // Fetch dropoffs for this dispatch
                      const dropoffs = await fetchDispatchDropoffsFull(dispatch.id);
                      setStatusDropoffs(dropoffs);
                      setIsStatusDialogOpen(true);
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Update Status
                  </Button>
                )}
                {/* Add/View Financial Details button - Admin can access anytime, others only for delivered */}
                {hasAnyRole(["admin"]) && dispatch.status !== "cancelled" && (
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
                    {dispatch.is_historical ? "View Financials" : "Financials"}
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Status Update Dialog */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Update Delivery Status</DialogTitle>
            <DialogDescription>
              Update status for {selectedDispatch?.dispatch_number}. Customer will be notified via email.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Main Dispatch Status */}
            <div className="space-y-2">
              <Label>Dispatch Status</Label>
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
              <AddressAutocomplete
                value={statusUpdate.location}
                onChange={(val) => setStatusUpdate((prev) => ({ ...prev, location: val }))}
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

            {/* Delay reason — shown when marking as delivered */}
            {statusUpdate.status === "delivered" && (
              <div className="space-y-2 p-3 rounded-lg border border-warning/30 bg-warning/5">
                <Label className="text-warning font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Delay Reason <span className="text-xs text-muted-foreground font-normal">(required if delivery exceeded ETA)</span>
                </Label>
                <Select
                  value={statusUpdate.delay_reason || "none"}
                  onValueChange={(v) => setStatusUpdate((prev) => ({ ...prev, delay_reason: v === "none" ? "" : v }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Select delay reason (if applicable)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No delay / On time</SelectItem>
                    <SelectItem value="traffic">Traffic congestion</SelectItem>
                    <SelectItem value="vehicle_breakdown">Vehicle breakdown</SelectItem>
                    <SelectItem value="bad_road">Bad road / Road condition</SelectItem>
                    <SelectItem value="customer_unavailable">Customer unavailable</SelectItem>
                    <SelectItem value="wrong_address">Wrong / incomplete address</SelectItem>
                    <SelectItem value="weather">Weather conditions</SelectItem>
                    <SelectItem value="security">Security / roadblock</SelectItem>
                    <SelectItem value="loading_delay">Loading / offloading delay</SelectItem>
                    <SelectItem value="driver_issue">Driver issue</SelectItem>
                    <SelectItem value="other">Other (see notes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Drop-off Points Status Section */}
            {statusDropoffs.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Drop-off Points ({statusDropoffs.length})
                </Label>
                <p className="text-xs text-muted-foreground">
                  Update status for each drop-off location
                </p>
                <div className="space-y-3">
                  {statusDropoffs.map((dropoff, index) => {
                    const dropoffStatusColors: Record<string, string> = {
                      pending: "bg-muted text-muted-foreground",
                      arrived: "bg-info/15 text-info",
                      completed: "bg-success/15 text-success",
                      skipped: "bg-destructive/15 text-destructive",
                    };
                    const currentStatus = dropoff.status || "pending";
                    return (
                      <div
                        key={dropoff.id}
                        className="p-3 rounded-lg border bg-secondary/30 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Stop {index + 1}
                              </span>
                              <Badge className={`text-xs ${dropoffStatusColors[currentStatus]}`}>
                                {currentStatus}
                              </Badge>
                            </div>
                            <p className="text-sm font-medium truncate mt-1">
                              {dropoff.address}
                            </p>
                            {dropoff.notes && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {dropoff.notes}
                              </p>
                            )}
                            {dropoff.status_updated_at && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Updated: {format(new Date(dropoff.status_updated_at), "MMM dd, HH:mm")}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant={currentStatus === "arrived" ? "default" : "outline"}
                            className="text-xs h-7"
                            onClick={() => handleDropoffStatusUpdate(dropoff.id, "arrived")}
                            disabled={saving || currentStatus === "completed"}
                          >
                            Arrived
                          </Button>
                          <Button
                            size="sm"
                            variant={currentStatus === "completed" ? "default" : "outline"}
                            className="text-xs h-7"
                            onClick={() => handleDropoffStatusUpdate(dropoff.id, "completed")}
                            disabled={saving}
                          >
                            Completed
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-7 text-destructive hover:text-destructive"
                            onClick={() => handleDropoffStatusUpdate(dropoff.id, "skipped", "Location skipped")}
                            disabled={saving || currentStatus === "completed"}
                          >
                            Skip
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStatusUpdate} disabled={saving}>
              {saving ? "Updating..." : "Update Dispatch Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch Detail Dialog with Fuel Planning */}
      <Dialog open={isDetailDialogOpen} onOpenChange={(open) => {
        setIsDetailDialogOpen(open);
        if (!open) {
          setHistoricalData(null);
        }
      }}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              {selectedDispatch?.dispatch_number} | {selectedDispatch?.vehicles?.registration_number || "No Vehicle"} | {selectedDispatch?.pickup_address?.split(",")[0]} → {selectedDispatch?.delivery_address?.split(",")[0]}
              {selectedDispatch?.is_historical && (
                <Badge variant="secondary" className="ml-2">
                  <History className="w-3 h-3 mr-1" />
                  Historical
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedDispatch?.is_historical
                ? "View imported historical dispatch data and all transaction details"
                : "View dispatch information and fuel planning"}
            </DialogDescription>
          </DialogHeader>

          {selectedDispatch && (
            <>
              {selectedDispatch.is_historical && historicalData ? (
                <Tabs defaultValue="historical" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="historical">All Transaction Data</TabsTrigger>
                    <TabsTrigger value="dispatch">Dispatch & Map</TabsTrigger>
                    <TabsTrigger value="pre-check" className="flex items-center gap-1">
                      Pre-Trip {preInspectionSaved && <CheckCircle className="w-3 h-3 text-success" />}
                    </TabsTrigger>
                    <TabsTrigger value="post-check" className="flex items-center gap-1">
                      Post-Trip {postInspectionSaved && <CheckCircle className="w-3 h-3 text-success" />}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="historical" className="mt-4">
                    <HistoricalDataView data={historicalData} loading={loadingHistorical} />
                  </TabsContent>
                  <TabsContent value="dispatch" className="mt-4">
                    <div className="grid gap-6">
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
                          lat: d.latitude || undefined,
                          lng: d.longitude || undefined,
                          type: "dropoff" as const,
                          label: `Stop ${i + 1}`,
                        }))}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="pre-check" className="mt-4">
                    {["assigned", "picked_up", "in_transit", "delivered"].includes(selectedDispatch.status || "") ? (
                      <TripChecklistPanel
                        sections={PRE_TRIP_CHECKLIST}
                        checklistState={preInspection}
                        setChecklistState={setPreInspection}
                        notes={preInspectionNotes}
                        setNotes={setPreInspectionNotes}
                        saved={preInspectionSaved}
                        saving={savingInspection}
                        onSave={() => handleSaveInspection("pre")}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
                        <Clock className="w-8 h-8 opacity-40" />
                        <p className="text-sm">Pre-trip check becomes available once a driver is assigned.</p>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="post-check" className="mt-4">
                    {selectedDispatch.status === "delivered" ? (
                      <TripChecklistPanel
                        sections={POST_TRIP_CHECKLIST}
                        checklistState={postInspection}
                        setChecklistState={setPostInspection}
                        notes={postInspectionNotes}
                        setNotes={setPostInspectionNotes}
                        saved={postInspectionSaved}
                        saving={savingInspection}
                        onSave={() => handleSaveInspection("post")}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
                        <Clock className="w-8 h-8 opacity-40" />
                        <p className="text-sm">Post-trip check becomes available after delivery is completed.</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              ) : (
                <Tabs defaultValue="dispatch" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="dispatch">Dispatch & Map</TabsTrigger>
                    <TabsTrigger value="pre-check" className="flex items-center gap-1">
                      Pre-Trip {preInspectionSaved && <CheckCircle className="w-3 h-3 text-success" />}
                    </TabsTrigger>
                    <TabsTrigger value="post-check" className="flex items-center gap-1">
                      Post-Trip {postInspectionSaved && <CheckCircle className="w-3 h-3 text-success" />}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="dispatch" className="mt-4">
                  <div className="grid gap-6">
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
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Route</p>
                      <p className="font-medium">{selectedDispatch.routes?.name || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Route ETA</p>
                      <p className="font-medium">
                        {selectedDispatch.routes?.estimated_duration_hours
                          ? `${selectedDispatch.routes.estimated_duration_hours} day(s)`
                          : "—"}
                      </p>
                    </div>
                    {selectedDispatch.scheduled_pickup && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Scheduled Pickup</p>
                        <p className="font-medium">{format(new Date(selectedDispatch.scheduled_pickup), "MMM dd, yyyy")}</p>
                      </div>
                    )}
                    {selectedDispatch.actual_pickup && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Actual Pickup</p>
                        <p className="font-medium">{format(new Date(selectedDispatch.actual_pickup), "MMM dd, yyyy HH:mm")}</p>
                      </div>
                    )}
                    {selectedDispatch.actual_delivery && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Actual Delivery</p>
                        <p className="font-medium">{format(new Date(selectedDispatch.actual_delivery), "MMM dd, yyyy HH:mm")}</p>
                      </div>
                    )}
                    {selectedDispatch.date_loaded && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Date Loaded</p>
                        <p className="font-medium">{format(new Date(selectedDispatch.date_loaded), "MMM dd, yyyy HH:mm")}</p>
                      </div>
                    )}
                    {(() => {
                      const startDate = selectedDispatch.actual_pickup || selectedDispatch.scheduled_pickup || selectedDispatch.created_at;
                      const endDate = selectedDispatch.actual_delivery;
                      if (!startDate || !endDate) return null;
                      const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
                      if (ms < 0) return null;
                      const hoursInTransit = ms / (1000 * 60 * 60);
                      const eta = selectedDispatch.routes?.estimated_duration_hours ?? 2;
                      const etaHours = eta * 24;
                      const onTime = hoursInTransit <= etaHours;
                      const displayDays = (hoursInTransit / 24).toFixed(1);
                      return (
                        <div className="space-y-1 col-span-2">
                          <p className="text-xs text-muted-foreground">OTD Status</p>
                          <p className={`font-semibold ${onTime ? "text-success" : "text-destructive"}`}>
                            {displayDays} day(s) in transit — {onTime ? "✓ On Time" : "✗ Late"} (ETA: {eta} day(s))
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Delay Reason — shown for delivered dispatches */}
                  {selectedDispatch.status === "delivered" && (
                    <div className={`p-3 rounded-lg border ${(selectedDispatch as any).delay_reason ? "border-warning/30 bg-warning/5" : "border-border/50 bg-secondary/30"}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <Clock className="w-4 h-4 text-warning" />
                          Delay Reason
                        </p>
                        {canManage && !editingDelayReason && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => {
                              setDelayReasonEdit((selectedDispatch as any).delay_reason || "none");
                              setEditingDelayReason(true);
                            }}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            {(selectedDispatch as any).delay_reason ? "Edit" : "Record"}
                          </Button>
                        )}
                      </div>
                      {editingDelayReason ? (
                        <div className="space-y-2">
                          <Select
                            value={delayReasonEdit || "none"}
                            onValueChange={setDelayReasonEdit}
                          >
                            <SelectTrigger className="bg-secondary/50 h-8 text-sm">
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No delay / On time</SelectItem>
                              <SelectItem value="traffic">Traffic congestion</SelectItem>
                              <SelectItem value="vehicle_breakdown">Vehicle breakdown</SelectItem>
                              <SelectItem value="bad_road">Bad road condition</SelectItem>
                              <SelectItem value="customer_unavailable">Customer unavailable</SelectItem>
                              <SelectItem value="wrong_address">Wrong / incomplete address</SelectItem>
                              <SelectItem value="weather">Weather conditions</SelectItem>
                              <SelectItem value="security">Security / roadblock</SelectItem>
                              <SelectItem value="loading_delay">Loading / offloading delay</SelectItem>
                              <SelectItem value="driver_issue">Driver issue</SelectItem>
                              <SelectItem value="other">Other (see notes)</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs" onClick={handleSaveDelayReason} disabled={savingDelayReason}>
                              {savingDelayReason ? "Saving..." : "Save"}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingDelayReason(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className={`text-sm ${(selectedDispatch as any).delay_reason ? "text-warning font-medium" : "text-muted-foreground italic"}`}>
                          {(selectedDispatch as any).delay_reason
                            ? (selectedDispatch as any).delay_reason.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
                            : "Not recorded"}
                        </p>
                      )}
                    </div>
                  )}

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
                      lat: d.latitude || undefined,
                      lng: d.longitude || undefined,
                      type: "dropoff" as const,
                      label: `Stop ${i + 1}`,
                    }))}
                  />

                  {/* Delivery Updates Timeline */}
                  {deliveryUpdates.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="font-heading text-lg flex items-center gap-2">
                          <History className="w-5 h-5" />
                          Delivery Updates
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {deliveryUpdates.map((update, index) => {
                            const config = deliveryStatusConfig[update.status] || { icon: Clock, color: "text-muted-foreground", label: update.status };
                            const UpdateIcon = config.icon;
                            return (
                              <div key={index} className="flex gap-4">
                                <div className="flex flex-col items-center">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color} bg-secondary`}>
                                    <UpdateIcon className="w-4 h-4" />
                                  </div>
                                  {index < deliveryUpdates.length - 1 && (
                                    <div className="w-0.5 h-full bg-border mt-2" />
                                  )}
                                </div>
                                <div className="flex-1 pb-4">
                                  <p className="font-medium text-foreground">
                                    {config.label}
                                  </p>
                                  {update.location && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                      <MapPin className="w-3 h-3" />
                                      {update.location}
                                    </p>
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
                  </TabsContent>

                  {/* Pre-Trip Checklist Tab */}
                  <TabsContent value="pre-check" className="mt-4">
                    {["assigned", "picked_up", "in_transit", "delivered"].includes(selectedDispatch.status || "") ? (
                      <TripChecklistPanel
                        sections={PRE_TRIP_CHECKLIST}
                        checklistState={preInspection}
                        setChecklistState={setPreInspection}
                        notes={preInspectionNotes}
                        setNotes={setPreInspectionNotes}
                        saved={preInspectionSaved}
                        saving={savingInspection}
                        onSave={() => handleSaveInspection("pre")}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
                        <Clock className="w-8 h-8 opacity-40" />
                        <p className="text-sm">Pre-trip check becomes available once a driver is assigned.</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Post-Trip Checklist Tab */}
                  <TabsContent value="post-check" className="mt-4">
                    {selectedDispatch.status === "delivered" ? (
                      <TripChecklistPanel
                        sections={POST_TRIP_CHECKLIST}
                        checklistState={postInspection}
                        setChecklistState={setPostInspection}
                        notes={postInspectionNotes}
                        setNotes={setPostInspectionNotes}
                        saved={postInspectionSaved}
                        saving={savingInspection}
                        onSave={() => handleSaveInspection("post")}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-2">
                        <Clock className="w-8 h-8 opacity-40" />
                        <p className="text-sm">Post-trip check becomes available after delivery is completed.</p>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </>
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
            {/* Customer field — admin only, editable before delivery */}
            {userRole === "admin" && selectedDispatch?.status !== "delivered" && (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select
                  value={editFormData.customer_id}
                  onValueChange={(customerId) => {
                    const customer = customers.find(c => c.id === customerId);
                    setEditFormData(prev => ({
                      ...prev,
                      customer_id: customerId,
                      pickup_address: customer?.factory_address || prev.pickup_address,
                    }));
                  }}
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
            )}
            <div className="space-y-2">
              <Label>Route *</Label>
              <Select value={selectedEditRouteId || ""} onValueChange={handleEditRouteChange}>
                <SelectTrigger className="bg-secondary/50">
                  <Route className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Select a route..." />
                </SelectTrigger>
                <SelectContent>
                  {routes.map((route) => (
                    <SelectItem key={route.id} value={route.id}>
                      {route.name} ({route.origin.split(",")[0]} → {route.destination.split(",")[0]})
                      {route.waypoints?.length ? ` • ${route.waypoints.length} stop(s)` : ""}
                      {route.distance_km ? ` • ${route.distance_km} km` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Pickup Address</Label>
                <Input
                  value={editFormData.pickup_address}
                  readOnly
                  placeholder="Auto-filled from selected route"
                  className="bg-secondary/50 text-muted-foreground cursor-default"
                />
              </div>
              <div className="space-y-2">
                <Label>Delivery Address</Label>
                <Input
                  value={editFormData.delivery_address}
                  readOnly
                  placeholder="Auto-filled from selected route"
                  className="bg-secondary/50 text-muted-foreground cursor-default"
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
                <Label htmlFor="edit_cargo_weight_kg">Tonnage (T)</Label>
                <Input
                  id="edit_cargo_weight_kg"
                  name="cargo_weight_kg"
                  type="number"
                  step="0.01"
                  value={editFormData.cargo_weight_kg}
                  onChange={handleEditInputChange}
                  placeholder="e.g., 12.75"
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

            {/* Transit Date Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_date_loaded">Date Loaded</Label>
                <Input
                  id="edit_date_loaded"
                  name="date_loaded"
                  type="datetime-local"
                  value={editFormData.date_loaded}
                  onChange={handleEditInputChange}
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_delivery_commenced_at">Date Delivery Commenced</Label>
                <Input
                  id="edit_delivery_commenced_at"
                  name="delivery_commenced_at"
                  type="datetime-local"
                  value={editFormData.delivery_commenced_at}
                  onChange={handleEditInputChange}
                  className="bg-secondary/50"
                />
              </div>
            </div>

            {/* Days in Transit Calculator */}
            {editFormData.date_loaded && editFormData.delivery_commenced_at && (
              <div className="p-3 bg-info/10 rounded-lg border border-info/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Days in Transit</span>
                  <span className="font-semibold text-info">
                    {Math.ceil(
                      (new Date(editFormData.delivery_commenced_at).getTime() - new Date(editFormData.date_loaded).getTime()) /
                      (1000 * 60 * 60 * 24)
                    )} day(s)
                  </span>
                </div>
              </div>
            )}

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
        isReadOnly={selectedDispatch?.is_historical === true}
        onSuccess={() => {
          toast({
            title: "Success",
            description: "Financial details saved and will sync to Google Sheets",
          });
          fetchData();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dispatch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete dispatch{" "}
              <span className="font-semibold text-foreground">
                {dispatchToDelete?.dispatch_number}
              </span>
              ?
              {dispatchToDelete?.is_historical && (
                <span className="block mt-2 text-warning">
                  This is a historical dispatch. Deleting it will also remove the linked transaction data.
                </span>
              )}
              <span className="block mt-2">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDispatch}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default DispatchPage;
