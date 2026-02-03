import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Columns,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

export interface TransactionRecord {
  id: string;
  customer_name: string;
  vendor_name: string | null;
  period_year: number;
  period_month: number;
  month_name: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  week_num: number | null;
  pickup_location: string | null;
  pick_off: string | null;
  delivery_location: string | null;
  drop_point: string | null;
  route_cluster: string | null;
  km_covered: number | null;
  truck_number: string | null;
  driver_name: string | null;
  tonnage: string | null;
  tonnage_loaded: number | null;
  waybill_number: string | null;
  trips_count: number | null;
  num_deliveries: number | null;
  extra_dropoffs: number | null;
  extra_dropoff_cost: number | null;
  amount_vatable: number | null;
  amount_not_vatable: number | null;
  total_amount: number | null;
  total_revenue: number | null;
  total_cost: number | null;
  total_vendor_cost: number | null;
  vat_amount: number | null;
  sub_total: number | null;
  gross_profit: number | null;
  profit_margin: number | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_status: string | null;
  payment_terms_days: number | null;
  due_date: string | null;
  vendor_bill_number: string | null;
  vendor_invoice_status: string | null;
  vendor_invoice_submission_date: string | null;
  customer_payment_status: string | null;
  payment_receipt_date: string | null;
  invoice_paid_date: string | null;
  invoice_amount_paid: number | null;
  balance_owed: number | null;
  wht_status: string | null;
  wht_deducted: number | null;
  bank_payment_received: string | null;
  bank_debited: string | null;
  gap_in_payment: number | null;
  invoice_ageing: number | null;
  invoice_age_for_interest: number | null;
  daily_rate: number | null;
  interest_paid: number | null;
  interest_not_paid: number | null;
  source_file: string | null;
  imported_at: string | null;
  dispatch_id: string | null;
}

// Column definitions with labels and default visibility - All 51 columns
const ALL_COLUMNS = [
  // Basic Info
  { key: "transaction_type", label: "Type", visible: false, category: "Basic" },
  { key: "customer_name", label: "Customer", visible: true, category: "Basic" },
  { key: "vendor_name", label: "3PL Vendor", visible: true, category: "Basic" },

  // Period
  { key: "transaction_date", label: "Date", visible: true, category: "Period" },
  { key: "week_num", label: "Week", visible: false, category: "Period" },
  { key: "period_month", label: "Month", visible: true, category: "Period" },
  { key: "month_name", label: "Month Name", visible: false, category: "Period" },
  { key: "period_year", label: "Year", visible: true, category: "Period" },

  // Route
  { key: "pickup_location", label: "Pick Off", visible: true, category: "Route" },
  { key: "delivery_location", label: "Drop Point", visible: true, category: "Route" },
  { key: "route_cluster", label: "Route Cluster", visible: false, category: "Route" },
  { key: "km_covered", label: "KM Covered", visible: false, category: "Route" },

  // Vehicle & Driver
  { key: "driver_name", label: "Driver", visible: false, category: "Vehicle" },
  { key: "tonnage", label: "Tonnage", visible: false, category: "Vehicle" },
  { key: "tonnage_loaded", label: "Tonnage Loaded", visible: false, category: "Vehicle" },
  { key: "truck_number", label: "Truck", visible: true, category: "Vehicle" },

  // Trip Details
  { key: "waybill_number", label: "Waybill No", visible: false, category: "Trip" },
  { key: "num_deliveries", label: "No of Deliveries", visible: false, category: "Trip" },
  { key: "extra_dropoffs", label: "Extra Dropoffs", visible: false, category: "Trip" },
  { key: "extra_dropoff_cost", label: "Cost per Extra", visible: false, category: "Trip" },

  // Revenue
  { key: "amount_vatable", label: "Amount (VAT)", visible: false, category: "Revenue" },
  { key: "amount_not_vatable", label: "Amount (Non-VAT)", visible: false, category: "Revenue" },
  { key: "total_amount", label: "Amount", visible: false, category: "Revenue" },
  { key: "sub_total", label: "Sub-Total", visible: false, category: "Revenue" },
  { key: "vat_amount", label: "Total VAT", visible: false, category: "Revenue" },
  { key: "total_revenue", label: "Revenue", visible: true, category: "Revenue" },

  // Costs & Profit
  { key: "total_vendor_cost", label: "Vendor Cost", visible: false, category: "Costs" },
  { key: "total_cost", label: "Total Cost", visible: true, category: "Costs" },
  { key: "gross_profit", label: "Gross Profit", visible: true, category: "Costs" },

  // Invoice
  { key: "invoice_number", label: "Invoice #", visible: true, category: "Invoice" },
  { key: "invoice_date", label: "Invoice Date", visible: false, category: "Invoice" },
  { key: "invoice_status", label: "Invoice Status", visible: false, category: "Invoice" },
  { key: "payment_terms_days", label: "Payment Terms", visible: false, category: "Invoice" },
  { key: "due_date", label: "Due Date", visible: false, category: "Invoice" },

  // Vendor Billing
  { key: "vendor_bill_number", label: "Vendor Bill #", visible: false, category: "Vendor" },
  { key: "vendor_invoice_status", label: "Vendor Status", visible: false, category: "Vendor" },
  { key: "vendor_invoice_submission_date", label: "Vendor Submit Date", visible: false, category: "Vendor" },

  // Payment Tracking
  { key: "customer_payment_status", label: "Payment Status", visible: true, category: "Payment" },
  { key: "payment_receipt_date", label: "Receipt Date", visible: false, category: "Payment" },
  { key: "invoice_paid_date", label: "Paid Date", visible: false, category: "Payment" },
  { key: "invoice_amount_paid", label: "Amount Paid", visible: false, category: "Payment" },
  { key: "balance_owed", label: "Balance Owed", visible: false, category: "Payment" },

  // WHT & Bank
  { key: "wht_status", label: "WHT Status", visible: false, category: "WHT" },
  { key: "wht_deducted", label: "WHT Deducted", visible: false, category: "WHT" },
  { key: "bank_payment_received", label: "Bank Received", visible: false, category: "WHT" },
  { key: "bank_debited", label: "Bank Debited", visible: false, category: "WHT" },

  // Analysis
  { key: "gap_in_payment", label: "Gap (Days)", visible: false, category: "Analysis" },
  { key: "invoice_ageing", label: "Invoice Age", visible: false, category: "Analysis" },
  { key: "invoice_age_for_interest", label: "Age for Interest", visible: false, category: "Analysis" },
  { key: "daily_rate", label: "Daily Rate", visible: false, category: "Analysis" },
  { key: "interest_paid", label: "Interest Paid", visible: false, category: "Analysis" },
  { key: "interest_not_paid", label: "Interest Due", visible: false, category: "Analysis" },
];

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const formatCurrency = (amount: number | null) => {
  if (amount === null || amount === undefined) return "-";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date: string | null) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

