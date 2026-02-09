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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Search,
  Filter,
  Phone,
  Mail,
  Star,
  Truck,
  MapPin,
  FileText,
  MoreVertical,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format, differenceInDays } from "date-fns";
import DriverProfileDialog from "@/components/drivers/DriverProfileDialog";
import DriverSalarySection from "@/components/drivers/DriverSalarySection";

interface Driver {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  license_number: string | null;
  license_expiry: string | null;
  status: string | null;
  rating: number | null;
  total_trips: number | null;
  documents_verified: boolean | null;
}

interface DriverDocument {
  id: string;
  driver_id: string;
  document_type: string;
  document_name: string;
  expiry_date: string | null;
  is_verified: boolean | null;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  available: { label: "Available", color: "bg-success/15 text-success border-success/30" },
  on_trip: { label: "On Trip", color: "bg-info/15 text-info border-info/30" },
  offline: { label: "Offline", color: "bg-muted text-muted-foreground border-border" },
  on_leave: { label: "On Leave", color: "bg-warning/15 text-warning border-warning/30" },
};

const documentTypes = [
  { value: "drivers_license", label: "Driver's License" },
  { value: "vehicle_papers", label: "Vehicle Papers" },
  { value: "insurance", label: "Insurance" },
  { value: "medical_certificate", label: "Medical Certificate" },
  { value: "id_card", label: "ID Card" },
];

