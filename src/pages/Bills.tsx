import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Search,
  CloudDownload,
  CloudUpload,
  MoreVertical,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Building2,
  Loader2,
  Pencil,
  Trash2,
  ArrowLeft,
  Upload,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";
import { format } from "date-fns";

interface LineItem {
  id: string;
  item_details: string;
  account: string;
  quantity: number;
  rate: number;
  vat_type: "none" | "inclusive" | "exclusive";
  customer_id: string;
}

interface Bill {
  id: string;
  bill_number: string | null;
  order_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  bill_date: string;
  due_date: string | null;
  payment_terms: string | null;
  subtotal: number;
  discount_pct: number;
  adjustment: number;
  tax_amount: number;
  amount: number;
  paid_amount: number;
  status: string;
  notes: string | null;
  line_items: LineItem[];
  attachment_url: string | null;
  zoho_bill_id: string | null;
  zoho_synced_at: string | null;
  created_at: string;
  vendors?: { company_name: string } | null;
}

interface Vendor { id: string; company_name: string; }
interface Customer { id: string; company_name: string; }

const PAYMENT_TERMS = [
  { value: "due_on_receipt", label: "Due on Receipt" },
  { value: "net_15",         label: "Net 15" },
  { value: "net_30",         label: "Net 30" },
  { value: "net_45",         label: "Net 45" },
  { value: "net_60",         label: "Net 60" },
];

const ACCOUNTS = [
  "Cost of Goods Sold",
  "Fuel/Mileage Expenses",
  "Repairs and Maintenance",
  "Salaries and Employee Wages",
  "Insurance",
  "Travel Expenses",
  "Office Supplies",
  "Advertising And Marketing",
  "Electricity and Gas",
  "Rent Expense",
  "Equipment Rental",
  "Tax Expense",
  "Interest Expense",
  "Commission Expense",
  "Miscellaneous Expenses",
];

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(n);

const statusConfig: Record<string, { label: string; icon: any; variant: string }> = {
  draft:   { label: "Draft",   icon: Clock,         variant: "secondary" },
  open:    { label: "Open",    icon: AlertTriangle, variant: "warning" },
  partial: { label: "Partial", icon: Clock,         variant: "secondary" },
  paid:    { label: "Paid",    icon: CheckCircle,   variant: "success" },
  overdue: { label: "Overdue", icon: XCircle,       variant: "destructive" },
  void:    { label: "Void",    icon: XCircle,       variant: "secondary" },
};

const newLineItem = (): LineItem => ({
  id: crypto.randomUUID(),
  item_details: "",
  account: "",
  quantity: 1,
  rate: 0,
  vat_type: "none" as const,
  customer_id: "",
});

const emptyForm = () => ({
  bill_number: "",
  order_number: "",
  vendor_id: "",
  bill_date: format(new Date(), "yyyy-MM-dd"),
  due_date: format(new Date(), "yyyy-MM-dd"),
  payment_terms: "due_on_receipt",
  discount_pct: "0",
  adjustment: "0",
  notes: "",
  line_items: [newLineItem()],
  attachment_url: "",
});

