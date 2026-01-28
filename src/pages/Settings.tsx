import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Settings as SettingsIcon,
  Mail,
  Map,
  FileText,
  Bell,
  Shield,
  Users,
  MessageSquare,
  Zap,
  ExternalLink,
  Check,
  AlertCircle,
  Loader2,
  Building2,
  CreditCard,
  Upload,
  Image,
  PenTool,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import GoogleSheetsIntegration from "@/components/settings/GoogleSheetsIntegration";

interface Integration {
  id: string;
  name: string;
  type: string;
  is_enabled: boolean | null;
  config: Record<string, any> | null;
  last_sync_at: string | null;
}

const SettingsPage = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasAnyRole } = useAuth();

  const isAdmin = hasAnyRole(["admin"]);

  const [formData, setFormData] = useState({
    resend_api_key: "",
    zoho_client_id: "",
    zoho_client_secret: "",
    zoho_organization_id: "",
    mapbox_token: "",
    google_maps_key: "",
    leadership_email: "",
    support_email: "",
    sla_sms_recipients: "",
    // Company Profile
    company_name: "",
    company_tagline: "",
    company_email: "",
    company_phone: "",
    company_address: "",
    company_tin: "",
    company_website: "",
    // Bank Account Details
    bank_name: "",
    account_name: "",
    account_number: "",
  });

  // State for file uploads
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [authorizedSignature, setAuthorizedSignature] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .order("name");

      if (error) throw error;
      
      if (data) {
        const typedData = data.map(item => ({
          ...item,
          config: (item.config as Record<string, any>) || {},
          is_enabled: item.is_enabled ?? false,
        }));
        setIntegrations(typedData);
        // Pre-fill form with existing config
        typedData.forEach((integration) => {
          if (integration.name === "resend") {
            setFormData(prev => ({
              ...prev,
              resend_api_key: integration.config?.api_key || "",
            }));
          }
          if (integration.name === "zoho") {
            setFormData(prev => ({
              ...prev,
              zoho_client_id: integration.config?.client_id || "",
              zoho_client_secret: integration.config?.client_secret || "",
              zoho_organization_id: integration.config?.organization_id || "",
            }));
          }
          if (integration.name === "notifications") {
            setFormData(prev => ({
              ...prev,
              leadership_email: integration.config?.leadership_email || "",
              support_email: integration.config?.support_email || "",
            }));
          }
          if (integration.name === "sms_notifications") {
            setFormData(prev => ({
              ...prev,
              sla_sms_recipients: integration.config?.sla_sms_recipients || "",
            }));
          }
          if (integration.name === "company_profile") {
            setFormData(prev => ({
              ...prev,
              company_name: integration.config?.company_name || "",
              company_tagline: integration.config?.company_tagline || "",
              company_email: integration.config?.company_email || "",
              company_phone: integration.config?.company_phone || "",
              company_address: integration.config?.company_address || "",
              company_tin: integration.config?.tin_number || "",
              company_website: integration.config?.website || "",
            }));
            if (integration.config?.company_logo) {
              setCompanyLogo(integration.config.company_logo);
            }
            if (integration.config?.authorized_signature) {
              setAuthorizedSignature(integration.config.authorized_signature);
            }
          }
          if (integration.name === "bank_details") {
            setFormData(prev => ({
              ...prev,
              bank_name: integration.config?.bank_name || "",
              account_name: integration.config?.account_name || "",
              account_number: integration.config?.account_number || "",
            }));
          }
        });
      }
    } catch (error: any) {
      console.error("Error fetching integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchIntegrations();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  const handleSaveIntegration = async (type: string) => {
    setSaving(type);
    try {
      let config: Record<string, any> = {};
      let name = type;

      switch (type) {
        case "resend":
          config = { api_key: formData.resend_api_key };
          break;
        case "zoho":
          config = {
            client_id: formData.zoho_client_id,
            client_secret: formData.zoho_client_secret,
            organization_id: formData.zoho_organization_id,
          };
          break;
        case "notifications":
          config = {
            leadership_email: formData.leadership_email,
            support_email: formData.support_email,
          };
          break;
        case "sms_notifications":
          config = {
            sla_sms_recipients: formData.sla_sms_recipients,
          };
          name = "sms_notifications";
          break;
        case "company_profile":
          config = {
            company_name: formData.company_name,
            company_tagline: formData.company_tagline,
            company_email: formData.company_email,
            company_phone: formData.company_phone,
            company_address: formData.company_address,
            company_logo: companyLogo,
            authorized_signature: authorizedSignature,
            tin_number: formData.company_tin,
            website: formData.company_website,
          };
          name = "company_profile";
          break;
        case "bank_details":
          config = {
            bank_name: formData.bank_name,
            account_name: formData.account_name,
            account_number: formData.account_number,
          };
          name = "bank_details";
          break;
        default:
          break;
      }

      // Use upsert to handle both insert and update cases
      // This prevents 409 Conflict errors when record exists in DB but not in local state
      const { error } = await supabase
        .from("integrations")
        .upsert(
          {
            name,
            type,
            config,
            is_enabled: true,
            updated_at: new Date().toISOString()
          },
          {
            onConflict: "name",
            ignoreDuplicates: false
          }
        );

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} settings have been updated.`,
      });

      fetchIntegrations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleToggleIntegration = async (integration: Integration) => {
    try {
      const { error } = await supabase
        .from("integrations")
        .update({ is_enabled: !integration.is_enabled })
        .eq("id", integration.id);

      if (error) throw error;

      toast({
        title: integration.is_enabled ? "Integration Disabled" : "Integration Enabled",
        description: `${integration.name} has been ${integration.is_enabled ? "disabled" : "enabled"}.`,
      });

      fetchIntegrations();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to toggle integration",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (file: File, type: "logo" | "signature") => {
    setUploading(type);
    try {
      // Convert to base64 for storage
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        if (type === "logo") {
          setCompanyLogo(base64);
        } else {
          setAuthorizedSignature(base64);
        }
        setUploading(null);
        toast({
          title: "File Uploaded",
          description: `${type === "logo" ? "Company logo" : "Signature"} uploaded successfully. Remember to save your settings.`,
        });
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast({
        title: "Upload Error",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
      setUploading(null);
    }
  };

  const handleRemoveFile = (type: "logo" | "signature") => {
    if (type === "logo") {
      setCompanyLogo(null);
    } else {
      setAuthorizedSignature(null);
    }
    toast({
      title: "File Removed",
      description: `${type === "logo" ? "Company logo" : "Signature"} removed. Remember to save your settings.`,
    });
  };

  if (!isAdmin) {
    return (
      <DashboardLayout title="Settings" subtitle="Manage platform settings and integrations">
        <div className="flex flex-col items-center justify-center py-16">
          <Shield className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Access Restricted</h3>
          <p className="text-muted-foreground text-center max-w-md">
            You don't have permission to access settings. Please contact an administrator.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Settings"
      subtitle="Manage platform settings and integrations"
    >
      <Tabs defaultValue="integrations" className="space-y-6">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="integrations">
            <Zap className="w-4 h-4 mr-2" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-4 h-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="general">
            <SettingsIcon className="w-4 h-4 mr-2" />
            General
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Zoho Integration */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="glass-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Zoho Invoice</CardTitle>
                        <CardDescription>Sync invoices with Zoho Books</CardDescription>
                      </div>
                    </div>
                    {integrations.find(i => i.name === "zoho")?.is_enabled && (
                      <Check className="w-5 h-5 text-success" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="zoho_client_id">Client ID</Label>
                    <Input
                      id="zoho_client_id"
                      value={formData.zoho_client_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, zoho_client_id: e.target.value }))}
                      placeholder="Enter Zoho Client ID"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zoho_client_secret">Client Secret</Label>
                    <Input
                      id="zoho_client_secret"
                      type="password"
                      value={formData.zoho_client_secret}
                      onChange={(e) => setFormData(prev => ({ ...prev, zoho_client_secret: e.target.value }))}
                      placeholder="Enter Zoho Client Secret"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zoho_organization_id">Organization ID</Label>
                    <Input
                      id="zoho_organization_id"
                      value={formData.zoho_organization_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, zoho_organization_id: e.target.value }))}
                      placeholder="Enter Zoho Organization ID"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <a
                      href="https://accounts.zoho.com/developerconsole"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                      Get API Keys <ExternalLink className="w-3 h-3" />
                    </a>
                    <Button
                      onClick={() => handleSaveIntegration("zoho")}
                      disabled={saving === "zoho"}
                    >
                      {saving === "zoho" ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Save & Connect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Resend Email Integration */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card className="glass-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-info" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">Resend Email</CardTitle>
                        <CardDescription>Send delivery notifications</CardDescription>
                      </div>
                    </div>
                    {integrations.find(i => i.name === "resend")?.is_enabled && (
                      <Check className="w-5 h-5 text-success" />
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="resend_api_key">API Key</Label>
                    <Input
                      id="resend_api_key"
                      type="password"
                      value={formData.resend_api_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, resend_api_key: e.target.value }))}
                      placeholder="re_xxxxxxxxxx"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <a
                      href="https://resend.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                      Get API Key <ExternalLink className="w-3 h-3" />
                    </a>
                    <Button
                      onClick={() => handleSaveIntegration("resend")}
                      disabled={saving === "resend"}
                    >
                      {saving === "resend" ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Save & Connect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Maps placeholder - for future use */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="glass-card">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                      <Map className="w-5 h-5 text-success" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Google Maps / Routes</CardTitle>
                      <CardDescription>Route optimization & tracking</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="google_maps_key">Google Maps API Key</Label>
                    <Input
                      id="google_maps_key"
                      type="password"
                      value={formData.google_maps_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, google_maps_key: e.target.value }))}
                      placeholder="AIza..."
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                      Get API Key <ExternalLink className="w-3 h-3" />
                    </a>
                    <Button
                      onClick={() => handleSaveIntegration("google_maps")}
                      disabled={saving === "google_maps"}
                    >
                      {saving === "google_maps" ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Save & Connect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Google Sheets Integration */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-2"
            >
              <GoogleSheetsIntegration />
            </motion.div>
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Email Notification Settings</CardTitle>
                <CardDescription>
                  Configure where delivery status updates are sent
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="leadership_email">Leadership Email</Label>
                    <Input
                      id="leadership_email"
                      type="email"
                      value={formData.leadership_email}
                      onChange={(e) => setFormData(prev => ({ ...prev, leadership_email: e.target.value }))}
                      placeholder="leadership@company.com"
                      className="bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Receives all delivery status updates
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="support_email">Support Team Email</Label>
                    <Input
                      id="support_email"
                      type="email"
                      value={formData.support_email}
                      onChange={(e) => setFormData(prev => ({ ...prev, support_email: e.target.value }))}
                      placeholder="support@company.com"
                      className="bg-secondary/50"
                    />
                    <p className="text-xs text-muted-foreground">
                      Receives customer support-related updates
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleSaveIntegration("notifications")}
                  disabled={saving === "notifications"}
                >
                  {saving === "notifications" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Save Notification Settings
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Notification Events</CardTitle>
                <CardDescription>
                  Choose which events trigger email notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { id: "dispatch_created", label: "New Dispatch Created", description: "When a new delivery is dispatched" },
                  { id: "pickup_started", label: "Pickup Started", description: "When driver starts pickup" },
                  { id: "in_transit", label: "In Transit", description: "When package is in transit" },
                  { id: "delivered", label: "Delivered", description: "When package is delivered" },
                  { id: "document_expiry", label: "Document Expiry Alerts", description: "7 days before document expires" },
                ].map((event) => (
                  <div key={event.id} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                    <div>
                      <p className="font-medium text-foreground">{event.label}</p>
                      <p className="text-sm text-muted-foreground">{event.description}</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* SMS Notifications Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">SMS Notifications</CardTitle>
                    <CardDescription>Configure SMS alerts for critical events</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sla_sms_recipients">SLA Breach SMS Recipients</Label>
                  <Input
                    id="sla_sms_recipients"
                    value={formData.sla_sms_recipients}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      sla_sms_recipients: e.target.value 
                    }))}
                    placeholder="+2348012345678, +2349012345678"
                    className="bg-secondary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated phone numbers in international format (+234...)
                  </p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    SMS notifications will be sent via Africa's Talking when SLA breaches are detected.
                    Standard SMS rates apply.
                  </p>
                </div>
                <Button 
                  onClick={() => handleSaveIntegration("sms_notifications")}
                  disabled={saving === "sms_notifications"}
                >
                  {saving === "sms_notifications" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Save SMS Settings
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="general" className="space-y-6">
          {/* Company Profile Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Company Profile</CardTitle>
                    <CardDescription>Basic company information for invoices and documents</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company_name">Company Name</Label>
                    <Input
                      id="company_name"
                      value={formData.company_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_name: e.target.value }))}
                      placeholder="Your Company Name"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_tagline">Tagline</Label>
                    <Input
                      id="company_tagline"
                      value={formData.company_tagline}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_tagline: e.target.value }))}
                      placeholder="Professional Services"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_email">Email</Label>
                    <Input
                      id="company_email"
                      type="email"
                      value={formData.company_email}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_email: e.target.value }))}
                      placeholder="contact@company.com"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_phone">Phone</Label>
                    <Input
                      id="company_phone"
                      value={formData.company_phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_phone: e.target.value }))}
                      placeholder="+234 800 000 0000"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="company_address">Address</Label>
                    <Input
                      id="company_address"
                      value={formData.company_address}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_address: e.target.value }))}
                      placeholder="123 Business Street, Lagos, Nigeria"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_tin">TIN Number</Label>
                    <Input
                      id="company_tin"
                      value={formData.company_tin}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_tin: e.target.value }))}
                      placeholder="12345678-0001"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_website">Website</Label>
                    <Input
                      id="company_website"
                      value={formData.company_website}
                      onChange={(e) => setFormData(prev => ({ ...prev, company_website: e.target.value }))}
                      placeholder="www.company.com"
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => handleSaveIntegration("company_profile")}
                  disabled={saving === "company_profile"}
                >
                  {saving === "company_profile" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Save Company Profile
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Bank Account Details Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Bank Account Details</CardTitle>
                    <CardDescription>Payment information displayed on invoices</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_name">Bank Name</Label>
                    <Input
                      id="bank_name"
                      value={formData.bank_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                      placeholder="Parallex Bank"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_name">Account Name</Label>
                    <Input
                      id="account_name"
                      value={formData.account_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, account_name: e.target.value }))}
                      placeholder="Company Ltd"
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_number">Account Number</Label>
                    <Input
                      id="account_number"
                      value={formData.account_number}
                      onChange={(e) => setFormData(prev => ({ ...prev, account_number: e.target.value }))}
                      placeholder="1000209551"
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => handleSaveIntegration("bank_details")}
                  disabled={saving === "bank_details"}
                >
                  {saving === "bank_details" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Save Bank Details
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Signature & Logo Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                    <PenTool className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Signature & Logo</CardTitle>
                    <CardDescription>Upload images for branding on invoices</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Authorized Signature */}
                  <div className="space-y-3">
                    <Label>Authorized Signature</Label>
                    <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center">
                      {authorizedSignature ? (
                        <div className="space-y-3">
                          <img
                            src={authorizedSignature}
                            alt="Signature"
                            className="max-h-24 mx-auto object-contain"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveFile("signature")}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block">
                          <div className="py-4">
                            <PenTool className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              {uploading === "signature" ? "Uploading..." : "Click to upload signature"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB</p>
                          </div>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, "signature");
                            }}
                            disabled={uploading === "signature"}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Company Logo */}
                  <div className="space-y-3">
                    <Label>Company Logo</Label>
                    <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center">
                      {companyLogo ? (
                        <div className="space-y-3">
                          <img
                            src={companyLogo}
                            alt="Company Logo"
                            className="max-h-24 mx-auto object-contain"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveFile("logo")}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block">
                          <div className="py-4">
                            <Image className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">
                              {uploading === "logo" ? "Uploading..." : "Click to upload logo"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 2MB</p>
                          </div>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file, "logo");
                            }}
                            disabled={uploading === "logo"}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    These images will appear on your generated invoices. The signature will be placed in the footer and the logo in the header.
                  </p>
                </div>

                <Button
                  onClick={() => handleSaveIntegration("company_profile")}
                  disabled={saving === "company_profile"}
                >
                  {saving === "company_profile" ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Save Signature & Logo
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default SettingsPage;