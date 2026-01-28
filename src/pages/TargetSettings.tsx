import { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Target, DollarSign, TrendingUp, TrendingDown, Calculator, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface TargetForm {
  target_year: number;
  target_month: number;
  revenue_target: string;
  cogs_target: string;
  cogs_input_type: "percentage" | "absolute";
  expense_target: string;
  expense_input_type: "percentage" | "absolute";
  profit_target: string;
  profit_input_type: "percentage" | "absolute";
  notes: string;
}

const TargetSettingsPage = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingTargets, setExistingTargets] = useState<any[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [form, setForm] = useState<TargetForm>({
    target_year: currentYear,
    target_month: currentMonth,
    revenue_target: "",
    cogs_target: "",
    cogs_input_type: "percentage",
    expense_target: "",
    expense_input_type: "percentage",
    profit_target: "",
    profit_input_type: "percentage",
    notes: "",
  });

  useEffect(() => {
    fetchExistingTargets();
  }, []);

  const fetchExistingTargets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("financial_targets")
        .select("*")
        .eq("target_type", "monthly")
        .order("target_year", { ascending: false })
        .order("target_month", { ascending: false })
        .limit(12);

      if (error) throw error;
      setExistingTargets(data || []);
    } catch (error) {
      console.error("Error fetching targets:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateActualValues = () => {
    const revenueTarget = parseFloat(form.revenue_target) || 0;
    
    let cogsActual = 0;
    if (form.cogs_input_type === "percentage") {
      cogsActual = (parseFloat(form.cogs_target) / 100) * revenueTarget;
    } else {
      cogsActual = parseFloat(form.cogs_target) || 0;
    }

    let expenseActual = 0;
    if (form.expense_input_type === "percentage") {
      expenseActual = (parseFloat(form.expense_target) / 100) * revenueTarget;
    } else {
      expenseActual = parseFloat(form.expense_target) || 0;
    }

    let profitActual = 0;
    if (form.profit_input_type === "percentage") {
      profitActual = (parseFloat(form.profit_target) / 100) * revenueTarget;
    } else {
      profitActual = parseFloat(form.profit_target) || 0;
    }

    const calculatedProfit = revenueTarget - cogsActual - expenseActual;

    return {
      revenue: revenueTarget,
      cogs: cogsActual,
      expenses: expenseActual,
      targetProfit: profitActual,
      calculatedProfit,
      profitDelta: calculatedProfit - profitActual,
    };
  };

  const handleSave = async () => {
    const revenueValue = parseFloat(form.revenue_target);
    if (!revenueValue || revenueValue <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid revenue target",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const values = calculateActualValues();

      const { error } = await supabase.from("financial_targets").insert({
        target_type: "monthly",
        target_year: form.target_year,
        target_month: form.target_month,
        revenue_target: values.revenue,
        cogs_target: values.cogs,
        cogs_input_type: form.cogs_input_type,
        expense_target: values.expenses,
        expense_input_type: form.expense_input_type,
        profit_target: values.targetProfit,
        profit_input_type: form.profit_input_type,
        notes: form.notes || null,
        status: "pending",
        created_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Financial targets saved successfully. Pending approval.",
      });

      setForm({
        target_year: currentYear,
        target_month: currentMonth,
        revenue_target: "",
        cogs_target: "",
        cogs_input_type: "percentage",
        expense_target: "",
        expense_input_type: "percentage",
        profit_target: "",
        profit_input_type: "percentage",
        notes: "",
      });
      fetchExistingTargets();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save targets",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const values = calculateActualValues();

  return (
    <DashboardLayout
      title="Target Settings"
      subtitle="Set revenue, COGS, expense, and profit targets"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Target Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2"
        >
          <Card className="glass-card border-border/50">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2">
                <Target className="w-5 h-5" />
                Set Financial Targets
              </CardTitle>
              <CardDescription>
                Revenue must be entered as an absolute number. Other targets can be percentage of revenue or absolute values.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Period Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Target Year</Label>
                  <Select
                    value={String(form.target_year)}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, target_year: parseInt(value) }))}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
                        <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Target Month</Label>
                  <Select
                    value={String(form.target_month)}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, target_month: parseInt(value) }))}
                  >
                    <SelectTrigger className="bg-secondary/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month, index) => (
                        <SelectItem key={month} value={String(index + 1)}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Revenue Target - Always Absolute */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Revenue Target (₦)
                </Label>
                <Input
                  type="number"
                  value={form.revenue_target}
                  onChange={(e) => setForm((prev) => ({ ...prev, revenue_target: e.target.value }))}
                  placeholder="e.g., 50000000"
                  className="bg-secondary/50"
                />
                <p className="text-xs text-muted-foreground">Enter the target revenue amount in Naira</p>
              </div>

              {/* COGS Target */}
              <div className="space-y-3 p-4 border border-border/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-warning" />
                    COGS Target
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Percentage</span>
                    <Switch
                      checked={form.cogs_input_type === "absolute"}
                      onCheckedChange={(checked) => 
                        setForm((prev) => ({ ...prev, cogs_input_type: checked ? "absolute" : "percentage" }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">Absolute</span>
                  </div>
                </div>
                <Input
                  type="number"
                  value={form.cogs_target}
                  onChange={(e) => setForm((prev) => ({ ...prev, cogs_target: e.target.value }))}
                  placeholder={form.cogs_input_type === "percentage" ? "e.g., 40" : "e.g., 20000000"}
                  className="bg-secondary/50"
                />
                {form.cogs_input_type === "percentage" && form.cogs_target && (
                  <p className="text-xs text-muted-foreground">
                    = {formatCurrency(values.cogs)} of revenue
                  </p>
                )}
              </div>

              {/* Operating Expenses Target */}
              <div className="space-y-3 p-4 border border-border/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-info" />
                    Operating Expenses Target
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Percentage</span>
                    <Switch
                      checked={form.expense_input_type === "absolute"}
                      onCheckedChange={(checked) => 
                        setForm((prev) => ({ ...prev, expense_input_type: checked ? "absolute" : "percentage" }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">Absolute</span>
                  </div>
                </div>
                <Input
                  type="number"
                  value={form.expense_target}
                  onChange={(e) => setForm((prev) => ({ ...prev, expense_target: e.target.value }))}
                  placeholder={form.expense_input_type === "percentage" ? "e.g., 25" : "e.g., 12500000"}
                  className="bg-secondary/50"
                />
                {form.expense_input_type === "percentage" && form.expense_target && (
                  <p className="text-xs text-muted-foreground">
                    = {formatCurrency(values.expenses)} of revenue
                  </p>
                )}
              </div>

              {/* Profit Target */}
              <div className="space-y-3 p-4 border border-border/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-success" />
                    Profit Target
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Percentage</span>
                    <Switch
                      checked={form.profit_input_type === "absolute"}
                      onCheckedChange={(checked) => 
                        setForm((prev) => ({ ...prev, profit_input_type: checked ? "absolute" : "percentage" }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">Absolute</span>
                  </div>
                </div>
                <Input
                  type="number"
                  value={form.profit_target}
                  onChange={(e) => setForm((prev) => ({ ...prev, profit_target: e.target.value }))}
                  placeholder={form.profit_input_type === "percentage" ? "e.g., 35" : "e.g., 17500000"}
                  className="bg-secondary/50"
                />
                {form.profit_input_type === "percentage" && form.profit_target && (
                  <p className="text-xs text-muted-foreground">
                    = {formatCurrency(values.targetProfit)} of revenue
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any notes about these targets..."
                  className="bg-secondary/50"
                />
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Targets"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Preview & Existing Targets */}
        <div className="space-y-6">
          {/* Calculation Preview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-heading flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Revenue</span>
                  <span className="font-semibold text-success">{formatCurrency(values.revenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">COGS</span>
                  <span className="font-semibold text-warning">({formatCurrency(values.cogs)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Expenses</span>
                  <span className="font-semibold text-info">({formatCurrency(values.expenses)})</span>
                </div>
                <div className="border-t border-border/50 pt-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Calculated Profit</span>
                    <span className={`font-bold ${values.calculatedProfit >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(values.calculatedProfit)}
                    </span>
                  </div>
                </div>
                {values.targetProfit > 0 && Math.abs(values.profitDelta) > 0 && (
                  <div className={`p-2 rounded text-xs ${values.profitDelta >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {values.profitDelta >= 0 
                      ? `+${formatCurrency(values.profitDelta)} above target`
                      : `${formatCurrency(Math.abs(values.profitDelta))} below target`
                    }
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Targets */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass-card border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-heading">Recent Targets</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-4">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                  </div>
                ) : existingTargets.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No targets set yet</p>
                ) : (
                  <div className="space-y-3">
                    {existingTargets.slice(0, 5).map((target) => (
                      <div key={target.id} className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">
                            {months[target.target_month - 1]} {target.target_year}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Revenue: {formatCurrency(target.revenue_target)}
                          </p>
                        </div>
                        <Badge variant={
                          target.status === "approved" ? "default" : 
                          target.status === "rejected" ? "destructive" : "secondary"
                        }>
                          {target.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TargetSettingsPage;
