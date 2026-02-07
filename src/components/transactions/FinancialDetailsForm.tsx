import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Save, Calculator, CloudUpload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { googleSheetsService } from "@/services/googleSheetsService";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const TRANSACTION_TYPES = ["VC", "FC", "DC", "SC", "Other"];
const PAYMENT_STATUSES = ["Paid", "Partial", "Unpaid", "Pending"];
const INVOICE_STATUSES = ["Paid", "Not Paid", "Partially Paid", "Draft", "Invoiced", "Sent", "Overdue", "Cancelled"];
const VENDOR_INVOICE_STATUSES = ["Paid", "Unpaid", "Partial", "Pending", "Submitted", "Approved"];
const WHT_STATUSES = ["Yes", "No", "Remitted", "Not Remitted", "Pending", "N/A"];
const YES_NO_OPTIONS = ["Yes", "No"];

interface DispatchData {
  id: string;
  dispatch_number: string;
  pickup_address: string;
  delivery_address: string;
  distance_km: number | null;
  cargo_weight_kg: number | null;
  customers?: { id: string; company_name: string } | null;
  drivers?: { id: string; full_name: string } | null;
  vehicles?: {
    id: string;
    registration_number: string;
    fleet_type?: string | null;
    vendor_id?: string | null;
    vendor?: { id: string; company_name: string } | null;
  } | null;
}

interface FinancialDetailsFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch?: DispatchData | null;
  existingTransaction?: any | null;
  onSuccess?: () => void;
  isReadOnly?: boolean;
}

interface FormValues {
  // Period Info
  transaction_type: string;
  transaction_date: string;
  week_num: number | null;
  period_month: number;
  period_year: number;

  // Route Info (pre-filled from dispatch)
  customer_name: string;
  vendor_name: string;
  driver_name: string;
  truck_number: string;
  pickup_location: string;
  pick_off: string;
  delivery_location: string;
  drop_point: string;
  route_cluster: string;
  km_covered: number | null;
  tonnage: string;
  tonnage_loaded: number | null;

  // Trip Details
  waybill_number: string;
  num_deliveries: number | null;
  extra_dropoffs: number | null;
  extra_dropoff_cost: number | null;

  // Revenue
  amount_vatable: number | null;
  amount_not_vatable: number | null;
  total_amount: number | null;
  sub_total: number | null;
  vat_amount: number | null;
  total_revenue: number | null;

  // Costs
  total_vendor_cost: number | null;
  total_cost: number | null;
  gross_profit: number | null;

  // Invoice Info
  invoice_number: string;
  invoice_date: string;
  invoice_status: string;
  payment_terms_days: number | null;
  due_date: string;

  // Vendor Info
  vendor_bill_number: string;
  vendor_invoice_status: string;
  vendor_invoice_submission_date: string;

  // Payment Tracking
  customer_payment_status: string;
  payment_receipt_date: string;
  invoice_paid_date: string;
  invoice_amount_paid: number | null;
  balance_owed: number | null;

  // WHT
  wht_status: string;
  wht_deducted: number | null;

  // Bank Info
  bank_payment_received: string;  // Yes/No
  bank_debited: number | null;    // Amount debited

  // Analysis
  gap_in_payment: number | null;
  invoice_ageing: number | null;
  invoice_age_for_interest: number | null;
  daily_rate: number | null;
  interest_paid: number | null;
  interest_not_paid: number | null;

  notes: string;
}

