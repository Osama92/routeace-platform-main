import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Settings,
  Plus,
  Edit,
  Trash2,
  MapPin,
  Truck,
  DollarSign,
  RefreshCw,
  AlertTriangle,
  History,
  Layers,
  Download,
  Bell,
  Building,
  Users,
  Mail,
  X,
  FileSpreadsheet,
  Fuel,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";
import VendorRateUpload from "@/components/trip-rate/VendorRateUpload";
import DieselRateUpload from "@/components/trip-rate/DieselRateUpload";
import RateChangePreview from "@/components/trip-rate/RateChangePreview";

interface TripRateConfig {
  id: string;
  truck_type: string;
  zone: string;
  rate_amount: number;
  is_net: boolean;
  driver_type: 'owned' | 'vendor';
  partner_id: string | null;
  customer_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface RateHistory {
  id: string;
  rate_config_id: string | null;
  truck_type: string;
  zone: string;
  old_rate_amount: number | null;
  new_rate_amount: number;
  change_type: string;
  changed_by: string | null;
  changed_by_email: string | null;
  notes: string | null;
  driver_type: string | null;
  created_at: string;
}

interface Partner {
  id: string;
  company_name: string;
}

interface Customer {
  id: string;
  company_name: string;
}

interface NotificationRecipient {
  id: string;
  email: string;
  is_active: boolean;
}

const TRUCK_TYPES = ["5t", "10t", "15t", "20t", "trailer"];
const ZONES = ["within_ibadan", "outside_ibadan"];

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const TripRateConfigPage = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rates, setRates] = useState<TripRateConfig[]>([]);
  const [history, setHistory] = useState<RateHistory[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [isRecipientsDialogOpen, setIsRecipientsDialogOpen] = useState(false);
  const [isVendorUploadOpen, setIsVendorUploadOpen] = useState(false);
  const [isDieselUploadOpen, setIsDieselUploadOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<TripRateConfig | null>(null);
  const [activeTab, setActiveTab] = useState("rates");
  const [driverTypeTab, setDriverTypeTab] = useState<'owned' | 'vendor'>('owned');
  const [newRecipientEmail, setNewRecipientEmail] = useState("");
  const [routes, setRoutes] = useState<{ id: string; name: string; origin: string; destination: string }[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    truck_type: "",
    zone: "",
    rate_amount: "",
    is_net: true,
    driver_type: "owned" as 'owned' | 'vendor',
    partner_id: "",
    customer_id: "",
    description: "",
  });

  // Bulk update form state
  const [bulkFormData, setBulkFormData] = useState({
    zone: "within_ibadan",
    new_rate: "",
    driver_type: "owned" as 'owned' | 'vendor',
  });

  const fetchRates = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("trip_rate_config" as any)
        .select("*")
        .order("driver_type", { ascending: true })
        .order("zone", { ascending: true })
        .order("truck_type", { ascending: true }) as any);

      if (error) throw error;
      setRates((data as TripRateConfig[]) || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch rate configuration",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await (supabase
        .from("trip_rate_history" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100) as any);

      if (error) throw error;
      setHistory((data as RateHistory[]) || []);
    } catch (error: any) {
      console.error("Failed to fetch rate history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("id, company_name")
        .eq("partner_type", "vendor")
        .order("company_name");

      if (error) throw error;
      setPartners(data || []);
    } catch (error) {
      console.error("Failed to fetch partners:", error);
    }
  };

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, company_name")
        .order("company_name");

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("Failed to fetch customers:", error);
    }
  };

  const fetchRecipients = async () => {
    try {
      const { data, error } = await (supabase
        .from("rate_change_recipients" as any)
        .select("*")
        .order("created_at", { ascending: false }) as any);

      if (error) throw error;
      setRecipients((data as NotificationRecipient[]) || []);
    } catch (error) {
      console.error("Failed to fetch recipients:", error);
    }
  };

  const fetchRoutes = async () => {
    try {
      const { data, error } = await supabase
        .from("routes")
        .select("id, name, origin, destination")
        .order("name");

      if (error) throw error;
      setRoutes(data || []);
    } catch (error) {
      console.error("Failed to fetch routes:", error);
    }
  };

  useEffect(() => {
    fetchRates();
    fetchHistory();
    fetchPartners();
    fetchCustomers();
    fetchRecipients();
    fetchRoutes();
  }, []);

  const sendRateChangeNotification = async (
    truckType: string,
    zone: string,
    oldRate: number | null,
    newRate: number,
    changeType: 'create' | 'update' | 'delete' | 'bulk_update',
    driverType: 'owned' | 'vendor',
    partnerId?: string | null,
    customerId?: string | null,
    notes?: string
  ) => {
    try {
      const partner = partnerId ? partners.find(p => p.id === partnerId) : null;
      const customer = customerId ? customers.find(c => c.id === customerId) : null;

      await supabase.functions.invoke('send-rate-change-notification', {
        body: {
          truck_type: truckType,
          zone: zone,
          old_rate: oldRate,
          new_rate: newRate,
          change_type: changeType,
          changed_by_email: user?.email || 'Unknown',
          driver_type: driverType,
          partner_name: partner?.company_name,
          customer_name: customer?.company_name,
          notes: notes,
        }
      });
    } catch (error) {
      console.error("Failed to send rate change notification:", error);
    }
  };

  const logRateChange = async (
    rateConfigId: string | null,
    truckType: string,
    zone: string,
    oldRate: number | null,
    newRate: number,
    changeType: 'create' | 'update' | 'delete' | 'bulk_update',
    driverType: 'owned' | 'vendor',
    partnerId?: string | null,
    customerId?: string | null,
    notes?: string
  ) => {
    try {
      await (supabase.from("trip_rate_history" as any) as any).insert({
        rate_config_id: rateConfigId,
        truck_type: truckType,
        zone: zone,
        old_rate_amount: oldRate,
        new_rate_amount: newRate,
        change_type: changeType,
        changed_by: user?.id,
        changed_by_email: user?.email,
        driver_type: driverType,
        partner_id: partnerId || null,
        customer_id: customerId || null,
        notes: notes,
      });

      // Send email notification
      await sendRateChangeNotification(
        truckType, zone, oldRate, newRate, changeType, driverType, partnerId, customerId, notes
      );
    } catch (error) {
      console.error("Failed to log rate change:", error);
    }
  };

  const handleExportHistory = () => {
    if (history.length === 0) {
      toast({
        title: "No Data",
        description: "No rate history records to export",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Date/Time",
      "Truck Type",
      "Zone",
      "Driver Type",
      "Change Type",
      "Old Rate",
      "New Rate",
      "Changed By",
      "Notes"
    ];

    const rows = history.map((record) => [
      format(parseISO(record.created_at), "yyyy-MM-dd HH:mm:ss"),
      record.truck_type.toUpperCase(),
      record.zone === 'within_ibadan' ? 'Within Zone' : 'Outside Zone',
      record.driver_type || 'owned',
      record.change_type.replace('_', ' '),
      record.old_rate_amount !== null ? record.old_rate_amount.toString() : '',
      record.change_type === 'delete' ? 'DELETED' : record.new_rate_amount.toString(),
      record.changed_by_email || 'System',
      record.notes || ''
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `trip-rate-history-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Complete",
      description: `Exported ${history.length} rate history records`,
    });
  };

  const handleAddRecipient = async () => {
    if (!newRecipientEmail || !newRecipientEmail.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await (supabase.from("rate_change_recipients" as any).insert({
        email: newRecipientEmail,
        is_active: true,
        created_by: user?.id,
      }) as any);

      if (error) throw error;

      toast({
        title: "Recipient Added",
        description: `${newRecipientEmail} will receive rate change notifications`,
      });
      setNewRecipientEmail("");
      fetchRecipients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add recipient",
        variant: "destructive",
      });
    }
  };

  const handleRemoveRecipient = async (id: string) => {
    try {
      const { error } = await (supabase
        .from("rate_change_recipients" as any)
        .delete()
        .eq("id", id) as any);

      if (error) throw error;
      fetchRecipients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to remove recipient",
        variant: "destructive",
      });
    }
  };

  const handleOpenEdit = (rate: TripRateConfig) => {
    setSelectedRate(rate);
    setFormData({
      truck_type: rate.truck_type,
      zone: rate.zone,
      rate_amount: rate.rate_amount.toString(),
      is_net: rate.is_net,
      driver_type: rate.driver_type || 'owned',
      partner_id: rate.partner_id || "",
      customer_id: rate.customer_id || "",
      description: rate.description || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleOpenAdd = () => {
    setFormData({
      truck_type: "",
      zone: "",
      rate_amount: "",
      is_net: true,
      driver_type: driverTypeTab,
      partner_id: "",
      customer_id: "",
      description: "",
    });
    setIsAddDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedRate) return;

    const oldRate = selectedRate.rate_amount;
    const newRate = parseFloat(formData.rate_amount);

    setSaving(true);
    try {
      const { error } = await (supabase
        .from("trip_rate_config" as any)
        .update({
          rate_amount: newRate,
          is_net: formData.is_net,
          driver_type: formData.driver_type,
          partner_id: formData.partner_id || null,
          customer_id: formData.customer_id || null,
          description: formData.description || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedRate.id) as any);

      if (error) throw error;

      await logRateChange(
        selectedRate.id,
        formData.truck_type,
        formData.zone,
        oldRate,
        newRate,
        'update',
        formData.driver_type,
        formData.partner_id,
        formData.customer_id
      );

      toast({
        title: "Rate Updated",
        description: `Rate for ${formData.truck_type.toUpperCase()} in ${formData.zone.replace("_", " ")} updated successfully`,
      });

      setIsEditDialogOpen(false);
      fetchRates();
      fetchHistory();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update rate",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddRate = async () => {
    if (!formData.truck_type || !formData.zone || !formData.rate_amount) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const existingRate = rates.find(
      (r) => 
        r.truck_type === formData.truck_type && 
        r.zone === formData.zone && 
        r.driver_type === formData.driver_type &&
        r.partner_id === (formData.partner_id || null) &&
        r.customer_id === (formData.customer_id || null)
    );
    if (existingRate) {
      toast({
        title: "Duplicate Rate",
        description: "A rate for this combination already exists. Please edit the existing rate.",
        variant: "destructive",
      });
      return;
    }

    const newRate = parseFloat(formData.rate_amount);

    setSaving(true);
    try {
      const { data, error } = await (supabase.from("trip_rate_config" as any).insert({
        truck_type: formData.truck_type,
        zone: formData.zone,
        rate_amount: newRate,
        is_net: formData.is_net,
        driver_type: formData.driver_type,
        partner_id: formData.partner_id || null,
        customer_id: formData.customer_id || null,
        description: formData.description || null,
      }).select().single() as any);

      if (error) throw error;

      await logRateChange(
        data?.id || null,
        formData.truck_type,
        formData.zone,
        null,
        newRate,
        'create',
        formData.driver_type,
        formData.partner_id,
        formData.customer_id
      );

      toast({
        title: "Rate Added",
        description: `New rate for ${formData.truck_type.toUpperCase()} in ${formData.zone.replace("_", " ")} added successfully`,
      });

      setIsAddDialogOpen(false);
      fetchRates();
      fetchHistory();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add rate",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRate = async (rate: TripRateConfig) => {
    if (!confirm(`Delete rate for ${rate.truck_type.toUpperCase()} in ${rate.zone.replace("_", " ")}?`)) {
      return;
    }

    try {
      await logRateChange(
        rate.id,
        rate.truck_type,
        rate.zone,
        rate.rate_amount,
        0,
        'delete',
        rate.driver_type || 'owned',
        rate.partner_id,
        rate.customer_id
      );

      const { error } = await (supabase
        .from("trip_rate_config" as any)
        .delete()
        .eq("id", rate.id) as any);

      if (error) throw error;

      toast({
        title: "Rate Deleted",
        description: "Trip rate configuration deleted successfully",
      });

      fetchRates();
      fetchHistory();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete rate",
        variant: "destructive",
      });
    }
  };

  const handleBulkUpdate = async () => {
    if (!bulkFormData.new_rate) {
      toast({
        title: "Validation Error",
        description: "Please enter a new rate amount",
        variant: "destructive",
      });
      return;
    }

    const newAmount = parseFloat(bulkFormData.new_rate);
    const zone = bulkFormData.zone;
    const driverType = bulkFormData.driver_type;

    setSaving(true);
    try {
      const standardTrucks = rates.filter(
        (r) => r.zone === zone && r.truck_type !== "trailer" && r.driver_type === driverType && !r.partner_id
      );

      for (const rate of standardTrucks) {
        const oldAmount = rate.rate_amount;
        
        await (supabase
          .from("trip_rate_config" as any)
          .update({ rate_amount: newAmount, updated_at: new Date().toISOString() })
          .eq("id", rate.id) as any);

        await logRateChange(
          rate.id,
          rate.truck_type,
          zone,
          oldAmount,
          newAmount,
          'bulk_update',
          driverType,
          null,
          null,
          `Bulk update: All standard ${driverType} trucks in ${zone.replace("_", " ")}`
        );
      }

      toast({
        title: "Bulk Update Complete",
        description: `Updated ${standardTrucks.length} rates for ${driverType} drivers in ${zone.replace("_", " ")}`,
      });

      setIsBulkDialogOpen(false);
      setBulkFormData({ zone: "within_ibadan", new_rate: "", driver_type: "owned" });
      fetchRates();
      fetchHistory();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update rates",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Filter rates by driver type and zone
  const filteredRates = rates.filter(r => (r.driver_type || 'owned') === driverTypeTab);
  const withinZoneRates = filteredRates.filter((r) => r.zone === "within_ibadan");
  const outsideZoneRates = filteredRates.filter((r) => r.zone === "outside_ibadan");

  const getPartnerName = (partnerId: string | null) => {
    if (!partnerId) return null;
    return partners.find(p => p.id === partnerId)?.company_name;
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return null;
    return customers.find(c => c.id === customerId)?.company_name;
  };

  const renderRateTable = (zoneRates: TripRateConfig[], color: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Truck Type</TableHead>
          {driverTypeTab === 'vendor' && <TableHead>Vendor/Customer</TableHead>}
          <TableHead className="text-right">Rate/Trip</TableHead>
          <TableHead className="text-center">Net</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {zoneRates.map((rate) => (
          <TableRow key={rate.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium uppercase">{rate.truck_type}</span>
              </div>
            </TableCell>
            {driverTypeTab === 'vendor' && (
              <TableCell>
                <div className="text-sm">
                  {rate.partner_id && (
                    <div className="text-muted-foreground">
                      <span className="font-medium">{getPartnerName(rate.partner_id)}</span>
                    </div>
                  )}
                  {rate.customer_id && (
                    <div className="text-xs text-muted-foreground">
                      For: {getCustomerName(rate.customer_id)}
                    </div>
                  )}
                  {!rate.partner_id && !rate.customer_id && (
                    <span className="text-muted-foreground italic">Default</span>
                  )}
                </div>
              </TableCell>
            )}
            <TableCell className={`text-right font-semibold ${color}`}>
              {formatCurrency(rate.rate_amount)}
            </TableCell>
            <TableCell className="text-center">
              {rate.is_net ? (
                <Badge variant="secondary" className="bg-green-500/10 text-green-600">Yes</Badge>
              ) : (
                <Badge variant="outline">No</Badge>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-1 justify-end">
                <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(rate)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRate(rate)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {zoneRates.length === 0 && (
          <TableRow>
            <TableCell colSpan={driverTypeTab === 'vendor' ? 5 : 4} className="text-center py-8 text-muted-foreground">
              No rates configured
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <DashboardLayout
      title="Trip Rate Configuration"
      subtitle="Configure zone-based rates for different truck types and driver categories"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <TabsList>
            <TabsTrigger value="rates" className="gap-2">
              <Settings className="w-4 h-4" />
              Rate Configuration
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              Change History
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setIsRecipientsDialogOpen(true)}>
              <Bell className="w-4 h-4 mr-2" />
              Notifications
              {recipients.length > 0 && (
                <Badge variant="secondary" className="ml-2">{recipients.length}</Badge>
              )}
            </Button>
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(true)}>
              <Layers className="w-4 h-4 mr-2" />
              Bulk Update
            </Button>
            <Button onClick={handleOpenAdd}>
              <Plus className="w-4 h-4 mr-2" />
              Add Rate
            </Button>
          </div>
        </div>

        <TabsContent value="rates" className="space-y-6">
          {/* Driver Type Tabs */}
          <Tabs value={driverTypeTab} onValueChange={(v) => setDriverTypeTab(v as 'owned' | 'vendor')}>
            <TabsList>
              <TabsTrigger value="owned" className="gap-2">
                <Users className="w-4 h-4" />
                Owned Drivers
              </TabsTrigger>
              <TabsTrigger value="vendor" className="gap-2">
                <Building className="w-4 h-4" />
                3rd Party Vendors
              </TabsTrigger>
            </TabsList>

            <TabsContent value="owned" className="mt-6 space-y-6">
              {/* Upload Actions for Owned Drivers */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setIsDieselUploadOpen(true)}>
                  <Fuel className="w-4 h-4 mr-2" />
                  Upload Diesel Rates
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <Card className="border-blue-500/20 bg-blue-500/5">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">Within Zone</CardTitle>
                            <CardDescription>Lagos, Sagamu, Abeokuta, Ibadan</CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
                          {withinZoneRates.length} rates
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>{renderRateTable(withinZoneRates, "text-blue-600")}</CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                  <Card className="border-orange-500/20 bg-orange-500/5">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">Outside Zone</CardTitle>
                            <CardDescription>All other destinations</CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">
                          {outsideZoneRates.length} rates
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>{renderRateTable(outsideZoneRates, "text-orange-600")}</CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>

            <TabsContent value="vendor" className="mt-6 space-y-6">
              <Card className="bg-purple-500/5 border-purple-500/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building className="w-5 h-5" />
                        3rd Party Vendor Rates
                      </CardTitle>
                      <CardDescription>
                        Configure rates for vendor drivers. You can set default rates or specific rates per vendor/customer.
                      </CardDescription>
                    </div>
                    <Button onClick={() => setIsVendorUploadOpen(true)}>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Upload Excel
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
                  <Card className="border-blue-500/20 bg-blue-500/5">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">Within Zone</CardTitle>
                            <CardDescription>Vendor rates for within zone</CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
                          {withinZoneRates.length} rates
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>{renderRateTable(withinZoneRates, "text-blue-600")}</CardContent>
                  </Card>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
                  <Card className="border-orange-500/20 bg-orange-500/5">
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <MapPin className="w-5 h-5 text-orange-600" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">Outside Zone</CardTitle>
                            <CardDescription>Vendor rates for outside zone</CardDescription>
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">
                          {outsideZoneRates.length} rates
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>{renderRateTable(outsideZoneRates, "text-orange-600")}</CardContent>
                  </Card>
                </motion.div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Rate Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Rate Comparison Summary ({driverTypeTab === 'owned' ? 'Owned Drivers' : 'Vendor Default Rates'})
              </CardTitle>
              <CardDescription>Quick view of rate differences between zones</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Truck Type</TableHead>
                    <TableHead className="text-right">Within Zone</TableHead>
                    <TableHead className="text-right">Outside Zone</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {TRUCK_TYPES.map((truckType) => {
                    const defaultWithin = filteredRates.filter(r => !r.partner_id && !r.customer_id);
                    const defaultOutside = filteredRates.filter(r => !r.partner_id && !r.customer_id);
                    const withinRate = defaultWithin.find((r) => r.truck_type === truckType && r.zone === 'within_ibadan');
                    const outsideRate = defaultOutside.find((r) => r.truck_type === truckType && r.zone === 'outside_ibadan');
                    const difference = (outsideRate?.rate_amount || 0) - (withinRate?.rate_amount || 0);

                    return (
                      <TableRow key={truckType}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium uppercase">{truckType}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-blue-600 font-medium">
                          {withinRate ? formatCurrency(withinRate.rate_amount) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-orange-600 font-medium">
                          {outsideRate ? formatCurrency(outsideRate.rate_amount) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {difference > 0 ? (
                            <span className="text-green-600 font-semibold">+{formatCurrency(difference)}</span>
                          ) : difference < 0 ? (
                            <span className="text-destructive font-semibold">{formatCurrency(difference)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Zone Classification</p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Within Zone:</strong> Trips with delivery addresses containing Lagos, Sagamu, Abeokuta, or Ibadan.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Outside Zone:</strong> All other destinations.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    <strong>Rate Priority:</strong> Specific vendor+customer rate → Specific vendor rate → Default vendor rate → Owned driver rate
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Rate changes will apply to future payroll calculations. Existing processed payroll records will not be affected.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Rate Change History
                  </CardTitle>
                  <CardDescription>Audit log of all rate configuration changes</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportHistory}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={fetchHistory}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : history.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No rate changes recorded yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Truck Type</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead>Driver Type</TableHead>
                      <TableHead>Change Type</TableHead>
                      <TableHead className="text-right">Old Rate</TableHead>
                      <TableHead className="text-right">New Rate</TableHead>
                      <TableHead>Changed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="text-sm">{format(parseISO(record.created_at), "PPp")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium uppercase">{record.truck_type}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={record.zone === 'within_ibadan' 
                              ? 'bg-blue-500/10 text-blue-600 border-blue-200' 
                              : 'bg-orange-500/10 text-orange-600 border-orange-200'
                            }
                          >
                            {record.zone === 'within_ibadan' ? 'Within' : 'Outside'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={record.driver_type === 'vendor' ? 'bg-purple-500/10 text-purple-600' : ''}>
                            {record.driver_type === 'vendor' ? 'Vendor' : 'Owned'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              record.change_type === 'create' ? 'default' :
                              record.change_type === 'delete' ? 'destructive' :
                              record.change_type === 'bulk_update' ? 'secondary' :
                              'outline'
                            }
                            className="capitalize"
                          >
                            {record.change_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {record.old_rate_amount !== null ? (
                            <span className="text-muted-foreground">{formatCurrency(record.old_rate_amount)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {record.change_type === 'delete' ? (
                            <span className="text-destructive">Deleted</span>
                          ) : (
                            <span className="text-green-600">{formatCurrency(record.new_rate_amount)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {record.changed_by_email || 'System'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Rate Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Trip Rate</DialogTitle>
            <DialogDescription>
              Update the rate for {formData.truck_type.toUpperCase()} in {formData.zone.replace("_", " ")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Truck Type</Label>
                <Input value={formData.truck_type.toUpperCase()} disabled />
              </div>
              <div className="grid gap-2">
                <Label>Zone</Label>
                <Input value={formData.zone.replace("_", " ")} disabled className="capitalize" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Driver Type</Label>
              <Select
                value={formData.driver_type}
                onValueChange={(value) => setFormData({ ...formData, driver_type: value as 'owned' | 'vendor' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">Owned Driver</SelectItem>
                  <SelectItem value="vendor">3rd Party Vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.driver_type === 'vendor' && (
              <>
                <div className="grid gap-2">
                  <Label>Vendor (Optional)</Label>
                  <Select
                    value={formData.partner_id || "_all"}
                    onValueChange={(value) => setFormData({ ...formData, partner_id: value === "_all" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Vendors (Default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Vendors (Default)</SelectItem>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Customer (Optional)</Label>
                  <Select
                    value={formData.customer_id || "_all"}
                    onValueChange={(value) => setFormData({ ...formData, customer_id: value === "_all" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Customers (Default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Customers (Default)</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="rate_amount">Rate per Trip (₦)</Label>
              <Input
                id="rate_amount"
                type="number"
                value={formData.rate_amount}
                onChange={(e) => setFormData({ ...formData, rate_amount: e.target.value })}
                placeholder="e.g., 20000"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Net Rate</Label>
                <p className="text-xs text-muted-foreground">Rate is paid directly without deductions</p>
              </div>
              <Switch
                checked={formData.is_net}
                onCheckedChange={(checked) => setFormData({ ...formData, is_net: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rate Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Trip Rate</DialogTitle>
            <DialogDescription>Configure a new rate for a truck type and zone combination</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Driver Type</Label>
              <Select
                value={formData.driver_type}
                onValueChange={(value) => setFormData({ ...formData, driver_type: value as 'owned' | 'vendor' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">Owned Driver</SelectItem>
                  <SelectItem value="vendor">3rd Party Vendor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Truck Type</Label>
                <Select
                  value={formData.truck_type}
                  onValueChange={(value) => setFormData({ ...formData, truck_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select truck type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRUCK_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type.toUpperCase()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Zone</Label>
                <Select
                  value={formData.zone}
                  onValueChange={(value) => setFormData({ ...formData, zone: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select zone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="within_ibadan">Within Zone</SelectItem>
                    <SelectItem value="outside_ibadan">Outside Zone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.driver_type === 'vendor' && (
              <>
                <div className="grid gap-2">
                  <Label>Vendor (Optional)</Label>
                  <Select
                    value={formData.partner_id || "_all"}
                    onValueChange={(value) => setFormData({ ...formData, partner_id: value === "_all" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Vendors (Default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Vendors (Default)</SelectItem>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Leave empty for default vendor rate</p>
                </div>
                <div className="grid gap-2">
                  <Label>Customer (Optional)</Label>
                  <Select
                    value={formData.customer_id || "_all"}
                    onValueChange={(value) => setFormData({ ...formData, customer_id: value === "_all" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Customers (Default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">All Customers (Default)</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Set customer-specific rates for this vendor</p>
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="new_rate_amount">Rate per Trip (₦)</Label>
              <Input
                id="new_rate_amount"
                type="number"
                value={formData.rate_amount}
                onChange={(e) => setFormData({ ...formData, rate_amount: e.target.value })}
                placeholder="e.g., 20000"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Net Rate</Label>
                <p className="text-xs text-muted-foreground">Rate is paid directly without deductions</p>
              </div>
              <Switch
                checked={formData.is_net}
                onCheckedChange={(checked) => setFormData({ ...formData, is_net: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddRate} disabled={saving}>
              {saving ? "Adding..." : "Add Rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Bulk Rate Update
            </DialogTitle>
            <DialogDescription>
              Update all standard truck rates (5T, 10T, 15T, 20T) in a zone at once. Trailers are excluded.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Driver Type</Label>
              <Select
                value={bulkFormData.driver_type}
                onValueChange={(value) => setBulkFormData({ ...bulkFormData, driver_type: value as 'owned' | 'vendor' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owned">Owned Drivers</SelectItem>
                  <SelectItem value="vendor">3rd Party Vendors (Default Rates)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Zone</Label>
              <Select
                value={bulkFormData.zone}
                onValueChange={(value) => setBulkFormData({ ...bulkFormData, zone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="within_ibadan">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      Within Zone
                    </div>
                  </SelectItem>
                  <SelectItem value="outside_ibadan">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      Outside Zone
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk_rate">New Rate for All Standard Trucks (₦)</Label>
              <Input
                id="bulk_rate"
                type="number"
                value={bulkFormData.new_rate}
                onChange={(e) => setBulkFormData({ ...bulkFormData, new_rate: e.target.value })}
                placeholder="e.g., 25000"
              />
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                This will update default rates for: <strong>5T, 10T, 15T, 20T</strong> trucks in the selected zone.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Trailer rates and vendor-specific rates will not be affected.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkUpdate} disabled={saving}>
              {saving ? "Updating..." : "Update All Standard Trucks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Recipients Dialog */}
      <Dialog open={isRecipientsDialogOpen} onOpenChange={setIsRecipientsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Rate Change Notifications
            </DialogTitle>
            <DialogDescription>
              Configure email addresses to receive notifications when trip rates are changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enter email address"
                value={newRecipientEmail}
                onChange={(e) => setNewRecipientEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
              />
              <Button onClick={handleAddRecipient}>
                <Plus className="w-4 h-4 mr-2" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {recipients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No notification recipients configured</p>
                  <p className="text-sm">Add email addresses to receive rate change alerts</p>
                </div>
              ) : (
                recipients.map((recipient) => (
                  <div
                    key={recipient.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{recipient.email}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveRecipient(recipient.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRecipientsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialogs */}
      <VendorRateUpload
        open={isVendorUploadOpen}
        onOpenChange={setIsVendorUploadOpen}
        partners={partners}
        customers={customers}
        onSuccess={() => fetchRates()}
      />

      <DieselRateUpload
        open={isDieselUploadOpen}
        onOpenChange={setIsDieselUploadOpen}
        routes={routes}
        onSuccess={() => {
          toast({
            title: "Diesel Rates Updated",
            description: "Diesel rate configuration has been updated successfully",
          });
        }}
      />

      <RateChangePreview
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        zone={bulkFormData.zone}
        driverType={bulkFormData.driver_type}
        currentRates={rates.filter(r => r.zone === bulkFormData.zone && (r.driver_type || 'owned') === bulkFormData.driver_type && !r.partner_id)}
        newRate={parseFloat(bulkFormData.new_rate) || 0}
        onConfirm={() => {
          setIsPreviewOpen(false);
          handleBulkUpdate();
        }}
      />
    </DashboardLayout>
  );
};

export default TripRateConfigPage;