const DriversPage = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDocDialogOpen, setIsDocDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { userRole, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const canManage = hasAnyRole(["admin", "operations", "dispatcher"]);

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    license_number: "",
    license_expiry: "",
    driver_type: "owned" as "owned" | "third_party",
    salary_type: "monthly" as "per_trip" | "bi_monthly" | "monthly",
    base_salary: 0,
    tax_id: "",
  });

  const [docFormData, setDocFormData] = useState({
    document_type: "",
    document_name: "",
    expiry_date: "",
  });

  const fetchDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Count delivered dispatches per driver for accurate completed trips
      const { data: deliveredCounts } = await supabase
        .from("dispatches")
        .select("driver_id")
        .eq("status", "delivered")
        .not("driver_id", "is", null);

      const tripCountMap: Record<string, number> = {};
      deliveredCounts?.forEach((d: any) => {
        if (d.driver_id) {
          tripCountMap[d.driver_id] = (tripCountMap[d.driver_id] || 0) + 1;
        }
      });

      const driversWithTrips = (data || []).map((driver: any) => ({
        ...driver,
        total_trips: tripCountMap[driver.id] || 0,
      }));

      setDrivers(driversWithTrips);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch drivers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from("driver_documents")
        .select("*")
        .order("expiry_date", { ascending: true });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error: any) {
      console.error("Error fetching documents:", error);
    }
  };

  useEffect(() => {
    fetchDrivers();
    fetchDocuments();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.full_name || !formData.phone) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Set approval_status based on role - Operations requires admin approval
      const needsApproval = userRole === "operations";

      const insertData = {
        full_name: formData.full_name,
        email: formData.email || null,
        phone: formData.phone,
        license_number: formData.license_number || null,
        license_expiry: formData.license_expiry || null,
        driver_type: formData.driver_type,
        salary_type: formData.salary_type,
        base_salary: formData.base_salary,
        tax_id: formData.tax_id || null,
        approval_status: needsApproval ? "pending" : "approved",
        created_by_role: userRole,
      };

      const { data, error } = await supabase.from("drivers").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "drivers",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: needsApproval ? "Driver Submitted" : "Success",
        description: needsApproval
          ? "Driver added and pending admin approval"
          : "Driver added successfully. Pending document verification.",
      });
      setIsDialogOpen(false);
      setFormData({
        full_name: "",
        email: "",
        phone: "",
        license_number: "",
        license_expiry: "",
        driver_type: "owned",
        salary_type: "monthly",
        base_salary: 0,
        tax_id: "",
      });
      fetchDrivers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add driver",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddDocument = async () => {
    if (!selectedDriver || !docFormData.document_type || !docFormData.document_name) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("driver_documents").insert({
        driver_id: selectedDriver.id,
        document_type: docFormData.document_type,
        document_name: docFormData.document_name,
        expiry_date: docFormData.expiry_date || null,
      });

      if (error) throw error;

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

  const filteredDrivers = drivers.filter((driver) => {
    const matchesSearch =
      driver.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (driver.email?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      driver.phone.includes(searchQuery);
    const matchesStatus =
      statusFilter === "all" || driver.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const expiringDocs = documents.filter(doc => {
    if (!doc.expiry_date) return false;
    const days = differenceInDays(new Date(doc.expiry_date), new Date());
    return days <= 30 && days >= 0;
  });

  return (
    <DashboardLayout
      title="Driver Management"
      subtitle="Manage your fleet drivers, documents, and assignments"
    >
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Drivers", value: drivers.length, icon: Truck },
          {
            label: "Available",
            value: drivers.filter((d) => d.status === "available").length,
            icon: CheckCircle,
          },
          {
            label: "Avg. Rating",
            value: drivers.length > 0
              ? (drivers.reduce((acc, d) => acc + (d.rating || 0), 0) / drivers.length).toFixed(1)
              : "0",
            icon: Star,
          },
          {
            label: "Docs Expiring",
            value: expiringDocs.length,
            icon: AlertCircle,
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
              <stat.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {stat.value}
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Document Alerts */}
      {expiringDocs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-lg border border-warning/30 bg-warning/10"
        >
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            <h3 className="font-semibold text-foreground">Document Alerts</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {expiringDocs.length} driver document(s) expiring within 30 days. Please renew promptly.
          </p>
        </motion.div>
      )}

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
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
              <SelectItem value="on_trip">On Trip</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Driver
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="font-heading">Add New Driver</DialogTitle>
                <DialogDescription>
                  Enter driver details for onboarding.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="personal" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="personal">Personal Info</TabsTrigger>
                  <TabsTrigger value="license">License Details</TabsTrigger>
                  <TabsTrigger value="salary">Salary</TabsTrigger>
                </TabsList>
                <TabsContent value="personal" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      placeholder="John Doe"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="john@email.com"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone *</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="+234 800 123 4567"
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="license" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="license_number">License Number</Label>
                    <Input
                      id="license_number"
                      name="license_number"
                      value={formData.license_number}
                      onChange={handleInputChange}
                      placeholder="LOS-2024-12345"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="license_expiry">License Expiry Date</Label>
                    <Input
                      id="license_expiry"
                      name="license_expiry"
                      type="date"
                      value={formData.license_expiry}
                      onChange={handleInputChange}
                      className="bg-secondary/50"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="salary" className="mt-4">
                  <DriverSalarySection
                    data={{
                      driver_type: formData.driver_type,
                      salary_type: formData.salary_type,
                      base_salary: formData.base_salary,
                      tax_id: formData.tax_id,
                    }}
                    onChange={(salaryData) => setFormData(prev => ({ 
                      ...prev, 
                      driver_type: salaryData.driver_type,
                      salary_type: salaryData.salary_type,
                      base_salary: salaryData.base_salary,
                      tax_id: salaryData.tax_id || "",
                    }))}
                    isEditing={true}
                  />
                </TabsContent>
              </Tabs>
              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? "Adding..." : "Add Driver"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Drivers Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredDrivers.length === 0 ? (
        <div className="text-center py-12">
          <Truck className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No drivers found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredDrivers.map((driver, index) => {
            const statusInfo = statusConfig[driver.status || "available"] || statusConfig.available;
            const driverDocs = documents.filter(d => d.driver_id === driver.id);
            const hasExpiringDocs = driverDocs.some(d => {
              if (!d.expiry_date) return false;
              const days = differenceInDays(new Date(d.expiry_date), new Date());
              return days <= 30;
            });

            return (
              <motion.div
                key={driver.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="glass-card p-6 hover:border-primary/30 transition-all duration-300"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src="/placeholder.svg" />
                      <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                        {driver.full_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-foreground">{driver.full_name}</h3>
                      <p className="text-sm text-muted-foreground">{driver.license_number || "No license"}</p>
                    </div>
                  </div>
                  {hasExpiringDocs && (
                    <AlertCircle className="w-5 h-5 text-warning" />
                  )}
                </div>

                {/* Status & Rating */}
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline" className={statusInfo.color}>
                    {statusInfo.label}
                  </Badge>
                  <div className="flex items-center gap-1 ml-auto">
                    <Star className="w-4 h-4 text-warning fill-warning" />
                    <span className="text-sm font-medium text-foreground">
                      {driver.rating?.toFixed(1) || "5.0"}
                    </span>
                  </div>
                  {driver.documents_verified ? (
                    <CheckCircle className="w-4 h-4 text-success" />
                  ) : (
                    <XCircle className="w-4 h-4 text-destructive" />
                  )}
                </div>

                {/* Contact Info */}
                <div className="space-y-2 mb-4">
                  {driver.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground truncate">{driver.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{driver.phone}</span>
                  </div>
                  {driver.license_expiry && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        License expires: {format(new Date(driver.license_expiry), "dd MMM yyyy")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Completed Trips</p>
                    <p className="text-lg font-semibold text-foreground">
                      {driver.total_trips || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Documents</p>
                    <p className="text-lg font-semibold text-foreground">
                      {driverDocs.length}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedDriver(driver);
                      setIsDocDialogOpen(true);
                    }}
                  >
                    <Upload className="w-4 h-4 mr-1" />
                    Add Doc
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      setSelectedDriver(driver);
                      setIsProfileDialogOpen(true);
                    }}
                  >
                    View Profile
                  </Button>
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
              Add Document - {selectedDriver?.full_name}
            </DialogTitle>
            <DialogDescription>
              Upload driver documentation with expiry tracking.
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
                placeholder="e.g., Driver's License 2025"
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

      {/* Driver Profile Dialog */}
      <DriverProfileDialog
        driver={selectedDriver}
        open={isProfileDialogOpen}
        onOpenChange={setIsProfileDialogOpen}
        onUpdate={() => {
          fetchDrivers();
          fetchDocuments();
        }}
      />
    </DashboardLayout>
  );
};

export default DriversPage;