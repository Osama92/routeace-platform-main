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
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  created_at: string;
  zoho_invoice_id?: string | null;
  zoho_synced_at?: string | null;
  status_updated_at?: string | null;
  customers?: {
    company_name: string;
  };
  dispatches?: {
    pickup_address: string;
    delivery_address: string;
    distance_km: number | null;
  } | null;
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
    tax_type: "none" as "none" | "inclusive" | "exclusive",
    tax_amount: "0",
    due_date: "",
    notes: "",
  });

  // Line items state for the new invoice creation
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", type: "delivery", description: "Delivery Service", quantity: 1, price: 0 }
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
      { id: generateItemId(), type, description: descriptions[type], quantity: 1, price: 0, location: "" }
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

  // Calculate totals from line items (fuel items are not taxable)
  const invoiceTotals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.price), 0);
    // Calculate taxable amount (exclude fuel items)
    const taxableAmount = lineItems
      .filter(item => item.type !== "fuel")
      .reduce((sum, item) => sum + (item.quantity * item.price), 0);
    const fuelAmount = lineItems
      .filter(item => item.type === "fuel")
      .reduce((sum, item) => sum + (item.quantity * item.price), 0);

    let vatAmount = 0;
    let total = subtotal;

    if (formData.tax_type === "exclusive") {
      // 7.5% VAT added on top of taxable items only
      vatAmount = taxableAmount * 0.075;
      total = subtotal + vatAmount;
    } else if (formData.tax_type === "inclusive") {
      // VAT already included in taxable items, extract it
      vatAmount = taxableAmount - (taxableAmount / 1.075);
      total = subtotal; // Total stays same for inclusive
    }

    return { subtotal, vatAmount, total, taxableAmount, fuelAmount };
  }, [lineItems, formData.tax_type]);

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

  // Calculate tax amount based on tax type
  const calculateTax = (amount: string, taxType: string): number => {
    const baseAmount = parseFloat(amount) || 0;
    if (taxType === "exclusive") {
      // 7.5% added on top
      return baseAmount * 0.075;
    } else if (taxType === "inclusive") {
      // 7.5% already included, extract tax
      return baseAmount - (baseAmount / 1.075);
    }
    return 0;
  };

  // Calculate total based on tax type
  const calculateTotal = (amount: string, taxType: string): { subtotal: number; tax: number; total: number } => {
    const baseAmount = parseFloat(amount) || 0;
    if (taxType === "exclusive") {
      const tax = baseAmount * 0.075;
      return { subtotal: baseAmount, tax, total: baseAmount + tax };
    } else if (taxType === "inclusive") {
      const subtotal = baseAmount / 1.075;
      const tax = baseAmount - subtotal;
      return { subtotal, tax, total: baseAmount };
    }
    return { subtotal: baseAmount, tax: 0, total: baseAmount };
  };

  // Update tax when amount or tax type changes
  useEffect(() => {
    const tax = calculateTax(formData.amount, formData.tax_type);
    setFormData(prev => ({ ...prev, tax_amount: tax.toFixed(2) }));
  }, [formData.amount, formData.tax_type]);

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          customers(company_name),
          dispatches(pickup_address, delivery_address, distance_km)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Auto-detect overdue invoices
      const now = new Date();
      const processedInvoices = (data || []).map((inv: any) => {
        if (inv.status === "pending" && inv.due_date) {
          const dueDate = new Date(inv.due_date);
          if (dueDate < now) {
            return { ...inv, status: "overdue" };
          }
        }
        return inv;
      });
      
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
      // Build notes from line items for record keeping
      const lineItemsNote = lineItems.map(item =>
        `${item.description}${item.location ? ` (${item.location})` : ''}: ${item.quantity} x ₦${item.price.toLocaleString()}`
      ).join('; ');

      // For non-admin users (support/operations role), set approval workflow
      const insertData: any = {
        invoice_number: generateInvoiceNumber(),
        customer_id: formData.customer_id,
        dispatch_id: formData.dispatch_id || null,
        amount: invoiceTotals.subtotal,
        tax_amount: invoiceTotals.vatAmount,
        total_amount: invoiceTotals.total,
        tax_type: formData.tax_type,
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
      tax_type: "none",
      tax_amount: "0",
      due_date: "",
      notes: "",
    });
    setLineItems([
      { id: "1", type: "delivery", description: "Delivery Service", quantity: 1, price: 0 }
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

      // Parse line items from notes
      const parseLineItems = (notes: string | null) => {
        if (!notes) return [];
        const itemsSection = notes.split('\n\nNotes:')[0];
        const items = itemsSection.split('; ').map((item, index) => {
          const match = item.match(/^(.+?)(?:\s*\(([^)]+)\))?\s*:\s*(\d+(?:\.\d+)?)\s*x\s*₦?([\d,]+(?:\.\d+)?)/);
          if (match) {
            return {
              id: String(index + 1),
              description: match[1].trim(),
              location: match[2] || '',
              quantity: parseFloat(match[3]) || 1,
              price: parseFloat(match[4].replace(/,/g, '')) || 0,
            };
          }
          return null;
        }).filter(Boolean);
        return items;
      };

      const lineItemsFromNotes = parseLineItems(invoice.notes);

      // Header - Company Logo placeholder and Invoice title
      // Left side: Company info
      if (companyProfile?.company_logo) {
        try {
          doc.addImage(companyProfile.company_logo, 'PNG', margin, yPos, 40, 25);
        } catch (e) {
          // If logo fails to load, draw a placeholder
          doc.setFillColor(249, 115, 22);
          doc.roundedRect(margin, yPos, 30, 20, 3, 3, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(16);
          doc.setFont("helvetica", "bold");
          doc.text(companyProfile?.company_name?.charAt(0) || "C", margin + 15, yPos + 13, { align: "center" });
        }
      } else {
        doc.setFillColor(249, 115, 22);
        doc.roundedRect(margin, yPos, 30, 20, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text(companyProfile?.company_name?.charAt(0) || "C", margin + 15, yPos + 13, { align: "center" });
      }

      // Right side: Invoice title and balance due
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(28);
      doc.setFont("helvetica", "normal");
      doc.text("Invoice", pageWidth - margin, yPos + 8, { align: "right" });

      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.text(`# ${invoice.invoice_number}`, pageWidth - margin, yPos + 15, { align: "right" });

      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text("Balance Due", pageWidth - margin, yPos + 25, { align: "right" });

      doc.setFontSize(14);
      doc.setTextColor(30, 30, 30);
      doc.setFont("helvetica", "bold");
      doc.text(`NGN${pdfFormatCurrency(invoice.total_amount)}`, pageWidth - margin, yPos + 32, { align: "right" });

      yPos += 45;

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

      yPos += 15;

      // Bill To and Invoice Info in two columns
      const leftColX = margin;
      const rightColX = pageWidth - margin - 60;
      const infoStartY = yPos;

      // Left: Bill To
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text(invoice.customers?.company_name || "Customer", leftColX, yPos);

      // Right: Invoice details table
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      doc.setTextColor(128, 128, 128);
      doc.text("Invoice Date :", rightColX, infoStartY);
      doc.setTextColor(30, 30, 30);
      doc.text(formatDate(invoice.created_at), pageWidth - margin, infoStartY, { align: "right" });

      doc.setTextColor(128, 128, 128);
      doc.text("Terms :", rightColX, infoStartY + 5);
      doc.setTextColor(30, 30, 30);
      doc.text("Due on Receipt", pageWidth - margin, infoStartY + 5, { align: "right" });

      doc.setTextColor(128, 128, 128);
      doc.text("Due Date :", rightColX, infoStartY + 10);
      doc.setTextColor(30, 30, 30);
      doc.text(invoice.due_date ? formatDate(invoice.due_date) : "—", pageWidth - margin, infoStartY + 10, { align: "right" });

      yPos += 25;

      // Items Table
      const tableData = lineItemsFromNotes.length > 0
        ? lineItemsFromNotes.map((item: any, index: number) => [
            index + 1,
            item.location ? `${item.description}\n${item.location}` : item.description,
            item.quantity.toFixed(2),
            pdfFormatCurrency(item.price),
            pdfFormatCurrency(item.quantity * item.price),
          ])
        : [[
            1,
            invoice.dispatches
              ? `Delivery Service\n${invoice.dispatches.pickup_address?.split(',')[0]} → ${invoice.dispatches.delivery_address?.split(',')[0]}`
              : "Service",
            "1.00",
            pdfFormatCurrency(invoice.amount),
            pdfFormatCurrency(invoice.amount),
          ]];

      autoTable(doc, {
        startY: yPos,
        head: [['#', 'Description', 'Qty', 'Rate', 'Amount']],
        body: tableData,
        theme: 'plain',
        styles: {
          fontSize: 9,
          cellPadding: 4,
          textColor: [30, 30, 30],
        },
        headStyles: {
          fillColor: [248, 248, 248],
          textColor: [100, 100, 100],
          fontStyle: 'bold',
          lineWidth: { top: 0.5, bottom: 0.5 },
          lineColor: [200, 200, 200],
        },
        columnStyles: {
          0: { cellWidth: 15, halign: 'left' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 35, halign: 'right' },
          4: { cellWidth: 40, halign: 'right' },
        },
        margin: { left: margin, right: margin },
        didDrawCell: (data: any) => {
          if (data.section === 'body') {
            doc.setDrawColor(230, 230, 230);
            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
          }
        },
      });

      // Get the final Y position after the table
      yPos = (doc as any).lastAutoTable.finalY + 10;

      // Totals Section - right aligned
      const totalsX = pageWidth - margin - 80;
      const valuesX = pageWidth - margin;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);

      // Sub Total
      doc.setTextColor(100, 100, 100);
      doc.text("Sub Total", totalsX, yPos);
      doc.setTextColor(30, 30, 30);
      doc.text(pdfFormatCurrency(invoice.amount), valuesX, yPos, { align: "right" });

      // VAT (if applicable)
      if (invoice.tax_amount > 0) {
        yPos += 6;
        doc.setTextColor(100, 100, 100);
        doc.text("VAT (7.5%)", totalsX, yPos);
        doc.setTextColor(30, 30, 30);
        doc.text(pdfFormatCurrency(invoice.tax_amount), valuesX, yPos, { align: "right" });
      }

      // Total
      yPos += 8;
      doc.setDrawColor(200, 200, 200);
      doc.line(totalsX - 10, yPos - 3, valuesX, yPos - 3);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      doc.text("Total", totalsX, yPos + 3);
      doc.text(`NGN${pdfFormatCurrency(invoice.total_amount)}`, valuesX, yPos + 3, { align: "right" });

      // Balance Due
      yPos += 10;
      doc.setFillColor(245, 245, 245);
      doc.rect(totalsX - 10, yPos - 3, valuesX - totalsX + 15, 10, 'F');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Balance Due", totalsX, yPos + 3);
      doc.text(`NGN${pdfFormatCurrency(invoice.total_amount)}`, valuesX, yPos + 3, { align: "right" });

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
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addLineItem("delivery")}
                                className="h-8 text-xs gap-1"
                              >
                                <Truck className="w-3 h-3" />
                                Delivery
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addLineItem("extra_drop")}
                                className="h-8 text-xs gap-1"
                              >
                                <MapPin className="w-3 h-3" />
                                Extra Drop
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addLineItem("fuel")}
                                className="h-8 text-xs gap-1"
                              >
                                <Fuel className="w-3 h-3" />
                                Fuel
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addLineItem("toll")}
                                className="h-8 text-xs gap-1"
                              >
                                <CircleDollarSign className="w-3 h-3" />
                                Toll
                              </Button>
                            </div>
                          </div>

                          {/* Line Items List */}
                          <div className="space-y-3">
                            {lineItems.map((item, index) => (
                              <div
                                key={item.id}
                                className="p-3 rounded-lg border border-border/50 bg-secondary/20 space-y-3"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {item.type === "delivery" && <Truck className="w-4 h-4 text-primary" />}
                                    {item.type === "extra_drop" && <MapPin className="w-4 h-4 text-warning" />}
                                    {item.type === "fuel" && <Fuel className="w-4 h-4 text-blue-500" />}
                                    {item.type === "toll" && <CircleDollarSign className="w-4 h-4 text-green-500" />}
                                    <span className="text-sm font-medium capitalize">
                                      {item.type.replace("_", " ")}
                                    </span>
                                  </div>
                                  {lineItems.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => removeLineItem(item.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  )}
                                </div>

                                <div className="space-y-2">
                                  <Input
                                    value={item.description}
                                    onChange={(e) => updateLineItem(item.id, "description", e.target.value)}
                                    placeholder="Description"
                                    className="bg-secondary/50 h-9"
                                  />
                                </div>

                                {(item.type === "extra_drop") && (
                                  <Input
                                    value={item.location || ""}
                                    onChange={(e) => updateLineItem(item.id, "location", e.target.value)}
                                    placeholder="Location"
                                    className="bg-secondary/50 h-9"
                                  />
                                )}

                                <div className="flex gap-3">
                                  <div className="w-20">
                                    <Input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => updateLineItem(item.id, "quantity", parseInt(e.target.value) || 1)}
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
                                      placeholder="Price"
                                      className="bg-secondary/50 h-9"
                                    />
                                  </div>
                                  <div className="flex items-center min-w-[100px] text-right font-semibold">
                                    {formatCurrency(item.quantity * item.price)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Tax Type Selection */}
                        <div className="space-y-2 pt-2">
                          <Label>Tax Type</Label>
                          <Select
                            value={formData.tax_type}
                            onValueChange={(value: "none" | "inclusive" | "exclusive") =>
                              setFormData(prev => ({ ...prev, tax_type: value }))
                            }
                          >
                            <SelectTrigger className="bg-secondary/50">
                              <SelectValue placeholder="Select tax type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Tax</SelectItem>
                              <SelectItem value="inclusive">Tax Inclusive (7.5% VAT included)</SelectItem>
                              <SelectItem value="exclusive">Tax Exclusive (7.5% VAT added)</SelectItem>
                            </SelectContent>
                          </Select>
                          {formData.tax_type !== "none" && invoiceTotals.fuelAmount > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Note: Fuel charges (₦{invoiceTotals.fuelAmount.toLocaleString()}) are not subject to VAT
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Preview (Zoho-style format) */}
                    <div className="w-full lg:w-[380px] bg-white p-4 border-t lg:border-t-0 lg:border-l border-border/30 overflow-y-auto min-h-0">
                      {loadingCompanySettings ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                        </div>
                      ) : (
                        <div className="bg-white text-gray-900 text-xs" style={{ fontFamily: "Arial, sans-serif" }}>
                          {/* Header Section */}
                          <div className="flex justify-between items-start mb-4">
                            {/* Company Logo */}
                            <div className="flex-shrink-0">
                              {companyProfile?.company_logo ? (
                                <img
                                  src={companyProfile.company_logo}
                                  alt="Company Logo"
                                  className="max-w-[80px] max-h-[50px] object-contain"
                                />
                              ) : (
                                <div className="w-[60px] h-[40px] bg-gradient-to-br from-orange-400 to-orange-600 rounded flex items-center justify-center">
                                  <span className="text-white text-sm font-bold">
                                    {companyProfile?.company_name?.charAt(0) || "C"}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Invoice Title */}
                            <div className="text-right">
                              <h1 className="text-xl font-light text-gray-700">Invoice</h1>
                              <p className="text-gray-500 text-[10px]"># INV-{new Date().getFullYear()}-XXX</p>
                              <div className="mt-2">
                                <p className="text-[9px] text-gray-500 uppercase">Balance Due</p>
                                <p className="text-sm font-semibold text-gray-900">
                                  NGN{Math.round(invoiceTotals.total).toLocaleString()}.00
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Company Details */}
                          <div className="mb-3 text-[10px]">
                            <p className="font-semibold text-gray-900">
                              {companyProfile?.company_name || "Your Company Name"}
                            </p>
                            {companyProfile?.company_address && (
                              <p className="text-gray-600">{companyProfile.company_address}</p>
                            )}
                            {companyProfile?.company_phone && (
                              <p className="text-gray-600">{companyProfile.company_phone}</p>
                            )}
                            {companyProfile?.company_email && (
                              <p className="text-gray-600">{companyProfile.company_email}</p>
                            )}
                            {companyProfile?.website && (
                              <p className="text-gray-600">{companyProfile.website}</p>
                            )}
                          </div>

                          {/* Bill To and Invoice Info */}
                          <div className="flex justify-between mb-4">
                            <div>
                              <p className="font-semibold text-gray-900">
                                {selectedCustomer?.company_name || "Select customer"}
                              </p>
                            </div>
                            <div className="text-right text-[10px]">
                              <div className="flex justify-end gap-2">
                                <span className="text-gray-500">Invoice Date :</span>
                                <span className="text-gray-900">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                              </div>
                              <div className="flex justify-end gap-2">
                                <span className="text-gray-500">Terms :</span>
                                <span className="text-gray-900">Due on Receipt</span>
                              </div>
                              <div className="flex justify-end gap-2">
                                <span className="text-gray-500">Due Date :</span>
                                <span className="text-gray-900">{formData.due_date ? new Date(formData.due_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                              </div>
                            </div>
                          </div>

                          {/* Items Table */}
                          <div className="mb-3">
                            <table className="w-full border-collapse text-[10px]">
                              <thead>
                                <tr className="border-t border-b border-gray-300 bg-gray-50">
                                  <th className="text-left py-2 px-2 text-gray-600 font-medium w-6">#</th>
                                  <th className="text-left py-2 px-2 text-gray-600 font-medium">Description</th>
                                  <th className="text-center py-2 px-1 text-gray-600 font-medium w-10">Qty</th>
                                  <th className="text-right py-2 px-1 text-gray-600 font-medium w-16">Rate</th>
                                  <th className="text-right py-2 px-2 text-gray-600 font-medium w-20">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lineItems.map((item, index) => (
                                  <tr key={item.id} className="border-b border-gray-200">
                                    <td className="py-2 px-2 text-gray-900 align-top">{index + 1}</td>
                                    <td className="py-2 px-2 text-gray-900">
                                      <div className="font-medium">{item.description}</div>
                                      {item.location && (
                                        <div className="text-gray-500 text-[9px]">{item.location}</div>
                                      )}
                                    </td>
                                    <td className="py-2 px-1 text-gray-900 text-center">{item.quantity.toFixed(2)}</td>
                                    <td className="py-2 px-1 text-gray-900 text-right">{item.price.toLocaleString()}.00</td>
                                    <td className="py-2 px-2 text-gray-900 text-right">{(item.quantity * item.price).toLocaleString()}.00</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Totals Section */}
                          <div className="flex justify-end mb-4">
                            <table className="w-[180px] text-[10px]">
                              <tbody>
                                <tr>
                                  <td className="py-1 text-right text-gray-600">Sub Total</td>
                                  <td className="py-1 text-right text-gray-900 pl-4">
                                    {(formData.tax_type === "inclusive"
                                      ? invoiceTotals.subtotal - invoiceTotals.vatAmount
                                      : invoiceTotals.subtotal
                                    ).toLocaleString()}.00
                                  </td>
                                </tr>
                                {formData.tax_type !== "none" && invoiceTotals.vatAmount > 0 && (
                                  <tr>
                                    <td className="py-1 text-right text-gray-600">VAT (7.5%)</td>
                                    <td className="py-1 text-right text-gray-900 pl-4">
                                      {Math.round(invoiceTotals.vatAmount).toLocaleString()}.00
                                    </td>
                                  </tr>
                                )}
                                <tr className="border-t border-gray-300">
                                  <td className="py-2 text-right font-semibold text-gray-900">Total</td>
                                  <td className="py-2 text-right font-semibold text-gray-900 pl-4">
                                    NGN{Math.round(invoiceTotals.total).toLocaleString()}.00
                                  </td>
                                </tr>
                                <tr className="bg-gray-100">
                                  <td className="py-2 px-2 text-right font-semibold text-gray-900">Balance Due</td>
                                  <td className="py-2 px-2 text-right font-bold text-gray-900">
                                    NGN{Math.round(invoiceTotals.total).toLocaleString()}.00
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Bank Details */}
                          {bankDetails && (
                            <div className="mb-4 text-[10px]">
                              <p className="text-gray-900">{bankDetails.account_number}</p>
                              <p className="text-gray-600">{bankDetails.bank_name}</p>
                            </div>
                          )}

                          {/* Footer - Signature and TIN */}
                          <div className="border-t border-gray-200 pt-3">
                            <div className="flex justify-between items-end">
                              <div className="text-[10px]">
                                {companyProfile?.company_name && (
                                  <p className="text-gray-600">{companyProfile.company_name}</p>
                                )}
                                {companyProfile?.tin_number && (
                                  <p className="text-gray-600">TIN - {companyProfile.tin_number}</p>
                                )}
                              </div>
                              <div className="text-center">
                                {companyProfile?.authorized_signature && (
                                  <div className="mb-1">
                                    <img
                                      src={companyProfile.authorized_signature}
                                      alt="Authorized Signature"
                                      className="max-h-8 object-contain mx-auto"
                                    />
                                  </div>
                                )}
                                <p className="text-[9px] text-gray-600 border-t border-gray-300 pt-1">
                                  For {companyProfile?.company_name || "Company"}
                                </p>
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
        className="glass-card overflow-hidden"
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
                      <span
                        className={`status-badge ${status.className}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
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
                    <p className="text-sm text-muted-foreground">Status</p>
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
