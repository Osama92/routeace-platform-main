import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Filter,
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
  Building2,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useAuditLog } from "@/hooks/useAuditLog";

interface VendorPayable {
  id: string;
  partner_id: string;
  dispatch_id: string | null;
  expense_id: string | null;
  invoice_number: string | null;
  amount: number;
  due_date: string | null;
  status: string;
  paid_amount: number;
  paid_date: string | null;
  payment_reference: string | null;
  notes: string | null;
  created_at: string;
  partners?: { company_name: string };
  dispatches?: { dispatch_number: string } | null;
}

interface Partner {
  id: string;
  company_name: string;
}

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-warning/15 text-warning" },
  partial: { label: "Partial", icon: AlertTriangle, className: "bg-info/15 text-info" },
  paid: { label: "Paid", icon: CheckCircle, className: "bg-success/15 text-success" },
  cancelled: { label: "Cancelled", icon: AlertTriangle, className: "bg-muted text-muted-foreground" },
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const VendorPayables = () => {
  const [payables, setPayables] = useState<VendorPayable[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [selectedPayable, setSelectedPayable] = useState<VendorPayable | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const canManage = hasAnyRole(["admin", "operations"]);

  const [formData, setFormData] = useState({
    partner_id: "",
    invoice_number: "",
    amount: "",
    due_date: "",
    notes: "",
  });

  const [paymentData, setPaymentData] = useState({
    paid_amount: "",
    payment_reference: "",
    notes: "",
  });

  const fetchPayables = async () => {
    try {
      const { data, error } = await supabase
        .from("vendor_payables")
        .select(`
          *,
          partners(company_name),
          dispatches(dispatch_number)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPayables(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch payables",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPartners = async () => {
    const { data } = await supabase
      .from("partners")
      .select("id, company_name")
      .eq("partner_type", "vendor")
      .order("company_name");
    setPartners(data || []);
  };

  useEffect(() => {
    fetchPayables();
    fetchPartners();
  }, []);

  const handleCreatePayable = async () => {
    if (!formData.partner_id || !formData.amount) {
      toast({
        title: "Validation Error",
        description: "Please fill in vendor and amount",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const insertData = {
        partner_id: formData.partner_id,
        invoice_number: formData.invoice_number || null,
        amount: parseFloat(formData.amount),
        due_date: formData.due_date || null,
        notes: formData.notes || null,
        created_by: user?.id,
      };

      const { data, error } = await supabase.from("vendor_payables").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "vendor_payables",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: "Success",
        description: "Payable created successfully",
      });
      setIsDialogOpen(false);
      setFormData({ partner_id: "", invoice_number: "", amount: "", due_date: "", notes: "" });
      fetchPayables();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create payable",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!selectedPayable || !paymentData.paid_amount) {
      toast({
        title: "Validation Error",
        description: "Please enter payment amount",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const paidAmount = parseFloat(paymentData.paid_amount);
      const totalPaid = selectedPayable.paid_amount + paidAmount;
      const newStatus = totalPaid >= selectedPayable.amount ? "paid" : "partial";

      const updateData = {
        paid_amount: totalPaid,
        status: newStatus,
        paid_date: new Date().toISOString(),
        payment_reference: paymentData.payment_reference || null,
        notes: paymentData.notes ? `${selectedPayable.notes || ""}\n${paymentData.notes}` : selectedPayable.notes,
      };

      const { error } = await supabase
        .from("vendor_payables")
        .update(updateData)
        .eq("id", selectedPayable.id);

      if (error) throw error;

      // Log the payment update
      await logChange({
        table_name: "vendor_payables",
        record_id: selectedPayable.id,
        action: "update",
        old_data: { status: selectedPayable.status, paid_amount: selectedPayable.paid_amount },
        new_data: updateData,
      });

      toast({
        title: "Payment Recorded",
        description: newStatus === "paid" ? "Payable marked as fully paid" : "Partial payment recorded",
      });
      setIsPayDialogOpen(false);
      setSelectedPayable(null);
      setPaymentData({ paid_amount: "", payment_reference: "", notes: "" });
      fetchPayables();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const filteredPayables = payables.filter((p) => {
    const matchesSearch =
      p.partners?.company_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totals = {
    total: payables.reduce((sum, p) => sum + p.amount, 0),
    pending: payables.filter((p) => p.status === "pending").reduce((sum, p) => sum + (p.amount - p.paid_amount), 0),
    paid: payables.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0),
    partial: payables.filter((p) => p.status === "partial").reduce((sum, p) => sum + p.paid_amount, 0),
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Vendor Payables Report", 105, 20, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, 105, 28, { align: "center" });

    doc.setFontSize(12);
    doc.text(`Total Payables: ${formatCurrency(totals.total)}`, 14, 42);
    doc.text(`Pending: ${formatCurrency(totals.pending)}`, 14, 49);
    doc.text(`Paid: ${formatCurrency(totals.paid)}`, 14, 56);

    const tableData = filteredPayables.map((p) => [
      p.partners?.company_name || "N/A",
      p.invoice_number || "N/A",
      formatCurrency(p.amount),
      formatCurrency(p.paid_amount),
      formatCurrency(p.amount - p.paid_amount),
      p.status,
      p.due_date ? format(new Date(p.due_date), "dd/MM/yyyy") : "N/A",
    ]);

    autoTable(doc, {
      startY: 65,
      head: [["Vendor", "Invoice #", "Amount", "Paid", "Balance", "Status", "Due Date"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });

    doc.save("vendor-payables-report.pdf");
  };

  return (
    <DashboardLayout
      title="Vendor Payables"
      subtitle="Track and manage payments to vendors"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Payables", value: formatCurrency(totals.total), icon: DollarSign, color: "text-foreground" },
          { label: "Pending", value: formatCurrency(totals.pending), icon: Clock, color: "text-warning" },
          { label: "Paid", value: formatCurrency(totals.paid), icon: CheckCircle, color: "text-success" },
          { label: "Outstanding", value: payables.filter(p => p.status !== "paid").length, icon: AlertTriangle, color: "text-destructive" },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass-card p-5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search payables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Payable
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Vendor Payable</DialogTitle>
                  <DialogDescription>Record a new payable to a vendor</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label>Vendor *</Label>
                    <Select value={formData.partner_id} onValueChange={(v) => setFormData(prev => ({ ...prev, partner_id: v }))}>
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        {partners.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Invoice Number</Label>
                      <Input
                        value={formData.invoice_number}
                        onChange={(e) => setFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
                        placeholder="VND-001"
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Amount *</Label>
                      <Input
                        type="number"
                        value={formData.amount}
                        onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                        placeholder="0.00"
                        className="bg-secondary/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                      className="bg-secondary/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Additional notes..."
                      className="bg-secondary/50"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreatePayable} disabled={saving}>
                    {saving ? "Creating..." : "Create Payable"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Payables Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50">
              <TableHead>Vendor</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredPayables.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No payables found
                </TableCell>
              </TableRow>
            ) : (
              filteredPayables.map((payable) => {
                const balance = payable.amount - payable.paid_amount;
                const config = statusConfig[payable.status];
                const StatusIcon = config?.icon || Clock;
                return (
                  <TableRow key={payable.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{payable.partners?.company_name || "N/A"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{payable.invoice_number || "-"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(payable.amount)}</TableCell>
                    <TableCell className="text-right text-success">{formatCurrency(payable.paid_amount)}</TableCell>
                    <TableCell className="text-right text-warning">{formatCurrency(balance)}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={config?.className}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config?.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payable.due_date ? format(new Date(payable.due_date), "dd MMM yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      {payable.status !== "paid" && canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedPayable(payable);
                            setPaymentData({ paid_amount: String(balance), payment_reference: "", notes: "" });
                            setIsPayDialogOpen(true);
                          }}
                        >
                          Pay
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Payment Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Mark payment for {selectedPayable?.partners?.company_name}
              <br />
              Outstanding: {formatCurrency((selectedPayable?.amount || 0) - (selectedPayable?.paid_amount || 0))}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Payment Amount *</Label>
              <Input
                type="number"
                value={paymentData.paid_amount}
                onChange={(e) => setPaymentData(prev => ({ ...prev, paid_amount: e.target.value }))}
                placeholder="0.00"
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Reference</Label>
              <Input
                value={paymentData.payment_reference}
                onChange={(e) => setPaymentData(prev => ({ ...prev, payment_reference: e.target.value }))}
                placeholder="e.g., Bank transfer ref..."
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={paymentData.notes}
                onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Payment notes..."
                className="bg-secondary/50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkAsPaid} disabled={saving}>
              {saving ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default VendorPayables;
