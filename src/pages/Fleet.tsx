import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Search,
  Filter,
  Truck,
  Calendar,
  Fuel,
  Gauge,
  Wrench,
  MoreVertical,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  Upload,
  Clock,
  MapPin,
  Pencil,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format, differenceInDays } from "date-fns";

interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string | null;
  current_fuel_level: number | null;
  capacity_kg: number | null;
  last_maintenance: string | null;
  next_maintenance: string | null;
  partner_id: string | null;
  current_location: string | null;
  current_lat: number | null;
  current_lng: number | null;
  location_updated_at: string | null;
  fleet_type: string | null;
  vendor_id: string | null;
  vendor?: { id: string; company_name: string } | null;
}

interface Vendor {
  id: string;
  company_name: string;
}

interface VehicleDocument {
  id: string;
  vehicle_id: string;
  document_type: string;
  document_name: string;
  document_url: string | null;
  expiry_date: string | null;
  is_verified: boolean | null;
}

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  available: { label: "Available", icon: CheckCircle, color: "bg-success/15 text-success" },
  in_use: { label: "In Use", icon: Gauge, color: "bg-info/15 text-info" },
  maintenance: { label: "Maintenance", icon: Wrench, color: "bg-warning/15 text-warning" },
  retired: { label: "Retired", icon: XCircle, color: "bg-muted text-muted-foreground" },
};

const documentTypes = [
  { value: "registration", label: "Vehicle Registration" },
  { value: "insurance", label: "Insurance Certificate" },
  { value: "roadworthiness", label: "Road Worthiness" },
  { value: "hackney_permit", label: "Hackney Permit" },
  { value: "vehicle_license", label: "Vehicle License" },
];