interface TransactionsTableProps {
  filterYear?: number;
  filterMonth?: number;
  filterCustomer?: string;
  showFilters?: boolean;
  pageSize?: number;
}

const TransactionsTable = ({
  filterYear,
  filterMonth,
  filterCustomer,
  showFilters = true,
  pageSize = 50,
}: TransactionsTableProps) => {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<string>(filterYear?.toString() || "all");
  const [monthFilter, setMonthFilter] = useState<string>(filterMonth?.toString() || "all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    ALL_COLUMNS.reduce((acc, col) => ({ ...acc, [col.key]: col.visible }), {})
  );
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetchTransactions();
  }, [yearFilter, monthFilter, paymentFilter, page]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("historical_invoice_data" as any)
        .select("*", { count: "exact" });

      if (yearFilter !== "all") {
        query = query.eq("period_year", parseInt(yearFilter));
      }
      if (monthFilter !== "all") {
        query = query.eq("period_month", parseInt(monthFilter));
      }
      if (paymentFilter !== "all") {
        query = query.eq("customer_payment_status", paymentFilter);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .range(from, to) as any;

      if (error) throw error;

      setTransactions(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.customer_name?.toLowerCase().includes(query) ||
      t.vendor_name?.toLowerCase().includes(query) ||
      t.truck_number?.toLowerCase().includes(query) ||
      t.invoice_number?.toLowerCase().includes(query) ||
      t.waybill_number?.toLowerCase().includes(query)
    );
  });

  const exportToExcel = () => {
    const exportData = filteredTransactions.map((t) => ({
      "Customer Name": t.customer_name,
      "3PL Vendor": t.vendor_name,
      "Year": t.period_year,
      "Month": t.period_month,
      "Month Name": MONTH_NAMES[t.period_month] || "",
      "Date": t.transaction_date,
      "Truck Number": t.truck_number,
      "Driver": t.driver_name,
      "Pick Off": t.pickup_location || t.pick_off,
      "Drop Point": t.delivery_location,
      "Route Cluster": t.route_cluster,
      "KM Covered": t.km_covered,
      "Tonnage Loaded": t.tonnage_loaded,
      "Waybill No": t.waybill_number,
      "Deliveries": t.num_deliveries,
      "Amount (VAT)": t.amount_vatable,
      "Amount (Non-VAT)": t.amount_not_vatable,
      "Amount": t.total_amount,
      "Revenue": t.total_revenue,
      "Cost": t.total_cost,
      "Gross Profit": t.gross_profit,
      "VAT Amount": t.vat_amount,
      "Invoice Number": t.invoice_number,
      "Invoice Date": t.invoice_date,
      "Invoice Status": t.invoice_status,
      "Due Date": t.due_date,
      "Payment Status": t.customer_payment_status,
      "Paid Date": t.invoice_paid_date,
      "Amount Paid": t.invoice_amount_paid,
      "Balance Owed": t.balance_owed,
      "WHT Status": t.wht_status,
      "WHT Deducted": t.wht_deducted,
      "Vendor Bill #": t.vendor_bill_number,
      "Vendor Status": t.vendor_invoice_status,
      "Gap in Payment": t.gap_in_payment,
      "Invoice Age": t.invoice_ageing,
      "Interest Paid": t.interest_paid,
      "Interest Due": t.interest_not_paid,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions");
    XLSX.writeFile(wb, `transactions_export_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const getPaymentStatusColor = (status: string | null) => {
    if (!status) return "bg-muted text-muted-foreground";
    const lower = status.toLowerCase();
    if (lower.includes("paid") && !lower.includes("not")) return "bg-green-500/10 text-green-600";
    if (lower.includes("partial")) return "bg-yellow-500/10 text-yellow-600";
    return "bg-red-500/10 text-red-600";
  };

  const renderCell = (transaction: TransactionRecord, columnKey: string) => {
    const value = transaction[columnKey as keyof TransactionRecord];

    switch (columnKey) {
      case "period_month":
        return MONTH_NAMES[transaction.period_month] || transaction.period_month;
      // Currency columns
      case "total_amount":
      case "total_revenue":
      case "total_cost":
      case "total_vendor_cost":
      case "gross_profit":
      case "vat_amount":
      case "sub_total":
      case "amount_vatable":
      case "amount_not_vatable":
      case "invoice_amount_paid":
      case "balance_owed":
      case "wht_deducted":
      case "interest_paid":
      case "interest_not_paid":
      case "extra_dropoff_cost":
      case "daily_rate":
        return formatCurrency(value as number);
      // Date columns
      case "transaction_date":
      case "invoice_date":
      case "due_date":
      case "invoice_paid_date":
      case "payment_receipt_date":
      case "vendor_invoice_submission_date":
        return formatDate(value as string);
      // Status badges with colors
      case "customer_payment_status":
        return value ? (
          <Badge variant="outline" className={getPaymentStatusColor(value as string)}>
            {value as string}
          </Badge>
        ) : "-";
      case "invoice_status":
      case "vendor_invoice_status":
      case "wht_status":
        return value ? (
          <Badge variant="outline">{value as string}</Badge>
        ) : "-";
      // Route fields with fallbacks
      case "pickup_location":
        return transaction.pickup_location || transaction.pick_off || "-";
      case "delivery_location":
        return transaction.delivery_location || transaction.drop_point || "-";
      // Number fields
      case "km_covered":
      case "tonnage_loaded":
        return value !== null && value !== undefined ? `${value}` : "-";
      case "gap_in_payment":
      case "invoice_ageing":
      case "invoice_age_for_interest":
      case "payment_terms_days":
        return value !== null && value !== undefined ? `${value} days` : "-";
      default:
        return value !== null && value !== undefined ? String(value) : "-";
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const years = Array.from(new Set(transactions.map((t) => t.period_year))).sort((a, b) => b - a);

  // Group columns by category for the dropdown
  const columnsByCategory = ALL_COLUMNS.reduce((acc, col) => {
    if (!acc[col.category]) acc[col.category] = [];
    acc[col.category].push(col);
    return acc;
  }, {} as Record<string, typeof ALL_COLUMNS>);

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, vendor, truck, invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary/50"
            />
          </div>

          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[120px] bg-secondary/50">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {[2026, 2025, 2024, 2023, 2022].map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-[140px] bg-secondary/50">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTH_NAMES.slice(1).map((m, i) => (
                <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[150px] bg-secondary/50">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Paid">Paid</SelectItem>
              <SelectItem value="Partial">Partial</SelectItem>
              <SelectItem value="Unpaid">Unpaid</SelectItem>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <Columns className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 max-h-[400px] overflow-y-auto">
              <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(columnsByCategory).map(([category, cols]) => (
                <div key={category}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    {category}
                  </DropdownMenuLabel>
                  {cols.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={visibleColumns[col.key]}
                      onCheckedChange={() => toggleColumn(col.key)}
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      )}

      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {ALL_COLUMNS.filter((col) => visibleColumns[col.key]).map((col) => (
                <TableHead key={col.key} className="whitespace-nowrap">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={Object.values(visibleColumns).filter(Boolean).length}
                  className="text-center py-12"
                >
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Object.values(visibleColumns).filter(Boolean).length}
                  className="text-center py-12 text-muted-foreground"
                >
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  {ALL_COLUMNS.filter((col) => visibleColumns[col.key]).map((col) => (
                    <TableCell key={col.key} className="whitespace-nowrap">
                      {renderCell(transaction, col.key)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount} transactions
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TransactionsTable;
