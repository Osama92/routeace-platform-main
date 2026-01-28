import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Route, 
  Loader2, 
  ArrowRight, 
  TrendingDown, 
  Clock, 
  MapPin,
  Check 
} from "lucide-react";

interface Waypoint {
  id: string;
  address: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

interface OptimizedRoute {
  optimizedOrder: number[];
  waypoints: { address: string }[];
  totalDistanceKm: number;
  totalDurationHours: number;
  legs: {
    from: string;
    to: string;
    distanceKm: number;
    durationHours: number;
  }[];
  savingsPercent: number;
}

interface RouteOptimizerProps {
  origin: string;
  destination: string;
  dropoffs: Waypoint[];
  onApplyOptimizedOrder: (newOrder: Waypoint[]) => void;
}

const RouteOptimizer = ({
  origin,
  destination,
  dropoffs,
  onApplyOptimizedOrder,
}: RouteOptimizerProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OptimizedRoute | null>(null);

  const handleOptimize = async () => {
    if (!origin || !destination || dropoffs.length === 0) {
      toast({
        title: "Missing Data",
        description: "Origin, destination, and at least one dropoff required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("optimize-route", {
        body: {
          origin: { address: origin },
          destination: { address: destination },
          waypoints: dropoffs.map((d) => ({
            address: d.address,
            latitude: d.latitude,
            longitude: d.longitude,
          })),
        },
      });

      if (error) throw error;

      setResult(data);
      toast({
        title: "Route Optimized",
        description: `${data.savingsPercent}% distance savings possible`,
      });
    } catch (error: any) {
      console.error("Optimization error:", error);
      toast({
        title: "Optimization Failed",
        description: error.message || "Could not optimize route",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyOrder = () => {
    if (!result) return;

    const reorderedDropoffs = result.optimizedOrder.map((index) => dropoffs[index]);
    onApplyOptimizedOrder(reorderedDropoffs);
    
    toast({
      title: "Order Applied",
      description: "Dropoff points have been reordered for optimal routing",
    });
  };

  const formatDuration = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Route className="w-4 h-4 text-primary" />
            <span>Route Optimization</span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleOptimize}
            disabled={loading || dropoffs.length === 0}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Route className="w-4 h-4 mr-1" />
            )}
            Optimize Route
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click "Optimize Route" to find the most efficient delivery order
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">
              Calculating optimal route...
            </span>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-background/60 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Total Distance</p>
                <p className="text-lg font-bold">{result.totalDistanceKm} km</p>
              </div>
              <div className="bg-background/60 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Est. Duration</p>
                <p className="text-lg font-bold">
                  {formatDuration(result.totalDurationHours)}
                </p>
              </div>
              <div className="bg-success/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Savings</p>
                <p className="text-lg font-bold text-success flex items-center justify-center gap-1">
                  <TrendingDown className="w-4 h-4" />
                  {result.savingsPercent}%
                </p>
              </div>
            </div>

            {/* Optimized Route Display */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Optimized Order:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-success/10 text-success">
                  <MapPin className="w-3 h-3 mr-1" />
                  Start
                </Badge>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                
                {result.legs.map((leg, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs max-w-[150px] truncate">
                      {index + 1}. {leg.to.split(",")[0]}
                    </Badge>
                    {index < result.legs.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Leg Details */}
            <div className="space-y-1 text-xs">
              {result.legs.map((leg, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-1 border-b border-border/30 last:border-0"
                >
                  <span className="text-muted-foreground truncate flex-1">
                    {leg.from.split(",")[0]} → {leg.to.split(",")[0]}
                  </span>
                  <div className="flex items-center gap-3 text-foreground">
                    <span>{leg.distanceKm} km</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDuration(leg.durationHours)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Apply Button */}
            <Button
              type="button"
              onClick={handleApplyOrder}
              className="w-full"
              variant="default"
            >
              <Check className="w-4 h-4 mr-2" />
              Apply Optimized Order
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RouteOptimizer;