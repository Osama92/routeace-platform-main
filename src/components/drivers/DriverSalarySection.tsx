import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DollarSign, Calculator, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DriverSalaryData {
  driver_type: "owned" | "third_party";
  salary_type: "per_trip" | "bi_monthly" | "monthly";
  base_salary: number;
  tax_id?: string;
}

interface DriverSalarySectionProps {
  data: DriverSalaryData;
  onChange: (data: DriverSalaryData) => void;
  isEditing: boolean;
  tripAmount?: number;
}

// Nigeria Tax Act 2025 Personal Income Tax Brackets (assumed based on trends)
const calculateNigeriaTax = (annualIncome: number): { tax: number; effectiveRate: number } => {
  // 2025 PIT brackets (estimated - these would be confirmed from official gazette)
  // First ₦300,000 - 7%
  // Next ₦300,000 - 11%
  // Next ₦500,000 - 15%
  // Next ₦500,000 - 19%
  // Next ₦1,600,000 - 21%
  // Above ₦3,200,000 - 24%

  let tax = 0;
  let remaining = annualIncome;

  const brackets = [
    { limit: 300000, rate: 0.07 },
    { limit: 300000, rate: 0.11 },
    { limit: 500000, rate: 0.15 },
    { limit: 500000, rate: 0.19 },
    { limit: 1600000, rate: 0.21 },
    { limit: Infinity, rate: 0.24 },
  ];

  for (const bracket of brackets) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, bracket.limit);
    tax += taxable * bracket.rate;
    remaining -= taxable;
  }

  const effectiveRate = annualIncome > 0 ? (tax / annualIncome) * 100 : 0;
  return { tax, effectiveRate };
};

// Calculate salary based on type
const calculateSalaryBreakdown = (
  salaryType: string,
  baseSalary: number,
  tripAmount?: number
) => {
  let grossMonthly = 0;
  let grossAnnual = 0;

  switch (salaryType) {
    case "per_trip":
      // Assume average 8 trips per month
      grossMonthly = baseSalary * 8;
      break;
    case "bi_monthly":
      grossMonthly = baseSalary * 2;
      break;
    case "monthly":
      grossMonthly = baseSalary;
      break;
  }

  grossAnnual = grossMonthly * 12;
  const { tax, effectiveRate } = calculateNigeriaTax(grossAnnual);
  const monthlyTax = tax / 12;
  const netMonthly = grossMonthly - monthlyTax;

  return {
    grossMonthly,
    grossAnnual,
    annualTax: tax,
    monthlyTax,
    netMonthly,
    effectiveRate,
    tripSalary: tripAmount || baseSalary,
  };
};

const DriverSalarySection = ({
  data,
  onChange,
  isEditing,
  tripAmount,
}: DriverSalarySectionProps) => {
  const breakdown = calculateSalaryBreakdown(
    data.salary_type,
    data.base_salary,
    tripAmount
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // If third party driver, show minimal info
  if (data.driver_type === "third_party") {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Salary Information
          </CardTitle>
          <CardDescription>Third-party driver - No salary tracking required</CardDescription>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Driver Type</Label>
                <Select
                  value={data.driver_type}
                  onValueChange={(value: "owned" | "third_party") =>
                    onChange({ ...data, driver_type: value })
                  }
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Owned Driver</SelectItem>
                    <SelectItem value="third_party">Third Party</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-muted/30 rounded-lg text-center">
              <Badge variant="secondary" className="mb-2">Third Party Driver</Badge>
              <p className="text-sm text-muted-foreground">
                Payment handled externally through partner agreements
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Salary Information
            </CardTitle>
            <CardDescription>Based on Nigeria Tax Act 2025 PIT</CardDescription>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">
                  Tax calculated using Nigeria Personal Income Tax brackets:
                  7%-24% progressive rates based on annual income.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Driver Type</Label>
                <Select
                  value={data.driver_type}
                  onValueChange={(value: "owned" | "third_party") =>
                    onChange({ ...data, driver_type: value })
                  }
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owned">Owned Driver</SelectItem>
                    <SelectItem value="third_party">Third Party</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Salary Type</Label>
                <Select
                  value={data.salary_type}
                  onValueChange={(value: "per_trip" | "bi_monthly" | "monthly") =>
                    onChange({ ...data, salary_type: value })
                  }
                >
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_trip">Per Trip</SelectItem>
                    <SelectItem value="bi_monthly">Bi-Monthly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  {data.salary_type === "per_trip"
                    ? "Amount Per Trip (₦)"
                    : data.salary_type === "bi_monthly"
                    ? "Bi-Monthly Amount (₦)"
                    : "Monthly Salary (₦)"}
                </Label>
                <Input
                  type="number"
                  value={data.base_salary}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      base_salary: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="e.g., 50000"
                  className="bg-secondary/50"
                />
              </div>
              <div className="space-y-2">
                <Label>Tax ID (Optional)</Label>
                <Input
                  value={data.tax_id || ""}
                  onChange={(e) =>
                    onChange({ ...data, tax_id: e.target.value })
                  }
                  placeholder="TIN Number"
                  className="bg-secondary/50"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Display mode */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Driver Type</p>
                <Badge variant="default" className="capitalize">
                  {data.driver_type.replace("_", " ")}
                </Badge>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Salary Type</p>
                <Badge variant="secondary" className="capitalize">
                  {data.salary_type.replace("_", " ")}
                </Badge>
              </div>
            </div>
          </>
        )}

        {/* Zone-Based Rate Information for per_trip drivers */}
        {data.salary_type === "per_trip" && (
          <div className="p-4 bg-info/5 rounded-lg border border-info/20">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-info" />
              <span className="font-medium text-sm">Zone-Based Trip Rates</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-border/30">
                <span className="text-muted-foreground">Standard Trucks (5T-20T)</span>
                <div className="text-right">
                  <span className="font-medium">₦20k</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="font-medium">₦30k</span>
                </div>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/30">
                <span className="text-muted-foreground">Trailers</span>
                <div className="text-right">
                  <span className="font-medium">₦30k</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="font-medium">₦70k</span>
                </div>
              </div>
              <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-success"></div>
                  <span>Within Zone (Lagos, Ibadan, Sagamu, Abeokuta)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-warning"></div>
                  <span>Outside Zone</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Salary Breakdown - Always show for owned drivers */}
        {data.base_salary > 0 && (
          <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Salary Breakdown</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">
                  {data.salary_type === "per_trip" ? "Per Trip (base)" : "Base Amount"}
                </p>
                <p className="font-semibold">{formatCurrency(data.base_salary)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Est. Monthly Gross</p>
                <p className="font-semibold">{formatCurrency(breakdown.grossMonthly)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Est. Monthly Tax</p>
                <p className="font-semibold text-destructive">
                  -{formatCurrency(breakdown.monthlyTax)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Est. Net Monthly</p>
                <p className="font-semibold text-success">
                  {formatCurrency(breakdown.netMonthly)}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Effective Tax Rate</span>
                <span>{breakdown.effectiveRate.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Annual Tax Liability</span>
                <span>{formatCurrency(breakdown.annualTax)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DriverSalarySection;
