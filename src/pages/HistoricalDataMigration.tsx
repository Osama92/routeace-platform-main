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
  trips_count: number;
  total_revenue: number;
  total_cost: number;
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

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const row of parsedData) {
        const customerId = findCustomerId(row.customer_name);
        const vendorId = row.vendor_name ? findPartnerId(row.vendor_name) : null;

        const insertData = {
          customer_id: customerId,
          customer_name: row.customer_name,
          vendor_id: vendorId,
          vendor_name: row.vendor_name || null,
          period_year: Number(row.period_year),
          period_month: Number(row.period_month),
          tonnage: row.tonnage || null,
          truck_type: row.truck_type || null,
          route: row.route || null,
          pickup_location: row.pickup_location || null,
          delivery_location: row.delivery_location || null,
          trips_count: Number(row.trips_count) || 0,
          total_revenue: Number(row.total_revenue) || 0,
          total_cost: Number(row.total_cost) || 0,
          profit_margin: Number(row.profit_margin) || 0,
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
                <div className="border rounded-lg overflow-auto max-h-[300px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Trips</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 20).map((row, index) => {
                        const hasCustomer = !!findCustomerId(row.customer_name);
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {row.customer_name}
                                {!hasCustomer && (
                                  <span title="Customer not found">
                                    <AlertCircle className="w-4 h-4 text-warning" />
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{row.vendor_name || '-'}</TableCell>
                            <TableCell>
                              {MONTHS.find(m => m.value === Number(row.period_month))?.label} {row.period_year}
                            </TableCell>
                            <TableCell className="text-right">{row.trips_count || 0}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(Number(row.total_revenue) || 0)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                                Ready
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
            <div className="border rounded-lg overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Trips</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.slice(0, 100).map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.customer_name}</TableCell>
                      <TableCell>{record.vendor_name || '-'}</TableCell>
                      <TableCell>
                        {MONTHS.find(m => m.value === record.period_month)?.label} {record.period_year}
                      </TableCell>
                      <TableCell className="text-right">{record.trips_count}</TableCell>
                      <TableCell className="text-right">{formatCurrency(record.total_revenue)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(record.total_cost)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs truncate max-w-[100px]">
                          {record.source_file || 'Manual'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRecords.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No historical data found. Upload an Excel file to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {filteredRecords.length > 100 && (
                <div className="p-2 text-center text-sm text-muted-foreground">
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