const FinancialDetailsForm = ({
  open,
  onOpenChange,
  dispatch,
  existingTransaction,
  onSuccess,
  isReadOnly = false,
}: FinancialDetailsFormProps) => {
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<{ id: string; company_name: string }[]>([]);

  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentYear = today.getFullYear();

  const form = useForm<FormValues>({
    defaultValues: {
      transaction_type: "VC",
      transaction_date: today.toISOString().split("T")[0],
      week_num: Math.ceil(today.getDate() / 7),
      period_month: currentMonth,
      period_year: currentYear,
      customer_name: "",
      vendor_name: "",
      driver_name: "",
      truck_number: "",
      pickup_location: "",
      pick_off: "",
      delivery_location: "",
      drop_point: "",
      route_cluster: "",
      km_covered: null,
      tonnage: "",
      tonnage_loaded: null,
      waybill_number: "",
      num_deliveries: 1,
      extra_dropoffs: 0,
      extra_dropoff_cost: 0,
      amount_vatable: null,
      amount_not_vatable: 0,
      total_amount: null,
      sub_total: null,
      vat_amount: null,
      total_revenue: null,
      total_vendor_cost: null,
      total_cost: null,
      gross_profit: null,
      invoice_number: "",
      invoice_date: "",
      invoice_status: "Draft",
      payment_terms_days: 30,
      due_date: "",
      vendor_bill_number: "",
      vendor_invoice_status: "Pending",
      vendor_invoice_submission_date: "",
      customer_payment_status: "Unpaid",
      payment_receipt_date: "",
      invoice_paid_date: "",
      invoice_amount_paid: 0,
      balance_owed: 0,
      wht_status: "No",
      wht_deducted: 0,
      bank_payment_received: "No",
      bank_debited: null,
      gap_in_payment: null,
      invoice_ageing: null,
      invoice_age_for_interest: null,
      daily_rate: null,
      interest_paid: 0,
      interest_not_paid: 0,
      notes: "",
    },
  });

  // Fetch vendors/partners
  useEffect(() => {
    const fetchVendors = async () => {
      const { data } = await supabase
        .from("partners")
        .select("id, company_name")
        .eq("partner_type", "transporter")
        .order("company_name");
      if (data) setVendors(data);
    };
    fetchVendors();
  }, []);

  // Pre-fill from dispatch data
  useEffect(() => {
    if (dispatch) {
      const transactionDate = new Date();
      form.setValue("customer_name", dispatch.customers?.company_name || "");
      form.setValue("driver_name", dispatch.drivers?.full_name || "");
      form.setValue("truck_number", dispatch.vehicles?.registration_number || "");
      form.setValue("pickup_location", dispatch.pickup_address || "");
      form.setValue("pick_off", dispatch.pickup_address || "");
      form.setValue("delivery_location", dispatch.delivery_address || "");
      form.setValue("drop_point", dispatch.delivery_address || "");
      form.setValue("km_covered", dispatch.distance_km || null);
      form.setValue("tonnage_loaded", dispatch.cargo_weight_kg || null);
      form.setValue("transaction_date", transactionDate.toISOString().split("T")[0]);
      form.setValue("period_month", transactionDate.getMonth() + 1);
      form.setValue("period_year", transactionDate.getFullYear());

      // Auto-populate 3PL vendor if vehicle is a 3PL vehicle
      if (dispatch.vehicles?.fleet_type === "3pl" && dispatch.vehicles?.vendor?.company_name) {
        form.setValue("vendor_name", dispatch.vehicles.vendor.company_name);
      }
    }
  }, [dispatch, form]);

  // Pre-fill from existing transaction (edit mode)
  useEffect(() => {
    if (existingTransaction) {
      Object.keys(existingTransaction).forEach((key) => {
        if (key in form.getValues()) {
          form.setValue(key as keyof FormValues, existingTransaction[key]);
        }
      });
    }
  }, [existingTransaction, form]);

  // Auto-calculate fields
  const calculateFinancials = () => {
    const amountVatable = form.getValues("amount_vatable") || 0;
    const amountNotVatable = form.getValues("amount_not_vatable") || 0;
    const totalVendorCost = form.getValues("total_vendor_cost") || 0;
    const invoiceAmountPaid = form.getValues("invoice_amount_paid") || 0;

    // Calculate VAT (7.5%)
    const vatAmount = amountVatable * 0.075;
    form.setValue("vat_amount", Math.round(vatAmount * 100) / 100);

    // Calculate totals
    const subTotal = amountVatable + amountNotVatable;
    form.setValue("sub_total", subTotal);

    const totalRevenue = subTotal + vatAmount;
    form.setValue("total_revenue", Math.round(totalRevenue * 100) / 100);
    form.setValue("total_amount", Math.round(totalRevenue * 100) / 100);

    // Calculate cost and profit
    form.setValue("total_cost", totalVendorCost);
    const grossProfit = totalRevenue - totalVendorCost;
    form.setValue("gross_profit", Math.round(grossProfit * 100) / 100);

    // Calculate balance owed
    const balanceOwed = totalRevenue - invoiceAmountPaid;
    form.setValue("balance_owed", Math.round(balanceOwed * 100) / 100);

    // Calculate invoice ageing
    const invoiceDate = form.getValues("invoice_date");
    if (invoiceDate) {
      const invoiceDateObj = new Date(invoiceDate);
      const today = new Date();
      const daysDiff = Math.floor((today.getTime() - invoiceDateObj.getTime()) / (1000 * 60 * 60 * 24));
      form.setValue("invoice_ageing", daysDiff);
    }

    // Calculate gap in payment
    const dueDate = form.getValues("due_date");
    const paidDate = form.getValues("invoice_paid_date");
    if (dueDate && paidDate) {
      const dueDateObj = new Date(dueDate);
      const paidDateObj = new Date(paidDate);
      const gap = Math.floor((paidDateObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
      form.setValue("gap_in_payment", gap);
    }

    toast.success("Financials calculated");
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const monthName = MONTH_NAMES[data.period_month - 1];

      const transactionData = {
        ...data,
        month_name: monthName,
        dispatch_id: dispatch?.id || null,
        customer_id: dispatch?.customers?.id || null,
        imported_at: new Date().toISOString(),
        // Convert bank_debited to string for database compatibility
        bank_debited: data.bank_debited !== null ? String(data.bank_debited) : null,
      };

      let transactionId: string | null = null;
      const isNewTransaction = !existingTransaction?.id;

      if (existingTransaction?.id) {
        // Update existing
        const { error } = await supabase
          .from("historical_invoice_data")
          .update(transactionData)
          .eq("id", existingTransaction.id);

        if (error) throw error;
        transactionId = existingTransaction.id;
        toast.success("Transaction updated successfully");
      } else {
        // Insert new and get the ID
        const { data: insertedData, error } = await supabase
          .from("historical_invoice_data")
          .insert(transactionData)
          .select("id")
          .single();

        if (error) throw error;
        transactionId = insertedData?.id || null;
        toast.success("Transaction created successfully");
      }

      // Auto-sync to Google Sheets if configured
      if (transactionId && isNewTransaction) {
        try {
          // Check if there's an active Google Sheets configuration
          const { data: sheetsConfig } = await supabase
            .from("google_sheets_configs")
            .select("spreadsheet_id")
            .eq("is_active", true)
            .limit(1)
            .single();

          if (sheetsConfig?.spreadsheet_id) {
            toast.info("Syncing to Google Sheets...");
            const syncResult = await googleSheetsService.appendTransaction(
              sheetsConfig.spreadsheet_id,
              transactionId,
              "All Month breakdown All Biz"
            );

            if (syncResult.success) {
              toast.success("Transaction synced to Google Sheets");
            } else {
              console.error("Google Sheets sync failed:", syncResult.error);
              toast.warning("Transaction saved, but Google Sheets sync failed");
            }
          }
        } catch (syncError) {
          // Don't fail the whole operation if sync fails
          console.error("Google Sheets auto-sync error:", syncError);
          toast.warning("Transaction saved, but auto-sync to Google Sheets failed");
        }
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving transaction:", error);
      toast.error(error.message || "Failed to save transaction");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReadOnly
              ? "View Financial Details (Read Only)"
              : existingTransaction
              ? "Edit Transaction"
              : "Add Financial Details"}
          </DialogTitle>
          <DialogDescription>
            {dispatch
              ? `Adding financial details for dispatch: ${dispatch.dispatch_number}`
              : "Enter complete transaction details for the 51-column sheet sync"
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <fieldset disabled={isReadOnly} className={isReadOnly ? "opacity-90" : ""}>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
                <TabsTrigger value="invoice">Invoice</TabsTrigger>
                <TabsTrigger value="payment">Payment</TabsTrigger>
                <TabsTrigger value="analysis">Analysis</TabsTrigger>
              </TabsList>

              {/* Basic Info Tab */}
              <TabsContent value="basic" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Period & Type</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="transaction_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Transaction Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TRANSACTION_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="transaction_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="period_month"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Month</FormLabel>
                          <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {MONTH_NAMES.map((m, i) => (
                                <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="period_year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {[2024, 2025, 2026].map((y) => (
                                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Customer & Vendor</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="customer_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Name *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Customer company name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vendor_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>3PL Vendor</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select vendor" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {vendors.map((v) => (
                                <SelectItem key={v.id} value={v.company_name}>{v.company_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Route Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="pickup_location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pick Off</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="delivery_location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Drop Point</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="route_cluster"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Route Cluster</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., Lagos" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="km_covered"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>KM Covered</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="driver_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Driver Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="truck_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Truck Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Trip Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="tonnage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tonnage</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., 15T" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="tonnage_loaded"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tonnage Loaded</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="waybill_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Waybill No</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="num_deliveries"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>No of Deliveries</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="extra_dropoffs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Extra Dropoffs</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="extra_dropoff_cost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cost per Extra Dropoff</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="week_num"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Week Number</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Revenue Tab */}
              <TabsContent value="revenue" className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">Revenue & Costs</CardTitle>
                    {!isReadOnly && (
                      <Button type="button" variant="outline" size="sm" onClick={calculateFinancials}>
                        <Calculator className="w-4 h-4 mr-2" />
                        Calculate
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="amount_vatable"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (Vatable)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="amount_not_vatable"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount (Not Vatable)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sub_total"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sub-Total</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                              className="bg-muted"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vat_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>VAT Amount (7.5%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                              className="bg-muted"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="total_revenue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Revenue (VAT Incl)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                              className="bg-muted font-semibold"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="total_vendor_cost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Total Vendor Cost (+VAT)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="gross_profit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gross Profit</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                              className="bg-muted font-semibold text-green-600"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Invoice Tab */}
              <TabsContent value="invoice" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Customer Invoice</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="invoice_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="invoice_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="invoice_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {INVOICE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="payment_terms_days"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Terms (Days)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="due_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Vendor Invoice</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="vendor_bill_number"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor Bill Number</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vendor_invoice_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor Invoice Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {VENDOR_INVOICE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="vendor_invoice_submission_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vendor Submission Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Payment Tab */}
              <TabsContent value="payment" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Payment Tracking</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="customer_payment_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Payment Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {PAYMENT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="payment_receipt_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Payment Receipt Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="invoice_paid_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Paid Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="invoice_amount_paid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Amount Paid</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="balance_owed"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Balance Owed</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                              className="bg-muted"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">WHT & Bank Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="wht_status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WHT Payment Status</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {WHT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="wht_deducted"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>WHT Deducted</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bank_payment_received"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Payment Received</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {YES_NO_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bank_debited"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bank Debited (Amount)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                              placeholder="Amount debited by bank"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Analysis Tab */}
              <TabsContent value="analysis" className="space-y-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">Payment Analysis</CardTitle>
                    {!isReadOnly && (
                      <Button type="button" variant="outline" size="sm" onClick={calculateFinancials}>
                        <Calculator className="w-4 h-4 mr-2" />
                        Recalculate
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="gap_in_payment"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gap in Payment (Days)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              value={field.value ?? ""}
                              className="bg-muted"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="invoice_ageing"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Ageing (Days)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              value={field.value ?? ""}
                              className="bg-muted"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="invoice_age_for_interest"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age for Interest Calc</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Interest Calculations</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="daily_rate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Daily Rate (%)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.001"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="interest_paid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Interest Paid</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="interest_not_paid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Interest Not Paid</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input {...field} placeholder="Additional notes..." />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            </fieldset>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {isReadOnly ? "Close" : "Cancel"}
              </Button>
              {!isReadOnly && (
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Save className="w-4 h-4 mr-2" />
                  {existingTransaction ? "Update" : "Save"} Transaction
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default FinancialDetailsForm;
