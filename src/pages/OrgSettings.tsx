import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Building2,
  Zap,
  Users,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  UserPlus,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "operations", label: "Operations" },
  { value: "support", label: "Support" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "driver", label: "Driver" },
];

const ZOHO_REGIONS = [
  { value: "com", label: "US (zoho.com)" },
  { value: "eu", label: "Europe (zoho.eu)" },
  { value: "in", label: "India (zoho.in)" },
  { value: "com.au", label: "Australia (zoho.com.au)" },
  { value: "jp", label: "Japan (zoho.jp)" },
];

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  joined_at: string;
  profiles: { full_name: string | null; email: string | null } | null;
}

interface ZohoIntegration {
  id?: string;
  zoho_client_id: string;
  zoho_client_secret: string;
  zoho_refresh_token: string;
  zoho_organization_id: string;
  zoho_region: string;
  connected_at?: string | null;
}

const OrgSettingsPage = () => {
  const { user, organization, orgId } = useAuth();
  const { toast } = useToast();

  // Organization tab
  const [orgName, setOrgName] = useState(organization?.name || "");
  const [savingOrg, setSavingOrg] = useState(false);

  // Zoho tab
  const [zoho, setZoho] = useState<ZohoIntegration>({
    zoho_client_id: "",
    zoho_client_secret: "",
    zoho_refresh_token: "",
    zoho_organization_id: "",
    zoho_region: "com",
  });
  const [showSecret, setShowSecret] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);
  const [savingZoho, setSavingZoho] = useState(false);
  const [testingZoho, setTestingZoho] = useState(false);
  const [zohoStatus, setZohoStatus] = useState<"unknown" | "connected" | "failed">("unknown");

  // Members tab
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("operations");
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    if (organization) setOrgName(organization.name);
  }, [organization]);

  useEffect(() => {
    if (orgId) {
      fetchZohoIntegration();
      fetchMembers();
    }
  }, [orgId]);

  const fetchZohoIntegration = async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from("org_integrations")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();

    if (data) {
      setZoho({
        id: data.id,
        zoho_client_id: data.zoho_client_id || "",
        zoho_client_secret: data.zoho_client_secret || "",
        zoho_refresh_token: data.zoho_refresh_token || "",
        zoho_organization_id: data.zoho_organization_id || "",
        zoho_region: data.zoho_region || "com",
        connected_at: data.connected_at,
      });
      if (data.zoho_refresh_token) setZohoStatus("connected");
    }
  };

  const fetchMembers = async () => {
    if (!orgId) return;
    setLoadingMembers(true);
    try {
      const { data } = await supabase
        .from("org_members")
        .select("id, user_id, role, is_active, joined_at")
        .eq("org_id", orgId)
        .order("joined_at", { ascending: true });

      if (data) {
        // Fetch profiles separately to get names/emails
        const userIds = data.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);

        const profileMap: Record<string, any> = {};
        (profiles || []).forEach((p) => { profileMap[p.user_id] = p; });

        setMembers(
          data.map((m) => ({
            ...m,
            profiles: profileMap[m.user_id] || null,
          }))
        );
      }
    } finally {
      setLoadingMembers(false);
    }
  };

  const saveOrgName = async () => {
    if (!orgId || !orgName.trim()) return;
    setSavingOrg(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ name: orgName.trim(), updated_at: new Date().toISOString() })
        .eq("id", orgId);

      if (error) throw error;
      toast({ title: "Organization name updated" });
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setSavingOrg(false);
    }
  };

  const saveZohoCredentials = async () => {
    if (!orgId) return;
    setSavingZoho(true);
    try {
      const payload = {
        org_id: orgId,
        zoho_client_id: zoho.zoho_client_id.trim(),
        zoho_client_secret: zoho.zoho_client_secret.trim(),
        zoho_refresh_token: zoho.zoho_refresh_token.trim(),
        zoho_organization_id: zoho.zoho_organization_id.trim(),
        zoho_region: zoho.zoho_region,
        connected_at: new Date().toISOString(),
        connected_by: user?.id,
      };

      const { error } = await supabase
        .from("org_integrations")
        .upsert(payload, { onConflict: "org_id" });

      if (error) throw error;
      toast({ title: "Zoho credentials saved" });
      await fetchZohoIntegration();
    } catch (err: any) {
      toast({ title: "Failed to save credentials", description: err.message, variant: "destructive" });
    } finally {
      setSavingZoho(false);
    }
  };

  const testZohoConnection = async () => {
    if (!orgId) return;
    setTestingZoho(true);
    setZohoStatus("unknown");
    try {
      const { data, error } = await supabase.functions.invoke("zoho-sync", {
        body: { action: "test_connection", orgId },
      });
      if (error) throw error;
      if (data?.success) {
        setZohoStatus("connected");
        toast({ title: "Zoho connected successfully" });
      } else {
        setZohoStatus("failed");
        toast({ title: "Connection failed", description: data?.error, variant: "destructive" });
      }
    } catch (err: any) {
      setZohoStatus("failed");
      toast({ title: "Connection error", description: err.message, variant: "destructive" });
    } finally {
      setTestingZoho(false);
    }
  };

  const disconnectZoho = async () => {
    if (!orgId) return;
    try {
      await supabase
        .from("org_integrations")
        .update({
          zoho_client_id: null,
          zoho_client_secret: null,
          zoho_refresh_token: null,
          zoho_organization_id: null,
          connected_at: null,
          connected_by: null,
        })
        .eq("org_id", orgId);

      setZoho((prev) => ({
        ...prev,
        zoho_client_id: "",
        zoho_client_secret: "",
        zoho_refresh_token: "",
        zoho_organization_id: "",
      }));
      setZohoStatus("unknown");
      toast({ title: "Zoho disconnected" });
    } catch (err: any) {
      toast({ title: "Failed to disconnect", description: err.message, variant: "destructive" });
    }
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    const { error } = await supabase
      .from("org_members")
      .update({ role: newRole })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Failed to update role", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Role updated" });
      fetchMembers();
    }
  };

  const deactivateMember = async (memberId: string, userId: string) => {
    if (userId === user?.id) {
      toast({ title: "Cannot remove yourself", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("org_members")
      .update({ is_active: false })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Failed to remove member", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Member removed" });
      fetchMembers();
    }
  };

  const sendInvite = async () => {
    if (!inviteEmail.trim() || !orgId) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke("invite-team-member", {
        body: { email: inviteEmail.trim(), orgId, role: inviteRole },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Invite failed");

      toast({ title: "Invite sent", description: `${inviteEmail} has been invited as ${inviteRole}` });
      setInviteEmail("");
      setInviteOpen(false);
      fetchMembers();
    } catch (err: any) {
      toast({ title: "Failed to send invite", description: err.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const zohoFieldClass = "bg-background font-mono text-sm";

  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Organization Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organization profile, integrations, and team.
          </p>
        </div>

        <Tabs defaultValue="organization">
          <TabsList className="glass-card">
            <TabsTrigger value="organization" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Organization
            </TabsTrigger>
            <TabsTrigger value="zoho" className="flex items-center gap-2">
              <Zap className="w-4 h-4" /> Zoho Connection
            </TabsTrigger>
            <TabsTrigger value="members" className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Team Members
            </TabsTrigger>
          </TabsList>

          {/* ── Organization Tab ─────────────────────────────── */}
          <TabsContent value="organization" className="mt-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Organization Profile</CardTitle>
                <CardDescription>
                  This name appears throughout RouteAce and on documents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Acme Logistics Ltd"
                    className="bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-sm">Organization ID</Label>
                  <p className="text-xs font-mono text-muted-foreground bg-muted/30 p-2 rounded-md break-all">
                    {orgId}
                  </p>
                </div>
                <Button onClick={saveOrgName} disabled={savingOrg || !orgName.trim()}>
                  {savingOrg ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Zoho Connection Tab ──────────────────────────── */}
          <TabsContent value="zoho" className="mt-6 space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Zoho Books Connection</CardTitle>
                    <CardDescription className="mt-1">
                      Connect your Zoho Books account to sync invoices, expenses, and bills automatically.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {zohoStatus === "connected" && (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Connected
                      </Badge>
                    )}
                    {zohoStatus === "failed" && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Failed
                      </Badge>
                    )}
                    {zohoStatus === "unknown" && zoho.zoho_refresh_token && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Saved (not tested)
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                <div className="p-3 bg-muted/20 rounded-md border border-border/50 text-sm text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How to get your Zoho credentials</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Go to <span className="font-mono">api-console.zoho.com</span> → Add Client → Self Client</li>
                    <li>Copy the Client ID and Client Secret below</li>
                    <li>Generate a refresh token with scope: <span className="font-mono">ZohoBooks.fullaccess.all</span></li>
                    <li>Copy your Zoho Books Organization ID from Settings → Organization</li>
                  </ol>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input
                      value={zoho.zoho_client_id}
                      onChange={(e) => setZoho((p) => ({ ...p, zoho_client_id: e.target.value }))}
                      placeholder="1000.XXXXXXXXXXXXXXXXXX"
                      className={zohoFieldClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Client Secret</Label>
                    <div className="relative">
                      <Input
                        type={showSecret ? "text" : "password"}
                        value={zoho.zoho_client_secret}
                        onChange={(e) => setZoho((p) => ({ ...p, zoho_client_secret: e.target.value }))}
                        placeholder="••••••••••••••••••••"
                        className={zohoFieldClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Refresh Token</Label>
                    <div className="relative">
                      <Input
                        type={showRefreshToken ? "text" : "password"}
                        value={zoho.zoho_refresh_token}
                        onChange={(e) => setZoho((p) => ({ ...p, zoho_refresh_token: e.target.value }))}
                        placeholder="1000.XXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXX"
                        className={zohoFieldClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRefreshToken((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showRefreshToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Zoho Organization ID</Label>
                    <Input
                      value={zoho.zoho_organization_id}
                      onChange={(e) => setZoho((p) => ({ ...p, zoho_organization_id: e.target.value }))}
                      placeholder="123456789"
                      className={zohoFieldClass}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Region</Label>
                    <Select
                      value={zoho.zoho_region}
                      onValueChange={(v) => setZoho((p) => ({ ...p, zoho_region: v }))}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ZOHO_REGIONS.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button onClick={saveZohoCredentials} disabled={savingZoho}>
                    {savingZoho ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Credentials
                  </Button>
                  <Button variant="outline" onClick={testZohoConnection} disabled={testingZoho || !zoho.zoho_refresh_token}>
                    {testingZoho ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                    Test Connection
                  </Button>
                  {zoho.zoho_refresh_token && (
                    <Button variant="ghost" onClick={disconnectZoho} className="text-destructive hover:text-destructive ml-auto">
                      Disconnect
                    </Button>
                  )}
                </div>

                {zoho.connected_at && (
                  <p className="text-xs text-muted-foreground">
                    Last updated: {new Date(zoho.connected_at).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Team Members Tab ─────────────────────────────── */}
          <TabsContent value="members" className="mt-6">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Team Members</CardTitle>
                    <CardDescription>
                      Manage who has access to your organization in RouteAce.
                    </CardDescription>
                  </div>
                  <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <UserPlus className="w-4 h-4 mr-2" /> Invite Member
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite Team Member</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label>Email Address</Label>
                          <Input
                            type="email"
                            placeholder="colleague@example.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Role</Label>
                          <Select value={inviteRole} onValueChange={setInviteRole}>
                            <SelectTrigger className="bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLE_OPTIONS.map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end gap-3">
                          <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                          <Button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
                            {inviting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                            Send Invite
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {loadingMembers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : members.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No members found.</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => {
                      const displayName =
                        member.profiles?.full_name ||
                        member.profiles?.email ||
                        member.user_id.substring(0, 8) + "…";
                      const isCurrentUser = member.user_id === user?.id;

                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/40"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                              {(displayName[0] || "?").toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {displayName}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Joined {new Date(member.joined_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {!member.is_active && (
                              <Badge variant="outline" className="text-xs">Pending</Badge>
                            )}
                            <Select
                              value={member.role}
                              onValueChange={(v) => updateMemberRole(member.id, v)}
                              disabled={isCurrentUser}
                            >
                              <SelectTrigger className="w-32 h-8 text-xs bg-background">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS.map((r) => (
                                  <SelectItem key={r.value} value={r.value} className="text-xs">
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!isCurrentUser && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="w-8 h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => deactivateMember(member.id, member.user_id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </DashboardLayout>
  );
};

export default OrgSettingsPage;
