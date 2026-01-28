import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Fuel, Truck, MapPin, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FuelPlanningCardProps {
  dispatchId?: string;
  distanceKm: number;
  vehicleId?: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  onUpdate?: (data: FuelPlanData) => void;
  onSaveComplete?: () => void;
  readOnly?: boolean;
}

interface FuelPlanData {
  toDistance: number;
  returnDistance: number;
  totalDistance: number;
  suggestedFuel: number;
  actualFuel: number;
  variance: number;
}

interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_type: string;
  capacity_kg: number | null;
}

// Fuel consumption factors by tonnage (L/km)
const getFuelFactor = (capacityKg: number | null, vehicleType: string): number => {
  const tonnage = (capacityKg || 0) / 1000;
  
  // Based on user requirements:
  // 15-20 tonnes: 0.35 L/km
  // 30 tonnes: 0.47 L/km
  // 45-60+ tonnes: 0.55 L/km
  if (tonnage >= 45) return 0.55;
  if (tonnage >= 25) return 0.47;
  if (tonnage >= 15) return 0.35;
  
  // Default for lighter vehicles based on type
  switch (vehicleType) {
    case "heavy_truck":
    case "trailer":
    case "tanker":
      return 0.47;
    case "medium_truck":
      return 0.35;
    case "light_truck":
    default:
      return 0.25;
  }
};

