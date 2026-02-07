import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  MapPin,
  DollarSign,
  FileText,
  CreditCard,
  Building2,
  TrendingUp,
  Package,
} from "lucide-react";

export interface HistoricalInvoiceData {
  id: string;
  // Period Info
  transaction_type?: string | null;
  transaction_date?: string | null;
  week_num?: number | null;
  period_month?: number | null;
  month_name?: string | null;
  period_year?: number | null;
  // Parties
  customer_name?: string | null;
  vendor_name?: string | null;
  driver_name?: string | null;
  truck_number?: string | null;
  // Route
  pick_off?: string | null;
  pickup_location?: string | null;
  drop_point?: string | null;
  delivery_location?: string | null;
  route_cluster?: string | null;
  km_covered?: number | null;
  // Cargo
  tonnage?: string | null;
  tonnage_loaded?: number | null;
  waybill_number?: string | null;
  num_deliveries?: number | null;
  extra_dropoffs?: number | null;
  extra_dropoff_cost?: number | null;
  // Revenue
  amount_vatable?: number | null;
  amount_not_vatable?: number | null;
  total_amount?: number | null;
  total_vendor_cost?: number | null;
  total_cost?: number | null;
  sub_total?: number | null;
  vat_amount?: number | null;
  total_revenue?: number | null;
  gross_profit?: number | null;
  // Invoice
  invoice_number?: string | null;
  invoice_date?: string | null;
  invoice_status?: string | null;
  payment_terms_days?: number | null;
  due_date?: string | null;
  invoice_paid_date?: string | null;
  // Payment
  customer_payment_status?: string | null;
  payment_receipt_date?: string | null;
  invoice_amount_paid?: number | null;
  balance_owed?: number | null;
  // WHT
  wht_status?: string | null;
  wht_deducted?: number | null;
  // Bank
  bank_payment_received?: string | null;
  bank_debited?: string | null;
  // Vendor
  vendor_bill_number?: string | null;
  vendor_invoice_status?: string | null;
  vendor_invoice_submission_date?: string | null;
  // Interest/Aging
  gap_in_payment?: number | null;
  invoice_ageing?: number | null;
  invoice_age_for_interest?: number | null;
  daily_rate?: number | null;
  interest_paid?: number | null;
  interest_not_paid?: number | null;
  // Meta
  imported_at?: string | null;
  source_file?: string | null;
}

interface HistoricalDataViewProps {
  data: HistoricalInvoiceData | null;
  loading?: boolean;
}

const formatCurrency = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-NG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
};

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-NG");
};

const DataField = ({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
}) => (
  <div className={`space-y-1 ${className}`}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value ?? "—"}</p>
  </div>
);

const StatusBadge = ({ status, type }: { status: string | null | undefined; type: "payment" | "invoice" | "wht" }) => {
  if (!status) return <span className="text-sm text-muted-foreground">—</span>;

  const colorMap: Record<string, string> = {
    paid: "bg-success/15 text-success",
    unpaid: "bg-destructive/15 text-destructive",
    pending: "bg-warning/15 text-warning",
    partial: "bg-info/15 text-info",
    completed: "bg-success/15 text-success",
    open: "bg-info/15 text-info",
  };

  const statusLower = status.toLowerCase();
  const colorClass = colorMap[statusLower] || "bg-muted text-muted-foreground";

  return <Badge className={colorClass}>{status}</Badge>;
};

