import { useState, useEffect, useMemo, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  Filter,
  Download,
  FileText,
  Send,
  MoreVertical,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  Plus,
  RefreshCw,
  CloudUpload,
  Trash2,
  MapPin,
  Fuel,
  CircleDollarSign,
  Loader2,
  Truck,
  Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAuditLog } from "@/hooks/useAuditLog";

// Line item types
interface LineItem {
  id: string;
  type: "delivery" | "extra_drop" | "fuel" | "toll";
  description: string;
  quantity: number;
  price: number;
  location?: string;
  tonnage?: string;
  vatType?: "none" | "inclusive" | "exclusive";
  serviceCharge?: number;
  serviceChargeVat?: "none" | "inclusive" | "exclusive";
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  dispatch_id: string | null;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  approval_status: string | null;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
  zoho_invoice_id?: string | null;
  zoho_synced_at?: string | null;
  status_updated_at?: string | null;
  first_approver_id?: string | null;
  first_approved_at?: string | null;
  second_approver_id?: string | null;
  second_approved_at?: string | null;
  customers?: {
    company_name: string;
    factory_address?: string | null;
    head_office_address?: string | null;
  };
  dispatches?: {
    pickup_address: string;
    delivery_address: string;
    distance_km: number | null;
  } | null;
  first_approver?: {
    full_name: string;
    email: string;
  };
  second_approver?: {
    full_name: string;
    email: string;
  };
}

interface Customer {
  id: string;
  company_name: string;
}

interface Dispatch {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  distance_km: number | null;
  cost: number | null;
}

interface CompanyProfile {
  company_name: string;
  company_tagline: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_logo?: string;
  authorized_signature?: string;
  tin_number?: string;
  website?: string;
}

interface BankDetails {
  bank_name: string;
  account_name: string;
  account_number: string;
}

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle; className: string }> = {
  paid: {
    label: "Paid",
    icon: CheckCircle,
    className: "bg-success/15 text-success",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    className: "bg-warning/15 text-warning",
  },
  overdue: {
    label: "Overdue",
    icon: XCircle,
    className: "bg-destructive/15 text-destructive",
  },
  draft: {
    label: "Draft",
    icon: FileText,
    className: "bg-muted text-muted-foreground",
  },
};

