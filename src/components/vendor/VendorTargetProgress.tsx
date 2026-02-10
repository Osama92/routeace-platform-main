import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TrendingUp, TrendingDown, Minus, Truck } from "lucide-react";
import { startOfMonth, endOfMonth } from "date-fns";

const TRUCK_TYPES = ["3T", "5T", "10T", "15T", "20T", "30T", "45T", "60T"] as const;

// Map vehicle capacity_kg to the standard truck type categories
const capacityToTruckType = (capacityKg: number | null): string | null => {
  if (!capacityKg) return null;
  const tons = capacityKg / 1000;
  if (tons <= 3) return "3T";
  if (tons <= 5) return "5T";
  if (tons <= 10) return "10T";
  if (tons <= 15) return "15T";
  if (tons <= 20) return "20T";
  if (tons <= 30) return "30T";
  if (tons <= 45) return "45T";
  return "60T";
};

// Normalize a truck_type string to standard format (e.g. "10t" → "10T")
const normalizeTruckTypeStr = (truckType: string | null): string | null => {
  if (!truckType) return null;
  const upper = truckType.toUpperCase().trim();
  if ((TRUCK_TYPES as readonly string[]).includes(upper)) return upper;
  const match = upper.match(/(\d+)/);
  if (match) {
    const candidate = match[1] + "T";
    if ((TRUCK_TYPES as readonly string[]).includes(candidate)) return candidate;
  }
  return null;
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

interface VendorProgress {
  vendorId: string;
  vendorName: string;
  targets: Record<string, number>;
  actuals: Record<string, number>;
}

const VendorTargetProgress = () => {
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [vendorProgress, setVendorProgress] = useState<VendorProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgress();
  }, [selectedMonth, selectedYear]);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      // Fetch targets with vendor info
      const { data: targetsData, error: targetsError } = await supabase
        .from("vendor_truck_targets")
        .select(`
          id,
          vendor_id,
          truck_type,
          target_trips,
          partners!inner(company_name)
        `)
        .eq("target_month", selectedMonth)
        .eq("target_year", selectedYear);

      if (targetsError) throw targetsError;

      // Get unique vendor IDs from targets
      const vendorIds = [...new Set(targetsData?.map((t) => t.vendor_id) || [])];

      // Build date range for the selected month/year
      const monthStart = startOfMonth(new Date(selectedYear, selectedMonth - 1));
      const monthEnd = endOfMonth(new Date(selectedYear, selectedMonth - 1));

      // Compute actuals from real dispatches:
      // dispatch → vehicle (vendor_id) → partner
      // dispatch → vehicle (truck_type, capacity_kg) → truck type
      const { data: dispatchesData } = await supabase
        .from("dispatches")
        .select(`
          id,
          vehicles!inner(vendor_id, truck_type, capacity_kg)
        `)
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString())
        .eq("status", "delivered");

      // Count completed trips per vendor per truck type
      const actualsMap: Record<string, number> = {};

      dispatchesData?.forEach((dispatch: any) => {
        const partnerId = dispatch.vehicles?.vendor_id;
        if (!partnerId || !vendorIds.includes(partnerId)) return;

        // Determine truck type from vehicle's truck_type field or capacity_kg
        const truckType =
          normalizeTruckTypeStr(dispatch.vehicles?.truck_type) ||
          capacityToTruckType(dispatch.vehicles?.capacity_kg);

        if (!truckType) return;

        const key = `${partnerId}|${truckType}`;
        actualsMap[key] = (actualsMap[key] || 0) + 1;
      });

      // Build vendor progress map
      const vendorMap: Record<string, VendorProgress> = {};

      targetsData?.forEach((target: any) => {
        const vendorId = target.vendor_id;
        if (!vendorMap[vendorId]) {
          vendorMap[vendorId] = {
            vendorId,
            vendorName: target.partners?.company_name || "Unknown Partner",
            targets: {},
            actuals: {},
          };
        }
        vendorMap[vendorId].targets[target.truck_type] = target.target_trips;
        vendorMap[vendorId].actuals[target.truck_type] = actualsMap[`${vendorId}|${target.truck_type}`] || 0;
      });

      setVendorProgress(Object.values(vendorMap));
    } catch (error) {
      console.error("Error fetching progress:", error);
    } finally {
      setLoading(false);
    }
  };

  const getProgressStatus = (target: number, actual: number) => {
    if (target === 0) return { color: "bg-muted", icon: Minus, label: "No Target" };
    const percentage = (actual / target) * 100;
    if (percentage >= 80) return { color: "bg-success", icon: TrendingUp, label: "On Track" };
    if (percentage >= 50) return { color: "bg-warning", icon: Minus, label: "Behind" };
    return { color: "bg-destructive", icon: TrendingDown, label: "Critical" };
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const getTotalStats = (progress: VendorProgress) => {
    let totalTarget = 0;
    let totalActual = 0;
    TRUCK_TYPES.forEach((type) => {
      totalTarget += progress.targets[type] || 0;
      totalActual += progress.actuals[type] || 0;
    });
    return { totalTarget, totalActual };
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Truck Deployment Progress
          </CardTitle>
          <div className="flex gap-2">
            <Select
              value={selectedMonth.toString()}
              onValueChange={(v) => setSelectedMonth(parseInt(v))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month) => (
                  <SelectItem key={month.value} value={month.value.toString()}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={selectedYear.toString()}
              onValueChange={(v) => setSelectedYear(parseInt(v))}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : vendorProgress.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No targets set for this period
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Partner</TableHead>
                  {TRUCK_TYPES.map((type) => (
                    <TableHead key={type} className="text-center min-w-[100px]">
                      {type}
                    </TableHead>
                  ))}
                  <TableHead className="text-center min-w-[120px]">Total</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorProgress.map((vendor) => {
                  const { totalTarget, totalActual } = getTotalStats(vendor);
                  const overallPercentage = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
                  const status = getProgressStatus(totalTarget, totalActual);

                  return (
                    <TableRow key={vendor.vendorId}>
                      <TableCell className="font-medium">{vendor.vendorName}</TableCell>
                      {TRUCK_TYPES.map((type) => {
                        const target = vendor.targets[type] || 0;
                        const actual = vendor.actuals[type] || 0;
                        const percentage = target > 0 ? Math.round((actual / target) * 100) : 0;
                        const cellStatus = getProgressStatus(target, actual);

                        return (
                          <TableCell key={type} className="text-center">
                            {target > 0 ? (
                              <div className="space-y-1">
                                <div className="text-sm">
                                  <span className="font-medium">{actual}</span>
                                  <span className="text-muted-foreground">/{target}</span>
                                </div>
                                <Progress value={percentage} className="h-1.5" />
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {totalActual}/{totalTarget}
                          </div>
                          <Progress value={overallPercentage} className="h-2" />
                          <div className="text-xs text-muted-foreground">
                            {overallPercentage}%
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${status.color} text-white gap-1`}>
                          <status.icon className="w-3 h-3" />
                          {status.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VendorTargetProgress;
