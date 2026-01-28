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
import { Upload, Fuel, Download, Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  parseExcelFile,
  dieselRateHeaderMap,
  DieselRateRow,
  normalizeTruckType,
  generateDieselRateTemplate,
} from "@/lib/excelParser";

interface DieselRateUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routes: { id: string; name: string; origin: string; destination: string }[];
  onSuccess: () => void;
}

const DieselRateUpload = ({
  open,
  onOpenChange,
  routes,
  onSuccess,
}: DieselRateUploadProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsedData, setParsedData] = useState<DieselRateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileName(file.name);

    try {
      const data = await parseExcelFile<DieselRateRow>(file, dieselRateHeaderMap);
      
      // Validate and clean data
      const validData = data.filter(
        (row) => row.origin && row.destination && row.diesel_liters_agreed
      );
      setParsedData(validData);

      if (validData.length === 0) {
        toast({
          title: "No Valid Data",
          description: "No valid rows found. Ensure 'Origin', 'Destination', and 'Diesel Agreed' columns exist.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "File Parsed",
          description: `Found ${validData.length} valid diesel rate entries`,
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

  const findRouteId = (origin: string, destination: string): string | null => {
    const match = routes.find(
      (r) =>
        r.origin.toLowerCase().includes(origin.toLowerCase()) &&
        r.destination.toLowerCase().includes(destination.toLowerCase())
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
        const routeId = findRouteId(row.origin, row.destination);

        const insertData = {
          route_id: routeId,
          route_name: row.route_name || `${row.origin} - ${row.destination}`,
          origin: row.origin,
          destination: row.destination,
          distance_km: Number(row.distance_km) || null,
          truck_type: normalizeTruckType(row.truck_type || '10t'),
          diesel_liters_agreed: Number(row.diesel_liters_agreed),
          diesel_cost_per_liter: Number(row.diesel_cost_per_liter) || 950,
          notes: row.notes || null,
          is_active: true,
          created_by: user?.id,
        };

        const { error } = await (supabase.from("diesel_rate_config" as any).insert(insertData) as any);

        if (error) {
          console.error("Insert error:", error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} diesel rates. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
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
        description: error.message || "Failed to import diesel rates",
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
            <Fuel className="w-5 h-5" />
            Upload Diesel Rates per Route
          </DialogTitle>
          <DialogDescription>
            Upload an Excel file with agreed diesel rates for owned driver routes.
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
            <Button variant="ghost" onClick={generateDieselRateTemplate}>
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
                    <TableHead>Route Name</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Truck Type</TableHead>
                    <TableHead className="text-right">Diesel (L)</TableHead>
                    <TableHead className="text-right">Cost/L</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 50).map((row, index) => {
                    const routeId = findRouteId(row.origin, row.destination);

                    return (
                      <TableRow key={index}>
                        <TableCell>{row.route_name || `${row.origin}-${row.destination}`}</TableCell>
                        <TableCell>{row.origin}</TableCell>
                        <TableCell>{row.destination}</TableCell>
                        <TableCell>{normalizeTruckType(row.truck_type || '')}</TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(row.diesel_liters_agreed).toLocaleString()}L
                        </TableCell>
                        <TableCell className="text-right">
                          ₦{Number(row.diesel_cost_per_liter || 950).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {routeId ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600">
                              <Check className="w-3 h-3 mr-1" />
                              Route Found
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                              New Route
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
            Import {parsedData.length} Diesel Rates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DieselRateUpload;
