import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";

interface RateChangePreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zone: string;
  driverType: 'owned' | 'vendor';
  currentRates: { truck_type: string; rate_amount: number }[];
  newRate: number;
  onConfirm: () => void;
}

interface PayrollImpact {
  driverName: string;
  driverType: string;
  tripsAffected: number;
  oldPayroll: number;
  newPayroll: number;
  difference: number;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
  }).format(amount);
};

const RateChangePreview = ({
  open,
  onOpenChange,
  zone,
  driverType,
  currentRates,
  newRate,
  onConfirm,
}: RateChangePreviewProps) => {
  const [loading, setLoading] = useState(false);
  const [impacts, setImpacts] = useState<PayrollImpact[]>([]);
  const [totals, setTotals] = useState({
    driversAffected: 0,
    totalTrips: 0,
    oldTotal: 0,
    newTotal: 0,
    difference: 0,
  });

  useEffect(() => {
    if (open) {
      fetchPayrollImpact();
    }
  }, [open, zone, driverType, newRate]);

  const fetchPayrollImpact = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startDate = startOfMonth(now).toISOString();
      const endDate = endOfMonth(now).toISOString();

      // Get dispatches for current month
      const { data: dispatches, error } = await supabase
        .from("dispatches")
        .select(`
          id,
          driver_id,
          delivery_address,
          drivers (
            id,
            full_name,
            driver_type
          ),
          vehicles (
            truck_type
          )
        `)
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .eq("status", "delivered");

      if (error) throw error;

      // Calculate impact per driver
      const driverImpacts: Record<string, PayrollImpact> = {};

      (dispatches || []).forEach((dispatch: any) => {
        if (!dispatch.driver_id || !dispatch.drivers) return;

        // Check if driver matches type
        const dispatchDriverType = dispatch.drivers.driver_type || 'owned';
        if (dispatchDriverType !== driverType) return;

        // Simple zone classification
        const address = (dispatch.delivery_address || '').toLowerCase();
        const withinZoneKeywords = ['lagos', 'sagamu', 'abeokuta', 'ibadan', 'oyo'];
        const dispatchZone = withinZoneKeywords.some(k => address.includes(k))
          ? 'within_ibadan'
          : 'outside_ibadan';

        if (dispatchZone !== zone) return;

        const truckType = dispatch.vehicles?.truck_type || '10t';
        const currentRate = currentRates.find(r => r.truck_type === truckType)?.rate_amount || 20000;

        const driverId = dispatch.driver_id;
        if (!driverImpacts[driverId]) {
          driverImpacts[driverId] = {
            driverName: dispatch.drivers.full_name,
            driverType: dispatchDriverType,
            tripsAffected: 0,
            oldPayroll: 0,
            newPayroll: 0,
            difference: 0,
          };
        }

        driverImpacts[driverId].tripsAffected++;
        driverImpacts[driverId].oldPayroll += currentRate;
        driverImpacts[driverId].newPayroll += newRate;
      });

      // Calculate differences
      Object.values(driverImpacts).forEach((impact) => {
        impact.difference = impact.newPayroll - impact.oldPayroll;
      });

      const impactList = Object.values(driverImpacts).sort(
        (a, b) => Math.abs(b.difference) - Math.abs(a.difference)
      );

      setImpacts(impactList);

      // Calculate totals
      const totalOld = impactList.reduce((sum, i) => sum + i.oldPayroll, 0);
      const totalNew = impactList.reduce((sum, i) => sum + i.newPayroll, 0);

      setTotals({
        driversAffected: impactList.length,
        totalTrips: impactList.reduce((sum, i) => sum + i.tripsAffected, 0),
        oldTotal: totalOld,
        newTotal: totalNew,
        difference: totalNew - totalOld,
      });
    } catch (error) {
      console.error("Failed to calculate impact:", error);
    } finally {
      setLoading(false);
    }
  };

  const percentChange = totals.oldTotal > 0
    ? ((totals.difference / totals.oldTotal) * 100).toFixed(1)
    : '0';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Rate Change Impact Preview
          </DialogTitle>
          <DialogDescription>
            Preview the payroll impact before applying the bulk rate update for {driverType} drivers in {zone.replace('_', ' ')}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Drivers Affected
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{totals.driversAffected}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Trips This Month
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{totals.totalTrips}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Current Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(totals.oldTotal)}</p>
                  </CardContent>
                </Card>
                <Card className={totals.difference > 0 ? "border-destructive/50" : "border-success/50"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Payroll Change
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      {totals.difference > 0 ? (
                        <TrendingUp className="w-5 h-5 text-destructive" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-success" />
                      )}
                      <p className={`text-2xl font-bold ${totals.difference > 0 ? 'text-destructive' : 'text-success'}`}>
                        {totals.difference > 0 ? '+' : ''}{formatCurrency(totals.difference)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {totals.difference > 0 ? '+' : ''}{percentChange}% change
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Driver Breakdown */}
              {impacts.length > 0 && (
                <div className="border rounded-lg overflow-auto max-h-[300px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Driver</TableHead>
                        <TableHead className="text-center">Trips</TableHead>
                        <TableHead className="text-right">Current</TableHead>
                        <TableHead className="text-right">New</TableHead>
                        <TableHead className="text-right">Difference</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {impacts.slice(0, 20).map((impact, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{impact.driverName}</TableCell>
                          <TableCell className="text-center">{impact.tripsAffected}</TableCell>
                          <TableCell className="text-right">{formatCurrency(impact.oldPayroll)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(impact.newPayroll)}</TableCell>
                          <TableCell className="text-right">
                            <Badge
                              variant="outline"
                              className={impact.difference > 0
                                ? "bg-destructive/10 text-destructive"
                                : "bg-success/10 text-success"
                              }
                            >
                              {impact.difference > 0 ? '+' : ''}{formatCurrency(impact.difference)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {impacts.length > 20 && (
                    <div className="p-2 text-center text-sm text-muted-foreground">
                      Showing top 20 of {impacts.length} affected drivers
                    </div>
                  )}
                </div>
              )}

              {impacts.length === 0 && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  No drivers would be affected by this rate change in the current period.
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="destructive">
            Confirm Rate Change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RateChangePreview;
