import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format } from "date-fns";

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  approval_status: string | null;
  due_date: string | null;
  created_at: string;
  submitted_by: string | null;
  first_approver_id: string | null;
  first_approved_at: string | null;
  second_approver_id: string | null;
  second_approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  customers?: {
    company_name: string;
  };
  submitter?: {
    full_name: string;
    email: string;
  };
  first_approver?: {
    full_name: string;
    email: string;
  };
  second_approver?: {
    full_name: string;
    email: string;
  };
}

interface ApprovalRole {
  user_id: string;
  approval_level: "first_level" | "second_level";
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const approvalStatusConfig: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending_first_approval: {
    label: "Pending 1st Approval",
    className: "bg-warning/15 text-warning",
    icon: Clock,
  },
  pending_second_approval: {
    label: "Pending 2nd Approval",
    className: "bg-info/15 text-info",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    className: "bg-success/15 text-success",
    icon: CheckCircle,
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/15 text-destructive",
    icon: XCircle,
  },
};

const InvoiceApprovalsPage = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [userApprovalRoles, setUserApprovalRoles] = useState<ApprovalRole[]>([]);
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const { logChange } = useAuditLog();

  // Check if current user can perform approvals at each level
  const canFirstApprove = userApprovalRoles.some(r => r.approval_level === "first_level") || hasRole("admin");
  const canSecondApprove = userApprovalRoles.some(r => r.approval_level === "second_level") || hasRole("admin");

  const fetchInvoices = async () => {
    try {
      // Fetch invoices with customer and approver info
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customers(company_name)
        `)
        .not("approval_status", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch approver profiles separately for each invoice that has approvers
      const invoicesWithApprovers = await Promise.all(
        (data || []).map(async (invoice) => {
          const result: Invoice = { ...invoice };

          // Fetch submitter info
          if (invoice.submitted_by) {
            const { data: submitter } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("user_id", invoice.submitted_by)
              .single();
            if (submitter) result.submitter = submitter;
          }

          // Fetch first approver info
          if (invoice.first_approver_id) {
            const { data: firstApprover } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("user_id", invoice.first_approver_id)
              .single();
            if (firstApprover) result.first_approver = firstApprover;
          }

          // Fetch second approver info
          if (invoice.second_approver_id) {
            const { data: secondApprover } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("user_id", invoice.second_approver_id)
              .single();
            if (secondApprover) result.second_approver = secondApprover;
          }

          return result;
        })
      );

      setInvoices(invoicesWithApprovers);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch invoices",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserApprovalRoles = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from("approval_roles")
        .select("user_id, approval_level")
        .eq("user_id", user.id);

      if (error) throw error;
      setUserApprovalRoles(data || []);
    } catch (error) {
      console.error("Failed to fetch approval roles:", error);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchUserApprovalRoles();
  }, [user?.id]);

  const sendApprovalNotification = async (invoiceId: string, action: "first_approval" | "second_approval" | "rejected", rejectionReason?: string) => {
    try {
      await supabase.functions.invoke("send-approval-notification", {
        body: {
          invoice_id: invoiceId,
          action,
          rejection_reason: rejectionReason,
        },
      });
    } catch (error) {
      console.error("Failed to send approval notification:", error);
      // Don't throw - email is secondary to the approval action
    }
  };

  const handleFirstApproval = async (invoice: Invoice) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          approval_status: "pending_second_approval",
          first_approver_id: user?.id,
          first_approved_at: new Date().toISOString(),
        })
        .eq("id", invoice.id);

      if (error) throw error;

      await logChange({
        table_name: "invoices",
        record_id: invoice.id,
        action: "update",
        old_data: { approval_status: "pending_first_approval" },
        new_data: { approval_status: "pending_second_approval", first_approver_id: user?.id },
      });

      // Send email notification
      await sendApprovalNotification(invoice.id, "first_approval");

      toast({
        title: "First Approval Complete",
        description: "Invoice has been forwarded for second approval. Submitter notified via email.",
      });
      fetchInvoices();
      setIsDetailDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve invoice",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSecondApproval = async (invoice: Invoice) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          approval_status: "approved",
          second_approver_id: user?.id,
          second_approved_at: new Date().toISOString(),
          status: "pending", // Move to normal invoice flow
        })
        .eq("id", invoice.id);

      if (error) throw error;

      await logChange({
        table_name: "invoices",
        record_id: invoice.id,
        action: "update",
        old_data: { approval_status: "pending_second_approval" },
        new_data: { approval_status: "approved", second_approver_id: user?.id },
      });

      // Send email notification
      await sendApprovalNotification(invoice.id, "second_approval");

      toast({
        title: "Invoice Approved",
        description: "Invoice has been fully approved and is now active. Submitter notified via email.",
      });
      fetchInvoices();
      setIsDetailDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve invoice",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedInvoice || !rejectionReason.trim()) {
      toast({
        title: "Validation Error",
        description: "Please provide a reason for rejection",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({
          approval_status: "rejected",
          rejection_reason: rejectionReason,
          status: "draft",
        })
        .eq("id", selectedInvoice.id);

      if (error) throw error;

      await logChange({
        table_name: "invoices",
        record_id: selectedInvoice.id,
        action: "update",
        old_data: { approval_status: selectedInvoice.approval_status },
        new_data: { approval_status: "rejected", rejection_reason: rejectionReason },
      });

      // Send email notification
      await sendApprovalNotification(selectedInvoice.id, "rejected", rejectionReason);

      toast({
        title: "Invoice Rejected",
        description: "The submitter has been notified via email",
      });
      setIsRejectDialogOpen(false);
      setIsDetailDialogOpen(false);
      setRejectionReason("");
      fetchInvoices();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject invoice",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const pendingFirst = invoices.filter(inv => inv.approval_status === "pending_first_approval");
  const pendingSecond = invoices.filter(inv => inv.approval_status === "pending_second_approval");
  const approved = invoices.filter(inv => inv.approval_status === "approved");
  const rejected = invoices.filter(inv => inv.approval_status === "rejected");

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.customers?.company_name?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === "pending") {
      return matchesSearch && (invoice.approval_status === "pending_first_approval" || invoice.approval_status === "pending_second_approval");
    } else if (statusFilter === "all") {
      return matchesSearch;
    }
    return matchesSearch && invoice.approval_status === statusFilter;
  });

  return (
    <DashboardLayout
      title="Invoice Approvals"
      subtitle="Review and approve invoices submitted by team members"
    >
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Pending 1st Approval", value: pendingFirst.length, icon: Clock, color: "bg-warning/10 text-warning" },
          { label: "Pending 2nd Approval", value: pendingSecond.length, icon: AlertCircle, color: "bg-info/10 text-info" },
          { label: "Approved Today", value: approved.filter(inv => 
            new Date(inv.second_approved_at || "").toDateString() === new Date().toDateString()
          ).length, icon: CheckCircle, color: "bg-success/10 text-success" },
          { label: "Rejected", value: rejected.length, icon: XCircle, color: "bg-destructive/10 text-destructive" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="glass-card p-4 flex items-center gap-4"
          >
            <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center`}>
              <stat.icon className="w-5 h-5" />
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

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48 bg-secondary/50 border-border/50">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">All Pending</SelectItem>
              <SelectItem value="pending_first_approval">Pending 1st</SelectItem>
              <SelectItem value="pending_second_approval">Pending 2nd</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={fetchInvoices}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Invoice Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No invoices to review</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.map((invoice) => {
                const statusInfo = approvalStatusConfig[invoice.approval_status || ""] || approvalStatusConfig.pending_first_approval;
                const StatusIcon = statusInfo.icon;

                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.customers?.company_name || "—"}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(invoice.total_amount)}</TableCell>
                    <TableCell>
                      <Badge className={statusInfo.className}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(invoice.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedInvoice(invoice);
                          setIsDetailDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Invoice Review - {selectedInvoice?.invoice_number}
            </DialogTitle>
            <DialogDescription>
              Review invoice details before approving or rejecting
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6 py-4">
              {/* Invoice Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedInvoice.customers?.company_name || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={approvalStatusConfig[selectedInvoice.approval_status || ""]?.className}>
                    {approvalStatusConfig[selectedInvoice.approval_status || ""]?.label}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Subtotal</p>
                  <p className="font-medium">{formatCurrency(selectedInvoice.amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Tax</p>
                  <p className="font-medium">{formatCurrency(selectedInvoice.tax_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="font-semibold text-lg">{formatCurrency(selectedInvoice.total_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className="font-medium">
                    {selectedInvoice.due_date 
                      ? format(new Date(selectedInvoice.due_date), "dd MMM yyyy")
                      : "—"}
                  </p>
                </div>
              </div>

              {selectedInvoice.notes && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedInvoice.notes}</p>
                </div>
              )}

              {/* Submitter Info */}
              {selectedInvoice.submitter && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Submitted By</p>
                  <p className="text-sm font-medium">{selectedInvoice.submitter.full_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedInvoice.submitter.email}</p>
                </div>
              )}

              {/* Approval Timeline */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Approval Timeline</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      selectedInvoice.first_approver_id ? "bg-success/20" : "bg-muted"
                    }`}>
                      {selectedInvoice.first_approver_id ? (
                        <CheckCheck className="w-3 h-3 text-success" />
                      ) : (
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">First Approval</p>
                      {selectedInvoice.first_approver ? (
                        <>
                          <p className="text-xs text-foreground">{selectedInvoice.first_approver.full_name}</p>
                          <p className="text-xs text-muted-foreground">{selectedInvoice.first_approver.email}</p>
                          <p className="text-xs text-success mt-1">
                            {format(new Date(selectedInvoice.first_approved_at!), "dd MMM yyyy 'at' HH:mm")}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Pending</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      selectedInvoice.second_approver_id ? "bg-success/20" : "bg-muted"
                    }`}>
                      {selectedInvoice.second_approver_id ? (
                        <CheckCheck className="w-3 h-3 text-success" />
                      ) : (
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Second Approval (Final)</p>
                      {selectedInvoice.second_approver ? (
                        <>
                          <p className="text-xs text-foreground">{selectedInvoice.second_approver.full_name}</p>
                          <p className="text-xs text-muted-foreground">{selectedInvoice.second_approver.email}</p>
                          <p className="text-xs text-success mt-1">
                            {format(new Date(selectedInvoice.second_approved_at!), "dd MMM yyyy 'at' HH:mm")}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Pending</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rejection Reason if rejected */}
              {selectedInvoice.approval_status === "rejected" && selectedInvoice.rejection_reason && (
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <p className="text-xs text-destructive mb-1">Rejection Reason</p>
                  <p className="text-sm">{selectedInvoice.rejection_reason}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {selectedInvoice?.approval_status === "pending_first_approval" && (
              <>
                {!canFirstApprove && (
                  <p className="text-xs text-muted-foreground w-full text-center mb-2">
                    You are not authorized to give first level approval
                  </p>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setIsRejectDialogOpen(true)}
                  disabled={processing || !canFirstApprove}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleFirstApproval(selectedInvoice)}
                  disabled={processing || !canFirstApprove}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {processing ? "Processing..." : "Approve (1st Level)"}
                </Button>
              </>
            )}
            {selectedInvoice?.approval_status === "pending_second_approval" && (
              <>
                {!canSecondApprove && (
                  <p className="text-xs text-muted-foreground w-full text-center mb-2">
                    You are not authorized to give final approval
                  </p>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setIsRejectDialogOpen(true)}
                  disabled={processing || !canSecondApprove}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject
                </Button>
                <Button
                  onClick={() => handleSecondApproval(selectedInvoice)}
                  disabled={processing || !canSecondApprove}
                >
                  <CheckCheck className="w-4 h-4 mr-2" />
                  {processing ? "Processing..." : "Final Approval"}
                </Button>
              </>
            )}
            {(selectedInvoice?.approval_status === "approved" || selectedInvoice?.approval_status === "rejected") && (
              <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Invoice</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this invoice
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Enter rejection reason..."
              rows={4}
              className="bg-secondary/50"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              {processing ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default InvoiceApprovalsPage;
