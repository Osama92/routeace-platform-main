import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  DollarSign,
  Users,
  Calculator,
  Download,
  FileText,
  TrendingUp,
  Percent,
  Calendar,
  Printer,
  RefreshCw,
  CheckCircle,
  Loader2,
  FileDown,
  History,
  Eye,
  MapPin,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Driver {
  id: string;
  full_name: string;
  driver_type: string | null;
  salary_type: string | null;
  base_salary: number | null;
  tax_id: string | null;
  status: string | null;
  total_trips: number | null;
}

interface TripRateConfig {
  id?: string;
  truck_type: string;
  zone: string;
  rate_amount: number;
  driver_type?: 'owned' | 'vendor';
  partner_id?: string | null;
  customer_id?: string | null;
}

interface EarningsBreakdown {
  zone: string;
  truckType: string;
  count: number;
  ratePerTrip: number;
  total: number;
}

interface PayrollSummary {
  driver: Driver;
  grossMonthly: number;
  annualTax: number;
  monthlyTax: number;
  netMonthly: number;
  effectiveRate: number;
  tripCount: number;
  tripsWithinIbadan: number;
  tripsOutsideIbadan: number;
  earningsBreakdown: EarningsBreakdown[];
}

interface PayrollHistoryRecord {
  id: string;
  driver_id: string;
  driver_name: string;
  salary_type: string;
  gross_amount: number;
  tax_amount: number;
  net_amount: number;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
}

interface PayrollBatch {
  period: string;
  periodLabel: string;
  driversCount: number;
  totalGross: number;
  totalTax: number;
  totalNet: number;
  processedAt: string;
  records: PayrollHistoryRecord[];
}

// Nigeria Tax Act 2025 - Personal Income Tax (PIT) Calculator
// Effective from January 1, 2026
// Reference: https://www.ey.com/en_gl/technical/tax-alerts/nigeria-tax-act-2025-has-been-signed-highlights
interface TaxCalculationResult {
  grossIncome: number;
  taxFreeAmount: number;  // First ₦800,000 is tax-free under NTA 2025
  taxableIncome: number;
  tax: number;
  effectiveRate: number;
  isExempt: boolean;  // Income ≤₦800,000 is fully exempt
  brackets: { range: string; rate: number; taxable: number; tax: number }[];
}

const calculateNigeriaTax = (annualIncome: number): TaxCalculationResult => {
  // Nigeria Tax Act 2025: First ₦800,000 is tax-free
  const TAX_FREE_THRESHOLD = 800000;

  // If income is at or below the tax-free threshold, no tax
  if (annualIncome <= TAX_FREE_THRESHOLD) {
    return {
      grossIncome: annualIncome,
      taxFreeAmount: annualIncome,
      taxableIncome: 0,
      tax: 0,
      effectiveRate: 0,
      isExempt: true,
      brackets: []
    };
  }

  // Taxable income = Gross Income - Tax-free threshold (₦800,000)
  const taxFreeAmount = TAX_FREE_THRESHOLD;
  const taxableIncome = annualIncome - TAX_FREE_THRESHOLD;

  // Apply graduated tax rates to taxable income (income above ₦800,000)
  // Nigeria Tax Act 2025 brackets (effective Jan 1, 2026)
  let tax = 0;
  let remaining = taxableIncome;
  const bracketDetails: { range: string; rate: number; taxable: number; tax: number }[] = [];

  // Tax brackets based on Nigeria Tax Act 2025 Fourth Schedule
  // These apply to income ABOVE the ₦800,000 tax-free threshold
  const brackets = [
    { limit: 2200000, rate: 0.15, label: "₦800,001 - ₦3,000,000" },     // Next ₦2.2M at 15%
    { limit: 9000000, rate: 0.18, label: "₦3,000,001 - ₦12,000,000" },  // Next ₦9M at 18%
    { limit: 13000000, rate: 0.21, label: "₦12,000,001 - ₦25,000,000" }, // Next ₦13M at 21%
    { limit: 25000000, rate: 0.23, label: "₦25,000,001 - ₦50,000,000" }, // Next ₦25M at 23%
    { limit: Infinity, rate: 0.25, label: "Above ₦50,000,000" },         // Above ₦50M at 25%
  ];

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, bracket.limit);
    const bracketTax = taxable * bracket.rate;
    tax += bracketTax;
    remaining -= taxable;

    if (taxable > 0) {
      bracketDetails.push({
        range: bracket.label,
        rate: bracket.rate * 100,
        taxable,
        tax: bracketTax
      });
    }
  }

  // Note: Minimum tax has been abolished under Nigeria Tax Act 2025
  const effectiveRate = annualIncome > 0 ? (tax / annualIncome) * 100 : 0;

  return {
    grossIncome: annualIncome,
    taxFreeAmount,
    taxableIncome,
    tax,
    effectiveRate,
    isExempt: false,
    brackets: bracketDetails
  };
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

// Zone classification based on delivery address
const classifyZone = (address: string): 'within_ibadan' | 'outside_ibadan' => {
  const withinIbadanKeywords = ['lagos', 'sagamu', 'abeokuta', 'ibadan', 'oyo', 'iwo', 'ogbomoso'];
  const lowerAddress = address.toLowerCase();
  return withinIbadanKeywords.some(keyword => lowerAddress.includes(keyword))
    ? 'within_ibadan'
    : 'outside_ibadan';
};

