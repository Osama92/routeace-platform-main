import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Fuel,
  Wrench,
  Users,
  Shield,
  CircleDollarSign,
  Car,
  FileText,
  Building2,
  Calendar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  CloudUpload,
  Upload,
  Image,
  Package,
  ExternalLink,
  Pencil,
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
  dispatch_id: string | null;
  customer_id: string | null;
  notes: string | null;
  is_recurring: boolean;
  receipt_url: string | null;
  is_cogs: boolean;
  cogs_vendor_id: string | null;
  created_at: string;
  approval_status: string | null;
  first_approver_id: string | null;
  first_approved_at: string | null;
  second_approver_id: string | null;
  second_approved_at: string | null;
  rejection_reason: string | null;
  submitted_by: string | null;
  zoho_expense_id: string | null;
  zoho_synced_at: string | null;
  payment_account_id: string | null;
  payment_account_name: string | null;
}

interface BankAccount {
  id: string;
  name: string;
  account_type: string | null;
  account_number: string | null;
}

interface Partner {
  id: string;
  company_name: string;
}

interface Vehicle {
  id: string;
  registration_number: string;
}

interface Driver {
  id: string;
  full_name: string;
}

const expenseCategories = [
  { value: "cogs", label: "Cost of Goods Sold", icon: Package, color: "text-emerald-600" },
  { value: "fuel", label: "Fuel", icon: Fuel, color: "text-orange-500" },
  { value: "maintenance", label: "Maintenance", icon: Wrench, color: "text-blue-500" },
  { value: "driver_salary", label: "Driver Salary", icon: Users, color: "text-green-500" },
  { value: "employee_salary", label: "Employee Salary", icon: Users, color: "text-lime-500" },
  { value: "vat", label: "VAT", icon: FileText, color: "text-rose-500" },
  { value: "interest_payment", label: "Interest Payment", icon: TrendingDown, color: "text-red-600" },
  { value: "commission", label: "Commission", icon: CircleDollarSign, color: "text-violet-500" },
  { value: "insurance", label: "Insurance", icon: Shield, color: "text-purple-500" },
  { value: "tolls", label: "Tolls", icon: CircleDollarSign, color: "text-yellow-500" },
  { value: "parking", label: "Parking", icon: Car, color: "text-cyan-500" },
  { value: "repairs", label: "Repairs", icon: Wrench, color: "text-red-500" },
  { value: "administrative", label: "Administrative", icon: FileText, color: "text-gray-500" },
  { value: "marketing", label: "Marketing", icon: TrendingUp, color: "text-pink-500" },
  { value: "utilities", label: "Utilities", icon: Building2, color: "text-indigo-500" },
  { value: "rent", label: "Rent", icon: Building2, color: "text-amber-500" },
  { value: "equipment", label: "Equipment", icon: Wrench, color: "text-teal-500" },
  { value: "other", label: "Other", icon: CircleDollarSign, color: "text-muted-foreground" },
];

const Expenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vendors, setVendors] = useState<Partner[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [syncingBankAccounts, setSyncingBankAccounts] = useState(false);
  const [manageBankOpen, setManageBankOpen] = useState(false);
  const [editingAccountNumbers, setEditingAccountNumbers] = useState<Record<string, string>>({});
  const [savingAccountNumbers, setSavingAccountNumbers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cogsFilter, setCogsFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user, hasAnyRole } = useAuth();
  const { logChange } = useAuditLog();

  const [formData, setFormData] = useState({
    expense_date: format(new Date(), "yyyy-MM-dd"),
    category: "",
    description: "",
    amount: "",
    vendor_id: "",
    vehicle_id: "",
    driver_id: "",
    payment_account_id: "",
    notes: "",
    is_recurring: false,
    is_cogs: false,
    cogs_vendor_id: "",
    receipt_url: "",
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string>("");

  const canManage = hasAnyRole(["admin", "operations"]);

  const fetchData = async () => {
    try {
      const [expensesRes, vendorsRes, vehiclesRes, driversRes, bankAccountsRes] = await Promise.all([
        supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
        supabase.from("partners").select("id, company_name"),
        supabase.from("vehicles").select("id, registration_number"),
        supabase.from("drivers").select("id, full_name"),
        (supabase as any).from("bank_accounts").select("id, name, account_type, account_number").order("name"),
      ]);

      if (expensesRes.error) throw expensesRes.error;
      setExpenses((expensesRes.data as Expense[]) || []);
      setVendors(vendorsRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setDrivers(driversRes.data || []);
      setBankAccounts(bankAccountsRes.data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload an image under 5MB",
          variant: "destructive",
        });
        return;
      }
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReceiptPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadReceipt = async (): Promise<string | null> => {
    if (!receiptFile) return null;

    setUploading(true);
    try {
      const fileExt = receiptFile.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `receipts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('expense-receipts')
        .upload(filePath, receiptFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('expense-receipts')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload receipt",
        variant: "destructive",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.description || !formData.amount) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      let receiptUrl = formData.receipt_url;
      
      if (receiptFile) {
        receiptUrl = await uploadReceipt() || "";
      }

      const insertData = {
        expense_date: formData.expense_date || new Date().toISOString().split("T")[0],
        category: formData.category as "fuel" | "maintenance" | "driver_salary" | "insurance" | "tolls" | "parking" | "repairs" | "administrative" | "marketing" | "utilities" | "rent" | "equipment" | "other",
        description: formData.description,
        amount: parseFloat(formData.amount),
        vendor_id: formData.vendor_id || null,
        vehicle_id: formData.vehicle_id || null,
        driver_id: formData.driver_id || null,
        notes: formData.notes || null,
        is_recurring: formData.is_recurring,
        is_cogs: formData.is_cogs,
        cogs_vendor_id: formData.is_cogs ? (formData.cogs_vendor_id || null) : null,
        receipt_url: receiptUrl || null,
        created_by: user?.id,
        approval_status: "pending_first_approval",
        submitted_by: user?.id,
      };

      const { data, error } = await supabase.from("expenses").insert(insertData).select().single();

      if (error) throw error;

      // Log the creation
      if (data) {
        await logChange({
          table_name: "expenses",
          record_id: data.id,
          action: "insert",
          new_data: insertData,
        });
      }

      toast({
        title: "Success",
        description: "Expense submitted for approval",
      });
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add expense",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      expense_date: format(new Date(), "yyyy-MM-dd"),
      category: "",
      description: "",
      amount: "",
      vendor_id: "",
      vehicle_id: "",
      driver_id: "",
      payment_account_id: "",
      notes: "",
      is_recurring: false,
      is_cogs: false,
      cogs_vendor_id: "",
      receipt_url: "",
    });
    setReceiptFile(null);
    setReceiptPreview("");
  };

  const openManageAccounts = () => {
    const initial: Record<string, string> = {};
    bankAccounts.forEach(a => { initial[a.id] = a.account_number || ""; });
    setEditingAccountNumbers(initial);
    setManageBankOpen(true);
  };

  const saveAccountNumbers = async () => {
    setSavingAccountNumbers(true);
    try {
      await Promise.all(
        bankAccounts.map(a =>
          (supabase as any).from("bank_accounts")
            .update({ account_number: editingAccountNumbers[a.id] || null })
            .eq("id", a.id)
        )
      );
      // Refresh local state
      const res = await (supabase as any).from("bank_accounts").select("id, name, account_type, account_number").order("name");
      setBankAccounts(res.data || []);
      setManageBankOpen(false);
      toast({ title: "Account numbers saved" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSavingAccountNumbers(false);
    }
  };

  const syncBankAccounts = async () => {
    setSyncingBankAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: { action: 'fetch_bank_accounts' },
      });
      if (error) throw error;
      if (data.success) {
        // Use accounts returned directly from the edge function (no extra DB round-trip needed)
        const accounts: BankAccount[] = (data.bank_accounts || []).map((acc: any) => ({
          id: acc.zoho_account_id, // temporary id for display; will be replaced after DB fetch
          name: acc.name,
          account_type: acc.account_type,
        }));
        // Fetch from DB to get proper UUIDs
        const res = await (supabase as any).from("bank_accounts").select("id, name, account_type, account_number").order("name");
        setBankAccounts(res.data?.length ? res.data : accounts);
        toast({ title: "Bank accounts synced", description: `${data.count} accounts loaded from Zoho` });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast({ title: "Sync Error", description: error.message || "Failed to sync bank accounts", variant: "destructive" });
    } finally {
      setSyncingBankAccounts(false);
    }
  };

  const syncToZoho = async (expenseId?: string) => {
    if (expenseId) {
      const expense = expenses.find(e => e.id === expenseId);
      if (expense && expense.approval_status !== 'approved') {
        toast({
          title: "Cannot Sync",
          description: "Only approved expenses can be synced to Zoho",
          variant: "destructive",
        });
        return;
      }
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoho-sync', {
        body: {
          action: expenseId ? 'sync_expense' : 'sync_all_expenses',
          expenseId,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Synced to Zoho",
          description: expenseId
            ? "Expense synced successfully"
            : `Synced ${data.synced} expenses, ${data.failed} failed`,
        });
        fetchData();
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

  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch = expense.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || expense.category === categoryFilter;
    const matchesCogs = cogsFilter === "all" || 
      (cogsFilter === "cogs" && expense.is_cogs) || 
      (cogsFilter === "opex" && !expense.is_cogs);
    return matchesSearch && matchesCategory && matchesCogs;
  });

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const cogsTotal = expenses.filter(exp => exp.is_cogs).reduce((sum, exp) => sum + Number(exp.amount), 0);
  const opexTotal = expenses.filter(exp => !exp.is_cogs).reduce((sum, exp) => sum + Number(exp.amount), 0);
  
  const thisMonthExpenses = expenses
    .filter((exp) => {
      const expDate = new Date(exp.expense_date);
      const now = new Date();
      return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, exp) => sum + Number(exp.amount), 0);

  const getCategoryInfo = (category: string) => {
    return expenseCategories.find((c) => c.value === category) || expenseCategories[expenseCategories.length - 1];
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout
      title="Expenses"
      subtitle="Track and manage all business expenses"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mb-3">
            <CircleDollarSign className="w-5 h-5 text-primary" />
          </div>
          <p className="text-lg font-heading font-bold text-foreground leading-tight break-all">
            {formatCurrency(totalExpenses)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Total Expenses</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card p-4"
        >
          <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center mb-3">
            <Package className="w-5 h-5 text-destructive" />
          </div>
          <p className="text-lg font-heading font-bold text-foreground leading-tight break-all">
            {formatCurrency(cogsTotal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Cost of Goods Sold</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-4"
        >
          <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center mb-3">
            <TrendingDown className="w-5 h-5 text-warning" />
          </div>
          <p className="text-lg font-heading font-bold text-foreground leading-tight break-all">
            {formatCurrency(opexTotal)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Operating Expenses</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-4"
        >
          <div className="w-10 h-10 rounded-xl bg-info/20 flex items-center justify-center mb-3">
            <Calendar className="w-5 h-5 text-info" />
          </div>
          <p className="text-lg font-heading font-bold text-foreground leading-tight break-all">
            {formatCurrency(thisMonthExpenses)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">This Month</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-4"
        >
          <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center mb-3">
            <FileText className="w-5 h-5 text-success" />
          </div>
          <p className="text-lg font-heading font-bold text-foreground leading-tight">{expenses.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Records</p>
        </motion.div>
      </div>

      {/* Actions Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 flex-1 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search expenses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {expenseCategories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cogsFilter} onValueChange={setCogsFilter}>
            <SelectTrigger className="w-40 bg-secondary/50 border-border/50">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="cogs">COGS Only</SelectItem>
              <SelectItem value="opex">OPEX Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {canManage && (
          <>
            <Button
              variant="outline"
              onClick={syncBankAccounts}
              disabled={syncingBankAccounts}
              title="Sync bank accounts from Zoho"
            >
              {syncingBankAccounts ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sync Accounts
            </Button>
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
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Expense
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">Add New Expense</DialogTitle>
                  <DialogDescription>
                    Record a new business expense with category and details.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expense_date">Date *</Label>
                      <Input
                        id="expense_date"
                        name="expense_date"
                        type="date"
                        value={formData.expense_date}
                        onChange={handleInputChange}
                        className="bg-secondary/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Category *</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {expenseCategories.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Input
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="What was this expense for?"
                      className="bg-secondary/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (₦) *</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      value={formData.amount}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      className="bg-secondary/50"
                    />
                  </div>

                  {/* COGS Section */}
                  <div className="p-4 bg-secondary/30 rounded-lg space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="is_cogs"
                        checked={formData.is_cogs}
                        onCheckedChange={(checked) =>
                          setFormData((prev) => ({ ...prev, is_cogs: checked === true }))
                        }
                      />
                      <Label htmlFor="is_cogs" className="font-medium">
                        Cost of Goods Sold (COGS) - 3rd Party Vendor
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Check this if this expense is a direct cost related to services from a 3rd party vendor
                    </p>
                    
                    {formData.is_cogs && (
                      <div className="space-y-2 mt-2">
                        <Label>COGS Vendor</Label>
                        <Select
                          value={formData.cogs_vendor_id}
                          onValueChange={(value) =>
                            setFormData((prev) => ({ ...prev, cogs_vendor_id: value }))
                          }
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Select 3rd party vendor" />
                          </SelectTrigger>
                          <SelectContent>
                            {vendors.map((vendor) => (
                              <SelectItem key={vendor.id} value={vendor.id}>
                                {vendor.company_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="vendor_id">Vendor</Label>
                      <Select
                        value={formData.vendor_id}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, vendor_id: value }))}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Select vendor" />
                        </SelectTrigger>
                        <SelectContent>
                          {vendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.company_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vehicle_id">Vehicle</Label>
                      <Select
                        value={formData.vehicle_id}
                        onValueChange={(value) => setFormData((prev) => ({ ...prev, vehicle_id: value }))}
                      >
                        <SelectTrigger className="bg-secondary/50">
                          <SelectValue placeholder="Select vehicle" />
                        </SelectTrigger>
                        <SelectContent>
                          {vehicles.map((vehicle) => (
                            <SelectItem key={vehicle.id} value={vehicle.id}>
                              {vehicle.registration_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="driver_id">Driver</Label>
                    <Select
                      value={formData.driver_id}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, driver_id: value }))}
                    >
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            {driver.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="payment_account_id">Paid From (Bank Account)</Label>
                      <div className="flex items-center gap-1">
                        {bankAccounts.length === 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={syncBankAccounts}
                            disabled={syncingBankAccounts}
                          >
                            {syncingBankAccounts ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                            Load from Zoho
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs"
                            onClick={openManageAccounts}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit account numbers
                          </Button>
                        )}
                      </div>
                    </div>
                    <Select
                      value={formData.payment_account_id}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, payment_account_id: value }))}
                    >
                      <SelectTrigger className="bg-secondary/50">
                        <SelectValue placeholder={bankAccounts.length === 0 ? "No accounts — load from Zoho" : "Select bank account"} />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            <div className="flex flex-col">
                              <span>{account.name}</span>
                              {account.account_number && (
                                <span className="text-xs text-muted-foreground">{account.account_number}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Receipt Upload */}
                  <div className="space-y-2">
                    <Label>Receipt Image</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-4">
                      {receiptPreview ? (
                        <div className="space-y-2">
                          <img
                            src={receiptPreview}
                            alt="Receipt preview"
                            className="max-h-32 mx-auto rounded"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setReceiptFile(null);
                              setReceiptPreview("");
                            }}
                            className="w-full"
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex flex-col items-center justify-center cursor-pointer py-4"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Click to upload receipt image
                          </p>
                          <p className="text-xs text-muted-foreground">
                            PNG, JPG up to 5MB
                          </p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      placeholder="Additional notes..."
                      className="bg-secondary/50"
                    />
                  </div>
                </div>

                <DialogFooter className="mt-6">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={saving || uploading}>
                    {saving || uploading ? "Saving..." : "Add Expense"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      {/* Expenses Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Category</TableHead>
              <TableHead className="text-muted-foreground">Description</TableHead>
              <TableHead className="text-muted-foreground">Type</TableHead>
              <TableHead className="text-muted-foreground">Approval</TableHead>
              <TableHead className="text-muted-foreground">Amount</TableHead>
              <TableHead className="text-muted-foreground">Paid From</TableHead>
              <TableHead className="text-muted-foreground">Receipt</TableHead>
              <TableHead className="text-muted-foreground">Zoho</TableHead>
              {canManage && <TableHead className="text-muted-foreground">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={canManage ? 10 : 9} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    Loading expenses...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredExpenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 10 : 9} className="text-center py-8 text-muted-foreground">
                  No expenses found
                </TableCell>
              </TableRow>
            ) : (
              filteredExpenses.map((expense) => {
                const catInfo = getCategoryInfo(expense.category);
                const CatIcon = catInfo.icon;
                return (
                  <TableRow key={expense.id} className="border-border/50">
                    <TableCell className="font-medium">
                      {format(new Date(expense.expense_date), "MMM dd, yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CatIcon className={`w-4 h-4 ${catInfo.color}`} />
                        <span className="capitalize">{expense.category.replace("_", " ")}</span>
                      </div>
                    </TableCell>
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
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          expense.approval_status === "approved"
                            ? "bg-green-500/15 text-green-600 border-green-500/30"
                            : expense.approval_status === "rejected"
                            ? "bg-red-500/15 text-red-600 border-red-500/30"
                            : expense.approval_status === "pending_second_approval"
                            ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                            : "bg-yellow-500/15 text-yellow-600 border-yellow-500/30"
                        }
                      >
                        {expense.approval_status === "pending_first_approval"
                          ? "Pending 1st"
                          : expense.approval_status === "pending_second_approval"
                          ? "Pending 2nd"
                          : expense.approval_status === "approved"
                          ? "Approved"
                          : expense.approval_status === "rejected"
                          ? "Rejected"
                          : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold text-destructive">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {expense.payment_account_name || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {expense.receipt_url ? (
                        <a
                          href={expense.receipt_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <Image className="w-4 h-4" />
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {expense.zoho_synced_at ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-green-500 font-medium">Synced</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(expense.zoho_synced_at), "MMM dd, HH:mm")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not synced</span>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => syncToZoho(expense.id)}
                          disabled={syncing || expense.approval_status !== 'approved'}
                          title={expense.approval_status !== 'approved' ? "Expense must be approved first" : expense.zoho_synced_at ? "Re-sync to Zoho" : "Sync to Zoho"}
                        >
                          {syncing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <CloudUpload className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </motion.div>

      {/* Manage Bank Account Numbers Dialog */}
      <Dialog open={manageBankOpen} onOpenChange={setManageBankOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-heading">Bank Account Numbers</DialogTitle>
            <DialogDescription>
              Enter the account numbers for your Zoho banking accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2 max-h-[60vh] overflow-y-auto pr-1">
            {bankAccounts.map((account) => (
              <div key={account.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{account.name}</p>
                  <p className="text-xs text-muted-foreground">{account.account_type}</p>
                </div>
                <Input
                  className="w-44 bg-secondary/50 text-sm"
                  placeholder="Account number"
                  value={editingAccountNumbers[account.id] ?? ""}
                  onChange={(e) =>
                    setEditingAccountNumbers((prev) => ({ ...prev, [account.id]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setManageBankOpen(false)}>Cancel</Button>
            <Button onClick={saveAccountNumbers} disabled={savingAccountNumbers}>
              {savingAccountNumbers ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Expenses;
