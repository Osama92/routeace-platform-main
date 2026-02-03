import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Plus,
  Search,
  Handshake,
  Building2,
  FileText,
  Phone,
  Mail,
  MapPin,
  MoreVertical,
  CheckCircle,
  XCircle,
  Truck,
  Package,
  Users,
  CreditCard,
  Edit2,
  Power,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";

interface Partner {
  id: string;
  company_name: string;
  partner_type: string;
  cac_number: string | null;
  tin_number: string | null;
  director_name: string | null;
  director_phone: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string | null;
  city: string | null;
  state: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  is_verified: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

const Partners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  // Edit form data for view/edit dialog
  const [editFormData, setEditFormData] = useState({
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    is_active: true,
  });

  const [formData, setFormData] = useState({
    company_name: "",
    partner_type: "",
    cac_number: "",
    tin_number: "",
    director_name: "",
    director_phone: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    city: "",
    state: "",
    bank_name: "",
    bank_account_number: "",
    bank_account_name: "",
    notes: "",
  });

  const canManage = hasAnyRole(["admin", "operations"]);

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase
        .from("partners")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPartners(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch partners",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.company_name || !formData.partner_type || !formData.contact_name || !formData.contact_email || !formData.contact_phone) {
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
        partner_type: formData.partner_type,
        cac_number: formData.cac_number || null,
        tin_number: formData.tin_number || null,
        director_name: formData.director_name || null,
        director_phone: formData.director_phone || null,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone,
        address: formData.address || null,
        city: formData.city || null,
        state: formData.state || null,
        bank_name: formData.bank_name || null,
        bank_account_number: formData.bank_account_number || null,
        bank_account_name: formData.bank_account_name || null,
        notes: formData.notes || null,
        created_by: user?.id,
      };

