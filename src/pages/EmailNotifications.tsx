import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Mail,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  Plus,
  Eye,
  RefreshCw,
  Users,
  Truck,
  Timer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format, differenceInMinutes, addHours } from "date-fns";

interface Dispatch {
  id: string;
  dispatch_number: string;
  status: string | null;
  pickup_address: string;
  delivery_address: string;
  scheduled_delivery: string | null;
  customers: {
    company_name: string;
    contact_name: string;
    email: string;
  } | null;
}

interface EmailNotification {
  id: string;
  dispatch_id: string | null;
  recipient_email: string;
  recipient_type: string;
  subject: string;
  body: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string;
  sla_deadline?: string | null;
  sla_met?: boolean | null;
  sla_response_time_minutes?: number | null;
  notification_type?: string | null;
  dispatches?: {
    dispatch_number: string;
    status: string | null;
  } | null;
}

const SLA_HOURS = 2; // 2 hours SLA for customer notifications

const EmailNotificationsPage = () => {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [emailNotifications, setEmailNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailNotification | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();
  const { user, hasAnyRole } = useAuth();

  const isAdmin = hasAnyRole(["admin"]);
  const isSupport = hasAnyRole(["support"]);
  const canManage = isAdmin || isSupport || hasAnyRole(["operations"]);

  const [formData, setFormData] = useState({
    dispatch_id: "",
    recipient_type: "customer",
    subject: "",
    body: "",
    include_leadership: true,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dispatchesRes, notificationsRes] = await Promise.all([
        supabase
          .from("dispatches")
          .select(`
            id,
            dispatch_number,
            status,
            pickup_address,
            delivery_address,
            scheduled_delivery,
            customers (
              company_name,
              contact_name,
              email
            )
          `)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("email_notifications")
          .select(`
            *,
            dispatches (
              dispatch_number,
              status
            )
          `)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      if (dispatchesRes.error) throw dispatchesRes.error;
      if (notificationsRes.error) throw notificationsRes.error;

      setDispatches(dispatchesRes.data || []);
      setEmailNotifications(notificationsRes.data || []);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectDispatch = (dispatchId: string) => {
    const dispatch = dispatches.find(d => d.id === dispatchId);
    if (dispatch) {
      const statusMessage = getStatusMessage(dispatch.status || "pending");
      setFormData(prev => ({
        ...prev,
        dispatch_id: dispatchId,
        subject: `Delivery Update - ${dispatch.dispatch_number}`,
        body: `Dear ${dispatch.customers?.contact_name || "Customer"},\n\n${statusMessage}\n\nDispatch Number: ${dispatch.dispatch_number}\nPickup: ${dispatch.pickup_address}\nDelivery: ${dispatch.delivery_address}\n\nThank you for your business.\n\nBest regards,\nLogistics Team`,
      }));
    }
  };

  const getStatusMessage = (status: string): string => {
    const messages: Record<string, string> = {
      pending: "Your shipment is being prepared and will be dispatched shortly.",
      assigned: "Your shipment has been assigned to a driver and will be picked up soon.",
      picked_up: "Great news! Your shipment has been picked up and is now on its way.",
      in_transit: "Your shipment is currently in transit to the destination.",
      delivered: "Your shipment has been successfully delivered. Thank you for choosing us!",
      cancelled: "We regret to inform you that your shipment has been cancelled. Please contact us for more information.",
    };
    return messages[status] || `Your shipment status has been updated to: ${status}`;
  };

  const handleSendEmail = async () => {
    if (!formData.dispatch_id || !formData.subject || !formData.body) {
      toast({
        title: "Validation Error",
        description: "Please select a dispatch and fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    const dispatch = dispatches.find((d) => d.id === formData.dispatch_id);
    if (!dispatch?.customers?.email) {
      toast({
        title: "Error",
        description: "No customer email found for this dispatch",
        variant: "destructive",
      });
      setSending(false);
      return;
    }

    try {
      // Send to customer (real email) + log in backend
      const { data, error } = await supabase.functions.invoke("send-notification-email", {
        body: {
          dispatch_id: formData.dispatch_id,
          recipient_email: dispatch.customers.email,
          recipient_type: "customer",
          subject: formData.subject,
          body: formData.body,
          notification_type: "status_update",
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to send");

      // Optional leadership copy
      if (formData.include_leadership) {
        const { data: integrationData } = await supabase
          .from("integrations")
          .select("config")
          .eq("type", "notifications")
          .maybeSingle();

        const config = integrationData?.config as Record<string, any> | null;
        const leadershipEmail = config?.leadership_email;

        if (leadershipEmail) {
          await supabase.functions.invoke("send-notification-email", {
            body: {
              dispatch_id: formData.dispatch_id,
              recipient_email: leadershipEmail,
              recipient_type: "leadership",
              subject: `[INTERNAL] ${formData.subject}`,
              body: `Internal notification for dispatch ${dispatch.dispatch_number}\n\n${formData.body}`,
              notification_type: "internal_update",
            },
          });
        }
      }

      toast({
        title: "Email Sent",
        description: `Notification sent to ${dispatch.customers.email}`,
      });

      setDialogOpen(false);
      setFormData({
        dispatch_id: "",
        recipient_type: "customer",
        subject: "",
        body: "",
        include_leadership: true,
      });
      fetchData();
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const filteredNotifications = emailNotifications.filter(notification => {
    const matchesSearch = 
      notification.recipient_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      notification.dispatches?.dispatch_number?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || notification.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const slaStats = {
    total: emailNotifications.length,
    sent: emailNotifications.filter(e => e.status === "sent").length,
    pending: emailNotifications.filter(e => e.status === "pending").length,
    failed: emailNotifications.filter(e => e.status === "failed").length,
    slaMet: emailNotifications.filter(e => e.sla_met === true).length,
    slaBreached: emailNotifications.filter(e => e.sla_met === false).length,
  };

  const getSlaStatus = (notification: EmailNotification) => {
    if (!notification.sla_deadline) return null;
    const deadline = new Date(notification.sla_deadline);
    const now = new Date();
    
    if (notification.sla_met === true) {
      return { status: "met", label: "SLA Met", color: "bg-success/20 text-success" };
    } else if (notification.sla_met === false) {
      return { status: "breached", label: "SLA Breached", color: "bg-destructive/20 text-destructive" };
    } else if (deadline < now) {
      return { status: "overdue", label: "Overdue", color: "bg-warning/20 text-warning" };
    }
    return { status: "pending", label: "Within SLA", color: "bg-info/20 text-info" };
  };

  return (
    <DashboardLayout
      title="Email Notifications"
      subtitle="Manage customer communications and SLA tracking"
    >
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{slaStats.total}</p>
                    <p className="text-xs text-muted-foreground">Total Emails</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{slaStats.sent}</p>
                    <p className="text-xs text-muted-foreground">Sent</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{slaStats.pending}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{slaStats.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                    <Timer className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{slaStats.slaMet}</p>
                    <p className="text-xs text-muted-foreground">SLA Met</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-destructive/20 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{slaStats.slaBreached}</p>
                    <p className="text-xs text-muted-foreground">SLA Breached</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Actions Bar */}
        <Card className="glass-card">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex flex-1 gap-4 w-full md:w-auto">
                <div className="relative flex-1 md:max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search emails..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-secondary/50"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] bg-secondary/50">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={fetchData}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </Button>
                {canManage && (
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Send Update
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Email Notifications Table */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Email History</CardTitle>
            <CardDescription>View all sent notifications with SLA tracking</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Mail className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No email notifications found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dispatch</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SLA</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNotifications.map((notification) => {
                      const slaStatus = getSlaStatus(notification);
                      return (
                        <TableRow key={notification.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-muted-foreground" />
                              <span className="font-mono text-sm">
                                {notification.dispatches?.dispatch_number || "N/A"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">{notification.recipient_email}</span>
                              <span className="text-xs text-muted-foreground capitalize">
                                {notification.recipient_type}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {notification.subject}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {notification.notification_type?.replace("_", " ") || "Update"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                notification.status === "sent" ? "default" :
                                notification.status === "failed" ? "destructive" : "secondary"
                              }
                            >
                              {notification.status || "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {slaStatus && (
                              <Badge className={slaStatus.color}>
                                {slaStatus.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {notification.sent_at
                              ? format(new Date(notification.sent_at), "MMM d, yyyy HH:mm")
                              : "—"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedEmail(notification);
                                setViewDialogOpen(true);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Send Email Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send Delivery Update</DialogTitle>
            <DialogDescription>
              Send a status update email to the customer and leadership
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Dispatch</Label>
              <Select value={formData.dispatch_id} onValueChange={handleSelectDispatch}>
                <SelectTrigger className="bg-secondary/50">
                  <SelectValue placeholder="Select a dispatch..." />
                </SelectTrigger>
                <SelectContent>
                  {dispatches.map((dispatch) => (
                    <SelectItem key={dispatch.id} value={dispatch.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{dispatch.dispatch_number}</span>
                        <span className="text-muted-foreground">—</span>
                        <span>{dispatch.customers?.company_name || "No Customer"}</span>
                        <Badge variant="outline" className="ml-2 capitalize">
                          {dispatch.status || "pending"}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject..."
                className="bg-secondary/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Email body..."
                rows={8}
                className="bg-secondary/50"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="include_leadership"
                checked={formData.include_leadership}
                onChange={(e) => setFormData(prev => ({ ...prev, include_leadership: e.target.checked }))}
                className="rounded border-muted"
              />
              <Label htmlFor="include_leadership" className="text-sm cursor-pointer">
                Also send to leadership email
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendEmail} disabled={sending}>
              {sending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Email Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
            <DialogDescription>
              View full email content and SLA information
            </DialogDescription>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Recipient</Label>
                  <p className="font-medium">{selectedEmail.recipient_email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium capitalize">{selectedEmail.recipient_type}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge
                    variant={
                      selectedEmail.status === "sent" ? "default" :
                      selectedEmail.status === "failed" ? "destructive" : "secondary"
                    }
                  >
                    {selectedEmail.status || "pending"}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">SLA Status</Label>
                  {(() => {
                    const slaStatus = getSlaStatus(selectedEmail);
                    return slaStatus ? (
                      <Badge className={slaStatus.color}>{slaStatus.label}</Badge>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    );
                  })()}
                </div>
                {selectedEmail.sla_deadline && (
                  <div>
                    <Label className="text-muted-foreground">SLA Deadline</Label>
                    <p className="font-medium">
                      {format(new Date(selectedEmail.sla_deadline), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                )}
                {selectedEmail.sla_response_time_minutes !== null && (
                  <div>
                    <Label className="text-muted-foreground">Response Time</Label>
                    <p className="font-medium">{selectedEmail.sla_response_time_minutes} minutes</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium">{selectedEmail.subject}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Message</Label>
                <div className="bg-secondary/50 p-4 rounded-lg whitespace-pre-wrap text-sm">
                  {selectedEmail.body || "No message content"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p>{format(new Date(selectedEmail.created_at), "MMM d, yyyy HH:mm")}</p>
                </div>
                {selectedEmail.sent_at && (
                  <div>
                    <Label className="text-muted-foreground">Sent</Label>
                    <p>{format(new Date(selectedEmail.sent_at), "MMM d, yyyy HH:mm")}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default EmailNotificationsPage;