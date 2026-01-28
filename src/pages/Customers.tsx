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
} from "lucide-react";
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
  created_at: string;
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
              <Building2 className="w-6 h-6 text-success" />
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
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-info/20 flex items-center justify-center">
              <Factory className="w-6 h-6 text-info" />
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
              <TableHead className="text-muted-foreground">Head Office</TableHead>
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
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-medium text-foreground">{customer.company_name}</span>
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
                    {customer.head_office_address ? (
                      <div className="flex items-center gap-2 text-muted-foreground max-w-[150px]">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span className="truncate text-xs" title={customer.head_office_address}>
                          {customer.head_office_address.split(',')[0]}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
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
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>
    </DashboardLayout>
  );
};

export default Customers;
