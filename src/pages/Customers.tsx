import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  MoreVertical,
  Users,
  Package,
  Factory,
  Bell,
  BellOff,
  Edit2,
  Power,
  Eye,
  FileText,
  Truck,
  Receipt,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AddressAutocomplete } from "@/components/shared/AddressAutocomplete";
import { useAuditLog } from "@/hooks/useAuditLog";

interface Customer {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  head_office_address: string | null;
  head_office_lat: number | null;
  head_office_lng: number | null;
  factory_address: string | null;
  factory_lat: number | null;
  factory_lng: number | null;
  email_delivery_updates: boolean | null;
  email_invoice_reminders: boolean | null;
  status: string | null;
  notes: string | null;
  tin_number: string | null;
  created_at: string;
}

interface CustomerStats {
  totalDispatches: number;
  activeDispatches: number;
  totalInvoices: number;
  pendingInvoices: number;
}

interface PlaceDetails {
  formattedAddress: string;
  lat: number;
  lng: number;
  city: string;
  state: string;
  country: string;
}

const Customers = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerStats, setCustomerStats] = useState<CustomerStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const [formData, setFormData] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    head_office_address: "",
    head_office_lat: null as number | null,
    head_office_lng: null as number | null,
    factory_address: "",
    factory_lat: null as number | null,
    factory_lng: null as number | null,
    city: "",
    state: "",
    tin_number: "",
    email_delivery_updates: true,
    email_invoice_reminders: true,
  });

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    head_office_address: "",
    head_office_lat: null as number | null,
    head_office_lng: null as number | null,
    factory_address: "",
    factory_lat: null as number | null,
    factory_lng: null as number | null,
    city: "",
    state: "",
    tin_number: "",
    notes: "",
    status: "active",
    email_delivery_updates: true,
    email_invoice_reminders: true,
  });

  const canManage = hasAnyRole(["admin", "operations", "support"]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch customers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleHeadOfficeSelect = (details: PlaceDetails) => {
    setFormData((prev) => ({
      ...prev,
      head_office_address: details.formattedAddress,
      head_office_lat: details.lat,
      head_office_lng: details.lng,
      city: details.city || prev.city,
      state: details.state || prev.state,
    }));
  };

  const handleFactorySelect = (details: PlaceDetails) => {
    setFormData((prev) => ({
      ...prev,
      factory_address: details.formattedAddress,
      factory_lat: details.lat,
      factory_lng: details.lng,
    }));
  };

  const handleSubmit = async () => {
    if (!formData.company_name || !formData.contact_name || !formData.email || !formData.phone) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const insertData = {
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        email: formData.email,
        phone: formData.phone,
        address: formData.head_office_address || null,
        head_office_address: formData.head_office_address || null,
        head_office_lat: formData.head_office_lat,
        head_office_lng: formData.head_office_lng,
        factory_address: formData.factory_address || null,
        factory_lat: formData.factory_lat,
        factory_lng: formData.factory_lng,
        city: formData.city || null,
        state: formData.state || null,
        tin_number: formData.tin_number || null,
        email_delivery_updates: formData.email_delivery_updates,
        email_invoice_reminders: formData.email_invoice_reminders,
        created_by: user?.id,
      };

      const { data, error } = await supabase.from("customers").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "customers",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: "Success",
        description: "Customer added successfully",
      });
      setIsDialogOpen(false);
      setFormData({
        company_name: "",
        contact_name: "",
        email: "",
        phone: "",
        head_office_address: "",
        head_office_lat: null,
        head_office_lng: null,
        factory_address: "",
        factory_lat: null,
        factory_lng: null,
        city: "",
        state: "",
        tin_number: "",
        email_delivery_updates: true,
        email_invoice_reminders: true,
      });
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Fetch customer stats (dispatches, invoices)
  const fetchCustomerStats = async (customerId: string) => {
    setLoadingStats(true);
    try {
      // Get dispatch counts
      const { count: totalDispatches } = await supabase
        .from("dispatches")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", customerId);

      const { count: activeDispatches } = await supabase
        .from("dispatches")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .in("status", ["pending", "assigned", "in_transit", "loading"]);

      // Get invoice counts
      const { count: totalInvoices } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", customerId);

      const { count: pendingInvoices } = await supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("customer_id", customerId)
        .in("status", ["draft", "pending", "overdue"]);

      setCustomerStats({
        totalDispatches: totalDispatches || 0,
        activeDispatches: activeDispatches || 0,
        totalInvoices: totalInvoices || 0,
        pendingInvoices: pendingInvoices || 0,
      });
    } catch (error) {
      console.error("Error fetching customer stats:", error);
      setCustomerStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  // Handle opening edit dialog
  const handleViewCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditFormData({
      company_name: customer.company_name || "",
      contact_name: customer.contact_name || "",
      email: customer.email || "",
      phone: customer.phone || "",
      head_office_address: customer.head_office_address || "",
      head_office_lat: customer.head_office_lat,
      head_office_lng: customer.head_office_lng,
      factory_address: customer.factory_address || "",
      factory_lat: customer.factory_lat,
      factory_lng: customer.factory_lng,
      city: customer.city || "",
      state: customer.state || "",
      tin_number: customer.tin_number || "",
      notes: customer.notes || "",
      status: customer.status || "active",
      email_delivery_updates: customer.email_delivery_updates !== false,
      email_invoice_reminders: customer.email_invoice_reminders !== false,
    });
    setIsEditDialogOpen(true);
    fetchCustomerStats(customer.id);
  };

  // Handle edit form input changes
  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handle edit head office select
  const handleEditHeadOfficeSelect = (details: PlaceDetails) => {
    setEditFormData((prev) => ({
      ...prev,
      head_office_address: details.formattedAddress,
      head_office_lat: details.lat,
      head_office_lng: details.lng,
      city: details.city || prev.city,
      state: details.state || prev.state,
    }));
  };

  // Handle edit factory select
  const handleEditFactorySelect = (details: PlaceDetails) => {
    setEditFormData((prev) => ({
      ...prev,
      factory_address: details.formattedAddress,
      factory_lat: details.lat,
      factory_lng: details.lng,
    }));
  };

  // Handle update customer
  const handleUpdateCustomer = async () => {
    if (!selectedCustomer) return;

    if (!editFormData.company_name || !editFormData.contact_name || !editFormData.email || !editFormData.phone) {
      toast({
        title: "Validation Error",
        description: "Company name, contact name, email and phone are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        company_name: editFormData.company_name,
        contact_name: editFormData.contact_name,
        email: editFormData.email,
        phone: editFormData.phone,
        address: editFormData.head_office_address || null,
        head_office_address: editFormData.head_office_address || null,
        head_office_lat: editFormData.head_office_lat,
        head_office_lng: editFormData.head_office_lng,
        factory_address: editFormData.factory_address || null,
        factory_lat: editFormData.factory_lat,
        factory_lng: editFormData.factory_lng,
        city: editFormData.city || null,
        state: editFormData.state || null,
        tin_number: editFormData.tin_number || null,
        notes: editFormData.notes || null,
        status: editFormData.status,
        email_delivery_updates: editFormData.email_delivery_updates,
        email_invoice_reminders: editFormData.email_invoice_reminders,
      };

      const { error } = await supabase
        .from("customers")
        .update(updateData)
        .eq("id", selectedCustomer.id);

      if (error) throw error;

      // Log the update
      await logChange({
        table_name: "customers",
        record_id: selectedCustomer.id,
        action: "update",
        old_data: {
          company_name: selectedCustomer.company_name,
          contact_name: selectedCustomer.contact_name,
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          status: selectedCustomer.status,
        },
        new_data: updateData,
      });

      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
      setIsEditDialogOpen(false);
      setSelectedCustomer(null);
      setCustomerStats(null);
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle toggle customer status
  const handleToggleStatus = async (customer: Customer) => {
    const newStatus = customer.status === "active" ? "inactive" : "active";

    try {
      const { error } = await supabase
        .from("customers")
        .update({ status: newStatus })
        .eq("id", customer.id);

      if (error) throw error;

      // Log the change
      await logChange({
        table_name: "customers",
        record_id: customer.id,
        action: "update",
        old_data: { status: customer.status },
        new_data: { status: newStatus },
      });

      toast({
        title: "Success",
        description: `Customer marked as ${newStatus}`,
      });
      fetchCustomers();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer status",
        variant: "destructive",
      });
    }
  };

  const filteredCustomers = customers.filter((customer) =>
    customer.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout
      title="Customers"
      subtitle="Manage your customer database"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{customers.length}</p>
              <p className="text-sm text-muted-foreground">Total Customers</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <Power className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {customers.filter(c => c.status !== "inactive").length}
              </p>
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-info/20 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-info" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {customers.filter(c => c.head_office_address).length}
              </p>
              <p className="text-sm text-muted-foreground">With Head Office</p>
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
              <Factory className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {customers.filter(c => c.factory_address).length}
              </p>
              <p className="text-sm text-muted-foreground">With Factory</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary/50 border-border/50"
          />
        </div>

        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading">Add New Customer</DialogTitle>
                <DialogDescription>
                  Enter the customer's details. Use Google Maps to auto-fill addresses.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleInputChange}
                    placeholder="ABC Logistics Ltd"
                    className="bg-secondary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contact_name">Contact Name *</Label>
                    <Input
                      id="contact_name"
                      name="contact_name"
                      value={formData.contact_name}
                      onChange={handleInputChange}
                      placeholder="John Smith"
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
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="contact@company.com"
                    className="bg-secondary/50"
                  />
                </div>
                
                {/* Head Office Address with Google Maps */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Head Office Address
                  </Label>
                  <AddressAutocomplete
                    value={formData.head_office_address}
                    onChange={(value) => setFormData(prev => ({ ...prev, head_office_address: value }))}
                    onPlaceSelect={handleHeadOfficeSelect}
                    placeholder="Start typing head office address..."
                    className="bg-secondary/50"
                  />
                  {formData.head_office_lat && (
                    <p className="text-xs text-muted-foreground">
                      📍 Coordinates: {formData.head_office_lat.toFixed(4)}, {formData.head_office_lng?.toFixed(4)}
                    </p>
                  )}
                </div>

                {/* Factory Address with Google Maps */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Factory className="w-4 h-4" />
                    Factory Address
                  </Label>
                  <AddressAutocomplete
                    value={formData.factory_address}
                    onChange={(value) => setFormData(prev => ({ ...prev, factory_address: value }))}
                    onPlaceSelect={handleFactorySelect}
                    placeholder="Start typing factory address..."
                    className="bg-secondary/50"
                  />
                  {formData.factory_lat && (
                    <p className="text-xs text-muted-foreground">
                      📍 Coordinates: {formData.factory_lat.toFixed(4)}, {formData.factory_lng?.toFixed(4)}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      placeholder="Lagos"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      placeholder="Lagos State"
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tin_number">TIN Number</Label>
                  <Input
                    id="tin_number"
                    name="tin_number"
                    value={formData.tin_number}
                    onChange={handleInputChange}
                    placeholder="12345678-0001"
                    className="bg-secondary/50"
                  />
                </div>

                {/* Email Notification Preferences */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <Label className="flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    Email Notification Preferences
                  </Label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Delivery Updates</p>
                          <p className="text-xs text-muted-foreground">Receive email notifications for shipment status changes</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.email_delivery_updates}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, email_delivery_updates: checked }))}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Invoice Reminders</p>
                          <p className="text-xs text-muted-foreground">Receive email reminders for pending invoices</p>
                        </div>
                      </div>
                      <Switch
                        checked={formData.email_invoice_reminders}
                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, email_invoice_reminders: checked }))}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? "Adding..." : "Add Customer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Customers Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground">Company</TableHead>
              <TableHead className="text-muted-foreground">Contact</TableHead>
              <TableHead className="text-muted-foreground">Email</TableHead>
              <TableHead className="text-muted-foreground">Phone</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground text-center">Notifications</TableHead>
              <TableHead className="text-muted-foreground w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-muted-foreground">Loading customers...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredCustomers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No customers found</p>
                  <p className="text-sm text-muted-foreground/70">Add your first customer to get started</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((customer) => (
                <TableRow key={customer.id} className="data-table-row">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${customer.status === "inactive" ? "bg-muted" : "bg-primary/10"}`}>
                        <Building2 className={`w-5 h-5 ${customer.status === "inactive" ? "text-muted-foreground" : "text-primary"}`} />
                      </div>
                      <span className={`font-medium ${customer.status === "inactive" ? "text-muted-foreground" : "text-foreground"}`}>
                        {customer.company_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{customer.contact_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-4 h-4" />
                      {customer.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      {customer.phone}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.status === "inactive"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-success/15 text-success"
                    }`}>
                      {customer.status === "inactive" ? "Inactive" : "Active"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <div
                        className={`p-1.5 rounded ${customer.email_delivery_updates ? 'bg-success/20' : 'bg-muted'}`}
                        title={`Delivery updates: ${customer.email_delivery_updates ? 'On' : 'Off'}`}
                      >
                        <Package className={`w-3.5 h-3.5 ${customer.email_delivery_updates ? 'text-success' : 'text-muted-foreground'}`} />
                      </div>
                      <div
                        className={`p-1.5 rounded ${customer.email_invoice_reminders ? 'bg-info/20' : 'bg-muted'}`}
                        title={`Invoice reminders: ${customer.email_invoice_reminders ? 'On' : 'Off'}`}
                      >
                        <Mail className={`w-3.5 h-3.5 ${customer.email_invoice_reminders ? 'text-info' : 'text-muted-foreground'}`} />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewCustomer(customer)}>
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuItem onClick={() => handleViewCustomer(customer)}>
                              <Edit2 className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleToggleStatus(customer)}>
                              <Power className={`w-4 h-4 mr-2 ${customer.status === "inactive" ? "text-success" : "text-destructive"}`} />
                              {customer.status === "inactive" ? "Activate" : "Deactivate"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* View/Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) {
          setSelectedCustomer(null);
          setCustomerStats(null);
        }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              {selectedCustomer?.company_name}
            </DialogTitle>
            <DialogDescription>
              View and update customer information
            </DialogDescription>
          </DialogHeader>

          {selectedCustomer && (
            <Tabs defaultValue="details" className="mt-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="addresses">Addresses</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_company_name">Company Name *</Label>
                  <Input
                    id="edit_company_name"
                    name="company_name"
                    value={editFormData.company_name}
                    onChange={handleEditInputChange}
                    placeholder="ABC Logistics Ltd"
                    className="bg-secondary/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_contact_name">Contact Name *</Label>
                    <Input
                      id="edit_contact_name"
                      name="contact_name"
                      value={editFormData.contact_name}
                      onChange={handleEditInputChange}
                      placeholder="John Smith"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_phone">Phone *</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="edit_phone"
                        name="phone"
                        value={editFormData.phone}
                        onChange={handleEditInputChange}
                        placeholder="+234 800 123 4567"
                        className="pl-10 bg-secondary/50"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="edit_email"
                      name="email"
                      type="email"
                      value={editFormData.email}
                      onChange={handleEditInputChange}
                      placeholder="contact@company.com"
                      className="pl-10 bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit_city">City</Label>
                    <Input
                      id="edit_city"
                      name="city"
                      value={editFormData.city}
                      onChange={handleEditInputChange}
                      placeholder="Lagos"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_state">State</Label>
                    <Input
                      id="edit_state"
                      name="state"
                      value={editFormData.state}
                      onChange={handleEditInputChange}
                      placeholder="Lagos State"
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_tin_number">TIN Number</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="edit_tin_number"
                      name="tin_number"
                      value={editFormData.tin_number}
                      onChange={handleEditInputChange}
                      placeholder="12345678-0001"
                      className="pl-10 bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_notes">Notes</Label>
                  <Textarea
                    id="edit_notes"
                    name="notes"
                    value={editFormData.notes}
                    onChange={handleEditInputChange}
                    placeholder="Additional notes about this customer..."
                    className="bg-secondary/50"
                    rows={3}
                  />
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Power className={`w-5 h-5 ${editFormData.status === "active" ? "text-success" : "text-muted-foreground"}`} />
                    <div>
                      <Label className="text-sm font-medium">Customer Status</Label>
                      <p className="text-xs text-muted-foreground">
                        {editFormData.status === "active"
                          ? "Customer is active and can be assigned to dispatches"
                          : "Customer is inactive and won't appear in selections"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={editFormData.status === "active"}
                    onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, status: checked ? "active" : "inactive" }))}
                  />
                </div>
              </TabsContent>

              <TabsContent value="addresses" className="space-y-4 mt-4">
                {/* Head Office Address */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Head Office Address
                  </Label>
                  <AddressAutocomplete
                    value={editFormData.head_office_address}
                    onChange={(value) => setEditFormData(prev => ({ ...prev, head_office_address: value }))}
                    onPlaceSelect={handleEditHeadOfficeSelect}
                    placeholder="Start typing head office address..."
                    className="bg-secondary/50"
                  />
                  {editFormData.head_office_lat && (
                    <p className="text-xs text-muted-foreground">
                      Coordinates: {editFormData.head_office_lat.toFixed(4)}, {editFormData.head_office_lng?.toFixed(4)}
                    </p>
                  )}
                </div>

                {/* Factory Address */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Factory className="w-4 h-4" />
                    Factory Address
                  </Label>
                  <AddressAutocomplete
                    value={editFormData.factory_address}
                    onChange={(value) => setEditFormData(prev => ({ ...prev, factory_address: value }))}
                    onPlaceSelect={handleEditFactorySelect}
                    placeholder="Start typing factory address..."
                    className="bg-secondary/50"
                  />
                  {editFormData.factory_lat && (
                    <p className="text-xs text-muted-foreground">
                      Coordinates: {editFormData.factory_lat.toFixed(4)}, {editFormData.factory_lng?.toFixed(4)}
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="notifications" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Delivery Updates</p>
                        <p className="text-xs text-muted-foreground">Receive email notifications for shipment status changes</p>
                      </div>
                    </div>
                    <Switch
                      checked={editFormData.email_delivery_updates}
                      onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, email_delivery_updates: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Invoice Reminders</p>
                        <p className="text-xs text-muted-foreground">Receive email reminders for pending invoices</p>
                      </div>
                    </div>
                    <Switch
                      checked={editFormData.email_invoice_reminders}
                      onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, email_invoice_reminders: checked }))}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="space-y-4 mt-4">
                {/* Customer Activity Stats */}
                {loadingStats ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <span className="text-muted-foreground">Loading activity...</span>
                    </div>
                  </div>
                ) : customerStats ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-secondary/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Truck className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{customerStats.totalDispatches}</p>
                            <p className="text-xs text-muted-foreground">Total Dispatches</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-secondary/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
                            <Truck className="w-5 h-5 text-info" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{customerStats.activeDispatches}</p>
                            <p className="text-xs text-muted-foreground">Active Dispatches</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-secondary/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-success" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{customerStats.totalInvoices}</p>
                            <p className="text-xs text-muted-foreground">Total Invoices</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 bg-secondary/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-warning" />
                          </div>
                          <div>
                            <p className="text-2xl font-bold">{customerStats.pendingInvoices}</p>
                            <p className="text-xs text-muted-foreground">Pending Invoices</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Customer Info */}
                    <div className="p-4 bg-secondary/30 rounded-lg">
                      <h4 className="text-sm font-medium mb-3">Customer Information</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Created</p>
                          <p className="font-medium">{new Date(selectedCustomer.created_at).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Status</p>
                          <p className={`font-medium ${selectedCustomer.status === "inactive" ? "text-destructive" : "text-success"}`}>
                            {selectedCustomer.status === "inactive" ? "Inactive" : "Active"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No activity data available</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateCustomer} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Customers;