const FuelPlanningCard = ({ dispatchId, distanceKm, vehicleId, pickupAddress, deliveryAddress, onUpdate, onSaveComplete, readOnly = false }: FuelPlanningCardProps) => {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [historicalSuggestion, setHistoricalSuggestion] = useState<number | null>(null);
  const [data, setData] = useState<FuelPlanData>({
    toDistance: distanceKm || 0,
    returnDistance: distanceKm || 0,
    totalDistance: (distanceKm || 0) * 2,
    suggestedFuel: 0,
    actualFuel: 0,
    variance: 0,
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch historical fuel data for same route
  useEffect(() => {
    if (pickupAddress && deliveryAddress) {
      fetchHistoricalFuel();
    }
  }, [pickupAddress, deliveryAddress, vehicleId]);

  const fetchHistoricalFuel = async () => {
    if (!pickupAddress || !deliveryAddress) return;
    
    try {
      const { data: suggestion } = await supabase
        .from("fuel_suggestions")
        .select("average_actual_fuel, trip_count")
        .eq("pickup_address", pickupAddress)
        .eq("delivery_address", deliveryAddress)
        .maybeSingle();

      if (suggestion && suggestion.average_actual_fuel) {
        setHistoricalSuggestion(suggestion.average_actual_fuel);
      }
    } catch (error) {
      console.error("Error fetching historical fuel:", error);
    }
  };

  useEffect(() => {
    if (vehicleId) {
      fetchVehicle(vehicleId);
    }
  }, [vehicleId]);

  useEffect(() => {
    calculateFuel();
  }, [data.toDistance, data.returnDistance, vehicle]);

  const fetchVehicle = async (id: string) => {
    const { data: vehicleData } = await supabase
      .from("vehicles")
      .select("id, registration_number, vehicle_type, capacity_kg")
      .eq("id", id)
      .maybeSingle();
    
    if (vehicleData) {
      setVehicle(vehicleData);
    }
  };

  const calculateFuel = () => {
    const totalDistance = data.toDistance + data.returnDistance;
    const factor = vehicle ? getFuelFactor(vehicle.capacity_kg, vehicle.vehicle_type) : 0.35;
    const suggestedFuel = totalDistance * factor;
    const variance = data.actualFuel > 0 ? data.actualFuel - suggestedFuel : 0;

    setData(prev => ({
      ...prev,
      totalDistance,
      suggestedFuel,
      variance,
    }));
  };

  const handleSave = async () => {
    if (!dispatchId) {
      onUpdate?.(data);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("dispatches")
        .update({
          return_distance_km: data.returnDistance,
          total_distance_km: data.totalDistance,
          suggested_fuel_liters: data.suggestedFuel,
          actual_fuel_liters: data.actualFuel || null,
          fuel_variance: data.actualFuel ? data.variance : null,
        })
        .eq("id", dispatchId);

      if (error) throw error;

      // Update fuel suggestions table for future trips
      if (pickupAddress && deliveryAddress && data.actualFuel > 0) {
        const { data: existing } = await supabase
          .from("fuel_suggestions")
          .select("id, average_actual_fuel, trip_count")
          .eq("pickup_address", pickupAddress)
          .eq("delivery_address", deliveryAddress)
          .maybeSingle();

        if (existing) {
          const newAvg = ((existing.average_actual_fuel || 0) * (existing.trip_count || 1) + data.actualFuel) / ((existing.trip_count || 1) + 1);
          await supabase
            .from("fuel_suggestions")
            .update({
              average_actual_fuel: newAvg,
              trip_count: (existing.trip_count || 1) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("fuel_suggestions").insert({
            pickup_address: pickupAddress,
            delivery_address: deliveryAddress,
            average_actual_fuel: data.actualFuel,
            trip_count: 1,
            vehicle_type: vehicle?.vehicle_type || null,
          });
        }
      }

      toast({
        title: "Fuel Planning Saved",
        description: "Fuel estimates have been updated",
      });
      onUpdate?.(data);
      onSaveComplete?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save fuel planning",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const tonnage = vehicle ? (vehicle.capacity_kg || 0) / 1000 : 0;
  const factor = vehicle ? getFuelFactor(vehicle.capacity_kg, vehicle.vehicle_type) : 0.35;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-NG", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(num);
  };

  return (
    <Card className="glass-card border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <Fuel className="w-4 h-4" />
          Fuel Planning
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Vehicle Info */}
        {vehicle && (
          <div className="p-3 bg-secondary/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{vehicle.registration_number}</span>
              </div>
              <Badge variant="secondary">
                {tonnage > 0 ? `${tonnage}T` : vehicle.vehicle_type}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Fuel factor: {factor} L/km
            </p>
          </div>
        )}

        {/* Distance Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">To Distance (km)</Label>
            <Input
              type="number"
              value={data.toDistance}
              onChange={(e) => setData(prev => ({ ...prev, toDistance: parseFloat(e.target.value) || 0 }))}
              className="bg-secondary/50 h-9"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Return Distance (km)</Label>
            <Input
              type="number"
              value={data.returnDistance}
              onChange={(e) => setData(prev => ({ ...prev, returnDistance: parseFloat(e.target.value) || 0 }))}
              className="bg-secondary/50 h-9"
              readOnly={readOnly}
              disabled={readOnly}
            />
          </div>
        </div>

        {/* Total Distance */}
        <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="text-sm">Total Distance</span>
          </div>
          <span className="font-semibold">{formatNumber(data.totalDistance)} km</span>
        </div>

        {/* Suggested Fuel */}
        <div className="flex items-center justify-between p-2 bg-success/10 rounded-lg">
          <div className="flex items-center gap-2">
            <Fuel className="w-4 h-4 text-success" />
            <span className="text-sm">Suggested Diesel</span>
          </div>
          <span className="font-semibold text-success">{formatNumber(data.suggestedFuel)} L</span>
        </div>

        {/* Historical Suggestion */}
        {historicalSuggestion && (
          <div className="flex items-center justify-between p-2 bg-info/10 rounded-lg">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-info" />
              <span className="text-sm">Previous Trip Avg</span>
            </div>
            <span className="font-semibold text-info">{formatNumber(historicalSuggestion)} L</span>
          </div>
        )}

        {/* Actual Fuel Input */}
        <div className="space-y-1.5">
          <Label className="text-xs">Actual Fuel Issued (L)</Label>
          <Input
            type="number"
            value={data.actualFuel || ""}
            onChange={(e) => {
              const actual = parseFloat(e.target.value) || 0;
              const variance = actual - data.suggestedFuel;
              setData(prev => ({ ...prev, actualFuel: actual, variance }));
            }}
            placeholder={readOnly ? "—" : "Enter actual fuel issued"}
            className="bg-secondary/50 h-9"
            readOnly={readOnly}
            disabled={readOnly}
          />
        </div>

        {/* Variance */}
        {data.actualFuel > 0 && (
          <div className={`flex items-center justify-between p-2 rounded-lg ${
            data.variance > 0 ? "bg-warning/10" : data.variance < 0 ? "bg-destructive/10" : "bg-success/10"
          }`}>
            <div className="flex items-center gap-2">
              {data.variance > 0 ? (
                <TrendingUp className="w-4 h-4 text-warning" />
              ) : data.variance < 0 ? (
                <TrendingDown className="w-4 h-4 text-success" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm">Variance</span>
            </div>
            <span className={`font-semibold ${
              data.variance > 0 ? "text-warning" : data.variance < 0 ? "text-success" : ""
            }`}>
              {data.variance > 0 ? "+" : ""}{formatNumber(data.variance)} L
            </span>
          </div>
        )}

        {data.variance > 0 && data.actualFuel > 0 && (
          <p className="text-xs text-warning flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Over budget by {formatNumber(data.variance)} liters ({((data.variance / data.suggestedFuel) * 100).toFixed(1)}%)
          </p>
        )}

        {dispatchId && !readOnly && (
          <Button onClick={handleSave} disabled={loading} className="w-full" size="sm">
            {loading ? "Saving..." : "Save Fuel Plan"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default FuelPlanningCard;