// Normalize truck type to match trip_rate_config
const normalizeTruckType = (truckType: string | null, vehicleType: string | null): string => {
  if (!truckType && !vehicleType) return '10t'; // default
  const type = (truckType || vehicleType || '').toLowerCase();
  if (type.includes('trailer')) return 'trailer';
  if (type.includes('20') || type.includes('twenty')) return '20t';
  if (type.includes('15') || type.includes('fifteen')) return '15t';
  if (type.includes('5') || type.includes('five')) return '5t';
  return '10t'; // default to 10t
};

const DriverPayrollPage = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [payrollData, setPayrollData] = useState<PayrollSummary[]>([]);
  const [payrollHistory, setPayrollHistory] = useState<PayrollBatch[]>([]);
  const [tripRates, setTripRates] = useState<TripRateConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState<Set<string>>(new Set());
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedDriver, setSelectedDriver] = useState<PayrollSummary | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<PayrollBatch | null>(null);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("current");
  const [driverTypeFilter, setDriverTypeFilter] = useState<"all" | "owned" | "3pl">("all");
  const { toast } = useToast();

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = subMonths(new Date(), i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: format(date, "MMMM yyyy"),
    };
  });

  const toggleSelectDriver = (driverId: string) => {
    setSelectedDriverIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedDriverIds.size === filteredPayrollData.length) {
      setSelectedDriverIds(new Set());
    } else {
      setSelectedDriverIds(new Set(filteredPayrollData.map((p) => p.driver.id)));
    }
  };

  const handleBatchPayroll = async () => {
    if (selectedDriverIds.size === 0) {
      toast({
        title: "No Drivers Selected",
        description: "Please select drivers to process payroll",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const [year, month] = selectedMonth.split("-").map(Number);
      const periodStart = startOfMonth(new Date(year, month - 1)).toISOString();
      const periodEnd = endOfMonth(new Date(year, month - 1)).toISOString();

      const selectedPayrolls = payrollData.filter((p) => selectedDriverIds.has(p.driver.id));

      // Create salary records and expense records in parallel
      const salaryInserts = selectedPayrolls.map((p) => ({
        driver_id: p.driver.id,
        salary_type: p.driver.salary_type || "monthly",
        gross_amount: p.grossMonthly,
        tax_amount: p.monthlyTax,
        taxable_income: p.grossMonthly,
        net_amount: p.netMonthly,
        period_start: periodStart,
        period_end: periodEnd,
        status: "paid",
        notes: `Batch payroll for ${monthOptions.find((m) => m.value === selectedMonth)?.label}`,
      }));

      const expenseInserts = selectedPayrolls.map((p) => ({
        category: "driver_salary" as const,
        amount: p.netMonthly,
        description: `Salary payment - ${p.driver.full_name} (${monthOptions.find((m) => m.value === selectedMonth)?.label})`,
        expense_date: new Date().toISOString().split("T")[0],
        driver_id: p.driver.id,
        notes: `Gross: ₦${p.grossMonthly.toLocaleString()}, Tax: ₦${p.monthlyTax.toLocaleString()}, Net: ₦${p.netMonthly.toLocaleString()}`,
      }));

      const [salaryRes, expenseRes] = await Promise.all([
        supabase.from("driver_salaries").insert(salaryInserts),
        supabase.from("expenses").insert(expenseInserts),
      ]);

      if (salaryRes.error) throw salaryRes.error;
      if (expenseRes.error) throw expenseRes.error;

      toast({
        title: "Payroll Processed",
        description: `Successfully processed payroll for ${selectedDriverIds.size} drivers`,
      });

      setSelectedDriverIds(new Set());
      fetchPayrollHistory();
    } catch (error: any) {
      console.error("Batch payroll error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to process payroll",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .order("full_name");

      if (error) throw error;
      setDrivers(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to fetch drivers",
        variant: "destructive",
      });
    }
  };

  const fetchTripRates = async () => {
    try {
      const { data, error } = await (supabase
        .from("trip_rate_config" as any)
        .select("id, truck_type, zone, rate_amount, driver_type, partner_id, customer_id") as any);
      
      if (error) throw error;
      setTripRates((data as TripRateConfig[]) || []);
    } catch (error: any) {
      console.error("Failed to fetch trip rates:", error);
    }
  };

  // Cascading rate lookup with priority
  const findApplicableRate = (
    driverType: 'owned' | 'vendor',
    truckType: string,
    zone: string,
    partnerId?: string | null,
    customerId?: string | null
  ): number => {
    // Priority 1: Specific vendor + customer rate
    if (driverType === 'vendor' && partnerId && customerId) {
      const specific = tripRates.find(r =>
        r.driver_type === 'vendor' &&
        r.truck_type === truckType &&
        r.zone === zone &&
        r.partner_id === partnerId &&
        r.customer_id === customerId
      );
      if (specific) return specific.rate_amount;
    }

    // Priority 2: Specific vendor rate (any customer)
    if (driverType === 'vendor' && partnerId) {
      const vendorRate = tripRates.find(r =>
        r.driver_type === 'vendor' &&
        r.truck_type === truckType &&
        r.zone === zone &&
        r.partner_id === partnerId &&
        !r.customer_id
      );
      if (vendorRate) return vendorRate.rate_amount;
    }

    // Priority 3: Default vendor rate
    if (driverType === 'vendor') {
      const defaultVendor = tripRates.find(r =>
        r.driver_type === 'vendor' &&
        r.truck_type === truckType &&
        r.zone === zone &&
        !r.partner_id &&
        !r.customer_id
      );
      if (defaultVendor) return defaultVendor.rate_amount;
    }

    // Priority 4: Owned driver rate (also fallback for vendor if no vendor rates)
    const ownedRate = tripRates.find(r =>
      (r.driver_type === 'owned' || !r.driver_type) &&
      r.truck_type === truckType &&
      r.zone === zone
    );
    
    return ownedRate?.rate_amount || 20000; // default fallback
  };

  // Legacy getRate function for backward compatibility
  const getRate = (truckType: string, zone: string): number => {
    return findApplicableRate('owned', truckType, zone);
  };

  const fetchPayrollData = async () => {
    setLoading(true);
    try {
      // Parse selected month
      const [year, month] = selectedMonth.split("-").map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      // Get dispatches with vehicle info for the period
      const { data: dispatches, error: dispatchErr } = await supabase
        .from("dispatches")
        .select(`
          id,
          driver_id,
          delivery_address,
          vehicle_id,
          vehicles (
            id,
            truck_type,
            vehicle_type
          )
        `)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .eq("status", "delivered");

      if (dispatchErr) throw dispatchErr;

      // Build earnings breakdown per driver
      const driverEarnings: Record<string, {
        tripCount: number;
        tripsWithinIbadan: number;
        tripsOutsideIbadan: number;
        totalEarnings: number;
        breakdownMap: Record<string, EarningsBreakdown>;
      }> = {};

      (dispatches || []).forEach((dispatch: any) => {
        const driverId = dispatch.driver_id;
        if (!driverId) return;

        // Initialize driver record
        if (!driverEarnings[driverId]) {
          driverEarnings[driverId] = {
            tripCount: 0,
            tripsWithinIbadan: 0,
            tripsOutsideIbadan: 0,
            totalEarnings: 0,
            breakdownMap: {}
          };
        }

        const earnings = driverEarnings[driverId];
        earnings.tripCount++;

        // Classify zone
        const zone = classifyZone(dispatch.delivery_address || '');
        if (zone === 'within_ibadan') {
          earnings.tripsWithinIbadan++;
        } else {
          earnings.tripsOutsideIbadan++;
        }

        // Get truck type
        const truckType = normalizeTruckType(
          dispatch.vehicles?.truck_type,
          dispatch.vehicles?.vehicle_type
        );

        // Get rate from config
        const rate = getRate(truckType, zone);
        earnings.totalEarnings += rate;

        // Track breakdown
        const breakdownKey = `${truckType}-${zone}`;
        if (!earnings.breakdownMap[breakdownKey]) {
          earnings.breakdownMap[breakdownKey] = {
            zone,
            truckType,
            count: 0,
            ratePerTrip: rate,
            total: 0
          };
        }
        earnings.breakdownMap[breakdownKey].count++;
        earnings.breakdownMap[breakdownKey].total += rate;
      });

      // Calculate payroll for each owned driver
      const summaries: PayrollSummary[] = drivers.map((driver) => {
        const earnings = driverEarnings[driver.id];
        const tripCount = earnings?.tripCount || 0;
        const baseSalary = driver.base_salary || 0;
        const salaryType = driver.salary_type || "monthly";

        let grossMonthly = 0;
        switch (salaryType) {
          case "per_trip":
            // Use zone-based rates for per_trip drivers
            grossMonthly = earnings?.totalEarnings || 0;
            break;
          case "bi_monthly":
            grossMonthly = baseSalary * 2;
            break;
          case "monthly":
            grossMonthly = baseSalary;
            break;
        }

        const grossAnnual = grossMonthly * 12;
        const { tax, effectiveRate } = calculateNigeriaTax(grossAnnual);
        const monthlyTax = tax / 12;
        const netMonthly = grossMonthly - monthlyTax;

        return {
          driver,
          grossMonthly,
          annualTax: tax,
          monthlyTax,
          netMonthly,
          effectiveRate,
          tripCount,
          tripsWithinIbadan: earnings?.tripsWithinIbadan || 0,
          tripsOutsideIbadan: earnings?.tripsOutsideIbadan || 0,
          earningsBreakdown: Object.values(earnings?.breakdownMap || {}),
        };
      });

      setPayrollData(summaries);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to calculate payroll",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPayrollHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data: salaries, error } = await supabase
        .from("driver_salaries")
        .select(`
          id,
          driver_id,
          salary_type,
          gross_amount,
          tax_amount,
          net_amount,
          period_start,
          period_end,
          status,
          created_at,
          drivers (full_name)
        `)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;

      // Group by period
      const batches: Record<string, PayrollBatch> = {};
      
      (salaries || []).forEach((s: any) => {
        const periodKey = s.period_start?.slice(0, 7) || "unknown";
        
        if (!batches[periodKey]) {
          const periodDate = s.period_start ? parseISO(s.period_start) : new Date();
          batches[periodKey] = {
            period: periodKey,
            periodLabel: format(periodDate, "MMMM yyyy"),
            driversCount: 0,
            totalGross: 0,
            totalTax: 0,
            totalNet: 0,
            processedAt: s.created_at,
            records: []
          };
        }

        batches[periodKey].driversCount++;
        batches[periodKey].totalGross += s.gross_amount || 0;
        batches[periodKey].totalTax += s.tax_amount || 0;
        batches[periodKey].totalNet += s.net_amount || 0;
        batches[periodKey].records.push({
          id: s.id,
          driver_id: s.driver_id,
          driver_name: s.drivers?.full_name || "Unknown",
          salary_type: s.salary_type,
          gross_amount: s.gross_amount,
          tax_amount: s.tax_amount,
          net_amount: s.net_amount,
          period_start: s.period_start,
          period_end: s.period_end,
          status: s.status,
          created_at: s.created_at
        });
      });

      setPayrollHistory(Object.values(batches).sort((a, b) => 
        b.period.localeCompare(a.period)
      ));
    } catch (error: any) {
      console.error("Failed to fetch payroll history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
    fetchPayrollHistory();
    fetchTripRates();
  }, []);

  useEffect(() => {
    if (drivers.length > 0 && tripRates.length > 0) {
      fetchPayrollData();
    }
  }, [drivers, selectedMonth, tripRates]);

  // Filter payroll by driver type
  const filteredPayrollData = payrollData.filter((p) => {
    if (driverTypeFilter === "all") return true;
    if (driverTypeFilter === "owned") return !p.driver.driver_type || p.driver.driver_type === "owned";
    if (driverTypeFilter === "3pl") return p.driver.driver_type === "3pl" || p.driver.driver_type === "vendor";
    return true;
  });

  // Summary calculations
  const totals = {
    totalDrivers: filteredPayrollData.length,
    totalGross: filteredPayrollData.reduce((acc, p) => acc + p.grossMonthly, 0),
    totalTax: filteredPayrollData.reduce((acc, p) => acc + p.monthlyTax, 0),
    totalNet: filteredPayrollData.reduce((acc, p) => acc + p.netMonthly, 0),
    totalTrips: filteredPayrollData.reduce((acc, p) => acc + p.tripCount, 0),
    totalTripsWithinZone: filteredPayrollData.reduce((acc, p) => acc + p.tripsWithinIbadan, 0),
    totalTripsOutsideZone: filteredPayrollData.reduce((acc, p) => acc + p.tripsOutsideIbadan, 0),
    avgEffectiveRate: filteredPayrollData.length > 0
      ? filteredPayrollData.reduce((acc, p) => acc + p.effectiveRate, 0) / filteredPayrollData.length
      : 0,
  };

  const generatePayslipPDF = (payroll: PayrollSummary) => {
    const doc = new jsPDF();
    const periodLabel = monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth;

    // Header
    doc.setFillColor(26, 54, 93);
    doc.rect(0, 0, 210, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("PAYSLIP", 105, 20, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(periodLabel, 105, 30, { align: "center" });

    // Company info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text("LogiFlow Logistics", 15, 50);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, 15, 56);
    doc.text(`Ref: PAY-${payroll.driver.id.slice(0, 8).toUpperCase()}`, 15, 62);

    // Employee details
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Employee Details", 15, 75);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    const employeeData = [
      ["Name", payroll.driver.full_name],
      ["Employee Type", (payroll.driver.driver_type || "Owned").replace("_", " ").toUpperCase()],
      ["Salary Type", (payroll.driver.salary_type || "Monthly").replace("_", " ").toUpperCase()],
      ["Tax ID (TIN)", payroll.driver.tax_id || "Not Provided"],
    ];

    autoTable(doc, {
      startY: 80,
      head: [],
      body: employeeData,
      theme: "plain",
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 50 },
        1: { cellWidth: 80 }
      },
      margin: { left: 15 }
    });

    // Earnings
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Earnings", 15, 120);

    const earningsData = [
      ["Base Rate", formatCurrency(payroll.driver.base_salary || 0)],
    ];
    
    if (payroll.driver.salary_type === "per_trip") {
      earningsData.push(["Total Trips Completed", `${payroll.tripCount}`]);
    }
    
    earningsData.push(["Gross Monthly Salary", formatCurrency(payroll.grossMonthly)]);
    earningsData.push(["Estimated Annual Gross", formatCurrency(payroll.grossMonthly * 12)]);

    autoTable(doc, {
      startY: 125,
      head: [],
      body: earningsData,
      theme: "striped",
      headStyles: { fillColor: [38, 103, 73] },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 60, halign: "right" }
      },
      margin: { left: 15 }
    });

    // Zone-Based Earnings Breakdown (for per-trip drivers)
    let zoneBreakdownEndY = (doc as any).lastAutoTable.finalY;
    if (payroll.driver.salary_type === "per_trip" && payroll.earningsBreakdown.length > 0) {
      const zoneStartY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Zone-Based Earnings Breakdown", 15, zoneStartY);

      const zoneData = payroll.earningsBreakdown.map(item => [
        item.zone === 'within_ibadan' ? 'Within Zone' : 'Outside Zone',
        item.truckType.toUpperCase(),
        `${item.count} trips`,
        formatCurrency(item.ratePerTrip),
        formatCurrency(item.total)
      ]);

      // Add totals row
      const withinZoneTotal = payroll.earningsBreakdown
        .filter(e => e.zone === 'within_ibadan')
        .reduce((acc, e) => acc + e.total, 0);
      const outsideZoneTotal = payroll.earningsBreakdown
        .filter(e => e.zone === 'outside_ibadan')
        .reduce((acc, e) => acc + e.total, 0);

      autoTable(doc, {
        startY: zoneStartY + 5,
        head: [["Zone", "Truck Type", "Trips", "Rate/Trip", "Subtotal"]],
        body: [
          ...zoneData,
          ["", "", "", "Within Zone Total", formatCurrency(withinZoneTotal)],
          ["", "", "", "Outside Zone Total", formatCurrency(outsideZoneTotal)],
        ],
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 30, halign: "center" },
          2: { cellWidth: 25, halign: "center" },
          3: { cellWidth: 35, halign: "right" },
          4: { cellWidth: 40, halign: "right" }
        },
        margin: { left: 15 }
      });
      zoneBreakdownEndY = (doc as any).lastAutoTable.finalY;
    }

    // Tax Deductions Summary (simplified - no bracket breakdown)
    const taxStartY = zoneBreakdownEndY + 15;
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Tax Deductions (Nigeria PIT)", 15, taxStartY);

    const taxCalculation = calculateNigeriaTax(payroll.grossMonthly * 12);

    const taxSummaryData = taxCalculation.isExempt
      ? [
          ["Status", "EXEMPT (Income ≤₦800,000)"],
          ["Annual Tax", formatCurrency(0)],
          ["Monthly Withholding", formatCurrency(0)],
        ]
      : [
          ["Tax-Free Amount (First ₦800,000)", formatCurrency(taxCalculation.taxFreeAmount)],
          ["Taxable Income (Annual)", formatCurrency(taxCalculation.taxableIncome)],
          ["Annual Tax", formatCurrency(payroll.annualTax)],
          ["Monthly Withholding", formatCurrency(payroll.monthlyTax)],
          ["Effective Rate", `${payroll.effectiveRate.toFixed(2)}%`],
        ];

    autoTable(doc, {
      startY: taxStartY + 5,
      head: [],
      body: taxSummaryData,
      theme: "striped",
      headStyles: { fillColor: [180, 83, 9] },
      columnStyles: {
        0: { fontStyle: "bold", cellWidth: 80 },
        1: { cellWidth: 60, halign: "right" }
      },
      margin: { left: 15 }
    });

    // Net Pay
    const netStartY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFillColor(38, 103, 73);
    doc.rect(15, netStartY, 180, 25, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text("NET PAY (After Tax)", 25, netStartY + 10);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(payroll.netMonthly), 185, netStartY + 17, { align: "right" });

    // Footer
    doc.setTextColor(128, 128, 128);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("This is a computer-generated document. No signature is required.", 105, 280, { align: "center" });
    doc.text("For questions, please contact the HR department.", 105, 285, { align: "center" });

    // Save
    doc.save(`payslip-${payroll.driver.full_name.replace(/\s+/g, "-").toLowerCase()}-${selectedMonth}.pdf`);

    toast({
      title: "Payslip Generated",
      description: `Payslip for ${payroll.driver.full_name} downloaded`,
    });
  };

  const handleExportCSV = () => {
    const headers = ["Driver Name", "Driver Type", "Salary Type", "Trips", "Within Zone", "Outside Zone", "Gross Monthly", "Monthly Tax", "Net Monthly", "Effective Rate"];
    const rows = payrollData.map((p) => [
      p.driver.full_name,
      p.driver.driver_type || "owned",
      p.driver.salary_type || "monthly",
      p.tripCount,
      p.tripsWithinIbadan,
      p.tripsOutsideIbadan,
      p.grossMonthly.toFixed(2),
      p.monthlyTax.toFixed(2),
      p.netMonthly.toFixed(2),
      `${p.effectiveRate.toFixed(2)}%`,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-report-${selectedMonth}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Payroll report downloaded successfully",
    });
  };

  const handleExportHistoryCSV = () => {
    const headers = ["Period", "Driver Name", "Salary Type", "Gross", "Tax", "Net", "Status", "Processed Date"];
    const rows: string[][] = [];
    
    payrollHistory.forEach(batch => {
      batch.records.forEach(record => {
        rows.push([
          batch.periodLabel,
          record.driver_name,
          record.salary_type,
          record.gross_amount.toFixed(2),
          (record.tax_amount || 0).toFixed(2),
          (record.net_amount || 0).toFixed(2),
          record.status,
          format(parseISO(record.created_at), "PPP")
        ]);
      });
    });

    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-history-export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Payroll history exported successfully",
    });
  };

  return (
    <DashboardLayout
      title="Driver Payroll Report"
      subtitle="Monthly salary calculations, tax withholdings, and payroll history"
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="current" className="gap-2">
            <Calculator className="w-4 h-4" />
            Current Period
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            Payroll History
          </TabsTrigger>
        </TabsList>

        {/* Current Period Tab */}
        <TabsContent value="current">
          {/* Period Selector */}
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
            <div className="flex gap-4 items-center">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Pay Period</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-48 bg-secondary/50">
                    <Calendar className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={fetchPayrollData}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
            <div className="flex gap-2">
              {selectedDriverIds.size > 0 && (
                <Button 
                  onClick={handleBatchPayroll} 
                  disabled={processing}
                  className="bg-success hover:bg-success/90"
                >
                  {processing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Process Payroll ({selectedDriverIds.size})
                </Button>
              )}
              <Button variant="outline" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Drivers", value: totals.totalDrivers, icon: Users, color: "bg-primary/10 text-primary" },
              { label: "Gross Payroll", value: formatCurrency(totals.totalGross), icon: DollarSign, color: "bg-success/10 text-success" },
              { label: "Total Tax Withholding", value: formatCurrency(totals.totalTax), icon: Calculator, color: "bg-warning/10 text-warning" },
              { label: "Net Payroll", value: formatCurrency(totals.totalNet), icon: TrendingUp, color: "bg-info/10 text-info" },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                        <stat.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-2xl font-heading font-bold">{stat.value}</p>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Zone Distribution Chart */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Total Trips Completed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals.totalTrips}</p>
                <p className="text-xs text-muted-foreground">
                  For pay period: {monthOptions.find((m) => m.value === selectedMonth)?.label}
                </p>
              </CardContent>
            </Card>
            
            {/* Zone Distribution Visual */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  Zone Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Within Zone Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Within Zone</span>
                      <span className="font-medium text-blue-600">
                        {totals.totalTripsWithinZone} trips ({totals.totalTrips > 0 ? ((totals.totalTripsWithinZone / totals.totalTrips) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ 
                          width: totals.totalTrips > 0 
                            ? `${(totals.totalTripsWithinZone / totals.totalTrips) * 100}%` 
                            : '0%' 
                        }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-blue-500 rounded-full"
                      />
                    </div>
                  </div>
                  
                  {/* Outside Zone Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Outside Zone</span>
                      <span className="font-medium text-orange-600">
                        {totals.totalTripsOutsideZone} trips ({totals.totalTrips > 0 ? ((totals.totalTripsOutsideZone / totals.totalTrips) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ 
                          width: totals.totalTrips > 0 
                            ? `${(totals.totalTripsOutsideZone / totals.totalTrips) * 100}%` 
                            : '0%' 
                        }}
                        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
                        className="h-full bg-orange-500 rounded-full"
                      />
                    </div>
                  </div>

                  {/* Legends */}
                  <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Lagos, Sagamu, Abeokuta, Ibadan
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                      Other destinations
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Average Tax Rate Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Percent className="w-4 h-4 text-muted-foreground" />
                  Average Effective Tax Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{totals.avgEffectiveRate.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Based on Nigeria Tax Act 2025 PIT brackets</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  Zone Earnings Split
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6">
                  <div>
                    <p className="text-xl font-bold text-blue-600">
                      {formatCurrency(
                        payrollData.reduce((acc, p) => 
                          acc + p.earningsBreakdown
                            .filter(e => e.zone === 'within_ibadan')
                            .reduce((sum, e) => sum + e.total, 0), 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Within Zone</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-orange-600">
                      {formatCurrency(
                        payrollData.reduce((acc, p) => 
                          acc + p.earningsBreakdown
                            .filter(e => e.zone === 'outside_ibadan')
                            .reduce((sum, e) => sum + e.total, 0), 0)
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Outside Zone</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Driver Type Filter */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-muted-foreground font-medium">Show:</span>
            {(["all", "owned", "3pl"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setDriverTypeFilter(type)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                  driverTypeFilter === type
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/50 text-muted-foreground border-border/50 hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {type === "all" ? `All (${payrollData.length})` : type === "owned" ? `Owned (${payrollData.filter(p => !p.driver.driver_type || p.driver.driver_type === "owned").length})` : `3PL (${payrollData.filter(p => p.driver.driver_type === "3pl" || p.driver.driver_type === "vendor").length})`}
              </button>
            ))}
          </div>

          {/* Payroll Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : payrollData.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No drivers found</p>
                <p className="text-sm text-muted-foreground/70">Add drivers with salary information to generate payroll reports</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Payroll Breakdown</CardTitle>
                <CardDescription>
                  Individual driver salary calculations for {monthOptions.find((m) => m.value === selectedMonth)?.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedDriverIds.size === filteredPayrollData.length && filteredPayrollData.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Salary Type</TableHead>
                      <TableHead className="text-center">Trips</TableHead>
                      <TableHead className="text-center">Within Zone</TableHead>
                      <TableHead className="text-center">Outside Zone</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Tax</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Tax Rate</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayrollData.map((payroll) => (
                      <TableRow key={payroll.driver.id} className={selectedDriverIds.has(payroll.driver.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedDriverIds.has(payroll.driver.id)}
                            onCheckedChange={() => toggleSelectDriver(payroll.driver.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{payroll.driver.full_name}</p>
                            {payroll.driver.tax_id && (
                              <p className="text-xs text-muted-foreground">TIN: {payroll.driver.tax_id}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">
                            {(payroll.driver.salary_type || "monthly").replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {payroll.driver.salary_type === "per_trip" ? (
                            <span className="font-medium">{payroll.tripCount}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {payroll.driver.salary_type === "per_trip" && payroll.tripsWithinIbadan > 0 ? (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
                              {payroll.tripsWithinIbadan}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {payroll.driver.salary_type === "per_trip" && payroll.tripsOutsideIbadan > 0 ? (
                            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">
                              {payroll.tripsOutsideIbadan}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(payroll.grossMonthly)}
                        </TableCell>
                        <TableCell className="text-right text-destructive">
                          -{formatCurrency(payroll.monthlyTax)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-success">
                          {formatCurrency(payroll.netMonthly)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {payroll.effectiveRate.toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => generatePayslipPDF(payroll)}
                              title="Download Payslip"
                            >
                              <FileDown className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedDriver(payroll);
                                setIsDetailDialogOpen(true);
                              }}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Totals Row */}
                <div className="border-t mt-4 pt-4">
                  <div className="grid grid-cols-6 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Gross</p>
                      <p className="text-xl font-bold">{formatCurrency(totals.totalGross)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Tax</p>
                      <p className="text-xl font-bold text-destructive">-{formatCurrency(totals.totalTax)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Net</p>
                      <p className="text-xl font-bold text-success">{formatCurrency(totals.totalNet)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Trips</p>
                      <p className="text-xl font-bold">{totals.totalTrips}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Within Zone</p>
                      <p className="text-xl font-bold text-blue-600">{totals.totalTripsWithinZone}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Outside Zone</p>
                      <p className="text-xl font-bold text-orange-600">{totals.totalTripsOutsideZone}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold">Processed Payroll Batches</h3>
              <p className="text-sm text-muted-foreground">View previously processed payroll records</p>
            </div>
            <Button variant="outline" onClick={handleExportHistoryCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export History
            </Button>
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : payrollHistory.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <p className="text-muted-foreground">No payroll history found</p>
                <p className="text-sm text-muted-foreground/70">Process payroll from the Current Period tab to see history here</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-center">Drivers</TableHead>
                      <TableHead className="text-right">Total Gross</TableHead>
                      <TableHead className="text-right">Total Tax</TableHead>
                      <TableHead className="text-right">Total Net</TableHead>
                      <TableHead>Processed Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrollHistory.map((batch) => (
                      <TableRow key={batch.period}>
                        <TableCell className="font-medium">{batch.periodLabel}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{batch.driversCount}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(batch.totalGross)}</TableCell>
                        <TableCell className="text-right text-destructive">-{formatCurrency(batch.totalTax)}</TableCell>
                        <TableCell className="text-right font-semibold text-success">{formatCurrency(batch.totalNet)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(batch.processedAt), "PPP")}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedBatch(batch);
                              setIsBatchDialogOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Driver Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Payroll Details - {selectedDriver?.driver.full_name}
            </DialogTitle>
            <DialogDescription>
              {monthOptions.find((m) => m.value === selectedMonth)?.label}
            </DialogDescription>
          </DialogHeader>

          {selectedDriver && (
            <div className="space-y-6 py-4">
              {/* Driver Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Driver Type</p>
                  <Badge variant="default" className="capitalize">
                    {(selectedDriver.driver.driver_type || "owned").replace("_", " ")}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Salary Type</p>
                  <Badge variant="secondary" className="capitalize">
                    {(selectedDriver.driver.salary_type || "monthly").replace("_", " ")}
                  </Badge>
                </div>
                {selectedDriver.driver.tax_id && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground">Tax Identification Number</p>
                    <p className="font-mono">{selectedDriver.driver.tax_id}</p>
                  </div>
                )}
              </div>

              {/* Salary Breakdown */}
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-2 mb-4">
                  <Calculator className="w-5 h-5 text-primary" />
                  <span className="font-medium">Salary Calculation</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base Rate</span>
                    <span className="font-medium">{formatCurrency(selectedDriver.driver.base_salary || 0)}</span>
                  </div>
                  {selectedDriver.driver.salary_type === "per_trip" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Trips</span>
                      <span className="font-medium">{selectedDriver.tripCount}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between">
                    <span className="text-muted-foreground">Gross Monthly</span>
                    <span className="font-semibold">{formatCurrency(selectedDriver.grossMonthly)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Est. Annual Gross</span>
                    <span className="font-medium">{formatCurrency(selectedDriver.grossMonthly * 12)}</span>
                  </div>
                </div>
              </div>

              {/* Zone-Based Earnings Breakdown */}
              {selectedDriver.driver.salary_type === "per_trip" && selectedDriver.earningsBreakdown.length > 0 && (
                <div className="p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
                  <div className="flex items-center gap-2 mb-4">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    <span className="font-medium">Zone-Based Earnings</span>
                  </div>
                  <div className="space-y-2">
                    {selectedDriver.earningsBreakdown.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={item.zone === 'within_ibadan' 
                              ? 'bg-blue-500/10 text-blue-600 border-blue-200' 
                              : 'bg-orange-500/10 text-orange-600 border-orange-200'
                            }
                          >
                            {item.zone === 'within_ibadan' ? 'Within' : 'Outside'}
                          </Badge>
                          <span className="text-sm text-muted-foreground uppercase">{item.truckType}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-muted-foreground">{item.count} × {formatCurrency(item.ratePerTrip)} = </span>
                          <span className="font-medium">{formatCurrency(item.total)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 border-t">
                      <div className="flex gap-4">
                        <span className="text-sm">
                          <span className="text-blue-600 font-medium">{selectedDriver.tripsWithinIbadan}</span>
                          <span className="text-muted-foreground"> within</span>
                        </span>
                        <span className="text-sm">
                          <span className="text-orange-600 font-medium">{selectedDriver.tripsOutsideIbadan}</span>
                          <span className="text-muted-foreground"> outside</span>
                        </span>
                      </div>
                      <span className="font-semibold">{formatCurrency(selectedDriver.grossMonthly)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tax Breakdown */}
              {(() => {
                const taxDetails = calculateNigeriaTax(selectedDriver.grossMonthly * 12);
                return (
                  <div className="p-4 bg-warning/5 rounded-lg border border-warning/20">
                    <div className="flex items-center gap-2 mb-4">
                      <Percent className="w-5 h-5 text-warning" />
                      <span className="font-medium">Tax Calculation (Nigeria Tax Act 2025)</span>
                    </div>

                    {taxDetails.isExempt ? (
                      <div className="p-3 bg-success/10 rounded-lg border border-success/20 text-center">
                        <Badge variant="default" className="bg-success">EXEMPT</Badge>
                        <p className="text-sm text-muted-foreground mt-2">
                          Income ≤₦800,000/year is tax-free under Nigeria Tax Act 2025
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Tax-Free Amount */}
                        <div className="space-y-2 pb-3 border-b border-warning/20">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tax-Free Threshold</p>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">First ₦800,000 (Tax-Free)</span>
                            <span className="font-medium text-success">{formatCurrency(taxDetails.taxFreeAmount)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Taxable Income</span>
                            <span className="font-medium">{formatCurrency(taxDetails.taxableIncome)}</span>
                          </div>
                        </div>

                        {/* Tax Bracket Breakdown */}
                        {taxDetails.brackets.length > 0 && (
                          <div className="space-y-2 pb-3 border-b border-warning/20">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tax Bracket Breakdown</p>
                            <div className="space-y-1.5">
                              {taxDetails.brackets.map((bracket, idx) => (
                                <div key={idx} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    {bracket.range} @ {bracket.rate.toFixed(0)}%
                                  </span>
                                  <span className="font-mono">
                                    {formatCurrency(bracket.taxable)} → {formatCurrency(bracket.tax)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Summary */}
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Annual Tax Liability</span>
                            <span className="font-medium text-destructive">-{formatCurrency(selectedDriver.annualTax)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Monthly Withholding</span>
                            <span className="font-semibold text-destructive">-{formatCurrency(selectedDriver.monthlyTax)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Effective Tax Rate</span>
                            <span className="font-medium">{selectedDriver.effectiveRate.toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Net Pay */}
              <div className="p-4 bg-success/5 rounded-lg border border-success/20">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Net Pay (After Tax)</p>
                    <p className="text-2xl font-bold text-success">{formatCurrency(selectedDriver.netMonthly)}</p>
                  </div>
                  <DollarSign className="w-10 h-10 text-success/50" />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
            {selectedDriver && (
              <Button onClick={() => generatePayslipPDF(selectedDriver)}>
                <FileDown className="w-4 h-4 mr-2" />
                Download Payslip
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Detail Dialog */}
      <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Payroll Batch - {selectedBatch?.periodLabel}
            </DialogTitle>
            <DialogDescription>
              Processed on {selectedBatch && format(parseISO(selectedBatch.processedAt), "PPP")}
            </DialogDescription>
          </DialogHeader>

          {selectedBatch && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-2xl font-bold">{selectedBatch.driversCount}</p>
                  <p className="text-xs text-muted-foreground">Drivers Paid</p>
                </div>
                <div className="p-3 bg-success/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-success">{formatCurrency(selectedBatch.totalNet)}</p>
                  <p className="text-xs text-muted-foreground">Total Net Paid</p>
                </div>
                <div className="p-3 bg-warning/10 rounded-lg text-center">
                  <p className="text-2xl font-bold text-warning">{formatCurrency(selectedBatch.totalTax)}</p>
                  <p className="text-xs text-muted-foreground">Total Tax</p>
                </div>
              </div>

              {/* Individual Records */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Driver</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedBatch.records.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.driver_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {record.salary_type.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(record.gross_amount)}</TableCell>
                      <TableCell className="text-right text-destructive">
                        -{formatCurrency(record.tax_amount || 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-success">
                        {formatCurrency(record.net_amount || 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={record.status === "paid" ? "default" : "secondary"}>
                          {record.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default DriverPayrollPage;