      const { data, error } = await supabase.from("partners").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "partners",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: "Success",
        description: "Partner/Vendor added successfully",
      });
      setIsDialogOpen(false);
      setFormData({
        company_name: "",
        partner_type: "",
        cac_number: "",
        tin_number: "",
        director_name: "",
        director_phone: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        address: "",
        city: "",
        state: "",
        bank_name: "",
        bank_account_number: "",
        bank_account_name: "",
        notes: "",
      });
      fetchPartners();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add partner",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleViewPartner = (partner: Partner) => {
    setSelectedPartner(partner);
    setEditFormData({
      contact_name: partner.contact_name || "",
      contact_email: partner.contact_email || "",
      contact_phone: partner.contact_phone || "",
      is_active: partner.is_active !== false, // Default to true if not set
    });
    setIsViewDialogOpen(true);
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdatePartner = async () => {
    if (!selectedPartner) return;

    if (!editFormData.contact_email || !editFormData.contact_phone) {
      toast({
        title: "Validation Error",
        description: "Contact email and phone are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const updateData = {
        contact_name: editFormData.contact_name,
        contact_email: editFormData.contact_email,
        contact_phone: editFormData.contact_phone,
        is_active: editFormData.is_active,
      };

      const { error } = await supabase
        .from("partners")
        .update(updateData)
        .eq("id", selectedPartner.id);

      if (error) throw error;

      // Log the update
      await logChange({
        table_name: "partners",
        record_id: selectedPartner.id,
        action: "update",
        old_data: {
          contact_name: selectedPartner.contact_name,
          contact_email: selectedPartner.contact_email,
          contact_phone: selectedPartner.contact_phone,
          is_active: selectedPartner.is_active,
        },
        new_data: updateData,
      });

      toast({
        title: "Success",
        description: "Partner updated successfully",
      });
      setIsViewDialogOpen(false);
      setSelectedPartner(null);
      fetchPartners();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update partner",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (partner: Partner) => {
    try {
      const newActiveStatus = !partner.is_active;

      const { error } = await supabase
        .from("partners")
        .update({ is_active: newActiveStatus })
        .eq("id", partner.id);

      if (error) throw error;

      // Log the change
      await logChange({
        table_name: "partners",
        record_id: partner.id,
        action: "update",
        old_data: { is_active: partner.is_active },
        new_data: { is_active: newActiveStatus },
      });

      toast({
        title: "Success",
        description: `Partner marked as ${newActiveStatus ? "active" : "inactive"}`,
      });
      fetchPartners();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update partner status",
        variant: "destructive",
      });
    }
  };

  const filteredPartners = partners.filter((partner) => {
    const matchesSearch =
      partner.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      partner.contact_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || partner.partner_type === typeFilter;
    return matchesSearch && matchesType;
  });

  const transporters = partners.filter(p => p.partner_type === "transporter");
  const vendors = partners.filter(p => p.partner_type === "vendor");
  const thirdParty = partners.filter(p => p.partner_type === "3pl");

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "transporter":
        return <Truck className="w-5 h-5 text-primary" />;
      case "vendor":
        return <Package className="w-5 h-5 text-warning" />;
      case "3pl":
        return <Users className="w-5 h-5 text-info" />;
      default:
        return <Building2 className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      transporter: "bg-primary/15 text-primary",
      vendor: "bg-warning/15 text-warning",
      "3pl": "bg-info/15 text-info",
    };
    return styles[type] || "bg-muted text-muted-foreground";
  };

  return (
    <DashboardLayout
      title="Partners & Vendors"
      subtitle="Manage transporters, vendors, and 3PL partners"
    >
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
              <Handshake className="w-6 h-6 text-foreground" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{partners.length}</p>
              <p className="text-sm text-muted-foreground">Total Partners</p>
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
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{transporters.length}</p>
              <p className="text-sm text-muted-foreground">Transporters</p>
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
            <div className="w-12 h-12 rounded-xl bg-warning/20 flex items-center justify-center">
              <Package className="w-6 h-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">{vendors.length}</p>
              <p className="text-sm text-muted-foreground">Vendors</p>
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
            <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center">
              <Power className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {partners.filter(p => p.is_active !== false).length}
              </p>
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search partners..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="transporter">Transporters</SelectItem>
              <SelectItem value="vendor">Vendors</SelectItem>
              <SelectItem value="3pl">3PL Partners</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                Add Partner
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-heading">Onboard New Partner/Vendor</DialogTitle>
                <DialogDescription>
                  Enter the complete business details to add a new partner.
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="business" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="business">Business Info</TabsTrigger>
                  <TabsTrigger value="director">Director/Contact</TabsTrigger>
                  <TabsTrigger value="banking">Banking Details</TabsTrigger>
                </TabsList>
                
                <TabsContent value="business" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name *</Label>
                      <Input
                        id="company_name"
                        name="company_name"
                        value={formData.company_name}
                        onChange={handleInputChange}
                        placeholder="XYZ Logistics Ltd"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partner_type">Partner Type *</Label>
                      <Select
                        value={formData.partner_type}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, partner_type: value }))}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transporter">Transporter</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                          <SelectItem value="3pl">3PL Partner</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cac_number">CAC Number</Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="cac_number"
                          name="cac_number"
                          value={formData.cac_number}
                          onChange={handleInputChange}
                          placeholder="RC 123456"
                          className="pl-10 bg-secondary/50"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tin_number">TIN Number</Label>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="tin_number"
                          name="tin_number"
                          value={formData.tin_number}
                          onChange={handleInputChange}
                          placeholder="12345678-0001"
                          className="pl-10 bg-secondary/50"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="123 Business District"
                      className="bg-secondary/50"
                    />
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
                </TabsContent>
                
                <TabsContent value="director" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="director_name">Director's Name</Label>
                      <Input
                        id="director_name"
                        name="director_name"
                        value={formData.director_name}
                        onChange={handleInputChange}
                        placeholder="Chief John Okafor"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="director_phone">Director's Phone</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="director_phone"
                          name="director_phone"
                          value={formData.director_phone}
                          onChange={handleInputChange}
                          placeholder="+234 800 123 4567"
                          className="pl-10 bg-secondary/50"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-border/50 pt-4 mt-4">
                    <h4 className="text-sm font-medium text-foreground mb-4">Primary Contact Person</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact_name">Contact Name *</Label>
                        <Input
                          id="contact_name"
                          name="contact_name"
                          value={formData.contact_name}
                          onChange={handleInputChange}
                          placeholder="Jane Doe"
                          className="bg-secondary/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact_phone">Contact Phone *</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="contact_phone"
                            name="contact_phone"
                            value={formData.contact_phone}
                            onChange={handleInputChange}
                            placeholder="+234 800 987 6543"
                            className="pl-10 bg-secondary/50"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 mt-4">
                      <Label htmlFor="contact_email">Contact Email *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="contact_email"
                          name="contact_email"
                          type="email"
                          value={formData.contact_email}
                          onChange={handleInputChange}
                          placeholder="contact@company.com"
                          className="pl-10 bg-secondary/50"
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="banking" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name</Label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="bank_name"
                        name="bank_name"
                        value={formData.bank_name}
                        onChange={handleInputChange}
                        placeholder="First Bank Nigeria"
                        className="pl-10 bg-secondary/50"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bank_account_number">Account Number</Label>
                      <Input
                        id="bank_account_number"
                        name="bank_account_number"
                        value={formData.bank_account_number}
                        onChange={handleInputChange}
                        placeholder="0123456789"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bank_account_name">Account Name</Label>
                      <Input
                        id="bank_account_name"
                        name="bank_account_name"
                        value={formData.bank_account_name}
                        onChange={handleInputChange}
                        placeholder="XYZ Logistics Ltd"
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      placeholder="Any additional information..."
                      className="bg-secondary/50"
                    />
                  </div>
                </TabsContent>
              </Tabs>
              
              <DialogFooter className="mt-6">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? "Adding..." : "Add Partner"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* View/Edit Partner Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              Partner Details
            </DialogTitle>
            <DialogDescription>
              View and edit partner contact information
            </DialogDescription>
          </DialogHeader>

          {selectedPartner && (
            <div className="space-y-6 mt-4">
              {/* Company Info (read-only) */}
              <div className="p-4 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                    {getTypeIcon(selectedPartner.partner_type)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground">{selectedPartner.company_name}</h4>
                    <span className={`status-badge ${getTypeBadge(selectedPartner.partner_type)} text-xs`}>
                      {selectedPartner.partner_type.toUpperCase()}
                    </span>
                  </div>
                </div>
                {selectedPartner.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {selectedPartner.address}{selectedPartner.city && `, ${selectedPartner.city}`}{selectedPartner.state && `, ${selectedPartner.state}`}
                  </p>
                )}
              </div>

              {/* Editable Contact Fields */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_name">Contact Name</Label>
                  <Input
                    id="edit_contact_name"
                    name="contact_name"
                    value={editFormData.contact_name}
                    onChange={handleEditInputChange}
                    placeholder="Contact person name"
                    className="bg-secondary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_email">Contact Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="edit_contact_email"
                      name="contact_email"
                      type="email"
                      value={editFormData.contact_email}
                      onChange={handleEditInputChange}
                      placeholder="contact@company.com"
                      className="pl-10 bg-secondary/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit_contact_phone">Contact Phone *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="edit_contact_phone"
                      name="contact_phone"
                      value={editFormData.contact_phone}
                      onChange={handleEditInputChange}
                      placeholder="+234 800 123 4567"
                      className="pl-10 bg-secondary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Active/Inactive Toggle */}
              <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Power className={`w-5 h-5 ${editFormData.is_active ? "text-success" : "text-muted-foreground"}`} />
                  <div>
                    <Label htmlFor="is_active" className="text-sm font-medium">Partner Status</Label>
                    <p className="text-xs text-muted-foreground">
                      {editFormData.is_active ? "This partner is active and available for assignments" : "This partner is inactive and won't appear in selections"}
                    </p>
                  </div>
                </div>
                <Switch
                  id="is_active"
                  checked={editFormData.is_active}
                  onCheckedChange={(checked) => setEditFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>

              {/* Verification Status (read-only display) */}
              <div className="flex items-center gap-2 text-sm">
                {selectedPartner.is_verified ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-success">Verified Partner</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Not Verified</span>
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePartner} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Partners Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-muted-foreground">Loading partners...</span>
            </div>
          </div>
        ) : filteredPartners.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Handshake className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No partners found</p>
            <p className="text-sm text-muted-foreground/70">Add your first partner to get started</p>
          </div>
        ) : (
          filteredPartners.map((partner, index) => (
            <motion.div
              key={partner.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="glass-card p-6 hover:border-primary/30 transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                    {getTypeIcon(partner.partner_type)}
                  </div>
                  <div>
                    <h3 className="font-heading font-semibold text-foreground">{partner.company_name}</h3>
                    <span className={`status-badge ${getTypeBadge(partner.partner_type)} mt-1`}>
                      {partner.partner_type.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {partner.is_active === false && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
                      Inactive
                    </span>
                  )}
                  {partner.is_verified ? (
                    <CheckCircle className="w-5 h-5 text-success" title="Verified" />
                  ) : (
                    <XCircle className="w-5 h-5 text-muted-foreground" title="Not Verified" />
                  )}
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span>{partner.contact_email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span>{partner.contact_phone}</span>
                </div>
                {partner.city && partner.state && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{partner.city}, {partner.state}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border/50 grid grid-cols-2 gap-4 text-sm">
                {partner.cac_number && (
                  <div>
                    <p className="text-muted-foreground/70">CAC No.</p>
                    <p className="font-medium text-foreground">{partner.cac_number}</p>
                  </div>
                )}
                {partner.tin_number && (
                  <div>
                    <p className="text-muted-foreground/70">TIN</p>
                    <p className="font-medium text-foreground">{partner.tin_number}</p>
                  </div>
                )}
                {partner.director_name && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground/70">Director</p>
                    <p className="font-medium text-foreground">{partner.director_name}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleViewPartner(partner)}
                >
                  View Details
                </Button>
                {canManage && (
                  <Button
                    size="sm"
                    variant={partner.is_active !== false ? "outline" : "default"}
                    className={`flex-1 ${partner.is_active !== false ? "text-destructive hover:text-destructive" : ""}`}
                    onClick={() => handleToggleActive(partner)}
                  >
                    {partner.is_active !== false ? "Deactivate" : "Activate"}
                  </Button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </DashboardLayout>
  );
};

export default Partners;
