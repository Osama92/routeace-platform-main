import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Pencil,
  Target,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  AlertTriangle,
  RefreshCw,
  FileDown,
  Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import CustomerProfitabilityReport from "@/components/analytics/CustomerProfitabilityReport";
import BudgetVarianceAnalysis from "@/components/analytics/BudgetVarianceAnalysis";

interface PnLData {
  revenue: number;
  collected: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  grossMargin: number;
  netMargin: number;
}

interface FinancialTarget {
  id: string;
  target_type: string;
  target_month: number | null;
  target_year: number;
  revenue_target: number;
  expense_target: number;
  profit_target: number;
  cogs_target: number;
  status: string;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
}

interface SLABreachAlert {
  id: string;
  dispatch_id: string;
  breach_type: string;
  expected_time: string | null;
  actual_time: string | null;
  delay_hours: number | null;
  is_resolved: boolean;
  created_at: string;
  dispatches?: {
    dispatch_number: string;
    customers?: {
      company_name: string;
    };
  };
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const AdminAnalytics = () => {
  const [pnlData, setPnlData] = useState<PnLData>({
    revenue: 0,
    collected: 0,
    cogs: 0,
    grossProfit: 0,
    operatingExpenses: 0,
    netProfit: 0,
    grossMargin: 0,
    netMargin: 0,
  });
  const [monthlyPnl, setMonthlyPnl] = useState<any[]>([]);
  const [targets, setTargets] = useState<FinancialTarget[]>([]);
  const [slaBreaches, setSlaBreaches] = useState<SLABreachAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<FinancialTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingSLA, setCheckingSLA] = useState(false);
  const { toast } = useToast();
  const { user, hasAnyRole } = useAuth();

  const isAdmin = hasAnyRole(["admin"]);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // P&L period selector — defaults to current month
  const [pnlYear, setPnlYear] = useState(currentYear);
  const [pnlMonth, setPnlMonth] = useState(currentMonth);

  const [targetForm, setTargetForm] = useState({
    target_type: "monthly",
    target_month: currentMonth.toString(),
    target_year: currentYear.toString(),
    revenue_target: "",
    expense_target: "",
    profit_target: "",
    cogs_target: "",
    notes: "",
  });