const Bills = () => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [fetchingZoho, setFetchingZoho] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // view: "list" | "create" | "edit"
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [formData, setFormData] = useState(emptyForm());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const canManage = hasAnyRole(["admin", "operations"]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [billsRes, vendorsRes, customersRes] = await Promise.all([
        (supabase as any).from("bills").select("*, vendors:vendor_id(company_name)").order("bill_date", { ascending: false }),
        supabase.from("partners").select("id, company_name").order("company_name"),
        supabase.from("customers").select("id, company_name").order("company_name"),
      ]);
      setBills(billsRes.data || []);
      setVendors(vendorsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch {
      toast({ title: "Failed to load bills", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingBill(null);
  };

  const openCreate = () => { resetForm(); setView("create"); };

  const openEdit = (bill: Bill) => {
    setEditingBill(bill);
    setFormData({
      bill_number: bill.bill_number || "",
      order_number: bill.order_number || "",
      vendor_id: bill.vendor_id || "",
      bill_date: bill.bill_date,
      due_date: bill.due_date || format(new Date(), "yyyy-MM-dd"),
      payment_terms: bill.payment_terms || "due_on_receipt",
      discount_pct: String(bill.discount_pct ?? 0),
      adjustment: String(bill.adjustment ?? 0),
      notes: bill.notes || "",
      line_items: bill.line_items?.length ? bill.line_items : [newLineItem()],
      attachment_url: bill.attachment_url || "",
    });
    setView("edit");
  };

  // ── line item helpers ──────────────────────────────────────────
  const updateLine = (id: string, field: keyof LineItem, value: any) => {
    setFormData(p => ({ ...p, line_items: p.line_items.map(l => l.id === id ? { ...l, [field]: value } : l) }));
  };
  const addLine = () => setFormData(p => ({ ...p, line_items: [...p.line_items, newLineItem()] }));
  const removeLine = (id: string) => setFormData(p => ({ ...p, line_items: p.line_items.filter(l => l.id !== id) }));

  // ── totals ─────────────────────────────────────────────────────
  const subtotal = formData.line_items.reduce((s, l) => s + (Number(l.quantity) * Number(l.rate)), 0);
  const taxAmount = formData.line_items.reduce((s, l) => {
    const lineTotal = Number(l.quantity) * Number(l.rate);
    if (l.vat_type === "exclusive") return s + lineTotal * 0.075;
    return s; // inclusive VAT is embedded; none = 0
  }, 0);
  const discountAmt = subtotal * (Number(formData.discount_pct) / 100);
  const total = subtotal + taxAmount - discountAmt + Number(formData.adjustment);

  // ── file upload ────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast({ title: "File too large (max 10MB)", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `bills/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("expense-receipts").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("expense-receipts").getPublicUrl(path);
      setFormData(p => ({ ...p, attachment_url: publicUrl }));
      toast({ title: "File attached" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // ── save ───────────────────────────────────────────────────────
  const handleSubmit = async (asDraft = false) => {
    if (!formData.vendor_id || !formData.bill_date) {
      toast({ title: "Vendor and bill date are required.", variant: "destructive" }); return;
    }
    if (formData.line_items.every(l => !l.item_details && !l.rate)) {
      toast({ title: "Add at least one line item.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const vendor = vendors.find(v => v.id === formData.vendor_id);
      const payload: any = {
        bill_number: formData.bill_number || null,
        order_number: formData.order_number || null,
        vendor_id: formData.vendor_id,
        vendor_name: vendor?.company_name || null,
        bill_date: formData.bill_date,
        due_date: formData.due_date || null,
        payment_terms: formData.payment_terms,
        subtotal,
        tax_amount: taxAmount,
        discount_pct: Number(formData.discount_pct),
        adjustment: Number(formData.adjustment),
        amount: total,
        line_items: formData.line_items,
        notes: formData.notes || null,
        attachment_url: formData.attachment_url || null,
        status: asDraft ? "draft" : (editingBill?.status === "paid" ? "paid" : "open"),
      };

      if (editingBill) {
        const { error } = await (supabase as any).from("bills").update(payload).eq("id", editingBill.id);
        if (error) throw error;
        await logChange({ table_name: "bills", record_id: editingBill.id, action: "update", new_data: payload });
        toast({ title: "Bill updated" });
      } else {
        const { data, error } = await (supabase as any).from("bills").insert({ ...payload, paid_amount: 0, created_by: user?.id }).select().single();
        if (error) throw error;
        await logChange({ table_name: "bills", record_id: data.id, action: "insert", new_data: payload });
        toast({ title: asDraft ? "Bill saved as draft" : "Bill created" });
      }
      setView("list");
      resetForm();
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const markAsPaid = async (bill: Bill) => {
    await (supabase as any).from("bills").update({ status: "paid", paid_amount: bill.amount, paid_date: new Date().toISOString().split("T")[0] }).eq("id", bill.id);
    toast({ title: "Bill marked as paid" });
    fetchData();
  };

  const syncToZoho = async (billId: string) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("zoho-sync", { body: { action: "sync_bill", billId } });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error);
      toast({ title: "Bill synced to Zoho" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Zoho sync failed", description: err.message, variant: "destructive" });
    } finally { setSyncing(false); }
  };

  const fetchFromZoho = async () => {
    setFetchingZoho(true);
    try {
      const { data, error } = await supabase.functions.invoke("zoho-sync", { body: { action: "fetch_bills" } });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error);
      toast({ title: "Bills pulled from Zoho", description: `${data?.upserted ?? 0} bill(s) imported.` });
      fetchData();
    } catch (err: any) {
      toast({ title: "Zoho fetch failed", description: err.message, variant: "destructive" });
    } finally { setFetchingZoho(false); }
  };

  const filteredBills = bills.filter(b => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || (b.vendors?.company_name || b.vendor_name || "").toLowerCase().includes(q) || (b.bill_number || "").toLowerCase().includes(q);
    return matchesSearch && (statusFilter === "all" || b.status === statusFilter);
  });

  const totalOpen = bills.filter(b => b.status === "open" || b.status === "partial").reduce((s, b) => s + (b.amount - b.paid_amount), 0);
  const totalPaid = bills.filter(b => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const overdue   = bills.filter(b => b.status === "open" && b.due_date && new Date(b.due_date) < new Date()).length;

  // ─────────────────────────────────────────────────────────────────
  // CREATE / EDIT FORM VIEW
  // ─────────────────────────────────────────────────────────────────
  if (view === "create" || view === "edit") {
    return (
      <DashboardLayout title={editingBill ? "Edit Bill" : "New Bill"} subtitle="">
        <div className="max-w-5xl mx-auto">
          {/* Back */}
          <button onClick={() => { setView("list"); resetForm(); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Back to Bills
          </button>

          <div className="glass-card p-6 space-y-6">
            {/* Header fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Vendor */}
              <div className="space-y-2 sm:col-span-2">
                <Label>Vendor Name *</Label>
                <Select value={formData.vendor_id} onValueChange={v => setFormData(p => ({ ...p, vendor_id: v }))}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue placeholder="Select a Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.company_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {/* Bill # */}
              <div className="space-y-2">
                <Label>Bill # *</Label>
                <Input placeholder="e.g. BILL-2026-001" value={formData.bill_number}
                  onChange={e => setFormData(p => ({ ...p, bill_number: e.target.value }))} className="bg-secondary/50" />
              </div>
              {/* Order Number */}
              <div className="space-y-2">
                <Label>Order Number</Label>
                <Input placeholder="Purchase order reference" value={formData.order_number}
                  onChange={e => setFormData(p => ({ ...p, order_number: e.target.value }))} className="bg-secondary/50" />
              </div>
              {/* Bill Date */}
              <div className="space-y-2">
                <Label>Bill Date *</Label>
                <Input type="date" value={formData.bill_date}
                  onChange={e => setFormData(p => ({ ...p, bill_date: e.target.value }))} className="bg-secondary/50" />
              </div>
              {/* Due Date + Payment Terms */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={formData.due_date}
                    onChange={e => setFormData(p => ({ ...p, due_date: e.target.value }))} className="bg-secondary/50" />
                </div>
                <div className="space-y-2">
                  <Label>Payment Terms</Label>
                  <Select value={formData.payment_terms} onValueChange={v => setFormData(p => ({ ...p, payment_terms: v }))}>
                    <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <hr className="border-border/50" />

            {/* Item Table */}
            <div>
              <h3 className="font-medium text-sm mb-3">Item Table</h3>
              <div className="overflow-x-auto rounded-md border border-border/50">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[28%]">Item Details</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[18%]">Account</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground w-[8%]">Qty</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[10%]">Rate (₦)</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[12%]">VAT</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[18%]">Customer</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground w-[8%]">Amount</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.line_items.map((line, idx) => {
                      const lineTotal = Number(line.quantity) * Number(line.rate);
                      return (
                        <tr key={line.id} className="border-t border-border/30">
                          <td className="px-2 py-1.5">
                            <Input value={line.item_details} placeholder="Type or describe item"
                              onChange={e => updateLine(line.id, "item_details", e.target.value)}
                              className="bg-transparent border-0 shadow-none focus-visible:ring-0 px-1 text-sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={line.account} onValueChange={v => updateLine(line.id, "account", v)}>
                              <SelectTrigger className="bg-transparent border-0 shadow-none focus:ring-0 text-sm h-8">
                                <SelectValue placeholder="Select account" />
                              </SelectTrigger>
                              <SelectContent>
                                {ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" value={line.quantity} min={1}
                              onChange={e => updateLine(line.id, "quantity", e.target.value)}
                              className="bg-transparent border-0 shadow-none focus-visible:ring-0 text-center px-1 text-sm w-16" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" value={line.rate} min={0}
                              onChange={e => updateLine(line.id, "rate", e.target.value)}
                              className="bg-transparent border-0 shadow-none focus-visible:ring-0 text-right px-1 text-sm" />
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={line.vat_type} onValueChange={v => updateLine(line.id, "vat_type", v)}>
                              <SelectTrigger className="bg-transparent border-0 shadow-none focus:ring-0 text-sm h-8 min-w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No VAT</SelectItem>
                                <SelectItem value="inclusive">VAT Inclusive</SelectItem>
                                <SelectItem value="exclusive">VAT Exclusive</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5">
                            <Select value={line.customer_id} onValueChange={v => updateLine(line.id, "customer_id", v)}>
                              <SelectTrigger className="bg-transparent border-0 shadow-none focus:ring-0 text-sm h-8">
                                <SelectValue placeholder="Select Customer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                            {formatCurrency(lineTotal)}
                          </td>
                          <td className="px-1 py-1.5">
                            {formData.line_items.length > 1 && (
                              <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-destructive">
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button onClick={addLine} className="mt-3 flex items-center gap-1.5 text-sm text-primary hover:underline">
                <Plus className="w-4 h-4" /> Add New Row
              </button>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full sm:w-80 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sub Total</span>
                  <span className="font-medium tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="tabular-nums">{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Discount</span>
                  <div className="flex items-center gap-1">
                    <Input type="number" value={formData.discount_pct} min={0} max={100}
                      onChange={e => setFormData(p => ({ ...p, discount_pct: e.target.value }))}
                      className="w-20 h-7 text-right bg-secondary/50 text-sm" />
                    <span className="text-muted-foreground">%</span>
                    <span className="tabular-nums w-24 text-right">{formatCurrency(discountAmt)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Input value="Adjustment" readOnly className="w-28 h-7 bg-secondary/30 border-dashed text-sm text-muted-foreground" />
                  <div className="flex items-center gap-1">
                    <Input type="number" value={formData.adjustment}
                      onChange={e => setFormData(p => ({ ...p, adjustment: e.target.value }))}
                      className="w-24 h-7 text-right bg-secondary/50 text-sm" />
                    <span className="tabular-nums w-24 text-right">{formatCurrency(Number(formData.adjustment))}</span>
                  </div>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-bold text-base">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            <hr className="border-border/50" />

            {/* Notes + Attachment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Notes (will not be shown on PDF)"
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  className="bg-secondary/50 min-h-[100px]" />
                <p className="text-xs text-muted-foreground">It will not be shown in PDF</p>
              </div>
              <div className="space-y-2">
                <Label>Attach File(s) to Bill</Label>
                <div className="border-2 border-dashed border-border/50 rounded-lg p-4 text-center">
                  {formData.attachment_url ? (
                    <div className="flex items-center justify-between">
                      <a href={formData.attachment_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline truncate max-w-[200px]">
                        View attachment
                      </a>
                      <button onClick={() => setFormData(p => ({ ...p, attachment_url: "" }))} className="text-muted-foreground hover:text-destructive ml-2">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                        Upload File
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">Max 10MB per file</p>
                    </>
                  )}
                </div>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} />
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setView("list"); resetForm(); }}>Cancel</Button>
              <Button variant="outline" onClick={() => handleSubmit(true)} disabled={saving}>Save as Draft</Button>
              <Button onClick={() => handleSubmit(false)} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingBill ? "Save Changes" : "Save Bill"}
              </Button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout title="Bills" subtitle="Manage vendor bills and supplier invoices">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[
          { label: "Outstanding",    value: formatCurrency(totalOpen), color: "text-warning" },
          { label: "Paid (All Time)", value: formatCurrency(totalPaid), color: "text-success" },
          { label: "Overdue",        value: String(overdue), color: overdue > 0 ? "text-destructive" : "text-foreground" },
          { label: "Total Bills",    value: String(bills.length), color: "text-foreground" },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }} className="glass-card p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-xl font-bold font-heading ${s.color}`}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search vendor or bill #..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 bg-secondary/50" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 bg-secondary/50"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              {["all","open","partial","paid","overdue","draft","void"].map(s => (
                <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={fetchFromZoho} disabled={fetchingZoho}>
              {fetchingZoho ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CloudDownload className="w-4 h-4 mr-2" />}
              Pull from Zoho
            </Button>
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-2" /> New Bill
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Bill #</TableHead>
                <TableHead>Bill Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Zoho</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading bills...</TableCell></TableRow>
              ) : filteredBills.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No bills found</TableCell></TableRow>
              ) : filteredBills.map(bill => {
                const cfg = statusConfig[bill.status] || statusConfig.open;
                const StatusIcon = cfg.icon;
                const balance = bill.amount - bill.paid_amount;
                const isOverdue = bill.due_date && bill.status !== "paid" && new Date(bill.due_date) < new Date();
                return (
                  <TableRow key={bill.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{bill.vendors?.company_name || bill.vendor_name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{bill.bill_number || "—"}</TableCell>
                    <TableCell className="text-sm">{format(new Date(bill.bill_date), "dd MMM yyyy")}</TableCell>
                    <TableCell className={`text-sm ${isOverdue ? "text-destructive font-medium" : ""}`}>
                      {bill.due_date ? format(new Date(bill.due_date), "dd MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">{formatCurrency(bill.amount)}</TableCell>
                    <TableCell className="text-right text-sm text-success">{bill.paid_amount > 0 ? formatCurrency(bill.paid_amount) : "—"}</TableCell>
                    <TableCell className="text-right text-sm">
                      <span className={balance > 0 ? "text-warning font-medium" : "text-muted-foreground"}>
                        {balance > 0 ? formatCurrency(balance) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant as any} className="flex items-center gap-1 w-fit text-xs">
                        <StatusIcon className="w-3 h-3" />{cfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {bill.zoho_bill_id
                        ? <span className="text-xs text-success flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Synced</span>
                        : <span className="text-xs text-muted-foreground">Not synced</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canManage && <DropdownMenuItem onClick={() => openEdit(bill)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>}
                          {canManage && bill.status !== "paid" && <DropdownMenuItem onClick={() => markAsPaid(bill)}><CheckCircle className="w-4 h-4 mr-2" /> Mark as Paid</DropdownMenuItem>}
                          <DropdownMenuItem onClick={() => syncToZoho(bill.id)} disabled={syncing}>
                            <CloudUpload className="w-4 h-4 mr-2" />{bill.zoho_bill_id ? "Re-sync to Zoho" : "Sync to Zoho"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default Bills;