const approvalStatusConfig: Record<string, { label: string; className: string }> = {
  pending_first_approval: {
    label: "Pending 1st Approval",
    className: "bg-warning/15 text-warning",
  },
  pending_second_approval: {
    label: "Pending 2nd Approval",
    className: "bg-info/15 text-info",
  },
  approved: {
    label: "Approved",
    className: "bg-success/15 text-success",
  },
  rejected: {
    label: "Rejected",
    className: "bg-destructive/15 text-destructive",
  },
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const InvoicesPage = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const { user, hasAnyRole, userRole } = useAuth();
  const { logChange } = useAuditLog();

  const canManage = hasAnyRole(["admin", "operations"]);
  const canCreateInvoice = hasAnyRole(["admin", "operations", "support"]);
  const requiresApproval = userRole === "support" || userRole === "operations";

  // Company settings state
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [loadingCompanySettings, setLoadingCompanySettings] = useState(true);

  const [formData, setFormData] = useState({
    customer_id: "",
    dispatch_id: "",
    amount: "",
    due_date: "",
    notes: "",
    invoice_number: "",
  });

  // Line items state for the new invoice creation
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", type: "delivery", description: "Delivery Service", quantity: 1, price: 0, tonnage: "", vatType: "none", serviceCharge: 0, serviceChargeVat: "none" }
  ]);

  // Generate unique ID for line items
  const generateItemId = () => Math.random().toString(36).substring(2, 9);

  // Add line item
  const addLineItem = (type: LineItem["type"]) => {
    const descriptions: Record<LineItem["type"], string> = {
      delivery: "Delivery Service",
      extra_drop: "Extra Drop-off",
      fuel: "Fuel Surcharge",
      toll: "Toll Fee",
    };
    setLineItems(prev => [
      ...prev,
      { id: generateItemId(), type, description: descriptions[type], quantity: 1, price: 0, location: "", tonnage: "", vatType: "none", serviceCharge: 0, serviceChargeVat: "none" }
    ]);
  };

  // Remove line item
  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(prev => prev.filter(item => item.id !== id));
    }
  };

  // Update line item
  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  // Calculate totals from line items — VAT and service charge are per-item
  const invoiceTotals = useMemo(() => {
    let lineSubtotal = 0;
    let totalServiceCharge = 0;
    let vatAmount = 0;

    lineItems.forEach(item => {
      const lineAmount = item.quantity * item.price;
      const sc = item.serviceCharge || 0;
      lineSubtotal += lineAmount;
      totalServiceCharge += sc;

      // Line price VAT (applied to line amount only)
      if (item.vatType === "exclusive") {
        vatAmount += lineAmount * 0.075;
      } else if (item.vatType === "inclusive") {
        vatAmount += lineAmount - lineAmount / 1.075;
      }

      // Service charge VAT (independent)
      if (sc > 0) {
        if (item.serviceChargeVat === "exclusive") {
          vatAmount += sc * 0.075;
        } else if (item.serviceChargeVat === "inclusive") {
          vatAmount += sc - sc / 1.075;
        }
      }
    });

    // Exclusive VAT adds to the total; inclusive VAT is already embedded
    const exclusiveVat = lineItems.reduce((sum, item) => {
      const lineAmount = item.quantity * item.price;
      const sc = item.serviceCharge || 0;
      let ev = 0;
      if (item.vatType === "exclusive") ev += lineAmount * 0.075;
      if (sc > 0 && item.serviceChargeVat === "exclusive") ev += sc * 0.075;
      return sum + ev;
    }, 0);

    const total = lineSubtotal + totalServiceCharge + exclusiveVat;
    const subtotal = lineSubtotal + totalServiceCharge;

    return { subtotal, lineSubtotal, vatAmount, total, totalServiceCharge };
  }, [lineItems]);

  // Get selected customer name
  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.id === formData.customer_id);
  }, [customers, formData.customer_id]);

  // Get selected dispatch
  const selectedDispatch = useMemo(() => {
    return dispatches.find(d => d.id === formData.dispatch_id);
  }, [dispatches, formData.dispatch_id]);

  // Filter out dispatches that already have invoices
  const availableDispatches = useMemo(() => {
    const dispatchIdsWithInvoices = new Set(
      invoices
        .filter(inv => inv.dispatch_id)
        .map(inv => inv.dispatch_id)
    );
    return dispatches.filter(d => !dispatchIdsWithInvoices.has(d.id));
  }, [dispatches, invoices]);



  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customers(company_name, factory_address, head_office_address),
          dispatches(pickup_address, delivery_address, distance_km)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Auto-detect overdue invoices and fetch approver info
      const now = new Date();
      const processedInvoices = await Promise.all(
        (data || []).map(async (inv: any) => {
          // Only check overdue for invoices that are approved or have no approval workflow
          const isApproved = inv.approval_status === "approved" || inv.approval_status === null;
          if (inv.status === "pending" && inv.due_date && isApproved) {
            const dueDate = new Date(inv.due_date);
            if (dueDate < now) {
              inv.status = "overdue";
            }
          }

          // Fetch first approver info
          if (inv.first_approver_id) {
            const { data: firstApprover } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("user_id", inv.first_approver_id)
              .single();
            if (firstApprover) inv.first_approver = firstApprover;
          }

          // Fetch second approver info
          if (inv.second_approver_id) {
            const { data: secondApprover } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("user_id", inv.second_approver_id)
              .single();
            if (secondApprover) inv.second_approver = secondApprover;
          }

          return inv;
        })
      );

      setInvoices(processedInvoices);
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

  const fetchCustomers = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id, company_name")
      .order("company_name");
    setCustomers(data || []);
  };

  const fetchDispatches = async () => {
    const { data } = await supabase
      .from("dispatches")
      .select("id, dispatch_number, pickup_address, delivery_address, distance_km, cost")
      .eq("status", "delivered")
      .order("created_at", { ascending: false });
    setDispatches(data || []);
  };

  const fetchCompanySettings = async () => {
    setLoadingCompanySettings(true);
    try {
      // Fetch company profile
      const { data: companyData } = await supabase
        .from("integrations")
        .select("config")
        .eq("name", "company_profile")
        .single();

      if (companyData?.config) {
        setCompanyProfile(companyData.config as unknown as CompanyProfile);
      }

      // Fetch bank details
      const { data: bankData } = await supabase
        .from("integrations")
        .select("config")
        .eq("name", "bank_details")
        .single();

      if (bankData?.config) {
        setBankDetails(bankData.config as unknown as BankDetails);
      }
    } catch (error) {
      console.error("Error fetching company settings:", error);
    } finally {
      setLoadingCompanySettings(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
    fetchDispatches();
    fetchCompanySettings();
  }, []);

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `INV-${year}-${random}`;
  };

  const handleSubmit = async () => {
    if (!formData.customer_id) {
      toast({
        title: "Validation Error",
        description: "Please select a customer",
        variant: "destructive",
      });
      return;
    }

    if (invoiceTotals.subtotal <= 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one line item with a price",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Encode each line item including per-item tonnage, vatType, serviceCharge
      const lineItemsNote = lineItems.map(item => {
        let s = `${item.description}${item.location ? ` (${item.location})` : ''}: ${item.quantity} x ₦${item.price.toLocaleString()}`;
        if (item.tonnage) s += `|t:${item.tonnage}`;
        if (item.vatType && item.vatType !== "none") s += `|v:${item.vatType}`;
        if (item.serviceCharge && item.serviceCharge > 0) s += `|sc:${item.serviceCharge}`;
        if (item.serviceCharge && item.serviceCharge > 0 && item.serviceChargeVat && item.serviceChargeVat !== "none") s += `|scv:${item.serviceChargeVat}`;
        return s;
      }).join('; ');

      // For non-admin users (support/operations role), set approval workflow
      const insertData: any = {
        invoice_number: formData.invoice_number || generateInvoiceNumber(),
        customer_id: formData.customer_id,
        dispatch_id: formData.dispatch_id || null,
        amount: invoiceTotals.lineSubtotal,
        tax_amount: invoiceTotals.vatAmount,
        total_amount: invoiceTotals.total,
        tax_type: "none",
        due_date: formData.due_date || null,
        notes: lineItemsNote + (formData.notes ? `\n\nNotes: ${formData.notes}` : ''),
        status: requiresApproval ? "draft" : "pending",
        created_by: user?.id,
      };

      // Non-admin users need approval
      if (requiresApproval) {
        insertData.approval_status = "pending_first_approval";
        insertData.submitted_by = user?.id;
      }

      const { data, error } = await supabase.from("invoices").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "invoices",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: "Success",
        description: requiresApproval
          ? "Invoice submitted for approval"
          : "Invoice created successfully",
      });
      setIsCreateDialogOpen(false);
      resetForm();
      fetchInvoices();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      customer_id: "",
      dispatch_id: "",
      amount: "",
      due_date: "",
      notes: "",
      invoice_number: generateInvoiceNumber(),
    });
    setLineItems([
      { id: "1", type: "delivery", description: "Delivery Service", quantity: 1, price: 0, tonnage: "", vatType: "none", serviceCharge: 0, serviceChargeVat: "none" }
    ]);
  };

  const handleDispatchSelect = (dispatchId: string) => {
    const dispatch = dispatches.find(d => d.id === dispatchId);
    if (dispatch) {
      setFormData(prev => ({
        ...prev,
        dispatch_id: dispatchId,
        amount: dispatch.cost?.toString() || prev.amount,
      }));

      // Auto-populate the first delivery line item with dispatch route description
      const pickupShort = dispatch.pickup_address.split(',')[0].trim();
      const deliveryShort = dispatch.delivery_address.split(',')[0].trim();
      const routeDescription = `Delivery: ${pickupShort} → ${deliveryShort}`;

      setLineItems(prev => {
        const firstDeliveryIndex = prev.findIndex(item => item.type === "delivery");
        if (firstDeliveryIndex !== -1) {
          const updated = [...prev];
          updated[firstDeliveryIndex] = {
            ...updated[firstDeliveryIndex],
            description: routeDescription,
            price: dispatch.cost || updated[firstDeliveryIndex].price,
          };
          return updated;
        }
        return prev;
      });
    } else {
      setFormData(prev => ({ ...prev, dispatch_id: dispatchId }));
    }
  };

  // Parse line items stored in notes back into the form's LineItem array
  const parseLineItemsFromNotes = (notes: string | null): LineItem[] => {
    if (!notes) return [{ id: "1", type: "delivery", description: "Delivery Service", quantity: 1, price: 0, tonnage: "", vatType: "none", serviceCharge: 0, serviceChargeVat: "none" }];
    const itemsSection = notes.split('\n\nNotes:')[0];
    const items = itemsSection.split('; ').map((raw) => {
      // Each item may have trailing pipe-separated metadata: |t:tonnage|v:vatType|sc:serviceCharge
      const [itemPart, ...metaParts] = raw.split('|');
      const match = itemPart.match(/^(.+?)(?:\s*\(([^)]+)\))?\s*:\s*(\d+(?:\.\d+)?)\s*x\s*₦?([\d,]+(?:\.\d+)?)/);
      if (!match) return null;
      const meta: Record<string, string> = {};
      metaParts.forEach(m => { const [k, v] = m.split(':'); if (k && v) meta[k.trim()] = v.trim(); });
      return {
        id: generateItemId(),
        type: "delivery" as LineItem["type"],
        description: match[1].trim(),
        location: match[2] || "",
        quantity: parseFloat(match[3]) || 1,
        price: parseFloat(match[4].replace(/,/g, "")) || 0,
        tonnage: meta["t"] || "",
        vatType: (meta["v"] as LineItem["vatType"]) || "none",
        serviceCharge: meta["sc"] ? parseFloat(meta["sc"]) : 0,
        serviceChargeVat: (meta["scv"] as LineItem["serviceChargeVat"]) || "none",
      };
    }).filter(Boolean) as LineItem[];
    return items.length > 0
      ? items
      : [{ id: "1", type: "delivery", description: "Delivery Service", quantity: 1, price: 0, tonnage: "", vatType: "none", serviceCharge: 0, serviceChargeVat: "none" }];
  };

  // Parse user-facing notes (the part after \n\nNotes:)
  const parseUserNotes = (notes: string | null): string => {
    if (!notes) return "";
    const idx = notes.indexOf('\n\nNotes:');
    return idx !== -1 ? notes.slice(idx + '\n\nNotes:'.length).trim() : "";
  };

  const openEditDialog = (invoice: Invoice) => {
    const parsedItems = parseLineItemsFromNotes(invoice.notes);
    const parsedNotes = parseUserNotes(invoice.notes);

    setEditingInvoice(invoice);
    setFormData({
      customer_id: invoice.customer_id,
      dispatch_id: invoice.dispatch_id || "",
      amount: String(invoice.amount),
      due_date: invoice.due_date ? invoice.due_date.split('T')[0] : "",
      notes: parsedNotes,
      invoice_number: invoice.invoice_number,
    });
    setLineItems(parsedItems);
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingInvoice) return;

    if (!formData.customer_id) {
      toast({ title: "Validation Error", description: "Please select a customer", variant: "destructive" });
      return;
    }
    if (invoiceTotals.lineSubtotal <= 0) {
      toast({ title: "Validation Error", description: "Please add at least one line item with a price", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const lineItemsNote = lineItems.map(item => {
        let s = `${item.description}${item.location ? ` (${item.location})` : ''}: ${item.quantity} x ₦${item.price.toLocaleString()}`;
        if (item.tonnage) s += `|t:${item.tonnage}`;
        if (item.vatType && item.vatType !== "none") s += `|v:${item.vatType}`;
        if (item.serviceCharge && item.serviceCharge > 0) s += `|sc:${item.serviceCharge}`;
        if (item.serviceCharge && item.serviceCharge > 0 && item.serviceChargeVat && item.serviceChargeVat !== "none") s += `|scv:${item.serviceChargeVat}`;
        return s;
      }).join('; ');

      const updateData: any = {
        invoice_number: formData.invoice_number || editingInvoice.invoice_number,
        customer_id: formData.customer_id,
        dispatch_id: formData.dispatch_id || null,
        amount: invoiceTotals.lineSubtotal,
        tax_amount: invoiceTotals.vatAmount,
        total_amount: invoiceTotals.total,
        tax_type: "none",
        due_date: formData.due_date || null,
        notes: lineItemsNote + (formData.notes ? `\n\nNotes: ${formData.notes}` : ''),
      };

      const { error } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", editingInvoice.id);

      if (error) throw error;

      await logChange({
        table_name: "invoices",
        record_id: editingInvoice.id,
        action: "update",
        new_data: updateData,
      });

      toast({ title: "Success", description: "Invoice updated successfully" });
      setIsEditDialogOpen(false);
      setEditingInvoice(null);
      resetForm();
      fetchInvoices();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update invoice", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      const updateData: any = {
        status: newStatus,
        status_updated_at: new Date().toISOString(),
      };

      if (newStatus === "paid") {
        updateData.paid_date = new Date().toISOString();
      }

      const { error } = await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", invoiceId);

      if (error) throw error;

      toast({
        title: "Status Updated",
        description: `Invoice marked as ${newStatus}`,
      });
      fetchInvoices();
      setSelectedInvoice(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const syncToZoho = async (invoiceId?: string) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: invoiceId ? 'sync_invoice' : 'sync_all_invoices',
          invoiceId,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Synced to Zoho",
          description: invoiceId 
            ? "Invoice synced successfully" 
            : `Synced ${data.synced} invoices, ${data.failed} failed`,
        });
        fetchInvoices();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({
        title: "Sync Error",
        description: error.message || "Failed to sync to Zoho",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    if (pdfDownloading) return;

    setPdfDownloading(invoice.id);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = 20;

      // Helper function to format currency for PDF
      const pdfFormatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-NG", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(amount);
      };

      // Helper function to format date
      const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      };

      // Parse line items from notes (supports per-item |t:|v:|sc: metadata)
      const parseLineItems = (notes: string | null) => {
        if (!notes) return [];
        const itemsSection = notes.split('\n\nNotes:')[0];
        const items = itemsSection.split('; ').map((raw, index) => {
          const [itemPart, ...metaParts] = raw.split('|');
          const match = itemPart.match(/^(.+?)(?:\s*\(([^)]+)\))?\s*:\s*(\d+(?:\.\d+)?)\s*x\s*₦?([\d,]+(?:\.\d+)?)/);
          if (!match) return null;
          const meta: Record<string, string> = {};
          metaParts.forEach(m => { const [k, v] = m.split(':'); if (k && v) meta[k.trim()] = v.trim(); });
          return {
            id: String(index + 1),
            description: match[1].trim(),
            location: match[2] || '',
            quantity: parseFloat(match[3]) || 1,
            price: parseFloat(match[4].replace(/,/g, '')) || 0,
            tonnage: meta['t'] || '',
            vatType: meta['v'] || 'none',
            serviceCharge: meta['sc'] ? parseFloat(meta['sc']) : 0,
            serviceChargeVat: meta['scv'] || 'none',
          };
        }).filter(Boolean);
        return items;
      };

      const lineItemsFromNotes = parseLineItems(invoice.notes);

      // Compute totals from line items for the PDF totals section
      let pdfLineSubtotal = 0;
      let pdfTotalServiceCharge = 0;
      let pdfVatAmount = 0;
      lineItemsFromNotes.forEach((item: any) => {
        const lineAmt = item.quantity * item.price;
        const sc = item.serviceCharge || 0;
        pdfLineSubtotal += lineAmt;
        pdfTotalServiceCharge += sc;
        if (item.vatType === 'exclusive') pdfVatAmount += lineAmt * 0.075;
        else if (item.vatType === 'inclusive') pdfVatAmount += lineAmt - lineAmt / 1.075;
        if (sc > 0) {
          if (item.serviceChargeVat === 'exclusive') pdfVatAmount += sc * 0.075;
          else if (item.serviceChargeVat === 'inclusive') pdfVatAmount += sc - sc / 1.075;
        }
      });
      // For old invoices with no line item metadata, fall back to stored amounts
      if (lineItemsFromNotes.length === 0 || pdfLineSubtotal === 0) {
        pdfLineSubtotal = invoice.amount;
        pdfVatAmount = invoice.tax_amount;
      }
      const serviceChargeFromNotes = pdfTotalServiceCharge;

      // ── HEADER: Logo (top-left) │ Invoice title + balance (top-right) ──
      const logoW = 45;
      const logoH = 30;

      if (companyProfile?.company_logo) {
        try {
          // Try PNG first, then JPEG
          try {
            doc.addImage(companyProfile.company_logo, 'PNG', margin, yPos, logoW, logoH);
          } catch {
            doc.addImage(companyProfile.company_logo, 'JPEG', margin, yPos, logoW, logoH);
          }
        } catch (e) {
          // Fallback placeholder
          doc.setFillColor(249, 115, 22);
          doc.roundedRect(margin, yPos, logoW, logoH, 3, 3, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(20);
          doc.setFont("helvetica", "bold");
          doc.text(companyProfile?.company_name?.charAt(0) || "C", margin + logoW / 2, yPos + logoH / 2 + 4, { align: "center" });
        }
      } else {
        doc.setFillColor(249, 115, 22);
        doc.roundedRect(margin, yPos, logoW, logoH, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text(companyProfile?.company_name?.charAt(0) || "C", margin + logoW / 2, yPos + logoH / 2 + 4, { align: "center" });
      }

      // Right side: "Invoice" title
      doc.setTextColor(90, 90, 90);
      doc.setFontSize(30);
      doc.setFont("helvetica", "normal");
      doc.text("Invoice", pageWidth - margin, yPos + 10, { align: "right" });

      // Invoice number
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text(`# ${invoice.invoice_number}`, pageWidth - margin, yPos + 18, { align: "right" });

      // "Balance Due" label
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text("Balance Due", pageWidth - margin, yPos + 27, { align: "right" });

      // Balance amount – bold, larger
      doc.setFontSize(15);
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.text(`NGN${pdfFormatCurrency(invoice.total_amount)}`, pageWidth - margin, yPos + 35, { align: "right" });

      yPos += 48;

      // Company Details
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text(companyProfile?.company_name || "Your Company Name", margin, yPos);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      yPos += 5;

      if (companyProfile?.company_address) {
        const addressLines = companyProfile.company_address.split('\n');
        addressLines.forEach(line => {
          yPos += 4;
          doc.text(line, margin, yPos);
        });
      }
      if (companyProfile?.company_phone) {
        yPos += 4;
        doc.text(companyProfile.company_phone, margin, yPos);
      }
      if (companyProfile?.company_email) {
        yPos += 4;
        doc.text(companyProfile.company_email, margin, yPos);
      }
      if (companyProfile?.website) {
        yPos += 4;
        doc.text(companyProfile.website, margin, yPos);
      }

      yPos += 12;

      // ── BILL TO (left) │ INVOICE META (right) ──
      const leftColX = margin;
      const rightColX = pageWidth - margin - 65;
      const infoStartY = yPos;

      // Left: Customer name (bold) + address
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(invoice.customers?.company_name || "Customer", leftColX, yPos);

      const customerAddr = invoice.customers?.factory_address || invoice.customers?.head_office_address || null;
      if (customerAddr) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        const addrLines = doc.splitTextToSize(customerAddr, 90);
        addrLines.forEach((line: string, i: number) => {
          doc.text(line, leftColX, yPos + 5 + i * 4.5);
        });
      }

      // Right: Invoice meta (label right-aligned, value right-aligned)
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      doc.setTextColor(140, 140, 140);
      doc.text("Invoice Date :", rightColX, infoStartY);
      doc.setTextColor(20, 20, 20);
      doc.text(formatDate(invoice.created_at), pageWidth - margin, infoStartY, { align: "right" });

      doc.setTextColor(140, 140, 140);
      doc.text("Terms :", rightColX, infoStartY + 6);
      doc.setTextColor(20, 20, 20);
      doc.text("Due on Receipt", pageWidth - margin, infoStartY + 6, { align: "right" });

      doc.setTextColor(140, 140, 140);
      doc.text("Due Date :", rightColX, infoStartY + 12);
      doc.setTextColor(20, 20, 20);
      doc.text(invoice.due_date ? formatDate(invoice.due_date) : "—", pageWidth - margin, infoStartY + 12, { align: "right" });

      yPos += 28;

      // Items Table
      // Build description as plain string — avoid \n in jsPDF cells to prevent
      // letter-spacing artifacts. Use " · " as a readable inline separator.
      const tableData = lineItemsFromNotes.length > 0
        ? lineItemsFromNotes.map((item: any, index: number) => [
            index + 1,
            item.location ? `${item.description}  ·  ${item.location}` : item.description,
            item.tonnage || '—',
            item.quantity.toFixed(2),
            pdfFormatCurrency(item.price),
            pdfFormatCurrency(item.quantity * item.price),
          ])
        : [[
            1,
            invoice.dispatches
              ? `Delivery Service  ·  ${invoice.dispatches.pickup_address?.split(',')[0]} \u2192 ${invoice.dispatches.delivery_address?.split(',')[0]}`
              : "Service",
            '—',
            "1.00",
            pdfFormatCurrency(invoice.amount),
            pdfFormatCurrency(invoice.amount),
          ]];

      autoTable(doc, {
        startY: yPos,
        head: [['#', 'Description', 'T', 'Qty', 'Rate', 'Amount']],
        body: tableData,
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: { top: 5, bottom: 5, left: 5, right: 5 },
          textColor: [20, 20, 20],
        },
        headStyles: {
          fillColor: [45, 45, 45],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        columnStyles: {
          0: { cellWidth: 14, halign: 'left' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 34, halign: 'right' },
          5: { cellWidth: 38, halign: 'right' },
        },
        margin: { left: margin, right: margin },
        didDrawCell: (data: any) => {
          if (data.section === 'body') {
            doc.setDrawColor(232, 232, 232);
            doc.setLineWidth(0.3);
            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
          }
        },
      });

      // Get the final Y position after the table
      yPos = (doc as any).lastAutoTable.finalY + 10;

      // ── TOTALS SECTION (right-aligned) ──
      const totalsLabelX = pageWidth - margin - 75;
      const valuesX = pageWidth - margin;
      const rowH = 7;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      // Sub Total
      doc.setTextColor(100, 100, 100);
      doc.text("Sub Total", totalsLabelX, yPos, { align: "left" });
      doc.setTextColor(20, 20, 20);
      doc.text(pdfFormatCurrency(pdfLineSubtotal), valuesX, yPos, { align: "right" });

      // Service Charge (if any)
      if (serviceChargeFromNotes > 0) {
        yPos += rowH;
        doc.setTextColor(100, 100, 100);
        doc.text("Service Charge", totalsLabelX, yPos, { align: "left" });
        doc.setTextColor(20, 20, 20);
        doc.text(pdfFormatCurrency(serviceChargeFromNotes), valuesX, yPos, { align: "right" });
        yPos += 3;
      }

      // VAT (if applicable)
      if (pdfVatAmount > 0) {
        yPos += rowH;
        doc.setTextColor(100, 100, 100);
        doc.text("VAT (7.5%)", totalsLabelX, yPos, { align: "left" });
        doc.setTextColor(20, 20, 20);
        doc.text(pdfFormatCurrency(pdfVatAmount), valuesX, yPos, { align: "right" });
      }

      // Separator line before Total
      yPos += 5;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.4);
      doc.line(totalsLabelX - 5, yPos, valuesX, yPos);
      yPos += 5;

      // Total (bold)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text("Total", totalsLabelX, yPos);
      doc.text(`NGN${pdfFormatCurrency(invoice.total_amount)}`, valuesX, yPos, { align: "right" });

      // Balance Due row (grey background)
      yPos += 4;
      const balanceRowH = 11;
      doc.setFillColor(240, 240, 240);
      doc.rect(totalsLabelX - 5, yPos, valuesX - totalsLabelX + 5, balanceRowH, 'F');
      yPos += 7;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Balance Due", totalsLabelX, yPos);
      doc.text(`NGN${pdfFormatCurrency(invoice.total_amount)}`, valuesX, yPos, { align: "right" });

      yPos += 20;

      // Bank Details
      if (bankDetails) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(30, 30, 30);
        doc.text(bankDetails.account_number, margin, yPos);
        yPos += 4;
        doc.setTextColor(100, 100, 100);
        doc.text(bankDetails.bank_name, margin, yPos);
        yPos += 10;
      }

      // Footer - TIN and Signature
      const footerY = Math.max(yPos + 10, 250);

      doc.setDrawColor(230, 230, 230);
      doc.line(margin, footerY, pageWidth - margin, footerY);

      // Left: Company name and TIN
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);

      if (companyProfile?.company_name) {
        doc.text(companyProfile.company_name, margin, footerY + 8);
      }
      if (companyProfile?.tin_number) {
        doc.text(`TIN - ${companyProfile.tin_number}`, margin, footerY + 13);
      }

      // Right: Signature
      if (companyProfile?.authorized_signature) {
        try {
          doc.addImage(companyProfile.authorized_signature, 'PNG', pageWidth - margin - 50, footerY + 3, 40, 15);
        } catch (e) {
          // Signature failed to load
        }
      }

      doc.setDrawColor(180, 180, 180);
      doc.line(pageWidth - margin - 55, footerY + 20, pageWidth - margin - 5, footerY + 20);

      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`For ${companyProfile?.company_name || "Company"}`, pageWidth - margin - 30, footerY + 25, { align: "center" });

      // Page number
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(180, 180, 180);
      doc.text("1", pageWidth / 2, pageHeight - 10, { align: "center" });

      // Save the PDF
      doc.save(`${invoice.invoice_number}.pdf`);

      toast({
        title: "Downloaded",
        description: `Invoice ${invoice.invoice_number} downloaded as PDF`,
      });
    } catch (error) {
      console.error("PDF generation error:", error);
      toast({
        title: "Error",
        description: "Failed to download invoice",
        variant: "destructive",
      });
    } finally {
      setPdfDownloading(null);
      setSelectedInvoice(null);
    }
  };

  const filteredInvoices = invoices.filter((invoice) => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.customers?.company_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totals = {
    total: invoices.reduce((acc, inv) => acc + inv.total_amount, 0),
    paid: invoices
      .filter((inv) => inv.status === "paid")
      .reduce((acc, inv) => acc + inv.total_amount, 0),
    pending: invoices
      .filter((inv) => inv.status === "pending")
      .reduce((acc, inv) => acc + inv.total_amount, 0),
    overdue: invoices
      .filter((inv) => inv.status === "overdue")
      .reduce((acc, inv) => acc + inv.total_amount, 0),
  };

  const handleSendInvoice = (invoice: Invoice) => {
    toast({
      title: "Invoice Sent",
      description: `Invoice ${invoice.invoice_number} has been sent to ${invoice.customers?.company_name}.`,
    });
  };

  return (
    <DashboardLayout
      title="Invoices"
      subtitle="Manage billing and payment tracking"
    >
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Revenue",
            value: formatCurrency(totals.total),
            color: "text-foreground",
          },
          {
            label: "Collected",
            value: formatCurrency(totals.paid),
            color: "text-success",
          },
          {
            label: "Pending",
            value: formatCurrency(totals.pending),
            color: "text-warning",
          },
          {
            label: "Overdue",
            value: formatCurrency(totals.overdue),
            color: "text-destructive",
          },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="glass-card p-4"
          >
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className={`text-2xl font-heading font-bold mt-1 ${stat.color}`}>
              {stat.value}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Actions Bar */}
      <div className="invoices-actions-bar flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
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
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          {canManage && (
            <Button
              variant="outline"
              onClick={() => syncToZoho()}
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CloudUpload className="w-4 h-4 mr-2" />
              )}
              Sync to Zoho
            </Button>
          )}
          {canCreateInvoice && (
            <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
                setIsCreateDialogOpen(open);
                if (open) setFormData(prev => ({ ...prev, invoice_number: prev.invoice_number || generateInvoiceNumber() }));
                if (!open) resetForm();
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] lg:max-w-[900px] max-h-[90vh] p-0 overflow-hidden [&>button]:z-50 flex flex-col">
                  <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
                    {/* Left Side - Form */}
                    <div className="flex-1 p-6 pr-8 overflow-y-auto min-h-0">
                      <DialogHeader className="mb-6">
                        <DialogTitle className="font-heading text-xl">Create New Invoice</DialogTitle>
                        <DialogDescription>
                          Generate an invoice with itemized charges.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-5">
                        {/* Invoice Number */}
                        <div className="space-y-2">
                          <Label htmlFor="invoice_number">Invoice Number *</Label>
                          <Input
                            id="invoice_number"
                            value={formData.invoice_number}
                            onChange={(e) => setFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
                            placeholder="e.g. INV-2025-001"
                            className="bg-secondary/50"
                          />
                        </div>

                        {/* Customer Selection */}
                        <div className="space-y-2">
                          <Label htmlFor="customer_id">Customer *</Label>
                          <Select
                            value={formData.customer_id}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, customer_id: value }))}
                          >
                            <SelectTrigger className="bg-secondary/50">
                              <SelectValue placeholder="Select customer" />
                            </SelectTrigger>
                            <SelectContent>
                              {customers.map((customer) => (
                                <SelectItem key={customer.id} value={customer.id}>
                                  {customer.company_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Dispatch Link */}
                        <div className="space-y-2">
                          <Label htmlFor="dispatch_id">Link to Delivery (Optional)</Label>
                          <Select
                            value={formData.dispatch_id}
                            onValueChange={handleDispatchSelect}
                          >
                            <SelectTrigger className="bg-secondary/50">
                              <SelectValue placeholder="Select delivery" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableDispatches.length === 0 ? (
                                <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                                  No available dispatches (all have invoices)
                                </div>
                              ) : (
                                availableDispatches.map((dispatch) => (
                                  <SelectItem key={dispatch.id} value={dispatch.id}>
                                    {dispatch.dispatch_number} - {dispatch.pickup_address.split(',')[0]} → {dispatch.delivery_address.split(',')[0]}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Line Items Section */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Line Items</Label>
                            <div className="flex gap-1 flex-wrap justify-end">
                              <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("delivery")} className="h-8 text-xs gap-1">
                                <Truck className="w-3 h-3" />Delivery
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("extra_drop")} className="h-8 text-xs gap-1">
                                <MapPin className="w-3 h-3" />Extra Drop
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("fuel")} className="h-8 text-xs gap-1">
                                <Fuel className="w-3 h-3" />Fuel
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("toll")} className="h-8 text-xs gap-1">
                                <CircleDollarSign className="w-3 h-3" />Toll
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {lineItems.map((item) => (
                              <div key={item.id} className="p-3 rounded-lg border border-border/50 bg-secondary/20 space-y-2">
                                {/* Header row */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {item.type === "delivery" && <Truck className="w-4 h-4 text-primary" />}
                                    {item.type === "extra_drop" && <MapPin className="w-4 h-4 text-warning" />}
                                    {item.type === "fuel" && <Fuel className="w-4 h-4 text-blue-500" />}
                                    {item.type === "toll" && <CircleDollarSign className="w-4 h-4 text-green-500" />}
                                    <span className="text-sm font-medium capitalize">{item.type.replace("_", " ")}</span>
                                  </div>
                                  {lineItems.length > 1 && (
                                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLineItem(item.id)}>
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>

                                {/* Description */}
                                <Input
                                  value={item.description}
                                  onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                                  placeholder="Description"
                                  className="bg-secondary/50 h-9"
                                />

                                {/* Location (extra_drop only) */}
                                {item.type === "extra_drop" && (
                                  <Input
                                    value={item.location ?? ""}
                                    onChange={(e) => updateLineItem(item.id, "location", e.target.value)}
                                    placeholder="Location"
                                    className="bg-secondary/50 h-9"
                                  />
                                )}

                                {/* Tonnage */}
                                <Select
                                  value={item.tonnage ?? ""}
                                  onValueChange={(v) => updateLineItem(item.id, "tonnage", v)}
                                >
                                  <SelectTrigger className="bg-secondary/50 h-9 text-xs">
                                    <SelectValue placeholder="T (Tonnage)" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="1T">1T</SelectItem>
                                    <SelectItem value="2T">2T</SelectItem>
                                    <SelectItem value="3T">3T</SelectItem>
                                    <SelectItem value="5T">5T</SelectItem>
                                    <SelectItem value="10T">10T</SelectItem>
                                    <SelectItem value="15T">15T</SelectItem>
                                    <SelectItem value="20T">20T</SelectItem>
                                    <SelectItem value="25T">25T</SelectItem>
                                    <SelectItem value="30T">30T</SelectItem>
                                    <SelectItem value="40T">40T</SelectItem>
                                  </SelectContent>
                                </Select>

                                {/* Qty / Price / Amount */}
                                <div className="flex gap-2">
                                  <div className="w-20">
                                    <Input
                                      type="number"
                                      value={item.quantity === 0 ? "" : item.quantity}
                                      onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                                      onBlur={(e) => { if (!parseInt(e.target.value)) updateLineItem(item.id, "quantity", 1); }}
                                      placeholder="Qty"
                                      min={1}
                                      className="bg-secondary/50 h-9"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <Input
                                      type="number"
                                      value={item.price || ""}
                                      onChange={(e) => updateLineItem(item.id, "price", parseFloat(e.target.value) || 0)}
                                      placeholder="Rate (₦)"
                                      className="bg-secondary/50 h-9"
                                    />
                                  </div>
                                  <div className="flex items-center min-w-[90px] text-right text-sm font-semibold">
                                    {formatCurrency(item.quantity * item.price)}
                                  </div>
                                </div>

                                {/* Per-item VAT type */}
                                <div className="flex gap-2 items-center">
                                  <div className="flex-1">
                                    <Select
                                      value={item.vatType ?? "none"}
                                      onValueChange={(v) => updateLineItem(item.id, "vatType", v as LineItem["vatType"])}
                                    >
                                      <SelectTrigger className="bg-secondary/50 h-9 text-xs">
                                        <SelectValue placeholder="Tax type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">No VAT</SelectItem>
                                        <SelectItem value="inclusive">VAT Inclusive (7.5%)</SelectItem>
                                        <SelectItem value="exclusive">VAT Exclusive (+7.5%)</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex-1">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="any"
                                      value={item.serviceCharge === 0 ? "" : (item.serviceCharge ?? "")}
                                      onChange={(e) => updateLineItem(item.id, "serviceCharge", parseFloat(e.target.value) || 0)}
                                      placeholder="Service charge (₦)"
                                      className="bg-secondary/50 h-9 text-xs"
                                    />
                                  </div>
                                  {(item.serviceCharge ?? 0) > 0 && (
                                    <div className="flex-1">
                                      <Select
                                        value={item.serviceChargeVat ?? "none"}
                                        onValueChange={(v) => updateLineItem(item.id, "serviceChargeVat", v as LineItem["serviceChargeVat"])}
                                      >
                                        <SelectTrigger className="bg-secondary/50 h-9 text-xs">
                                          <SelectValue placeholder="SC VAT" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">SC: No VAT</SelectItem>
                                          <SelectItem value="inclusive">SC: VAT Incl. (7.5%)</SelectItem>
                                          <SelectItem value="exclusive">SC: VAT Excl. (+7.5%)</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Preview */}
                    <div className="w-full lg:w-[380px] bg-white p-4 border-t lg:border-t-0 lg:border-l border-border/30 overflow-y-auto min-h-0">
                      {loadingCompanySettings ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="bg-white text-gray-900 text-xs" style={{ fontFamily: "Arial, sans-serif" }}>
                          {/* Header */}
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-shrink-0">
                              {companyProfile?.company_logo ? (
                                <img src={companyProfile.company_logo} alt="Company Logo" className="max-w-[120px] max-h-[80px] object-contain" />
                              ) : (
                                <div className="w-[80px] h-[55px] bg-gradient-to-br from-orange-400 to-orange-600 rounded flex items-center justify-center">
                                  <span className="text-white text-lg font-bold">{companyProfile?.company_name?.charAt(0) || "C"}</span>
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <h1 className="text-xl font-light text-gray-700">Invoice</h1>
                              <p className="text-gray-500 text-[10px]"># INV-{new Date().getFullYear()}-XXX</p>
                              <div className="mt-2">
                                <p className="text-[9px] text-gray-500 uppercase">Balance Due</p>
                                <p className="text-sm font-semibold text-gray-900">NGN{Math.round(invoiceTotals.total).toLocaleString()}.00</p>
                              </div>
                            </div>
                          </div>
                          {/* Company Details */}
                          <div className="mb-3 text-[10px]">
                            <p className="font-semibold text-gray-900">{companyProfile?.company_name || "Your Company Name"}</p>
                            {companyProfile?.company_address && <p className="text-gray-600">{companyProfile.company_address}</p>}
                            {companyProfile?.company_phone && <p className="text-gray-600">{companyProfile.company_phone}</p>}
                            {companyProfile?.company_email && <p className="text-gray-600">{companyProfile.company_email}</p>}
                          </div>
                          {/* Bill To / Meta */}
                          <div className="flex justify-between mb-4">
                            <p className="font-semibold text-gray-900">{selectedCustomer?.company_name || "Select customer"}</p>
                            <div className="text-right text-[10px]">
                              <div className="flex justify-end gap-2"><span className="text-gray-500">Invoice Date :</span><span className="text-gray-900">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span></div>
                              <div className="flex justify-end gap-2"><span className="text-gray-500">Due Date :</span><span className="text-gray-900">{formData.due_date ? new Date(formData.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span></div>
                            </div>
                          </div>
                          {/* Items Table */}
                          <div className="mb-3">
                            <table className="w-full border-collapse text-[10px]">
                              <thead>
                                <tr style={{ backgroundColor: "#2d2d2d" }}>
                                  <th className="text-left py-2 px-1 text-white font-medium w-5">#</th>
                                  <th className="text-left py-2 px-1 text-white font-medium">Description</th>
                                  <th className="text-center py-2 px-1 text-white font-medium w-10">T</th>
                                  <th className="text-center py-2 px-1 text-white font-medium w-8">Qty</th>
                                  <th className="text-right py-2 px-1 text-white font-medium w-14">Rate</th>
                                  <th className="text-right py-2 px-1 text-white font-medium w-16">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lineItems.map((item, index) => (
                                  <tr key={item.id} className="border-b border-gray-200">
                                    <td className="py-1 px-1 text-gray-900 align-top">{index + 1}</td>
                                    <td className="py-1 px-1 text-gray-900">
                                      <div className="font-medium">{item.description}</div>
                                      {item.location && <div className="text-gray-500 text-[9px]">{item.location}</div>}
                                      {item.serviceCharge && item.serviceCharge > 0 && <div className="text-gray-500 text-[9px]">SC: ₦{item.serviceCharge.toLocaleString()}</div>}
                                      {item.vatType && item.vatType !== "none" && <div className="text-gray-400 text-[9px]">VAT {item.vatType}</div>}
                                    </td>
                                    <td className="py-1 px-1 text-gray-900 text-center">{item.tonnage || "—"}</td>
                                    <td className="py-1 px-1 text-gray-900 text-center">{item.quantity.toFixed(2)}</td>
                                    <td className="py-1 px-1 text-gray-900 text-right">{item.price.toLocaleString()}</td>
                                    <td className="py-1 px-1 text-gray-900 text-right">{(item.quantity * item.price).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {/* Totals */}
                          <div className="flex justify-end mb-4">
                            <table className="w-[185px] text-[10px]">
                              <tbody>
                                <tr>
                                  <td className="py-1 text-right text-gray-600">Sub Total</td>
                                  <td className="py-1 text-right text-gray-900 pl-4">{invoiceTotals.lineSubtotal.toLocaleString()}.00</td>
                                </tr>
                                {invoiceTotals.totalServiceCharge > 0 && (
                                  <tr>
                                    <td className="py-1 text-right text-gray-600">Service Charges</td>
                                    <td className="py-1 text-right text-gray-900 pl-4">{Math.round(invoiceTotals.totalServiceCharge).toLocaleString()}.00</td>
                                  </tr>
                                )}
                                {invoiceTotals.vatAmount > 0 && (
                                  <tr>
                                    <td className="py-1 text-right text-gray-600">VAT (7.5%)</td>
                                    <td className="py-1 text-right text-gray-900 pl-4">{Math.round(invoiceTotals.vatAmount).toLocaleString()}.00</td>
                                  </tr>
                                )}
                                <tr className="border-t border-gray-300">
                                  <td className="py-2 text-right font-semibold text-gray-900">Total</td>
                                  <td className="py-2 text-right font-semibold text-gray-900 pl-4">NGN{Math.round(invoiceTotals.total).toLocaleString()}.00</td>
                                </tr>
                                <tr className="bg-gray-100">
                                  <td className="py-2 px-2 text-right font-semibold text-gray-900">Balance Due</td>
                                  <td className="py-2 px-2 text-right font-bold text-gray-900">NGN{Math.round(invoiceTotals.total).toLocaleString()}.00</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          {bankDetails && (
                            <div className="mb-4 text-[10px]">
                              <p className="text-gray-900">{bankDetails.account_number}</p>
                              <p className="text-gray-600">{bankDetails.bank_name}</p>
                            </div>
                          )}
                          <div className="border-t border-gray-200 pt-3">
                            <div className="flex justify-between items-end">
                              <div className="text-[10px]">
                                {companyProfile?.company_name && <p className="text-gray-600">{companyProfile.company_name}</p>}
                                {companyProfile?.tin_number && <p className="text-gray-600">TIN - {companyProfile.tin_number}</p>}
                              </div>
                              <div className="text-center">
                                {companyProfile?.authorized_signature && (
                                  <div className="mb-1"><img src={companyProfile.authorized_signature} alt="Authorized Signature" className="max-h-8 object-contain mx-auto" /></div>
                                )}
                                <p className="text-[9px] text-gray-600 border-t border-gray-300 pt-1">For {companyProfile?.company_name || "Company"}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer - always visible */}
                  <div className="flex items-center justify-end gap-3 p-4 border-t border-border/50 bg-background shrink-0">
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving} className="bg-primary hover:bg-primary/90">
                      {saving ? "Creating..." : "Create Invoice"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
          )}
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Invoices Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="invoices-list glass-card overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground">Invoice</TableHead>
              <TableHead className="text-muted-foreground">Client</TableHead>
              <TableHead className="text-muted-foreground">Route</TableHead>
              <TableHead className="text-muted-foreground">Amount</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Due Date</TableHead>
              <TableHead className="text-muted-foreground">Zoho</TableHead>
              <TableHead className="text-right text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <span className="text-muted-foreground">Loading invoices...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12">
                  <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-muted-foreground">No invoices found</p>
                  <p className="text-sm text-muted-foreground/70">Create your first invoice to get started</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice, index) => {
                const status = statusConfig[invoice.status] || statusConfig.draft;
                const StatusIcon = status.icon;
                return (
                  <motion.tr
                    key={invoice.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + index * 0.03 }}
                    className="border-border/50 hover:bg-secondary/30 transition-colors"
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{invoice.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(invoice.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {invoice.customers?.company_name || 'N/A'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.dispatches ? (
                        <span className="text-xs">
                          {invoice.dispatches.pickup_address?.split(',')[0]} → {invoice.dispatches.delivery_address?.split(',')[0]}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="font-semibold text-foreground">
                      {formatCurrency(invoice.total_amount)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {/* If in approval workflow (not null) and NOT approved yet - show approval status */}
                        {invoice.approval_status &&
                         invoice.approval_status !== 'approved' &&
                         approvalStatusConfig[invoice.approval_status] ? (
                          <span
                            className={`status-badge ${approvalStatusConfig[invoice.approval_status].className}`}
                          >
                            {approvalStatusConfig[invoice.approval_status].label}
                          </span>
                        ) : (
                          /* Show payment status for: approved invoices OR invoices without approval workflow */
                          <span
                            className={`status-badge ${status.className}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {status.label}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      {invoice.zoho_invoice_id ? (
                        <span className="text-xs text-success">Synced</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedInvoice(invoice)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedInvoice(null); openEditDialog(invoice); }}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit Invoice
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleSendInvoice(invoice)}>
                                <Send className="w-4 h-4 mr-2" />
                                Send Invoice
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => updateInvoiceStatus(invoice.id, 'paid')}>
                                <CheckCircle className="w-4 h-4 mr-2 text-success" />
                                Mark as Paid
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateInvoiceStatus(invoice.id, 'pending')}>
                                <Clock className="w-4 h-4 mr-2 text-warning" />
                                Mark as Pending
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => updateInvoiceStatus(invoice.id, 'overdue')}>
                                <XCircle className="w-4 h-4 mr-2 text-destructive" />
                                Mark as Overdue
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {!invoice.zoho_invoice_id && (
                                <DropdownMenuItem onClick={() => syncToZoho(invoice.id)}>
                                  <CloudUpload className="w-4 h-4 mr-2" />
                                  Sync to Zoho
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Edit Invoice Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) { setEditingInvoice(null); resetForm(); }
      }}>
        <DialogContent className="max-w-[95vw] lg:max-w-[900px] max-h-[90vh] p-0 overflow-hidden [&>button]:z-50 flex flex-col">
          <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
            {/* Left Side - Form */}
            <div className="flex-1 p-6 pr-8 overflow-y-auto min-h-0">
              <DialogHeader className="mb-6">
                <DialogTitle className="font-heading text-xl">Edit Invoice</DialogTitle>
                <DialogDescription>
                  Update invoice details and line items.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {/* Invoice Number */}
                <div className="space-y-2">
                  <Label htmlFor="edit_invoice_number">Invoice Number *</Label>
                  <Input
                    id="edit_invoice_number"
                    value={formData.invoice_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, invoice_number: e.target.value }))}
                    placeholder="e.g. INV-2025-001"
                    className="bg-secondary/50"
                  />
                </div>

                {/* Customer Selection */}
                <div className="space-y-2">
                  <Label htmlFor="edit_customer_id">Customer *</Label>
                  <Select
                    value={formData.customer_id}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, customer_id: value }))}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dispatch Link */}
                <div className="space-y-2">
                  <Label htmlFor="edit_dispatch_id">Link to Delivery (Optional)</Label>
                  <Select
                    value={formData.dispatch_id}
                    onValueChange={handleDispatchSelect}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue placeholder="Select delivery" />
                    </SelectTrigger>
                    <SelectContent>
                      {dispatches.map((dispatch) => (
                        <SelectItem key={dispatch.id} value={dispatch.id}>
                          {dispatch.dispatch_number} - {dispatch.pickup_address.split(',')[0]} → {dispatch.delivery_address.split(',')[0]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Line Items Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Line Items</Label>
                    <div className="flex gap-1 flex-wrap justify-end">
                      <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("delivery")} className="h-8 text-xs gap-1">
                        <Truck className="w-3 h-3" />Delivery
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("extra_drop")} className="h-8 text-xs gap-1">
                        <MapPin className="w-3 h-3" />Extra Drop
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("fuel")} className="h-8 text-xs gap-1">
                        <Fuel className="w-3 h-3" />Fuel
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => addLineItem("toll")} className="h-8 text-xs gap-1">
                        <CircleDollarSign className="w-3 h-3" />Toll
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((item) => (
                      <div key={item.id} className="p-3 rounded-lg border border-border/50 bg-secondary/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {item.type === "delivery" && <Truck className="w-4 h-4 text-primary" />}
                            {item.type === "extra_drop" && <MapPin className="w-4 h-4 text-warning" />}
                            {item.type === "fuel" && <Fuel className="w-4 h-4 text-blue-500" />}
                            {item.type === "toll" && <CircleDollarSign className="w-4 h-4 text-green-500" />}
                            <span className="text-sm font-medium capitalize">{item.type.replace("_", " ")}</span>
                          </div>
                          {lineItems.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeLineItem(item.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                        <Input value={item.description} onChange={(e) => updateLineItem(item.id, "description", e.target.value)} placeholder="Description" className="bg-secondary/50 h-9" />
                        {item.type === "extra_drop" && (
                          <Input value={item.location ?? ""} onChange={(e) => updateLineItem(item.id, "location", e.target.value)} placeholder="Location" className="bg-secondary/50 h-9" />
                        )}
                        <Select value={item.tonnage ?? ""} onValueChange={(v) => updateLineItem(item.id, "tonnage", v)}>
                          <SelectTrigger className="bg-secondary/50 h-9 text-xs"><SelectValue placeholder="T (Tonnage)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1T">1T</SelectItem>
                            <SelectItem value="2T">2T</SelectItem>
                            <SelectItem value="3T">3T</SelectItem>
                            <SelectItem value="5T">5T</SelectItem>
                            <SelectItem value="10T">10T</SelectItem>
                            <SelectItem value="15T">15T</SelectItem>
                            <SelectItem value="20T">20T</SelectItem>
                            <SelectItem value="25T">25T</SelectItem>
                            <SelectItem value="30T">30T</SelectItem>
                            <SelectItem value="40T">40T</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <div className="w-20">
                            <Input type="number" value={item.quantity === 0 ? "" : item.quantity} onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 0)} onBlur={(e) => { if (!parseInt(e.target.value)) updateLineItem(item.id, "quantity", 1); }} placeholder="Qty" min={1} className="bg-secondary/50 h-9" />
                          </div>
                          <div className="flex-1">
                            <Input type="number" value={item.price || ""} onChange={(e) => updateLineItem(item.id, "price", parseFloat(e.target.value) || 0)} placeholder="Rate (₦)" className="bg-secondary/50 h-9" />
                          </div>
                          <div className="flex items-center min-w-[90px] text-right text-sm font-semibold">{formatCurrency(item.quantity * item.price)}</div>
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Select value={item.vatType ?? "none"} onValueChange={(v) => updateLineItem(item.id, "vatType", v as LineItem["vatType"])}>
                              <SelectTrigger className="bg-secondary/50 h-9 text-xs"><SelectValue placeholder="Tax type" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">No VAT</SelectItem>
                                <SelectItem value="inclusive">VAT Inclusive (7.5%)</SelectItem>
                                <SelectItem value="exclusive">VAT Exclusive (+7.5%)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-1">
                            <Input type="number" min="0" step="any" value={item.serviceCharge === 0 ? "" : (item.serviceCharge ?? "")} onChange={(e) => updateLineItem(item.id, "serviceCharge", parseFloat(e.target.value) || 0)} placeholder="Service charge (₦)" className="bg-secondary/50 h-9 text-xs" />
                          </div>
                          {(item.serviceCharge ?? 0) > 0 && (
                            <div className="flex-1">
                              <Select value={item.serviceChargeVat ?? "none"} onValueChange={(v) => updateLineItem(item.id, "serviceChargeVat", v as LineItem["serviceChargeVat"])}>
                                <SelectTrigger className="bg-secondary/50 h-9 text-xs"><SelectValue placeholder="SC VAT" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">SC: No VAT</SelectItem>
                                  <SelectItem value="inclusive">SC: VAT Incl. (7.5%)</SelectItem>
                                  <SelectItem value="exclusive">SC: VAT Excl. (+7.5%)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Due Date */}
                <div className="space-y-2 pt-2">
                  <Label htmlFor="edit_due_date">Due Date</Label>
                  <Input
                    id="edit_due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, due_date: e.target.value }))}
                    className="bg-secondary/50"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="edit_notes">Notes (Optional)</Label>
                  <Input
                    id="edit_notes"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Additional notes..."
                    className="bg-secondary/50"
                  />
                </div>
              </div>
            </div>

            {/* Right Side - Preview */}
            <div className="w-full lg:w-[380px] bg-white p-4 border-t lg:border-t-0 lg:border-l border-border/30 overflow-y-auto min-h-0">
              {loadingCompanySettings ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
              ) : (
                <div className="bg-white text-gray-900 text-xs" style={{ fontFamily: "Arial, sans-serif" }}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-shrink-0">
                      {companyProfile?.company_logo ? (
                        <img src={companyProfile.company_logo} alt="Company Logo" className="max-w-[120px] max-h-[80px] object-contain" />
                      ) : (
                        <div className="w-[80px] h-[55px] bg-gradient-to-br from-orange-400 to-orange-600 rounded flex items-center justify-center">
                          <span className="text-white text-lg font-bold">{companyProfile?.company_name?.charAt(0) || "C"}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <h1 className="text-xl font-light text-gray-700">Invoice</h1>
                      <p className="text-gray-500 text-[10px]"># {editingInvoice?.invoice_number}</p>
                      <div className="mt-2">
                        <p className="text-[9px] text-gray-500 uppercase">Balance Due</p>
                        <p className="text-sm font-semibold text-gray-900">NGN{Math.round(invoiceTotals.total).toLocaleString()}.00</p>
                      </div>
                    </div>
                  </div>
                  <div className="mb-3 text-[10px]">
                    <p className="font-semibold text-gray-900">{companyProfile?.company_name || "Your Company Name"}</p>
                    {companyProfile?.company_address && <p className="text-gray-600">{companyProfile.company_address}</p>}
                    {companyProfile?.company_phone && <p className="text-gray-600">{companyProfile.company_phone}</p>}
                    {companyProfile?.company_email && <p className="text-gray-600">{companyProfile.company_email}</p>}
                  </div>
                  <div className="flex justify-between mb-4">
                    <p className="font-semibold text-gray-900">{customers.find(c => c.id === formData.customer_id)?.company_name || "Select customer"}</p>
                    <div className="text-right text-[10px]">
                      <div className="flex justify-end gap-2"><span className="text-gray-500">Invoice Date :</span><span className="text-gray-900">{editingInvoice ? new Date(editingInvoice.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span></div>
                      <div className="flex justify-end gap-2"><span className="text-gray-500">Due Date :</span><span className="text-gray-900">{formData.due_date ? new Date(formData.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span></div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <table className="w-full border-collapse text-[10px]">
                      <thead>
                        <tr style={{ backgroundColor: "#2d2d2d" }}>
                          <th className="text-left py-2 px-1 text-white font-medium w-5">#</th>
                          <th className="text-left py-2 px-1 text-white font-medium">Description</th>
                          <th className="text-center py-2 px-1 text-white font-medium w-10">T</th>
                          <th className="text-center py-2 px-1 text-white font-medium w-8">Qty</th>
                          <th className="text-right py-2 px-1 text-white font-medium w-14">Rate</th>
                          <th className="text-right py-2 px-1 text-white font-medium w-16">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, index) => (
                          <tr key={item.id} className="border-b border-gray-200">
                            <td className="py-1 px-1 text-gray-900 align-top">{index + 1}</td>
                            <td className="py-1 px-1 text-gray-900">
                              <div className="font-medium">{item.description}</div>
                              {item.location && <div className="text-gray-500 text-[9px]">{item.location}</div>}
                              {item.serviceCharge && item.serviceCharge > 0 && <div className="text-gray-500 text-[9px]">SC: ₦{item.serviceCharge.toLocaleString()}</div>}
                              {item.vatType && item.vatType !== "none" && <div className="text-gray-400 text-[9px]">VAT {item.vatType}</div>}
                            </td>
                            <td className="py-1 px-1 text-gray-900 text-center">{item.tonnage || "—"}</td>
                            <td className="py-1 px-1 text-gray-900 text-center">{item.quantity.toFixed(2)}</td>
                            <td className="py-1 px-1 text-gray-900 text-right">{item.price.toLocaleString()}</td>
                            <td className="py-1 px-1 text-gray-900 text-right">{(item.quantity * item.price).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end mb-4">
                    <table className="w-[185px] text-[10px]">
                      <tbody>
                        <tr>
                          <td className="py-1 text-right text-gray-600">Sub Total</td>
                          <td className="py-1 text-right text-gray-900 pl-4">{invoiceTotals.lineSubtotal.toLocaleString()}.00</td>
                        </tr>
                        {invoiceTotals.totalServiceCharge > 0 && (
                          <tr>
                            <td className="py-1 text-right text-gray-600">Service Charges</td>
                            <td className="py-1 text-right text-gray-900 pl-4">{Math.round(invoiceTotals.totalServiceCharge).toLocaleString()}.00</td>
                          </tr>
                        )}
                        {invoiceTotals.vatAmount > 0 && (
                          <tr>
                            <td className="py-1 text-right text-gray-600">VAT (7.5%)</td>
                            <td className="py-1 text-right text-gray-900 pl-4">{Math.round(invoiceTotals.vatAmount).toLocaleString()}.00</td>
                          </tr>
                        )}
                        <tr className="border-t border-gray-300">
                          <td className="py-2 text-right font-semibold text-gray-900">Total</td>
                          <td className="py-2 text-right font-semibold text-gray-900 pl-4">NGN{Math.round(invoiceTotals.total).toLocaleString()}.00</td>
                        </tr>
                        <tr className="bg-gray-100">
                          <td className="py-2 px-2 text-right font-semibold text-gray-900">Balance Due</td>
                          <td className="py-2 px-2 text-right font-bold text-gray-900">NGN{Math.round(invoiceTotals.total).toLocaleString()}.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  {bankDetails && <div className="mb-4 text-[10px]"><p className="text-gray-900">{bankDetails.account_number}</p><p className="text-gray-600">{bankDetails.bank_name}</p></div>}
                  <div className="border-t border-gray-200 pt-3">
                    <div className="flex justify-between items-end">
                      <div className="text-[10px]">
                        {companyProfile?.company_name && <p className="text-gray-600">{companyProfile.company_name}</p>}
                        {companyProfile?.tin_number && <p className="text-gray-600">TIN - {companyProfile.tin_number}</p>}
                      </div>
                      <div className="text-center">
                        {companyProfile?.authorized_signature && <div className="mb-1"><img src={companyProfile.authorized_signature} alt="Authorized Signature" className="max-h-8 object-contain mx-auto" /></div>}
                        <p className="text-[9px] text-gray-600 border-t border-gray-300 pt-1">For {companyProfile?.company_name || "Company"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border/50 bg-background shrink-0">
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingInvoice(null); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Detail Dialog */}
      <Dialog
        open={!!selectedInvoice}
        onOpenChange={() => setSelectedInvoice(null)}
      >
        <DialogContent className="sm:max-w-[500px]">
          {selectedInvoice && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {selectedInvoice.invoice_number}
                </DialogTitle>
                <DialogDescription>
                  Invoice details and breakdown
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <p className="font-medium text-foreground">
                      {selectedInvoice.customers?.company_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payment Status</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground capitalize">
                        {selectedInvoice.status}
                      </p>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              Change
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => updateInvoiceStatus(selectedInvoice.id, 'paid')}>
                              Paid
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateInvoiceStatus(selectedInvoice.id, 'pending')}>
                              Pending
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => updateInvoiceStatus(selectedInvoice.id, 'overdue')}>
                              Overdue
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  {selectedInvoice.approval_status && (
                    <div>
                      <p className="text-sm text-muted-foreground">Approval Status</p>
                      <span className={`status-badge ${approvalStatusConfig[selectedInvoice.approval_status]?.className || 'bg-muted text-muted-foreground'}`}>
                        {approvalStatusConfig[selectedInvoice.approval_status]?.label || selectedInvoice.approval_status}
                      </span>
                    </div>
                  )}
                  {selectedInvoice.first_approver && (
                    <div>
                      <p className="text-sm text-muted-foreground">First Approval</p>
                      <p className="font-medium text-foreground text-sm">{selectedInvoice.first_approver.full_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedInvoice.first_approver.email}</p>
                      {selectedInvoice.first_approved_at && (
                        <p className="text-xs text-success">
                          {new Date(selectedInvoice.first_approved_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedInvoice.second_approver && (
                    <div>
                      <p className="text-sm text-muted-foreground">Final Approval</p>
                      <p className="font-medium text-foreground text-sm">{selectedInvoice.second_approver.full_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedInvoice.second_approver.email}</p>
                      {selectedInvoice.second_approved_at && (
                        <p className="text-xs text-success">
                          {new Date(selectedInvoice.second_approved_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedInvoice.paid_date && (
                    <div>
                      <p className="text-sm text-muted-foreground">Paid Date</p>
                      <p className="font-medium text-success">
                        {new Date(selectedInvoice.paid_date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {selectedInvoice.dispatches && (
                    <>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Route</p>
                        <p className="font-medium text-foreground text-sm">
                          {selectedInvoice.dispatches.pickup_address} → {selectedInvoice.dispatches.delivery_address}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Distance</p>
                        <p className="font-medium text-foreground">
                          {selectedInvoice.dispatches.distance_km || 'N/A'} km
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t border-border/50 pt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="text-foreground">
                      {formatCurrency(selectedInvoice.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="text-foreground">
                      {formatCurrency(selectedInvoice.tax_amount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold">
                    <span className="text-foreground">Total Amount</span>
                    <span className="text-primary">
                      {formatCurrency(selectedInvoice.total_amount)}
                    </span>
                  </div>
                </div>

                {selectedInvoice.zoho_invoice_id && (
                  <div className="border-t border-border/50 pt-4">
                    <p className="text-sm text-muted-foreground">Zoho Invoice ID</p>
                    <p className="text-foreground">{selectedInvoice.zoho_invoice_id}</p>
                    {selectedInvoice.zoho_synced_at && (
                      <p className="text-xs text-muted-foreground">
                        Synced: {new Date(selectedInvoice.zoho_synced_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}

                {selectedInvoice.notes && (
                  <div className="border-t border-border/50 pt-4">
                    <p className="text-sm text-muted-foreground">Notes</p>
                    <p className="text-foreground">{selectedInvoice.notes}</p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
                  Close
                </Button>
                {canCreateInvoice && (
                  <Button
                    variant="outline"
                    onClick={() => { setSelectedInvoice(null); openEditDialog(selectedInvoice); }}
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                )}
                <Button
                  onClick={() => handleDownloadPDF(selectedInvoice)}
                  disabled={pdfDownloading === selectedInvoice.id}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {pdfDownloading === selectedInvoice.id ? "Downloading..." : "Download PDF"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default InvoicesPage;