  const fetchPnLData = async () => {
    try {
      // Build date range for the selected month
      const periodStart = `${pnlYear}-${String(pnlMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(pnlYear, pnlMonth, 0).getDate();
      const periodEnd = `${pnlYear}-${String(pnlMonth).padStart(2, '0')}-${lastDay}T23:59:59`;

      // Fetch invoices for selected month — use invoice_date so invoices are attributed
      // to the month they were issued, not the month they were created in the system
      const { data: invoices, error: invError } = await supabase
        .from("invoices")
        .select("total_amount, status, invoice_date")
        .gte("invoice_date", periodStart.split("T")[0])
        .lte("invoice_date", periodEnd.split("T")[0]);

      if (invError) throw invError;

      // Fetch expenses for selected month
      const { data: expenses, error: expError } = await supabase
        .from("expenses")
        .select("amount, is_cogs, expense_date, category")
        .gte("expense_date", periodStart.split("T")[0])
        .lte("expense_date", periodEnd.split("T")[0]);

      if (expError) throw expError;

      // Calculate totals — revenue = all invoices raised; collected = paid only
      const revenue = invoices?.reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
      const collected = invoices?.filter(inv => inv.status === "paid").reduce((sum, inv) => sum + Number(inv.total_amount), 0) || 0;
      const cogs = expenses?.filter(e => e.is_cogs).reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;
      const operatingExpenses = expenses?.filter(e => !e.is_cogs).reduce((sum, exp) => sum + Number(exp.amount), 0) || 0;
      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - operatingExpenses;
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
      const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

      setPnlData({
        revenue,
        collected,
        cogs,
        grossProfit,
        operatingExpenses,
        netProfit,
        grossMargin,
        netMargin,
      });

      // Build monthly chart data: always last 6 months regardless of period picker
      const now = new Date();
      const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return {
          key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleString('default', { month: 'short', year: '2-digit' }),
          year: d.getFullYear(),
          month: d.getMonth() + 1,
        };
      });

      // Fetch invoices and expenses for the full 6-month window
      const chartStart = `${last6Months[0].year}-${String(last6Months[0].month).padStart(2, '0')}-01`;
      const lastM = last6Months[5];
      const lastDay6 = new Date(lastM.year, lastM.month, 0).getDate();
      const chartEnd = `${lastM.year}-${String(lastM.month).padStart(2, '0')}-${lastDay6}`;

      const [{ data: chartInvoices }, { data: chartExpenses }] = await Promise.all([
        supabase.from("invoices").select("total_amount, invoice_date").gte("invoice_date", chartStart).lte("invoice_date", chartEnd),
        supabase.from("expenses").select("amount, is_cogs, expense_date").gte("expense_date", chartStart).lte("expense_date", chartEnd),
      ]);

      // Also fetch approved targets for those 6 months
      const { data: chartTargets } = await supabase
        .from("financial_targets")
        .select("target_year, target_month, revenue_target, profit_target")
        .eq("target_type", "monthly")
        .in("target_year", [...new Set(last6Months.map(m => m.year))])
        .in("target_month", [...new Set(last6Months.map(m => m.month))]);

      const targetMap: Record<string, { revTarget: number; profitTarget: number }> = {};
      (chartTargets || []).forEach((t: any) => {
        const k = `${t.target_year}-${String(t.target_month).padStart(2, '0')}`;
        targetMap[k] = { revTarget: Number(t.revenue_target || 0), profitTarget: Number(t.profit_target || 0) };
      });

      const buckets: Record<string, { revenue: number; cogs: number; opex: number }> = {};
      last6Months.forEach(m => { buckets[m.key] = { revenue: 0, cogs: 0, opex: 0 }; });

      (chartInvoices || []).forEach((inv: any) => {
        const k = inv.invoice_date?.slice(0, 7);
        if (buckets[k]) buckets[k].revenue += Number(inv.total_amount);
      });
      (chartExpenses || []).forEach((exp: any) => {
        const k = exp.expense_date?.slice(0, 7);
        if (buckets[k]) {
          if (exp.is_cogs) buckets[k].cogs += Number(exp.amount);
          else buckets[k].opex += Number(exp.amount);
        }
      });

      const chartData = last6Months.map(m => {
        const b = buckets[m.key];
        const t = targetMap[m.key] || { revTarget: 0, profitTarget: 0 };
        return {
          month: m.label,
          revenue: Math.round(b.revenue),
          cogs: Math.round(b.cogs),
          profit: Math.round(b.revenue - b.cogs - b.opex),
          revenueTarget: t.revTarget,
          profitTarget: t.profitTarget,
        };
      });

      setMonthlyPnl(chartData);

    } catch (error: any) {
      console.error('Error fetching P&L data:', error);
    }
  };

  const fetchTargets = async () => {
    try {
      const { data, error } = await supabase
        .from("financial_targets")
        .select("*")
        .order("target_year", { ascending: false })
        .order("target_month", { ascending: false });

      if (error) throw error;
      setTargets((data as FinancialTarget[]) || []);
    } catch (error: any) {
      console.error('Error fetching targets:', error);
    }
  };

  const fetchSLABreaches = async () => {
    try {
      const { data, error } = await supabase
        .from("sla_breach_alerts")
        .select(`
          *,
          dispatches(
            dispatch_number,
            customers(company_name)
          )
        `)
        .eq("is_resolved", false)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setSlaBreaches((data as SLABreachAlert[]) || []);
    } catch (error: any) {
      console.error('Error fetching SLA breaches:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPnLData(), fetchTargets(), fetchSLABreaches()]);
      setLoading(false);
    };
    loadData();
  }, []);

  // Re-fetch P&L when period changes (after initial load)
  useEffect(() => {
    fetchPnLData();
  }, [pnlYear, pnlMonth]);

  const handleCreateTarget = async () => {
    if (!targetForm.revenue_target || !targetForm.profit_target) {
      toast({
        title: "Validation Error",
        description: "Please fill in revenue and profit targets",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const year = parseInt(targetForm.target_year);
      const annualRevenue = parseFloat(targetForm.revenue_target);
      const annualProfit = parseFloat(targetForm.profit_target);
      const annualExpense = parseFloat(targetForm.expense_target) || 0;
      const annualCogs = parseFloat(targetForm.cogs_target) || 0;
      const notes = targetForm.notes || null;

      if (targetForm.target_type === "annual") {
        // Divide evenly across all 12 months — round to whole numbers, add remainder to December
        const base = (v: number) => Math.floor(v / 12);
        const remainder = (v: number) => v - base(v) * 11; // month 12 gets the remainder

        const monthlyRecords = Array.from({ length: 12 }, (_, i) => {
          const isLast = i === 11;
          return {
            target_type: "monthly",
            target_month: i + 1,
            target_year: year,
            revenue_target: isLast ? remainder(annualRevenue) : base(annualRevenue),
            expense_target: isLast ? remainder(annualExpense) : base(annualExpense),
            profit_target: isLast ? remainder(annualProfit) : base(annualProfit),
            cogs_target: isLast ? remainder(annualCogs) : base(annualCogs),
            notes: notes ? `[Annual ÷ 12] ${notes}` : "[Annual ÷ 12]",
            created_by: user?.id,
            status: "pending",
          };
        });

        // Also insert the annual summary record
        const allRecords = [
          {
            target_type: "annual",
            target_month: null,
            target_year: year,
            revenue_target: annualRevenue,
            expense_target: annualExpense,
            profit_target: annualProfit,
            cogs_target: annualCogs,
            notes,
            created_by: user?.id,
            status: "pending",
          },
          ...monthlyRecords,
        ];

        const { error } = await supabase.from("financial_targets").insert(allRecords);
        if (error) throw error;

        toast({
          title: "Annual Target Created",
          description: `Annual target split evenly across all 12 months of ${year} and submitted for approval`,
        });
      } else {
        const { error } = await supabase.from("financial_targets").insert({
          target_type: "monthly",
          target_month: parseInt(targetForm.target_month),
          target_year: year,
          revenue_target: annualRevenue,
          expense_target: annualExpense,
          profit_target: annualProfit,
          cogs_target: annualCogs,
          notes,
          created_by: user?.id,
          status: "pending",
        });
        if (error) throw error;

        toast({
          title: "Target Created",
          description: "Monthly financial target submitted for approval",
        });
      }

      setIsTargetDialogOpen(false);
      resetTargetForm();
      fetchTargets();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create target",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetTargetForm = () => {
    setTargetForm({
      target_type: "monthly",
      target_month: currentMonth.toString(),
      target_year: currentYear.toString(),
      revenue_target: "",
      expense_target: "",
      profit_target: "",
      cogs_target: "",
      notes: "",
    });
  };

  const handleEditTarget = (target: FinancialTarget) => {
    setEditingTarget(target);
    setTargetForm({
      target_type: target.target_type,
      target_month: (target.target_month ?? currentMonth).toString(),
      target_year: target.target_year.toString(),
      revenue_target: target.revenue_target.toString(),
      expense_target: (target.expense_target ?? 0).toString(),
      profit_target: target.profit_target.toString(),
      cogs_target: (target.cogs_target ?? 0).toString(),
      notes: target.notes ?? "",
    });
    setIsTargetDialogOpen(true);
  };

  const handleUpdateTarget = async () => {
    if (!editingTarget || !targetForm.revenue_target || !targetForm.profit_target) {
      toast({ title: "Validation Error", description: "Please fill in revenue and profit targets", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("financial_targets").update({
        revenue_target: parseFloat(targetForm.revenue_target),
        expense_target: parseFloat(targetForm.expense_target) || 0,
        profit_target: parseFloat(targetForm.profit_target),
        cogs_target: parseFloat(targetForm.cogs_target) || 0,
        notes: targetForm.notes || null,
      }).eq("id", editingTarget.id);
      if (error) throw error;
      toast({ title: "Target Updated", description: "Financial target updated successfully" });
      setIsTargetDialogOpen(false);
      setEditingTarget(null);
      resetTargetForm();
      fetchTargets();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update target", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleApproveTarget = async (targetId: string, approve: boolean, reason?: string) => {
    try {
      const updateData: any = {
        status: approve ? "approved" : "rejected",
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      };
      
      if (!approve && reason) {
        updateData.rejection_reason = reason;
      }

      const { error } = await supabase
        .from("financial_targets")
        .update(updateData)
        .eq("id", targetId);

      if (error) throw error;

      toast({
        title: approve ? "Target Approved" : "Target Rejected",
        description: approve ? "Financial target has been approved" : "Financial target has been rejected",
      });
      fetchTargets();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update target",
        variant: "destructive",
      });
    }
  };

  const checkSLABreaches = async () => {
    setCheckingSLA(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-sla-breaches');
      
      if (error) throw error;
      
      toast({
        title: "SLA Check Complete",
        description: `Found ${data.newBreaches || 0} new breaches, ${data.overdueInvoices || 0} overdue invoices`,
      });
      fetchSLABreaches();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to check SLA breaches",
        variant: "destructive",
      });
    } finally {
      setCheckingSLA(false);
    }
  };

  const resolveSLABreach = async (breachId: string) => {
    try {
      const { error } = await supabase
        .from("sla_breach_alerts")
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
        })
        .eq("id", breachId);

      if (error) throw error;

      toast({
        title: "Breach Resolved",
        description: "SLA breach has been marked as resolved",
      });
      fetchSLABreaches();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to resolve breach",
        variant: "destructive",
      });
    }
  };

  const sendSLABreachEmail = async (breach: SLABreachAlert) => {
    try {
      const { error } = await supabase.functions.invoke('send-sla-breach-email', {
        body: {
          breachId: breach.id,
          dispatchNumber: breach.dispatches?.dispatch_number || 'N/A',
          customerName: breach.dispatches?.customers?.company_name || 'N/A',
          breachType: breach.breach_type,
          delayHours: breach.delay_hours || 0,
          expectedTime: breach.expected_time,
          actualTime: breach.actual_time,
        },
      });

      if (error) throw error;

      toast({
        title: "Email Sent",
        description: "SLA breach notification email has been sent",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    }
  };

  const exportPnLToPDF = () => {
    const doc = new jsPDF();
    const currentDate = format(new Date(), "MMMM dd, yyyy");
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("Profit & Loss Statement", 105, 20, { align: "center" });
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated on: ${currentDate}`, 105, 28, { align: "center" });
    doc.text("RouteAce Logistics", 105, 35, { align: "center" });

    // P&L Table
    const pnlTableData = [
      ["Revenue", formatCurrencyPlain(pnlData.revenue)],
      ["Less: Cost of Goods Sold (COGS)", `(${formatCurrencyPlain(pnlData.cogs)})`],
      ["Gross Profit", formatCurrencyPlain(pnlData.grossProfit)],
      ["Gross Margin", `${pnlData.grossMargin.toFixed(1)}%`],
      ["Less: Operating Expenses", `(${formatCurrencyPlain(pnlData.operatingExpenses)})`],
      ["Net Profit / (Loss)", formatCurrencyPlain(pnlData.netProfit)],
      ["Net Margin", `${pnlData.netMargin.toFixed(1)}%`],
    ];

    autoTable(doc, {
      startY: 45,
      head: [["Description", "Amount (NGN)"]],
      body: pnlTableData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      styles: { fontSize: 11 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 60, halign: "right" },
      },
      didParseCell: (data) => {
        // Highlight key rows
        if (data.row.index === 2 || data.row.index === 5) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 249, 255];
        }
      },
    });

    // Monthly Trend Table
    if (monthlyPnl.length > 0) {
      const finalY = (doc as any).lastAutoTable.finalY || 100;
      
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text("Monthly Performance", 14, finalY + 15);

      const monthlyTableData = monthlyPnl.map((m) => [
        m.month,
        formatCurrencyPlain(m.revenue),
        formatCurrencyPlain(m.cogs),
        formatCurrencyPlain(m.opex),
        formatCurrencyPlain(m.profit),
      ]);

      autoTable(doc, {
        startY: finalY + 20,
        head: [["Month", "Revenue", "COGS", "OpEx", "Net Profit"]],
        body: monthlyTableData,
        theme: "grid",
        headStyles: { fillColor: [34, 197, 94], textColor: 255 },
        styles: { fontSize: 10 },
      });
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Page ${i} of ${pageCount} | RouteAce Logistics | Confidential`,
        105,
        doc.internal.pageSize.height - 10,
        { align: "center" }
      );
    }

    doc.save(`PnL_Statement_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    
    toast({
      title: "PDF Exported",
      description: "P&L Statement has been downloaded",
    });
  };

  const formatCurrencyPlain = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-success/15 text-success"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case "rejected":
        return <Badge className="bg-destructive/15 text-destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge className="bg-warning/15 text-warning"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Admin Analytics" subtitle="Financial overview and reporting">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Admin Analytics"
      subtitle="P&L Statement, Targets & SLA Monitoring"
    >
      <Tabs defaultValue="pnl" className="space-y-6">
        <TabsList className="bg-secondary/50 flex-wrap">
          <TabsTrigger value="pnl">P&L Statement</TabsTrigger>
          <TabsTrigger value="profitability">Customer Profitability</TabsTrigger>
          <TabsTrigger value="variance">Budget Variance</TabsTrigger>
          <TabsTrigger value="targets">Financial Targets</TabsTrigger>
          <TabsTrigger value="sla">SLA Alerts</TabsTrigger>
        </TabsList>

        {/* P&L Statement Tab */}
        <TabsContent value="pnl" className="space-y-6">
          {/* Period selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={pnlMonth.toString()} onValueChange={(v) => setPnlMonth(Number(v))}>
              <SelectTrigger className="w-36 bg-secondary/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m, i) => (
                  <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pnlYear.toString()} onValueChange={(v) => setPnlYear(Number(v))}>
              <SelectTrigger className="w-28 bg-secondary/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear - 2, currentYear - 1, currentYear].map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              Showing P&L for {months[pnlMonth - 1]} {pnlYear}
            </span>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-heading font-bold text-foreground leading-tight break-all">{formatCurrency(pnlData.revenue)}</p>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-xs text-success mt-0.5">Collected: {formatCurrency(pnlData.collected)}</p>
                </div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-warning/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <DollarSign className="w-5 h-5 text-warning" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-heading font-bold text-foreground leading-tight break-all">{formatCurrency(pnlData.grossProfit)}</p>
                  <p className="text-sm text-muted-foreground">Gross Profit ({pnlData.grossMargin.toFixed(1)}%)</p>
                </div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <TrendingDown className="w-5 h-5 text-destructive" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-heading font-bold text-foreground leading-tight break-all">{formatCurrency(pnlData.operatingExpenses)}</p>
                  <p className="text-sm text-muted-foreground">Operating Expenses</p>
                </div>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xl font-heading font-bold leading-tight break-all ${pnlData.netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(pnlData.netProfit)}
                  </p>
                  <p className="text-sm text-muted-foreground">Net Profit ({pnlData.netMargin.toFixed(1)}%)</p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* P&L Statement Table */}
          <Card className="glass-card border-border/50">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-heading">Profit & Loss Statement</CardTitle>
              <Button variant="outline" onClick={exportPnLToPDF}>
                <FileDown className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow className="border-border/50 bg-success/5">
                    <TableCell className="font-semibold text-lg">Revenue</TableCell>
                    <TableCell className="text-right font-bold text-lg text-success">{formatCurrency(pnlData.revenue)}</TableCell>
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="pl-8 text-muted-foreground text-sm">Collected (Paid Invoices)</TableCell>
                    <TableCell className="text-right text-success text-sm">{formatCurrency(pnlData.collected)}</TableCell>
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="pl-8">Less: Cost of Goods Sold (COGS)</TableCell>
                    <TableCell className="text-right text-destructive">({formatCurrency(pnlData.cogs)})</TableCell>
                  </TableRow>
                  <TableRow className="border-border/50 bg-warning/5">
                    <TableCell className="font-semibold text-lg">Gross Profit</TableCell>
                    <TableCell className="text-right font-bold text-lg">{formatCurrency(pnlData.grossProfit)}</TableCell>
                  </TableRow>
                  <TableRow className="border-border/50">
                    <TableCell className="pl-8">Less: Operating Expenses</TableCell>
                    <TableCell className="text-right text-destructive">({formatCurrency(pnlData.operatingExpenses)})</TableCell>
                  </TableRow>
                  <TableRow className="border-border/50 bg-primary/5">
                    <TableCell className="font-bold text-xl">Net Profit / (Loss)</TableCell>
                    <TableCell className={`text-right font-bold text-xl ${pnlData.netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(pnlData.netProfit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Monthly Trend Chart */}
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="font-heading">Monthly Performance Trend vs Targets (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={monthlyPnl} barCategoryGap="18%" barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    tickFormatter={(v: number) => {
                      if (Math.abs(v) >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;
                      if (Math.abs(v) >= 1_000) return `₦${(v / 1_000).toFixed(0)}K`;
                      return `₦${v}`;
                    }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number, name: string) => [
                      new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value),
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} formatter={(v) => <span style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="revenueTarget" name="Revenue Target" fill="hsl(142 76% 36% / 0.3)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Net Profit" radius={[4, 4, 0, 0]}>
                    {monthlyPnl.map((entry, i) => (
                      <Cell key={i} fill={entry.profit >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />
                    ))}
                  </Bar>
                  <Bar dataKey="profitTarget" name="Profit Target" fill="hsl(var(--primary) / 0.25)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {monthlyPnl.every(m => m.revenueTarget === 0) && (
                <p className="text-xs text-muted-foreground text-center mt-2">No targets configured — set them in the Financial Targets tab</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customer Profitability Tab */}
        <TabsContent value="profitability" className="space-y-6">
          <CustomerProfitabilityReport month={pnlMonth} year={pnlYear} />
        </TabsContent>

        {/* Budget Variance Tab */}
        <TabsContent value="variance" className="space-y-6">
          <BudgetVarianceAnalysis month={pnlMonth} year={pnlYear} />
        </TabsContent>

        {/* Financial Targets Tab */}
        <TabsContent value="targets" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-heading font-bold">Financial Targets</h2>
            {isAdmin && (
              <Dialog open={isTargetDialogOpen} onOpenChange={(open) => {
                setIsTargetDialogOpen(open);
                if (!open) { setEditingTarget(null); resetTargetForm(); }
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Target
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>{editingTarget ? "Edit Financial Target" : "Create Financial Target"}</DialogTitle>
                    <DialogDescription>
                      {editingTarget
                        ? "Update the target values below. Period and type cannot be changed."
                        : targetForm.target_type === "annual"
                          ? `Annual targets will be automatically split evenly across all 12 months of ${targetForm.target_year}`
                          : "Set revenue, expense, and profit targets for approval"}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Target Type</Label>
                        <Select value={targetForm.target_type} onValueChange={(v) => setTargetForm(p => ({ ...p, target_type: v }))} disabled={!!editingTarget}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="annual">Annual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Year</Label>
                        <Select value={targetForm.target_year} onValueChange={(v) => setTargetForm(p => ({ ...p, target_year: v }))} disabled={!!editingTarget}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {!editingTarget && targetForm.target_type === "monthly" && (
                      <div className="space-y-2">
                        <Label>Month</Label>
                        <Select value={targetForm.target_month} onValueChange={(v) => setTargetForm(p => ({ ...p, target_month: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {months.map((m, i) => (
                              <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {editingTarget && targetForm.target_type === "monthly" && (
                      <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                        Period: {months[(editingTarget.target_month ?? 1) - 1]} {editingTarget.target_year} (cannot be changed)
                      </p>
                    )}
                    {!editingTarget && targetForm.target_type === "annual" && (
                      <p className="text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
                        Each value will be divided by 12 and saved as a monthly target for Jan–Dec {targetForm.target_year}. Any remainder goes to December.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Revenue Target (₦) *</Label>
                        <Input type="number" value={targetForm.revenue_target} onChange={(e) => setTargetForm(p => ({ ...p, revenue_target: e.target.value }))} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <Label>COGS Target (₦)</Label>
                        <Input type="number" value={targetForm.cogs_target} onChange={(e) => setTargetForm(p => ({ ...p, cogs_target: e.target.value }))} placeholder="0" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Expense Target (₦)</Label>
                        <Input type="number" value={targetForm.expense_target} onChange={(e) => setTargetForm(p => ({ ...p, expense_target: e.target.value }))} placeholder="0" />
                      </div>
                      <div className="space-y-2">
                        <Label>Profit Target (₦) *</Label>
                        <Input type="number" value={targetForm.profit_target} onChange={(e) => setTargetForm(p => ({ ...p, profit_target: e.target.value }))} placeholder="0" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={targetForm.notes} onChange={(e) => setTargetForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes..." />
                    </div>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => { setIsTargetDialogOpen(false); setEditingTarget(null); resetTargetForm(); }}>Cancel</Button>
                    <Button onClick={editingTarget ? handleUpdateTarget : handleCreateTarget} disabled={saving}>
                      {saving ? "Saving..." : editingTarget ? "Save Changes" : "Submit for Approval"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card className="glass-card border-border/50">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Revenue Target</TableHead>
                    <TableHead className="text-right">COGS Target</TableHead>
                    <TableHead className="text-right">Profit Target</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No targets set yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    targets.map((target) => (
                      <TableRow key={target.id} className="border-border/50">
                        <TableCell className="font-medium">
                          {target.target_type === "monthly"
                            ? `${months[(target.target_month || 1) - 1]} ${target.target_year}`
                            : `Annual ${target.target_year}`}
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(target.revenue_target)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(target.cogs_target)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(target.profit_target)}</TableCell>
                        <TableCell>{getStatusBadge(target.status)}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            {target.status === "pending" && (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" className="text-muted-foreground" onClick={() => handleEditTarget(target)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" className="text-success" onClick={() => handleApproveTarget(target.id, true)}>
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" className="text-destructive" onClick={() => handleApproveTarget(target.id, false, "Rejected by admin")}>
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SLA Alerts Tab */}
        <TabsContent value="sla" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-heading font-bold">SLA Breach Alerts</h2>
            <Button variant="outline" onClick={checkSLABreaches} disabled={checkingSLA}>
              {checkingSLA ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Check for Breaches
            </Button>
          </div>

          {slaBreaches.length > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">{slaBreaches.length} Unresolved SLA Breaches</p>
                <p className="text-sm text-muted-foreground">Action required to resolve delivery delays</p>
              </div>
            </motion.div>
          )}

          <Card className="glass-card border-border/50">
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>Dispatch</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Breach Type</TableHead>
                    <TableHead>Delay</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slaBreaches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        <CheckCircle className="w-8 h-8 mx-auto mb-2 text-success" />
                        No active SLA breaches
                      </TableCell>
                    </TableRow>
                  ) : (
                    slaBreaches.map((breach) => (
                      <TableRow key={breach.id} className="border-border/50">
                        <TableCell className="font-medium">
                          {breach.dispatches?.dispatch_number || "N/A"}
                        </TableCell>
                        <TableCell>{breach.dispatches?.customers?.company_name || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {breach.breach_type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-destructive font-medium">
                          {breach.delay_hours ? `${breach.delay_hours.toFixed(1)} hours` : "N/A"}
                        </TableCell>
                        <TableCell>{format(new Date(breach.created_at), "MMM dd, HH:mm")}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => sendSLABreachEmail(breach)} title="Send Email Alert">
                              <Mail className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => resolveSLABreach(breach.id)}>
                              Resolve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
};

export default AdminAnalytics;