const FleetPage = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fleetTypeFilter, setFleetTypeFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDocDialogOpen, setIsDocDialogOpen] = useState(false);
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locationFormData, setLocationFormData] = useState({
    current_location: "",
    current_lat: "",
    current_lng: "",
  });
  const { toast } = useToast();
  const { user, userRole, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const canManage = hasAnyRole(["admin", "operations"]);

  const [formData, setFormData] = useState({
    registration_number: "",
    vehicle_type: "",
    make: "",
    model: "",
    year: "",
    capacity_kg: "",
    fuel_type: "diesel",
    fleet_type: "internal",
    vendor_id: "",
  });

  const [editFormData, setEditFormData] = useState({
    registration_number: "",
    vehicle_type: "",
    make: "",
    model: "",
    year: "",
    capacity_kg: "",
    status: "available",
    fleet_type: "internal",
    vendor_id: "",
  });

  const [docFormData, setDocFormData] = useState({
    document_type: "",
    document_name: "",
    expiry_date: "",
  });

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicles")
        .select(`
          *,
          vendor:vendor_id (id, company_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setVehicles(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch vehicles",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, company_name")
        .eq("partner_type", "transporter")
        .eq("approval_status", "approved")
        .order("company_name");

      if (error) throw error;
      setVendors(data || []);
    } catch (error: any) {
      console.error("Error fetching vendors:", error);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicle_documents")
        .select("*")
        .order("expiry_date", { ascending: true });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error("Error fetching documents:", error);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchDocuments();
    fetchVendors();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.registration_number || !formData.vehicle_type) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    // Validate that 3PL vehicles must have a vendor selected
    if (formData.fleet_type === "3pl" && !formData.vendor_id) {
      toast({
        title: "Validation Error",
        description: "Please select a 3PL vendor for this vehicle",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Set approval_status based on role - Operations requires admin approval
      const needsApproval = userRole === "operations";

      const insertData = {
        registration_number: formData.registration_number,
        vehicle_type: formData.vehicle_type,
        make: formData.make || null,
        model: formData.model || null,
        year: formData.year ? parseInt(formData.year) : null,
        capacity_kg: formData.capacity_kg ? parseFloat(formData.capacity_kg) : null,
        fuel_type: formData.fuel_type,
        fleet_type: formData.fleet_type,
        vendor_id: formData.fleet_type === "3pl" ? formData.vendor_id : null,
        approval_status: needsApproval ? "pending" : "approved",
        created_by_role: userRole,
      };

      const { data, error } = await supabase.from("vehicles").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "vehicles",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: needsApproval ? "Vehicle Submitted" : "Success",
        description: needsApproval
          ? "Vehicle added and pending admin approval"
          : "Vehicle added successfully",
      });
      setIsDialogOpen(false);
      setFormData({
        registration_number: "",
        vehicle_type: "",
        make: "",
        model: "",
        year: "",
        capacity_kg: "",
        fuel_type: "diesel",
        fleet_type: "internal",
        vendor_id: "",
      });
      fetchVehicles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add vehicle",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setEditFormData({
      registration_number: vehicle.registration_number,
      vehicle_type: vehicle.vehicle_type,
      make: vehicle.make || "",
      model: vehicle.model || "",
      year: vehicle.year?.toString() || "",
      capacity_kg: vehicle.capacity_kg?.toString() || "",
      status: vehicle.status || "available",
      fleet_type: vehicle.fleet_type || "internal",
      vendor_id: vehicle.vendor_id || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingVehicle) return;

    if (!editFormData.registration_number || !editFormData.vehicle_type) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    if (editFormData.fleet_type === "3pl" && !editFormData.vendor_id) {
      toast({
        title: "Validation Error",
        description: "Please select a 3PL vendor for this vehicle",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        registration_number: editFormData.registration_number,
        vehicle_type: editFormData.vehicle_type,
        make: editFormData.make || null,
        model: editFormData.model || null,
        year: editFormData.year ? parseInt(editFormData.year) : null,
        capacity_kg: editFormData.capacity_kg ? parseFloat(editFormData.capacity_kg) : null,
        status: editFormData.status,
        fleet_type: editFormData.fleet_type,
        vendor_id: editFormData.fleet_type === "3pl" ? editFormData.vendor_id : null,
      };

      const { error } = await supabase
        .from("vehicles")
        .update(updateData)
        .eq("id", editingVehicle.id);

      if (error) throw error;

      await logChange({
        table_name: "vehicles",
        record_id: editingVehicle.id,
        action: "update",
        old_data: {
          registration_number: editingVehicle.registration_number,
          vehicle_type: editingVehicle.vehicle_type,
          status: editingVehicle.status,
        },
        new_data: updateData,
      });

      toast({
        title: "Success",
        description: "Vehicle updated successfully",
      });
      setIsEditDialogOpen(false);
      setEditingVehicle(null);
      fetchVehicles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update vehicle",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddDocument = async () => {
    if (!selectedVehicle || !docFormData.document_type || !docFormData.document_name) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const insertData = {
        vehicle_id: selectedVehicle.id,
        document_type: docFormData.document_type,
        document_name: docFormData.document_name,
        expiry_date: docFormData.expiry_date || null,
      };

      const { data, error } = await supabase.from("vehicle_documents").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "vehicle_documents",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: "Success",
        description: "Document added successfully",
      });
      setIsDocDialogOpen(false);
      setDocFormData({
        document_type: "",
        document_name: "",
        expiry_date: "",
      });
      fetchDocuments();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add document",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLocation = async () => {
    if (!selectedVehicle || !locationFormData.current_location) {
      toast({
        title: "Validation Error",
        description: "Please enter the vehicle's current location",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        current_location: locationFormData.current_location,
        current_lat: locationFormData.current_lat ? parseFloat(locationFormData.current_lat) : null,
        current_lng: locationFormData.current_lng ? parseFloat(locationFormData.current_lng) : null,
        location_updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("vehicles")
        .update(updateData)
        .eq("id", selectedVehicle.id);

      if (error) throw error;

      await logChange({
        table_name: "vehicles",
        record_id: selectedVehicle.id,
        action: "update",
        new_data: updateData,
      });

      toast({
        title: "Location Updated",
        description: `Vehicle ${selectedVehicle.registration_number} location has been updated`,
      });
      setIsLocationDialogOpen(false);
      setLocationFormData({
        current_location: "",
        current_lat: "",
        current_lng: "",
      });
      fetchVehicles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const days = differenceInDays(new Date(expiryDate), new Date());
    if (days < 0) return { status: "expired", color: "text-destructive", label: "Expired" };
    if (days <= 30) return { status: "expiring", color: "text-warning", label: `${days} days left` };
    return { status: "valid", color: "text-success", label: format(new Date(expiryDate), "dd MMM yyyy") };
  };

  const filteredVehicles = vehicles.filter((vehicle) => {
    const matchesSearch =
      vehicle.registration_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vehicle.make?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (vehicle.model?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (vehicle.vendor?.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) || false);
    const matchesStatus =
      statusFilter === "all" || vehicle.status === statusFilter;
    const matchesFleetType =
      fleetTypeFilter === "all" || vehicle.fleet_type === fleetTypeFilter;
    return matchesSearch && matchesStatus && matchesFleetType;
  });

  const expiringDocs = documents.filter(doc => {
    if (!doc.expiry_date) return false;
    const days = differenceInDays(new Date(doc.expiry_date), new Date());
    return days <= 30 && days >= 0;
  });

  const expiredDocs = documents.filter(doc => {
    if (!doc.expiry_date) return false;
    return differenceInDays(new Date(doc.expiry_date), new Date()) < 0;
  });

  return (
    <DashboardLayout
      title="Fleet Management"
      subtitle="Manage your vehicle fleet, documents, and maintenance schedules"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        {[
          {
            label: "Total Vehicles",
            value: vehicles.length,
            icon: Truck,
            color: "text-foreground",
          },
          {
            label: "Internal Fleet",
            value: vehicles.filter((v) => v.fleet_type !== "3pl").length,
            icon: CheckCircle,
            color: "text-success",
          },
          {
            label: "3PL Vehicles",
            value: vehicles.filter((v) => v.fleet_type === "3pl").length,
            icon: Truck,
            color: "text-blue-500",
          },
          {
            label: "In Maintenance",
            value: vehicles.filter((v) => v.status === "maintenance").length,
            icon: Wrench,
            color: "text-warning",
          },
          {
            label: "Docs Expiring",
            value: expiringDocs.length + expiredDocs.length,
            icon: AlertTriangle,
            color: expiringDocs.length + expiredDocs.length > 0 ? "text-destructive" : "text-muted-foreground",
          },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="glass-card p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <div>
              <p className={`text-2xl font-heading font-bold ${stat.color}`}>
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Document Alerts */}
      {(expiringDocs.length > 0 || expiredDocs.length > 0) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg border border-warning/30 bg-warning/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <h3 className="font-semibold text-foreground">Document Alerts</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {expiredDocs.length > 0 && `${expiredDocs.length} expired document(s). `}
            {expiringDocs.length > 0 && `${expiringDocs.length} document(s) expiring within 30 days.`}
          </p>
        </motion.div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search vehicles..."
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
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="in_use">In Use</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fleetTypeFilter} onValueChange={setFleetTypeFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <Truck className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Fleet Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fleet</SelectItem>
              <SelectItem value="internal">Internal Fleet</SelectItem>
              <SelectItem value="3pl">3PL Vendors</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Vehicle
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="font-heading">Add New Vehicle</DialogTitle>
                <DialogDescription>
                  Enter vehicle details and documentation.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="details" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="details">Vehicle Details</TabsTrigger>
                  <TabsTrigger value="fleet">Fleet Type</TabsTrigger>
                  <TabsTrigger value="specs">Specifications</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="registration_number">Registration Number *</Label>
                      <Input
                        id="registration_number"
                        name="registration_number"
                        value={formData.registration_number}
                        onChange={handleInputChange}
                        placeholder="LAG-XXX-XX"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicle_type">Vehicle Type *</Label>
                      <Select
                        value={formData.vehicle_type}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, vehicle_type: value }))}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light_truck">Light Truck</SelectItem>
                          <SelectItem value="medium_truck">Medium Truck</SelectItem>
                          <SelectItem value="heavy_truck">Heavy Truck</SelectItem>
                          <SelectItem value="trailer">Trailer</SelectItem>
                          <SelectItem value="tanker">Tanker</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="make">Make</Label>
                      <Input
                        id="make"
                        name="make"
                        value={formData.make}
                        onChange={handleInputChange}
                        placeholder="e.g., Mercedes-Benz"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="model">Model</Label>
                      <Input
                        id="model"
                        name="model"
                        value={formData.model}
                        onChange={handleInputChange}
                        placeholder="e.g., Actros"
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="fleet" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="fleet_type">Fleet Type *</Label>
                    <Select
                      value={formData.fleet_type}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, fleet_type: value, vendor_id: value === "internal" ? "" : prev.vendor_id }))}
                    >
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue placeholder="Select fleet type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">Internal Fleet (Owned)</SelectItem>
                        <SelectItem value="3pl">3PL Vendor</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Select "Internal Fleet" for company-owned vehicles or "3PL Vendor" for third-party logistics vehicles.
                    </p>
                  </div>
                  {formData.fleet_type === "3pl" && (
                    <div className="space-y-2">
                      <Label htmlFor="vendor_id">3PL Vendor *</Label>
                      <Select
                        value={formData.vendor_id}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, vendor_id: value }))}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.company_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Select the 3PL vendor that owns/operates this vehicle.
                      </p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="specs" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="year">Year</Label>
                      <Input
                        id="year"
                        name="year"
                        type="number"
                        value={formData.year}
                        onChange={handleInputChange}
                        placeholder="2024"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="capacity_kg">Capacity (Tons)</Label>
                      <Input
                        id="capacity_kg"
                        name="capacity_kg"
                        type="number"
                        step="0.01"
                        value={formData.capacity_kg}
                        onChange={handleInputChange}
                        placeholder="30"
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fuel_type">Fuel Type</Label>
                    <Select
                      value={formData.fuel_type}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, fuel_type: value }))}
                    >
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue placeholder="Select fuel type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="diesel">Diesel</SelectItem>
                        <SelectItem value="petrol">Petrol</SelectItem>
                        <SelectItem value="gas">Gas</SelectItem>
                        <SelectItem value="electric">Electric</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? "Adding..." : "Add Vehicle"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Vehicle Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="text-center py-12">
          <Truck className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No vehicles found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredVehicles.map((vehicle, index) => {
            const statusInfo = statusConfig[vehicle.status || "available"] || statusConfig.available;
            const StatusIcon = statusInfo.icon;
            const vehicleDocs = documents.filter(d => d.vehicle_id === vehicle.id);
            const hasExpiringDocs = vehicleDocs.some(d => {
              if (!d.expiry_date) return false;
              const days = differenceInDays(new Date(d.expiry_date), new Date());
              return days <= 30;
            });

            return (
              <motion.div
                key={vehicle.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="glass-card p-6 hover:border-primary/30 transition-all duration-300"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Truck className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {vehicle.registration_number}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {vehicle.make} {vehicle.model}
                      </p>
                    </div>
                  </div>
                  {hasExpiringDocs && (
                    <AlertTriangle className="w-5 h-5 text-warning" />
                  )}
                </div>

                {/* Status & Type */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <Badge className={statusInfo.color}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {statusInfo.label}
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    {vehicle.vehicle_type.replace("_", " ")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={vehicle.fleet_type === "3pl" ? "bg-blue-500/15 text-blue-500 border-blue-500/30" : "bg-green-500/15 text-green-500 border-green-500/30"}
                  >
                    {vehicle.fleet_type === "3pl" ? "3PL" : "Internal"}
                  </Badge>
                </div>

                {/* 3PL Vendor Info */}
                {vehicle.fleet_type === "3pl" && vehicle.vendor && (
                  <div className="mb-4 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs text-muted-foreground">3PL Vendor</p>
                    <p className="text-sm font-medium text-foreground">{vehicle.vendor.company_name}</p>
                  </div>
                )}

                {/* Details */}
                <div className="space-y-3 mb-4">
                  {vehicle.capacity_kg && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Capacity</span>
                      <span className="text-foreground">{vehicle.capacity_kg}T</span>
                    </div>
                  )}
                  {vehicle.year && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Year</span>
                      <span className="text-foreground">{vehicle.year}</span>
                    </div>
                  )}
                </div>

                {/* Fuel Level */}
                {vehicle.current_fuel_level !== null && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Fuel className="w-4 h-4" />
                        Fuel Level
                      </span>
                      <span className="text-foreground">{vehicle.current_fuel_level}%</span>
                    </div>
                    <Progress value={vehicle.current_fuel_level} className="h-2" />
                  </div>
                )}

                {/* Current Location */}
                {vehicle.current_location && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="w-4 h-4" />
                        Current Location
                      </span>
                      <span className="text-foreground text-xs max-w-[150px] truncate" title={vehicle.current_location}>
                        {vehicle.current_location}
                      </span>
                    </div>
                    {vehicle.location_updated_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Updated: {format(new Date(vehicle.location_updated_at), "MMM d, HH:mm")}
                      </p>
                    )}
                  </div>
                )}

                {/* Documents Summary */}
                <div className="pt-4 border-t border-border/50 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <FileText className="w-4 h-4" />
                      Documents
                    </span>
                    <span className="text-foreground">{vehicleDocs.length} uploaded</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(vehicle)}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedVehicle(vehicle);
                      setIsDocDialogOpen(true);
                    }}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Add Doc
                  </Button>
                  {(userRole === "admin" || userRole === "operations") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedVehicle(vehicle);
                        setLocationFormData({
                          current_location: vehicle.current_location || "",
                          current_lat: vehicle.current_lat?.toString() || "",
                          current_lng: vehicle.current_lng?.toString() || "",
                        });
                        setIsLocationDialogOpen(true);
                      }}
                    >
                      <MapPin className="w-4 h-4 mr-1" />
                      Location
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add Document Dialog */}
      <Dialog open={isDocDialogOpen} onOpenChange={setIsDocDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Add Document - {selectedVehicle?.registration_number}
            </DialogTitle>
            <DialogDescription>
              Upload vehicle documentation with expiry tracking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="document_type">Document Type *</Label>
              <Select
                value={docFormData.document_type}
                onValueChange={(value) => setDocFormData(prev => ({ ...prev, document_type: value }))}
              >
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="document_name">Document Name *</Label>
              <Input
                id="document_name"
                value={docFormData.document_name}
                onChange={(e) => setDocFormData(prev => ({ ...prev, document_name: e.target.value }))}
                placeholder="e.g., Insurance Certificate 2025"
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input
                id="expiry_date"
                type="date"
                value={docFormData.expiry_date}
                onChange={(e) => setDocFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
                className="bg-secondary/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDocDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDocument} disabled={saving}>
              {saving ? "Adding..." : "Add Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Vehicle Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Vehicle - {editingVehicle?.registration_number}</DialogTitle>
            <DialogDescription>
              Update vehicle details and specifications.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="details" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Vehicle Details</TabsTrigger>
              <TabsTrigger value="fleet">Fleet & Status</TabsTrigger>
              <TabsTrigger value="specs">Specifications</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_registration_number">Registration Number *</Label>
                  <Input
                    id="edit_registration_number"
                    name="registration_number"
                    value={editFormData.registration_number}
                    onChange={handleEditInputChange}
                    placeholder="LAG-XXX-XX"
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_vehicle_type">Vehicle Type *</Label>
                  <Select
                    value={editFormData.vehicle_type}
                    onValueChange={(value) => setEditFormData(prev => ({ ...prev, vehicle_type: value }))}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light_truck">Light Truck</SelectItem>
                      <SelectItem value="medium_truck">Medium Truck</SelectItem>
                      <SelectItem value="heavy_truck">Heavy Truck</SelectItem>
                      <SelectItem value="trailer">Trailer</SelectItem>
                      <SelectItem value="tanker">Tanker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_make">Make</Label>
                  <Input
                    id="edit_make"
                    name="make"
                    value={editFormData.make}
                    onChange={handleEditInputChange}
                    placeholder="e.g., Mercedes-Benz"
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_model">Model</Label>
                  <Input
                    id="edit_model"
                    name="model"
                    value={editFormData.model}
                    onChange={handleEditInputChange}
                    placeholder="e.g., Actros"
                    className="bg-secondary/50"
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="fleet" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="edit_status">Status</Label>
                <Select
                  value={editFormData.status}
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="in_use">In Use</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="retired">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_fleet_type">Fleet Type</Label>
                <Select
                  value={editFormData.fleet_type}
                  onValueChange={(value) => setEditFormData(prev => ({ ...prev, fleet_type: value, vendor_id: value === "internal" ? "" : prev.vendor_id }))}
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Select fleet type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal Fleet (Owned)</SelectItem>
                    <SelectItem value="3pl">3PL Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editFormData.fleet_type === "3pl" && (
                <div className="space-y-2">
                  <Label htmlFor="edit_vendor_id">3PL Vendor *</Label>
                  <Select
                    value={editFormData.vendor_id}
                    onValueChange={(value) => setEditFormData(prev => ({ ...prev, vendor_id: value }))}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </TabsContent>
            <TabsContent value="specs" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_year">Year</Label>
                  <Input
                    id="edit_year"
                    name="year"
                    type="number"
                    value={editFormData.year}
                    onChange={handleEditInputChange}
                    placeholder="2024"
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_capacity_kg">Capacity (Tons)</Label>
                  <Input
                    id="edit_capacity_kg"
                    name="capacity_kg"
                    type="number"
                    step="0.01"
                    value={editFormData.capacity_kg}
                    onChange={handleEditInputChange}
                    placeholder="30"
                    className="bg-secondary/50"
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Location Dialog */}
      <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Update Location - {selectedVehicle?.registration_number}
            </DialogTitle>
            <DialogDescription>
              Update the current position of this vehicle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="current_location">Current Location *</Label>
              <Input
                id="current_location"
                value={locationFormData.current_location}
                onChange={(e) => setLocationFormData(prev => ({ ...prev, current_location: e.target.value }))}
                placeholder="e.g., Lagos, Ikeja Terminal"
                className="bg-secondary/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="current_lat">Latitude (optional)</Label>
                <Input
                  id="current_lat"
                  type="number"
                  step="any"
                  value={locationFormData.current_lat}
                  onChange={(e) => setLocationFormData(prev => ({ ...prev, current_lat: e.target.value }))}
                  placeholder="e.g., 6.5244"
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="current_lng">Longitude (optional)</Label>
                <Input
                  id="current_lng"
                  type="number"
                  step="any"
                  value={locationFormData.current_lng}
                  onChange={(e) => setLocationFormData(prev => ({ ...prev, current_lng: e.target.value }))}
                  placeholder="e.g., 3.3792"
                  className="bg-secondary/50"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Location coordinates are optional but help with accurate mapping.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLocationDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateLocation} disabled={saving}>
              {saving ? "Updating..." : "Update Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default FleetPage;