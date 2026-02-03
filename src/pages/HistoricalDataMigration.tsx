import { useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload,
  FileSpreadsheet,
  Download,
  History,
  Loader2,
  Database,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  parseExcelFile,
  historicalInvoiceHeaderMap,
  HistoricalInvoiceRow,
  generateHistoricalDataTemplate,
} from "@/lib/excelParser";

interface HistoricalRecord {
  id: string;
  customer_name: string;
  vendor_name: string | null;
  period_year: number;
  period_month: number;
  month_name: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  truck_number: string | null;
  driver_name: string | null;
  waybill_number: string | null;
  pickup_location: string | null;
  delivery_location: string | null;
  route_cluster: string | null;
  trips_count: number;
  num_deliveries: number | null;
  total_revenue: number;
  total_cost: number;
  gross_profit: number | null;
  invoice_number: string | null;
  invoice_status: string | null;
  customer_payment_status: string | null;
  balance_owed: number | null;
  imported_at: string;
  source_file: string | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const HistoricalDataMigration = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [parsedData, setParsedData] = useState<HistoricalInvoiceRow[]>([]);
  const [historicalRecords, setHistoricalRecords] = useState<HistoricalRecord[]>([]);
  const [customers, setCustomers] = useState<{ id: string; company_name: string }[]>([]);
  const [partners, setPartners] = useState<{ id: string; company_name: string }[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  
  // Filter state
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  const [filterMonth, setFilterMonth] = useState<string>("all");

  useState(() => {
    fetchInitialData();
  });

  async function fetchInitialData() {
    try {
      const [customersRes, partnersRes, historicalRes] = await Promise.all([
        supabase.from("customers").select("id, company_name").order("company_name"),
        supabase.from("partners").select("id, company_name").eq("partner_type", "vendor").order("company_name"),
        (supabase.from("historical_invoice_data" as any).select("*").order("period_year", { ascending: false }).order("period_month", { ascending: false }).limit(500) as any),
      ]);

      if (customersRes.data) setCustomers(customersRes.data);
      if (partnersRes.data) setPartners(partnersRes.data);
      if (historicalRes.data) setHistoricalRecords(historicalRes.data);
    } catch (error) {
      console.error("Failed to fetch initial data:", error);
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);

    try {
      const data = await parseExcelFile<HistoricalInvoiceRow>(file, historicalInvoiceHeaderMap);
      
      // Validate and clean data
      const validData = data.filter(
        (row) => row.customer_name && row.period_year && row.period_month
      );
      setParsedData(validData);

      if (validData.length === 0) {
        toast({
          title: "No Valid Data",
          description: "No valid rows found. Ensure 'Customer Name', 'Year', and 'Month' columns exist.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "File Parsed",
          description: `Found ${validData.length} valid historical records`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Parse Error",
        description: error.message || "Failed to parse Excel file",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const findCustomerId = (name: string): string | null => {
    const match = customers.find(
      (c) => c.company_name.toLowerCase() === name.toLowerCase()
    );
    return match?.id || null;
  };

  const findPartnerId = (name: string): string | null => {
    if (!name) return null;
    const match = partners.find(
      (p) => p.company_name.toLowerCase() === name.toLowerCase()
    );
    return match?.id || null;
  };

  // Helper to parse date strings safely
  const parseDate = (value: string | undefined): string | null => {
    if (!value) return null;
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  // Helper to get month name from month number
  const getMonthName = (month: number): string => {
    return MONTHS.find(m => m.value === month)?.label || '';
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const row of parsedData) {
        const customerId = findCustomerId(row.customer_name);
        const vendorId = row.vendor_name ? findPartnerId(row.vendor_name) : null;
        const periodMonth = Number(row.period_month);

        // Build complete insert data with all 50+ fields
        const insertData = {
          // Core identification
          customer_id: customerId,
          customer_name: row.customer_name,
          vendor_id: vendorId,
          vendor_name: row.vendor_name || null,

          // Period information
          period_year: Number(row.period_year),
          period_month: periodMonth,
          month_name: row.month_name || getMonthName(periodMonth),
          week_number: row.week_number ? Number(row.week_number) : null,
          transaction_date: parseDate(row.transaction_date),
          transaction_type: row.transaction_type || null,

          // Route & delivery details
          pickup_location: row.pickup_location || row.pick_off || null,
          pick_off: row.pick_off || null,
          delivery_location: row.delivery_location || null,
          route: row.route || null,
          route_cluster: row.route_cluster || null,
          km_covered: row.km_covered ? Number(row.km_covered) : null,

          // Vehicle & driver info
          truck_type: row.truck_type || null,
          truck_number: row.truck_number || null,
          driver_name: row.driver_name || null,
          tonnage: row.tonnage || null,
          tonnage_loaded: row.tonnage_loaded ? Number(row.tonnage_loaded) : null,

          // Trip details
          waybill_number: row.waybill_number || null,
          trips_count: Number(row.trips_count) || 1,
          num_deliveries: row.num_deliveries ? Number(row.num_deliveries) : 1,
          extra_dropoffs: row.extra_dropoffs ? Number(row.extra_dropoffs) : 0,
          extra_dropoff_cost: row.extra_dropoff_cost ? Number(row.extra_dropoff_cost) : 0,

          // Revenue & cost breakdown
          amount_vatable: row.amount_vatable ? Number(row.amount_vatable) : null,
          amount_not_vatable: row.amount_not_vatable ? Number(row.amount_not_vatable) : null,
          total_amount: row.total_amount ? Number(row.total_amount) : null,
          total_revenue: Number(row.total_revenue) || 0,
          total_cost: Number(row.total_cost) || 0,
          vendor_cost: row.vendor_cost ? Number(row.vendor_cost) : null,
          vat_amount: row.vat_amount ? Number(row.vat_amount) : null,
          sub_total: row.sub_total ? Number(row.sub_total) : null,
          gross_profit: row.gross_profit ? Number(row.gross_profit) : null,
          profit_margin: Number(row.profit_margin) || 0,

          // Invoice information
          invoice_number: row.invoice_number || null,
          invoice_date: parseDate(row.invoice_date),
          invoice_status: row.invoice_status || null,
          payment_terms_days: row.payment_terms_days ? Number(row.payment_terms_days) : null,
          due_date: parseDate(row.due_date),

          // Vendor billing
          vendor_bill_number: row.vendor_bill_number || null,
          vendor_invoice_status: row.vendor_invoice_status || null,
          vendor_invoice_submission_date: parseDate(row.vendor_invoice_submission_date),

          // Payment tracking
          customer_payment_status: row.customer_payment_status || null,
          payment_receipt_date: parseDate(row.payment_receipt_date),
          invoice_paid_date: parseDate(row.invoice_paid_date),
          invoice_amount_paid: row.invoice_amount_paid ? Number(row.invoice_amount_paid) : null,
          balance_owed: row.balance_owed ? Number(row.balance_owed) : null,

          // WHT (Withholding Tax)
          wht_status: row.wht_status || null,
          wht_deducted: row.wht_deducted ? Number(row.wht_deducted) : null,

          // Bank payment info
          bank_payment_received: row.bank_payment_received || null,
          bank_payment_received_date: parseDate(row.bank_payment_received_date),
          bank_debited: row.bank_debited || null,
          bank_debited_date: parseDate(row.bank_debited_date),

          // Payment analysis (computed fields - store if provided)
          gap_in_payment: row.gap_in_payment ? Number(row.gap_in_payment) : null,
          invoice_ageing: row.invoice_ageing ? Number(row.invoice_ageing) : null,
          invoice_age_for_interest: row.invoice_age_for_interest ? Number(row.invoice_age_for_interest) : null,

          // Interest calculations
          daily_rate: row.daily_rate ? Number(row.daily_rate) : null,
          interest_paid: row.interest_paid ? Number(row.interest_paid) : null,
          interest_not_paid: row.interest_not_paid ? Number(row.interest_not_paid) : null,

          // Metadata
          notes: row.notes || null,
          imported_by: user?.id,
          source_file: fileName,
        };

        const { error } = await (supabase.from("historical_invoice_data" as any).insert(insertData) as any);

        if (error) {
          console.error("Insert error:", error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} records. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
      });

      if (successCount > 0) {
        fetchInitialData();
        setParsedData([]);
        setFileName(null);
      }
    } catch (error: any) {
      toast({
        title: "Import Error",
        description: error.message || "Failed to import historical data",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  // Filter records
  const filteredRecords = historicalRecords.filter((r) => {
    if (filterYear !== "all" && r.period_year.toString() !== filterYear) return false;
    if (filterMonth !== "all" && r.period_month.toString() !== filterMonth) return false;
    return true;
  });

  // Summary stats
  const summaryStats = {
    totalRecords: filteredRecords.length,
    totalRevenue: filteredRecords.reduce((sum, r) => sum + (r.total_revenue || 0), 0),
    totalCost: filteredRecords.reduce((sum, r) => sum + (r.total_cost || 0), 0),
    totalTrips: filteredRecords.reduce((sum, r) => sum + (r.trips_count || 0), 0),
  };

  const years = Array.from(new Set(historicalRecords.map((r) => r.period_year))).sort((a, b) => b - a);

  return (
    <DashboardLayout
      title="Historical Data Migration"
      subtitle="Import and manage historical invoice data for comparison and analytics"
    >
      <div className="space-y-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Upload Historical Data
            </CardTitle>
            <CardDescription>
              Upload Excel files containing historical invoice and trip data from previous years.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Select Excel File
              </Button>
              <Button variant="ghost" onClick={generateHistoricalDataTemplate}>
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
              {fileName && <Badge variant="secondary">{fileName}</Badge>}
            </div>

            {/* Preview Section */}
            {parsedData.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {parsedData.length} records ready for import
                  </p>
                  <Button onClick={handleImport} disabled={importing}>
                    {importing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Database className="w-4 h-4 mr-2" />
                    )}
                    Import {parsedData.length} Records
                  </Button>
                </div>
                <div className="border rounded-lg overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="min-w-[120px]">Customer</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Truck</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Profit</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 50).map((row, index) => {
                        const hasCustomer = !!findCustomerId(row.customer_name);
                        const hasVendor = !row.vendor_name || !!findPartnerId(row.vendor_name);
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <span className="truncate max-w-[100px]">{row.customer_name}</span>
                                {!hasCustomer && (
                                  <span title="Customer not found in system">
                                    <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <span className="truncate max-w-[80px]">{row.vendor_name || '-'}</span>
                                {row.vendor_name && !hasVendor && (
                                  <span title="Vendor not found in system">
                                    <AlertCircle className="w-4 h-4 text-warning flex-shrink-0" />
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {row.month_name || MONTHS.find(m => m.value === Number(row.period_month))?.label} {row.period_year}
                            </TableCell>
                            <TableCell className="truncate max-w-[80px]">{row.truck_number || '-'}</TableCell>
                            <TableCell>
                              <span className="truncate max-w-[100px] block" title={`${row.pickup_location || row.pick_off || ''} → ${row.delivery_location || ''}`}>
                                {row.pickup_location || row.pick_off || '-'} → {row.delivery_location || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {formatCurrency(Number(row.total_amount || row.total_revenue) || 0)}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {row.gross_profit ? formatCurrency(Number(row.gross_profit)) : '-'}
                            </TableCell>
                            <TableCell>
                              <span className="truncate max-w-[80px] block">{row.invoice_number || '-'}</span>
                            </TableCell>
                            <TableCell>
                              {row.customer_payment_status ? (
                                <Badge
                                  variant="outline"
                                  className={
                                    row.customer_payment_status.toLowerCase().includes('paid')
                                      ? 'bg-green-500/10 text-green-600'
                                      : 'bg-yellow-500/10 text-yellow-600'
                                  }
                                >
                                  {row.customer_payment_status}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Ready
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {parsedData.length > 50 && (
                    <div className="p-2 text-center text-sm text-muted-foreground border-t">
                      Showing first 50 of {parsedData.length} records in preview
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historical Records */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Imported Historical Data
                </CardTitle>
                <CardDescription>
                  View and filter previously imported historical records
                </CardDescription>
              </div>
              <div className="flex gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select value={filterYear} onValueChange={setFilterYear}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      {years.map((y) => (
                        <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Month</Label>
                  <Select value={filterMonth} onValueChange={setFilterMonth}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Months</SelectItem>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Records", value: summaryStats.totalRecords.toLocaleString() },
                { label: "Total Revenue", value: formatCurrency(summaryStats.totalRevenue) },
                { label: "Total Cost", value: formatCurrency(summaryStats.totalCost) },
                { label: "Total Trips", value: summaryStats.totalTrips.toLocaleString() },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="bg-muted/50 rounded-lg p-4"
                >
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Records Table */}
            <div className="border rounded-lg overflow-auto max-h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[120px]">Customer</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Truck</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.slice(0, 100).map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">
                        <span className="truncate max-w-[100px] block">{record.customer_name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="truncate max-w-[80px] block">{record.vendor_name || '-'}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {record.month_name || MONTHS.find(m => m.value === record.period_month)?.label} {record.period_year}
                      </TableCell>
                      <TableCell>{record.truck_number || '-'}</TableCell>
                      <TableCell>
                        <span className="truncate max-w-[120px] block" title={`${record.pickup_location || ''} → ${record.delivery_location || ''}`}>
                          {record.pickup_location || '-'} → {record.delivery_location || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatCurrency(record.total_revenue)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatCurrency(record.total_cost)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {record.gross_profit !== null ? formatCurrency(record.gross_profit) : formatCurrency(record.total_revenue - record.total_cost)}
                      </TableCell>
                      <TableCell>
                        {record.invoice_number ? (
                          <Badge variant="outline" className="text-xs">
                            {record.invoice_number}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {record.customer_payment_status ? (
                          <Badge
                            variant="outline"
                            className={
                              record.customer_payment_status.toLowerCase().includes('paid')
                                ? 'bg-green-500/10 text-green-600 text-xs'
                                : 'bg-yellow-500/10 text-yellow-600 text-xs'
                            }
                          >
                            {record.customer_payment_status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
                            N/A
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs truncate max-w-[80px]">
                          {record.source_file ? record.source_file.substring(0, 15) + '...' : 'Manual'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRecords.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        No historical data found. Upload an Excel file to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {filteredRecords.length > 100 && (
                <div className="p-2 text-center text-sm text-muted-foreground border-t">
                  Showing first 100 of {filteredRecords.length} records
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default HistoricalDataMigration;