const HistoricalDataView = ({ data, loading }: HistoricalDataViewProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-muted-foreground">Loading historical data...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No historical data found for this dispatch.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trip Information */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            Trip Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataField label="Transaction Type" value={data.transaction_type} />
          <DataField label="Date" value={formatDate(data.transaction_date)} />
          <DataField label="Week Number" value={data.week_num} />
          <DataField label="Month" value={data.month_name || `Month ${data.period_month}`} />
          <DataField label="Year" value={data.period_year} />
          <DataField label="Customer" value={data.customer_name} />
          <DataField label="3PL Vendor" value={data.vendor_name} />
          <DataField label="Driver" value={data.driver_name} />
        </CardContent>
      </Card>

      {/* Route Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            Route Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataField label="Pick Off" value={data.pick_off || data.pickup_location} className="col-span-2" />
          <DataField label="Drop Point" value={data.drop_point || data.delivery_location} className="col-span-2" />
          <DataField label="Route Cluster" value={data.route_cluster} />
          <DataField label="KM Covered" value={data.km_covered ? `${formatNumber(data.km_covered)} km` : null} />
          <DataField label="Truck Number" value={data.truck_number} />
          <DataField label="Waybill No" value={data.waybill_number} />
        </CardContent>
      </Card>

      {/* Cargo Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Cargo & Deliveries
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataField label="Tonnage" value={data.tonnage} />
          <DataField label="Tonnage Loaded" value={data.tonnage_loaded ? `${formatNumber(data.tonnage_loaded)} tons` : null} />
          <DataField label="No. of Deliveries" value={data.num_deliveries} />
          <DataField label="Extra Drop-offs" value={data.extra_dropoffs} />
          <DataField label="Extra Drop-off Cost" value={formatCurrency(data.extra_dropoff_cost)} />
        </CardContent>
      </Card>

      {/* Revenue & Costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            Revenue & Costs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DataField label="Amount (Vatable)" value={formatCurrency(data.amount_vatable)} />
            <DataField label="Amount (Not Vatable)" value={formatCurrency(data.amount_not_vatable)} />
            <DataField label="Total Amount" value={formatCurrency(data.total_amount)} />
            <DataField label="VAT Amount" value={formatCurrency(data.vat_amount)} />
            <DataField label="Sub-Total" value={formatCurrency(data.sub_total)} />
            <DataField label="Total Vendor Cost" value={formatCurrency(data.total_vendor_cost || data.total_cost)} />
            <DataField label="Total Revenue (VAT Incl.)" value={formatCurrency(data.total_revenue)} />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Gross Profit</p>
              <p className={`text-sm font-bold ${(data.gross_profit || 0) >= 0 ? "text-success" : "text-destructive"}`}>
                {formatCurrency(data.gross_profit)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Invoice Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataField label="Invoice Number" value={data.invoice_number} />
          <DataField label="Invoice Date" value={formatDate(data.invoice_date)} />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Invoice Status</p>
            <StatusBadge status={data.invoice_status} type="invoice" />
          </div>
          <DataField label="Payment Terms" value={data.payment_terms_days ? `${data.payment_terms_days} days` : null} />
          <DataField label="Due Date" value={formatDate(data.due_date)} />
          <DataField label="Invoice Paid Date" value={formatDate(data.invoice_paid_date)} />
        </CardContent>
      </Card>

      {/* Payment Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Payment Status
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Customer Payment Status</p>
            <StatusBadge status={data.customer_payment_status} type="payment" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">WHT Status</p>
            <StatusBadge status={data.wht_status} type="wht" />
          </div>
          <DataField label="WHT Deducted" value={formatCurrency(data.wht_deducted)} />
          <DataField label="Payment Receipt Date" value={formatDate(data.payment_receipt_date)} />
          <DataField label="Bank Payment Received" value={data.bank_payment_received} />
          <DataField label="Bank Debited" value={data.bank_debited} />
          <DataField label="Invoice Amount Paid" value={formatCurrency(data.invoice_amount_paid)} />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Balance Owed</p>
            <p className={`text-sm font-bold ${(data.balance_owed || 0) > 0 ? "text-destructive" : "text-success"}`}>
              {formatCurrency(data.balance_owed)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Vendor Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Vendor Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataField label="Vendor Bill Number" value={data.vendor_bill_number} />
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Vendor Invoice Status</p>
            <StatusBadge status={data.vendor_invoice_status} type="invoice" />
          </div>
          <DataField label="Vendor Invoice Submission" value={formatDate(data.vendor_invoice_submission_date)} />
        </CardContent>
      </Card>

      {/* Payment Analysis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Payment Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <DataField label="Gap In Payment" value={data.gap_in_payment ? `${data.gap_in_payment} days` : null} />
          <DataField label="Invoice Ageing" value={data.invoice_ageing ? `${data.invoice_ageing} days` : null} />
          <DataField label="Invoice Age (For Interest)" value={data.invoice_age_for_interest ? `${data.invoice_age_for_interest} days` : null} />
          <DataField label="Daily Rate" value={data.daily_rate ? `${data.daily_rate}%` : null} />
          <DataField label="Interest Paid" value={formatCurrency(data.interest_paid)} />
          <DataField label="Interest Not Paid" value={formatCurrency(data.interest_not_paid)} />
        </CardContent>
      </Card>

      {/* Import Info */}
      {(data.imported_at || data.source_file) && (
        <div className="text-xs text-muted-foreground flex items-center gap-4 pt-2 border-t">
          {data.imported_at && (
            <span>Imported: {formatDate(data.imported_at)}</span>
          )}
          {data.source_file && (
            <span>Source: {data.source_file}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default HistoricalDataView;
