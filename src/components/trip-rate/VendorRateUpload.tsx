import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Download, Check, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  parseExcelFile,
  vendorRateHeaderMap,
  VendorRateRow,
  normalizeTruckType,
  normalizeZone,
  generateVendorRateTemplate,
} from "@/lib/excelParser";

interface VendorRateUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partners: { id: string; company_name: string }[];
  customers: { id: string; company_name: string }[];
  onSuccess: () => void;
}

const VendorRateUpload = ({
  open,
  onOpenChange,
  partners,
  customers,
  onSuccess,
}: VendorRateUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<VendorRateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);

    try {
      const data = await parseExcelFile<VendorRateRow>(file, vendorRateHeaderMap);
      
      // Validate and clean data
      const validData = data.filter((row) => row.vendor_name && row.rate_amount);
      setParsedData(validData);

      if (validData.length === 0) {
        toast({
          title: "No Valid Data",
          description: "No valid rows found in the Excel file. Ensure 'Vendor Name' and 'Rate Amount' columns exist.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "File Parsed",
          description: `Found ${validData.length} valid rate entries`,
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

  const findPartnerId = (vendorName: string): string | null => {
    const match = partners.find(
      (p) => p.company_name.toLowerCase() === vendorName.toLowerCase()
    );
    return match?.id || null;
  };

  const findCustomerId = (customerName: string): string | null => {
    if (!customerName) return null;
    const match = customers.find(
      (c) => c.company_name.toLowerCase() === customerName.toLowerCase()
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
        const partnerId = findPartnerId(row.vendor_name);
        const customerId = row.customer_name ? findCustomerId(row.customer_name) : null;

        const insertData = {
          truck_type: normalizeTruckType(row.truck_type || row.tonnage || '10t'),
          zone: row.zone ? normalizeZone(row.zone) : 'outside_ibadan',
          rate_amount: Number(row.rate_amount) || 0,
          is_net: row.is_net === true || String(row.is_net).toLowerCase() === 'yes',
          driver_type: 'vendor' as const,
          partner_id: partnerId,
          customer_id: customerId,
          pickup_location: row.pickup_location || null,
          description: row.notes || `${row.vendor_name} rate for ${row.customer_name || 'all customers'}`,
        };

        const { error } = await (supabase.from("trip_rate_config" as any).insert(insertData) as any);

        if (error) {
          console.error("Insert error:", error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} rates. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
      });

      if (successCount > 0) {
        onSuccess();
        onOpenChange(false);
        setParsedData([]);
        setFileName(null);
      }
    } catch (error: any) {
      toast({
        title: "Import Error",
        description: error.message || "Failed to import rates",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setParsedData([]);
    setFileName(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Upload Vendor Rates
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file with vendor rates. Download the template for the correct format.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* Upload Section */}
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
              Select File
            </Button>
            <Button variant="ghost" onClick={generateVendorRateTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            {fileName && (
              <Badge variant="secondary">{fileName}</Badge>
            )}
          </div>

          {/* Preview Table */}
          {parsedData.length > 0 && (
            <div className="border rounded-lg overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Truck Type</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 50).map((row, index) => {
                    const partnerId = findPartnerId(row.vendor_name);
                    const customerId = row.customer_name ? findCustomerId(row.customer_name) : null;
                    const hasPartner = !!partnerId;
                    const hasCustomer = !row.customer_name || !!customerId;

                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {row.vendor_name}
                            {!hasPartner && (
                              <span title="Vendor not found">
                                <AlertCircle className="w-4 h-4 text-warning" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {row.customer_name || '-'}
                            {row.customer_name && !hasCustomer && (
                              <span title="Customer not found">
                                <AlertCircle className="w-4 h-4 text-warning" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{normalizeTruckType(row.truck_type || row.tonnage || '')}</TableCell>
                        <TableCell>{row.zone ? normalizeZone(row.zone) : 'outside_ibadan'}</TableCell>
                        <TableCell className="text-right font-medium">
                          ₦{Number(row.rate_amount).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {hasPartner ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600">
                              <Check className="w-3 h-3 mr-1" />
                              Ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-warning/10 text-warning">
                              New Vendor
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {parsedData.length > 50 && (
                <div className="p-2 text-center text-sm text-muted-foreground">
                  Showing first 50 of {parsedData.length} rows
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={parsedData.length === 0 || importing}
          >
            {importing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Import {parsedData.length} Rates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VendorRateUpload;
