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
import { Label } from "@/components/ui/label";
import {
  FileText,
  Download,
  Building2,
  Users,
  Calculator,
  Calendar,
  Printer,
  FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfYear, endOfYear, parseISO } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface TaxSummary {
  driver_id: string;
  driver_name: string;
  tin: string | null;
  total_gross: number;
  total_tax: number;
  months_employed: number;
  records: PayrollRecord[];
}

interface PayrollRecord {
  period: string;
  gross_amount: number;
  tax_amount: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const TaxFilingReport = () => {
  const [taxData, setTaxData] = useState<TaxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const { toast } = useToast();

  // Nigerian fiscal year is January to December
  const yearOptions = Array.from({ length: 5 }, (_, i) => {
    const year = new Date().getFullYear() - i;
    return { value: year, label: `${year}` };
  });

  const fetchTaxData = async () => {
    setLoading(true);
    try {
      const startDate = startOfYear(new Date(selectedYear, 0, 1));
      const endDate = endOfYear(new Date(selectedYear, 0, 1));

      // Fetch all salary records for the year
      const { data: salaries, error } = await supabase
        .from("driver_salaries")
        .select(`
          id,
          driver_id,
          gross_amount,
          tax_amount,
          period_start,
          drivers (full_name, tax_id)
        `)
        .gte("period_start", startDate.toISOString())
        .lte("period_start", endDate.toISOString())
        .eq("status", "paid");

      if (error) throw error;

      // Aggregate by driver
      const driverMap: Record<string, TaxSummary> = {};

      (salaries || []).forEach((s: any) => {
        const driverId = s.driver_id;
        
        if (!driverMap[driverId]) {
          driverMap[driverId] = {
            driver_id: driverId,
            driver_name: s.drivers?.full_name || "Unknown",
            tin: s.drivers?.tax_id || null,
            total_gross: 0,
            total_tax: 0,
            months_employed: 0,
            records: [],
          };
        }

        const periodKey = s.period_start?.slice(0, 7) || "unknown";
        
        driverMap[driverId].total_gross += s.gross_amount || 0;
        driverMap[driverId].total_tax += s.tax_amount || 0;
        driverMap[driverId].months_employed++;
        driverMap[driverId].records.push({
          period: periodKey,
          gross_amount: s.gross_amount || 0,
          tax_amount: s.tax_amount || 0,
        });
      });

      setTaxData(Object.values(driverMap).sort((a, b) => 
        a.driver_name.localeCompare(b.driver_name)
      ));
    } catch (error: any) {
      console.error("Failed to fetch tax data:", error);
      toast({
        title: "Error",
        description: "Failed to load tax data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaxData();
  }, [selectedYear]);

  // Totals
  const totals = {
    drivers: taxData.length,
    totalGross: taxData.reduce((acc, d) => acc + d.total_gross, 0),
    totalTax: taxData.reduce((acc, d) => acc + d.total_tax, 0),
    avgMonths: taxData.length > 0 
      ? taxData.reduce((acc, d) => acc + d.months_employed, 0) / taxData.length 
      : 0,
  };

  const handleExportCSV = () => {
    // FIRS-compatible format
    const headers = [
      "S/N",
      "Employee Name",
      "Tax Identification Number (TIN)",
      "Annual Gross Income (NGN)",
      "Annual Tax Deducted (NGN)",
      "Months Employed",
    ];

    const rows = taxData.map((d, index) => [
      index + 1,
      d.driver_name,
      d.tin || "N/A",
      d.total_gross.toFixed(2),
      d.total_tax.toFixed(2),
      d.months_employed,
    ]);

    // Add totals row
    rows.push([
      "",
      "TOTAL",
      "",
      totals.totalGross.toFixed(2),
      totals.totalTax.toFixed(2),
      "",
    ]);

    const csvContent = [
      `Annual Tax Filing Report - ${selectedYear}`,
      `Company: LogiFlow Logistics`,
      `Generated: ${format(new Date(), "PPP")}`,
      "",
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tax-filing-report-${selectedYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Tax filing report exported to CSV",
    });
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();

    // Header
    doc.setFillColor(26, 54, 93);
    doc.rect(0, 0, 210, 45, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("ANNUAL TAX FILING REPORT", 105, 18, { align: "center" });
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text(`Fiscal Year: ${selectedYear}`, 105, 28, { align: "center" });
    doc.setFontSize(10);
    doc.text("For Submission to Federal Inland Revenue Service (FIRS)", 105, 38, { align: "center" });

    // Company info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Employer Information", 15, 55);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Company Name: LogiFlow Logistics", 15, 63);
    doc.text(`Report Period: January 1, ${selectedYear} - December 31, ${selectedYear}`, 15, 70);
    doc.text(`Generated Date: ${format(new Date(), "PPP")}`, 15, 77);
    doc.text(`Total Employees: ${totals.drivers}`, 15, 84);

    // Summary
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Summary", 15, 97);
    
    autoTable(doc, {
      startY: 102,
      head: [["Description", "Amount (NGN)"]],
      body: [
        ["Total Gross Income Paid", formatCurrency(totals.totalGross)],
        ["Total Tax Deducted (PAYE)", formatCurrency(totals.totalTax)],
        ["Average Employment Period", `${totals.avgMonths.toFixed(1)} months`],
      ],
      theme: "striped",
      headStyles: { fillColor: [38, 103, 73] },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 60, halign: "right" }
      },
      margin: { left: 15 }
    });

    // Employee details
    const detailsStartY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Employee Tax Details", 15, detailsStartY);

    autoTable(doc, {
      startY: detailsStartY + 5,
      head: [["S/N", "Employee Name", "TIN", "Gross Income", "Tax Deducted", "Months"]],
      body: taxData.map((d, index) => [
        index + 1,
        d.driver_name,
        d.tin || "N/A",
        formatCurrency(d.total_gross),
        formatCurrency(d.total_tax),
        d.months_employed,
      ]),
      theme: "striped",
      headStyles: { fillColor: [38, 103, 73] },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 50 },
        2: { cellWidth: 35 },
        3: { cellWidth: 35, halign: "right" },
        4: { cellWidth: 35, halign: "right" },
        5: { cellWidth: 15, halign: "center" }
      },
      margin: { left: 15 },
      foot: [["", "TOTAL", "", formatCurrency(totals.totalGross), formatCurrency(totals.totalTax), ""]],
      footStyles: { fillColor: [180, 83, 9], textColor: [255, 255, 255], fontStyle: "bold" }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Declaration:", 15, finalY);
    doc.setFontSize(9);
    doc.text(
      "I hereby certify that the information contained in this report is true and correct to the best of my knowledge.",
      15,
      finalY + 7
    );
    
    doc.text("_________________________________", 15, finalY + 30);
    doc.text("Authorized Signatory", 15, finalY + 37);
    doc.text("Date: _______________", 15, finalY + 44);

    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text("This document is computer-generated. Contact HR for verification.", 105, 285, { align: "center" });

    doc.save(`tax-filing-report-${selectedYear}.pdf`);

    toast({
      title: "PDF Generated",
      description: "Tax filing report downloaded",
    });
  };

  return (
    <DashboardLayout
      title="Tax Filing Report"
      subtitle="Annual tax withholding summary for FIRS submission"
    >
      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
        <div className="flex gap-4 items-center">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Fiscal Year</Label>
            <Select 
              value={selectedYear.toString()} 
              onValueChange={(v) => setSelectedYear(parseInt(v))}
            >
              <SelectTrigger className="w-32 bg-secondary/50">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value.toString()}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export CSV (FIRS)
          </Button>
          <Button variant="outline" onClick={handleExportPDF}>
            <FileText className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Employees", value: totals.drivers, icon: Users, color: "bg-primary/10 text-primary" },
          { label: "Total Gross Income", value: formatCurrency(totals.totalGross), icon: Calculator, color: "bg-success/10 text-success" },
          { label: "Total Tax Deducted", value: formatCurrency(totals.totalTax), icon: Building2, color: "bg-warning/10 text-warning" },
          { label: "Avg. Employment", value: `${totals.avgMonths.toFixed(1)} months`, icon: Calendar, color: "bg-info/10 text-info" },
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

      {/* Tax Data Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : taxData.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground">No payroll data for {selectedYear}</p>
            <p className="text-sm text-muted-foreground/70">
              Process payroll for drivers to generate tax filing data
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Employee Tax Withholding Summary
            </CardTitle>
            <CardDescription>
              Annual PAYE deductions for fiscal year {selectedYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">S/N</TableHead>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>TIN</TableHead>
                  <TableHead className="text-right">Annual Gross</TableHead>
                  <TableHead className="text-right">Annual Tax</TableHead>
                  <TableHead className="text-center">Months</TableHead>
                  <TableHead className="text-right">Eff. Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxData.map((driver, index) => (
                  <TableRow key={driver.driver_id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium">{driver.driver_name}</p>
                    </TableCell>
                    <TableCell>
                      {driver.tin ? (
                        <Badge variant="secondary">{driver.tin}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not provided</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(driver.total_gross)}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {formatCurrency(driver.total_tax)}
                    </TableCell>
                    <TableCell className="text-center">
                      {driver.months_employed}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {driver.total_gross > 0 
                        ? ((driver.total_tax / driver.total_gross) * 100).toFixed(1)
                        : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Totals */}
            <div className="border-t mt-4 pt-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Annual Gross</p>
                  <p className="text-xl font-bold">{formatCurrency(totals.totalGross)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Tax Deducted</p>
                  <p className="text-xl font-bold text-destructive">{formatCurrency(totals.totalTax)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Overall Effective Rate</p>
                  <p className="text-xl font-bold">
                    {totals.totalGross > 0 
                      ? ((totals.totalTax / totals.totalGross) * 100).toFixed(1)
                      : 0}%
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </DashboardLayout>
  );
};

export default TaxFilingReport;
