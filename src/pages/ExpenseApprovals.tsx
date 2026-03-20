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
  CircleDollarSign,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCheck,
  Package,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format } from "date-fns";

interface Expense {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  vendor_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  is_cogs: boolean;
  notes: string | null;
  receipt_url: string | null;
  approval_status: string | null;
  created_at: string;
  submitted_by: string | null;
  first_approver_id: string | null;
  first_approved_at: string | null;
  second_approver_id: string | null;
  second_approved_at: string | null;
  rejection_reason: string | null;
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

const getStatusConfig = (status: string | null) => {
  if (!status) return approvalStatusConfig.pending_first_approval;
  return approvalStatusConfig[status] || approvalStatusConfig.pending_first_approval;
};

const formatCategory = (category: string) => {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const ExpenseApprovalsPage = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [userApprovalRoles, setUserApprovalRoles] = useState<ApprovalRole[]>([]);
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const { logChange } = useAuditLog();

  const canFirstApprove = userApprovalRoles.some(r => r.approval_level === "first_level") || hasRole("admin");
  const canSecondApprove = userApprovalRoles.some(r => r.approval_level === "second_level") || hasRole("admin");

  const fetchExpenses = async () => {
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .not("approval_status", "is", null)
        .neq("approval_status", "draft")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Collect all unique user IDs across submitted_by, first_approver_id, second_approver_id
      const userIds = [...new Set(
        (data || []).flatMap((e: any) => [e.submitted_by, e.first_approver_id, e.second_approver_id].filter(Boolean))
      )];

      // Single batch profile lookup — 1 query instead of N*3
      const profileMap = new Map<string, { full_name: string; email: string }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        (profiles || []).forEach((p: any) => profileMap.set(p.user_id, { full_name: p.full_name, email: p.email }));
      }

      const enriched: Expense[] = (data || []).map((e: any) => ({
        ...e,
        submitter: e.submitted_by ? profileMap.get(e.submitted_by) : undefined,
        first_approver: e.first_approver_id ? profileMap.get(e.first_approver_id) : undefined,
        second_approver: e.second_approver_id ? profileMap.get(e.second_approver_id) : undefined,
      }));

      setExpenses(enriched);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch expenses",
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
    fetchExpenses();
    fetchUserApprovalRoles();

    // Realtime: auto-refresh when any expense approval_status changes
    const channel = supabase
      .channel("expense-approvals-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        fetchExpenses();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const sendApprovalNotification = async (expenseId: string, action: "first_approval" | "second_approval" | "rejected", reason?: string) => {
    try {
      await supabase.functions.invoke("send-approval-notification", {
        body: {
          expense_id: expenseId,
          action,
          rejection_reason: reason,
        },
      });
    } catch (error) {
      console.error("Failed to send approval notification:", error);
    }
  };

  const handleFirstApproval = async (expense: Expense) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("expenses")
        .update({
          approval_status: "pending_second_approval",
          first_approver_id: user?.id,
          first_approved_at: new Date().toISOString(),
        })
        .eq("id", expense.id);

      if (error) throw error;

      await logChange({
        table_name: "expenses",
        record_id: expense.id,
        action: "update",
        old_data: { approval_status: "pending_first_approval" },
        new_data: { approval_status: "pending_second_approval", first_approver_id: user?.id },
      });

      await sendApprovalNotification(expense.id, "first_approval");

      toast({
        title: "First Approval Complete",
        description: "Expense has been forwarded for second approval.",
      });
      fetchExpenses();
      setIsDetailDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve expense",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleSecondApproval = async (expense: Expense) => {
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("expenses")
        .update({
          approval_status: "approved",
          second_approver_id: user?.id,
          second_approved_at: new Date().toISOString(),
        })
        .eq("id", expense.id);

      if (error) throw error;

      await logChange({
        table_name: "expenses",
        record_id: expense.id,
        action: "update",
        old_data: { approval_status: "pending_second_approval" },
        new_data: { approval_status: "approved", second_approver_id: user?.id },
      });

      await sendApprovalNotification(expense.id, "second_approval");

      toast({
        title: "Expense Approved",
        description: "Expense has been fully approved and can now be synced to Zoho.",
      });
      fetchExpenses();
      setIsDetailDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to approve expense",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedExpense || !rejectionReason.trim()) {
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
        .from("expenses")
        .update({
          approval_status: "rejected",
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedExpense.id);

      if (error) throw error;

      await logChange({
        table_name: "expenses",
        record_id: selectedExpense.id,
        action: "update",
        old_data: { approval_status: selectedExpense.approval_status },
        new_data: { approval_status: "rejected", rejection_reason: rejectionReason },
      });

      await sendApprovalNotification(selectedExpense.id, "rejected", rejectionReason);

      toast({
        title: "Expense Rejected",
        description: "The submitter has been notified.",
      });
      setIsRejectDialogOpen(false);
      setIsDetailDialogOpen(false);
      setRejectionReason("");
      fetchExpenses();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject expense",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  // Calculate stats
  const pendingFirst = expenses.filter(exp => exp.approval_status === "pending_first_approval");
  const pendingSecond = expenses.filter(exp => exp.approval_status === "pending_second_approval");
  const approved = expenses.filter(exp => exp.approval_status === "approved");
  const rejected = expenses.filter(exp => exp.approval_status === "rejected");

  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch = expense.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expense.category.toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === "all") return matchesSearch;

    if (statusFilter === "pending") {
      return matchesSearch && (
        expense.approval_status === "pending_first_approval" ||
        expense.approval_status === "pending_second_approval"
      );
    }

    return matchesSearch && expense.approval_status === statusFilter;
  });

  return (
    <DashboardLayout
      title="Expense Approvals"
      subtitle="Review and approve expenses submitted by team members"
    >
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Pending 1st Approval", value: pendingFirst.length, icon: Clock, color: "bg-warning/10 text-warning" },
          { label: "Pending 2nd Approval", value: pendingSecond.length, icon: AlertCircle, color: "bg-info/10 text-info" },
          { label: "Approved", value: approved.length, icon: CheckCircle, color: "bg-success/10 text-success" },
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
              placeholder="Search expenses..."
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
        <Button variant="outline" onClick={fetchExpenses}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Expense Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="text-center py-12">
          <CircleDollarSign className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No expenses to review</p>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense) => {
                const statusInfo = getStatusConfig(expense.approval_status);
                const StatusIcon = statusInfo.icon;

                return (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">
                      {format(new Date(expense.expense_date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="capitalize">{formatCategory(expense.category)}</TableCell>
                    <TableCell>{expense.description}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          expense.is_cogs
                            ? "bg-destructive/15 text-destructive"
                            : "bg-info/15 text-info"
                        }`}
                      >
                        {expense.is_cogs ? "COGS" : "OPEX"}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">{formatCurrency(expense.amount)}</TableCell>
                    <TableCell>
                      <Badge className={statusInfo.className}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedExpense(expense);
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
              Expense Review - {selectedExpense?.description}
            </DialogTitle>
            <DialogDescription>
              Review expense details before approving or rejecting
            </DialogDescription>
          </DialogHeader>

          {selectedExpense && (
            <div className="space-y-6 py-4">
              {/* Expense Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium capitalize">{formatCategory(selectedExpense.category)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={getStatusConfig(selectedExpense.approval_status).className}>
                    {getStatusConfig(selectedExpense.approval_status).label}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-semibold text-lg">{formatCurrency(selectedExpense.amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {format(new Date(selectedExpense.expense_date), "dd MMM yyyy")}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      selectedExpense.is_cogs
                        ? "bg-destructive/15 text-destructive"
                        : "bg-info/15 text-info"
                    }`}
                  >
                    {selectedExpense.is_cogs ? "COGS" : "OPEX"}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="font-medium">{selectedExpense.description}</p>
                </div>
              </div>

              {selectedExpense.notes && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{selectedExpense.notes}</p>
                </div>
              )}

              {selectedExpense.receipt_url && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Receipt</p>
                  <a
                    href={selectedExpense.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    View Receipt
                  </a>
                </div>
              )}

              {/* Submitter Info */}
              {selectedExpense.submitter && (
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Submitted By</p>
                  <p className="text-sm font-medium">{selectedExpense.submitter.full_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedExpense.submitter.email}</p>
                </div>
              )}

              {/* Approval Timeline */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Approval Timeline</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      selectedExpense.first_approver_id ? "bg-success/20" : "bg-muted"
                    }`}>
                      {selectedExpense.first_approver_id ? (
                        <CheckCheck className="w-3 h-3 text-success" />
                      ) : (
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">First Approval</p>
                      {selectedExpense.first_approver ? (
                        <>
                          <p className="text-xs text-foreground">{selectedExpense.first_approver.full_name}</p>
                          <p className="text-xs text-muted-foreground">{selectedExpense.first_approver.email}</p>
                          <p className="text-xs text-success mt-1">
                            {format(new Date(selectedExpense.first_approved_at!), "dd MMM yyyy 'at' HH:mm")}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">Pending</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/20">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      selectedExpense.second_approver_id ? "bg-success/20" : "bg-muted"
                    }`}>
                      {selectedExpense.second_approver_id ? (
                        <CheckCheck className="w-3 h-3 text-success" />
                      ) : (
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Second Approval (Final)</p>
                      {selectedExpense.second_approver ? (
                        <>
                          <p className="text-xs text-foreground">{selectedExpense.second_approver.full_name}</p>
                          <p className="text-xs text-muted-foreground">{selectedExpense.second_approver.email}</p>
                          <p className="text-xs text-success mt-1">
                            {format(new Date(selectedExpense.second_approved_at!), "dd MMM yyyy 'at' HH:mm")}
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
              {selectedExpense.approval_status === "rejected" && selectedExpense.rejection_reason && (
                <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <p className="text-xs text-destructive mb-1">Rejection Reason</p>
                  <p className="text-sm">{selectedExpense.rejection_reason}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 flex-wrap">
            {selectedExpense?.approval_status === "pending_first_approval" && (
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
                  onClick={() => handleFirstApproval(selectedExpense)}
                  disabled={processing || !canFirstApprove}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {processing ? "Processing..." : "Approve (1st Level)"}
                </Button>
              </>
            )}
            {selectedExpense?.approval_status === "pending_second_approval" && (
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
                  onClick={() => handleSecondApproval(selectedExpense)}
                  disabled={processing || !canSecondApprove}
                >
                  <CheckCheck className="w-4 h-4 mr-2" />
                  {processing ? "Processing..." : "Final Approval"}
                </Button>
              </>
            )}
            {(selectedExpense?.approval_status === "approved" || selectedExpense?.approval_status === "rejected") && (
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
            <DialogTitle>Reject Expense</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this expense
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

export default ExpenseApprovalsPage;
