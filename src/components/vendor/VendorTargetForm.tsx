import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Save, Target } from "lucide-react";

const TRUCK_TYPES = ["3T", "5T", "10T", "15T", "20T", "30T", "45T", "60T"] as const;

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

interface Vendor {
  id: string;
  company_name: string;
}

interface VendorTargetFormProps {
  onSaveComplete?: () => void;
}

const VendorTargetForm = ({ onSaveComplete }: VendorTargetFormProps) => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    if (selectedVendor) {
      fetchExistingTargets();
    }
  }, [selectedVendor, selectedMonth, selectedYear]);

  const fetchVendors = async () => {
    const { data, error } = await supabase
      .from("partners")
      .select("id, company_name")
      .in("partner_type", ["transporter", "3pl"])
      .eq("approval_status", "approved")
      .order("company_name");

    if (!error && data) {
      setVendors(data);
    }
  };

  const fetchExistingTargets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendor_truck_targets")
      .select("truck_type, target_trips")
      .eq("vendor_id", selectedVendor)
      .eq("target_month", selectedMonth)
      .eq("target_year", selectedYear);

    if (!error && data) {
      const targetsMap: Record<string, number> = {};
      TRUCK_TYPES.forEach((type) => {
        const found = data.find((t) => t.truck_type === type);
        targetsMap[type] = found?.target_trips || 0;
      });
      setTargets(targetsMap);
    } else {
      // Reset targets if no data
      const emptyTargets: Record<string, number> = {};
      TRUCK_TYPES.forEach((type) => {
        emptyTargets[type] = 0;
      });
      setTargets(emptyTargets);
    }
    setLoading(false);
  };

  const handleTargetChange = (truckType: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setTargets((prev) => ({ ...prev, [truckType]: numValue }));
  };

  const handleSave = async () => {
    if (!selectedVendor) {
      toast({
        title: "Select a partner",
        description: "Please select a partner to set targets for",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Upsert all targets
      const upsertData = TRUCK_TYPES.map((truckType) => ({
        vendor_id: selectedVendor,
        truck_type: truckType,
        target_month: selectedMonth,
        target_year: selectedYear,
        target_trips: targets[truckType] || 0,
      }));

      const { error } = await supabase
        .from("vendor_truck_targets")
        .upsert(upsertData, {
          onConflict: "vendor_id,truck_type,target_month,target_year",
        });

      if (error) throw error;

      toast({
        title: "Targets saved",
        description: "Partner truck deployment targets have been updated",
      });
      onSaveComplete?.();
    } catch (error: any) {
      toast({
        title: "Error saving targets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5" />
          Set Partner Truck Deployment Targets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Vendor and Period Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Partner</Label>
            <Select value={selectedVendor} onValueChange={setSelectedVendor}>
              <SelectTrigger>
                <SelectValue placeholder="Select partner" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((vendor) => (
                  <SelectItem key={vendor.id} value={vendor.id}>
                    {vendor.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Month</Label>
            <Select
              value={selectedMonth.toString()}
              onValueChange={(v) => setSelectedMonth(parseInt(v))}
            >
              <SelectTrigger>
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
          </div>
          <div className="space-y-2">
            <Label>Year</Label>
            <Select
              value={selectedYear.toString()}
              onValueChange={(v) => setSelectedYear(parseInt(v))}
            >
              <SelectTrigger>
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

        {/* Truck Type Targets */}
        {selectedVendor && (
          <div className="space-y-4">
            <Label className="text-base font-medium">
              Target Trips by Truck Type
            </Label>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {TRUCK_TYPES.map((truckType) => (
                  <div key={truckType} className="space-y-2">
                    <Label htmlFor={`target-${truckType}`} className="text-sm">
                      {truckType} Truck
                    </Label>
                    <Input
                      id={`target-${truckType}`}
                      type="number"
                      min="0"
                      value={targets[truckType] || 0}
                      onChange={(e) => handleTargetChange(truckType, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !selectedVendor}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Targets
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default VendorTargetForm;
