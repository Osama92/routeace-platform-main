import * as XLSX from 'xlsx';

export interface VendorRateRow {
  vendor_name: string;
  customer_name?: string;
  tonnage: string;
  truck_type: string;
  pickup_location?: string;
  route?: string;
  zone: string;
  rate_amount: number;
  is_net?: boolean;
  notes?: string;
}

export interface DieselRateRow {
  route_name: string;
  origin: string;
  destination: string;
  distance_km?: number;
  truck_type: string;
  diesel_liters_agreed: number;
  diesel_cost_per_liter?: number;
  notes?: string;
}

export interface HistoricalInvoiceRow {
  customer_name: string;
  vendor_name?: string;
  period_year: number;
  period_month: number;
  month_name?: string;
  tonnage?: string;
  truck_type?: string;
  route?: string;
  pickup_location?: string;
  pick_off?: string;
  delivery_location?: string;
  trips_count?: number;
  total_revenue?: number;
  total_cost?: number;
  profit_margin?: number;
  notes?: string;
  // Extended fields from Excel
  transaction_type?: string;
  transaction_date?: string;
  week_num?: number;
  drop_point?: string;
  route_cluster?: string;
  km_covered?: number;
  tonnage_loaded?: number;
  driver_name?: string;
  truck_number?: string;
  waybill_numbers?: string;
  num_deliveries?: number;
  amount_vatable?: number;
  amount_not_vatable?: number;
  extra_dropoffs?: number;
  extra_dropoff_cost?: number;
  total_vendor_cost?: number;
  sub_total?: number;
  vat_amount?: number;
  invoice_number?: string;
  gross_profit?: number;
  wht_status?: string;
  wht_deducted?: number;
  vendor_bill_number?: string;
  vendor_invoice_status?: string;
  customer_payment_status?: string;
  invoice_status?: string;
  payment_receipt_date?: string;
  invoice_date?: string;
  payment_terms_days?: number;
  due_date?: string;
  invoice_paid_date?: string;
  // Additional financial fields
  bank_payment_received?: string;
  bank_payment_received_date?: string;
  bank_debited?: string;
  bank_debited_date?: string;
  invoice_amount_paid?: number;
  balance_owed?: number;
  gap_in_payment?: number;
  invoice_ageing?: number;
  vendor_invoice_submission_date?: string;
  invoice_age_for_interest?: number;
  daily_rate?: number;
  interest_paid?: number;
  interest_not_paid?: number;
}

export const parseExcelFile = async <T>(
  file: File,
  headerMap: Record<string, keyof T>
): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Get raw JSON with headers
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);
        
        // Map headers to expected keys
        const mappedData = rawData.map((row) => {
          const mappedRow: Partial<T> = {};
          
          for (const [excelHeader, targetKey] of Object.entries(headerMap)) {
            // Try to find the column (case-insensitive)
            const matchingKey = Object.keys(row).find(
              (k) => k.toLowerCase().trim() === excelHeader.toLowerCase().trim()
            );
            
            if (matchingKey !== undefined) {
              mappedRow[targetKey] = row[matchingKey];
            }
          }
          
          return mappedRow as T;
        });
        
        resolve(mappedData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

export const vendorRateHeaderMap: Record<string, keyof VendorRateRow> = {
  'vendor name': 'vendor_name',
  'vendor': 'vendor_name',
  'partner': 'vendor_name',
  'customer name': 'customer_name',
  'customer': 'customer_name',
  'tonnage': 'tonnage',
  'truck type': 'truck_type',
  'truck': 'truck_type',
  'pickup location': 'pickup_location',
  'pickup': 'pickup_location',
  'route': 'route',
  'destination': 'route',
  'zone': 'zone',
  'rate': 'rate_amount',
  'rate amount': 'rate_amount',
  'amount': 'rate_amount',
  'is net': 'is_net',
  'net': 'is_net',
  'notes': 'notes',
  'description': 'notes',
};

export const dieselRateHeaderMap: Record<string, keyof DieselRateRow> = {
  'route name': 'route_name',
  'route': 'route_name',
  'origin': 'origin',
  'from': 'origin',
  'pickup': 'origin',
  'destination': 'destination',
  'to': 'destination',
  'delivery': 'destination',
  'distance': 'distance_km',
  'distance km': 'distance_km',
  'km': 'distance_km',
  'truck type': 'truck_type',
  'truck': 'truck_type',
  'diesel agreed': 'diesel_liters_agreed',
  'diesel liters': 'diesel_liters_agreed',
  'liters': 'diesel_liters_agreed',
  'fuel': 'diesel_liters_agreed',
  'cost per liter': 'diesel_cost_per_liter',
  'diesel cost': 'diesel_cost_per_liter',
  'notes': 'notes',
};

export const historicalInvoiceHeaderMap: Record<string, keyof HistoricalInvoiceRow> = {
  // Customer & Vendor
  'customer': 'customer_name',
  'customer name': 'customer_name',
  'vendor': 'vendor_name',
  'vendor name': 'vendor_name',
  '3pl vendor': 'vendor_name',

  // Period
  'year': 'period_year',
  'period year': 'period_year',
  'month': 'period_month',
  'period month': 'period_month',
  'month name': 'month_name',
  'week num': 'week_num',
  'week': 'week_num',

  // Transaction details
  'transaction type': 'transaction_type',
  'date': 'transaction_date',
  'transaction date': 'transaction_date',

  // Route & Location
  'route': 'route',
  'drop point': 'drop_point',
  'route clauster': 'route_cluster',
  'route cluster': 'route_cluster',
  'pickup': 'pickup_location',
  'pickup location': 'pickup_location',
  'pick off': 'pick_off',
  'delivery': 'delivery_location',
  'delivery location': 'delivery_location',
  'km covered': 'km_covered',

  // Vehicle & Driver
  'tonnage': 'tonnage',
  'tonnage loaded': 'tonnage_loaded',
  'truck type': 'truck_type',
  'truck': 'truck_type',
  'truck number': 'truck_number',
  'driver name': 'driver_name',
  'driver': 'driver_name',

  // Delivery details
  'waybill no': 'waybill_numbers',
  'waybill': 'waybill_numbers',
  'no of customers /deliveries': 'num_deliveries',
  'no of deliveries': 'num_deliveries',
  'deliveries': 'num_deliveries',
  'trips': 'trips_count',
  'trips count': 'trips_count',
  'extra drop off': 'extra_dropoffs',
  'extra dropoff': 'extra_dropoffs',
  'cost per extra dropoff': 'extra_dropoff_cost',

  // Revenue & Cost
  'amount (vatable)': 'amount_vatable',
  'amount vatable': 'amount_vatable',
  'amount (not vatable)': 'amount_not_vatable',
  'amount not vatable': 'amount_not_vatable',
  'amount': 'total_revenue',
  'revenue': 'total_revenue',
  'total revenue': 'total_revenue',
  'total rev vat incl': 'total_revenue',
  'total vendor cost (+ vat)': 'total_vendor_cost',
  'total vendor cost': 'total_vendor_cost',
  'vendor cost': 'total_vendor_cost',
  'cost': 'total_cost',
  'total cost': 'total_cost',
  'sub-total': 'sub_total',
  'sub total': 'sub_total',
  'subtotal': 'sub_total',
  'total vat on invoice': 'vat_amount',
  'vat': 'vat_amount',

  // Profit
  'gross profit': 'gross_profit',
  'profit': 'profit_margin',
  'profit margin': 'profit_margin',

  // Invoice details
  'customer invoice number': 'invoice_number',
  'invoice number': 'invoice_number',
  'invoice no': 'invoice_number',
  'invoice date': 'invoice_date',
  'invoice status': 'invoice_status',

  // Payment status
  'wht payment status': 'wht_status',
  'wht status': 'wht_status',
  'wht deducted': 'wht_deducted',
  'vendor bill number': 'vendor_bill_number',
  'vendor invoice status': 'vendor_invoice_status',
  'customer payment status': 'customer_payment_status',
  'payment reciept date': 'payment_receipt_date',
  'payment receipt date': 'payment_receipt_date',
  'payment terms(days)': 'payment_terms_days',
  'payment terms': 'payment_terms_days',
  'due date': 'due_date',
  'invoice paid date': 'invoice_paid_date',

  // Bank & Payment tracking
  'bank payment was recieved': 'bank_payment_received',
  'bank payment was received': 'bank_payment_received',
  'bank debited': 'bank_debited',
  'invoice amount paid': 'invoice_amount_paid',
  'cutomer invoice - balance owed': 'balance_owed',
  'customer invoice - balance owed': 'balance_owed',
  'gap in payment': 'gap_in_payment',
  'invoice ageing': 'invoice_ageing',
  'vendor invoice submission date': 'vendor_invoice_submission_date',

  // Interest calculation fields
  'invoice age(for intrest calculation)': 'invoice_age_for_interest',
  'invoice age(for interest calculation)': 'invoice_age_for_interest',
  'daily rate': 'daily_rate',
  'total interest on cash - paid': 'interest_paid',
  'total interest on cash - notpaid': 'interest_not_paid',

  // Notes
  'notes': 'notes',
};

export const normalizeTruckType = (type: string): string => {
  const normalized = type.toLowerCase().trim();
  if (normalized.includes('trailer') || normalized.includes('45') || normalized.includes('40')) return 'trailer';
  if (normalized.includes('20') || normalized.includes('twenty')) return '20t';
  if (normalized.includes('15') || normalized.includes('fifteen')) return '15t';
  if (normalized.includes('10') || normalized.includes('ten')) return '10t';
  if (normalized.includes('5') || normalized.includes('five')) return '5t';
  return '10t'; // default
};

export const normalizeZone = (zone: string): 'within_ibadan' | 'outside_ibadan' => {
  const normalized = zone.toLowerCase().trim();
  if (normalized.includes('within') || normalized.includes('inside') || normalized.includes('local')) {
    return 'within_ibadan';
  }
  return 'outside_ibadan';
};

export const generateVendorRateTemplate = (): void => {
  const headers = [
    'Vendor Name',
    'Customer Name',
    'Tonnage',
    'Truck Type',
    'Pickup Location',
    'Route/Destination',
    'Zone',
    'Rate Amount',
    'Is Net',
    'Notes'
  ];
  
  const sampleData = [
    ['ABC Logistics', 'Dangote Cement', '20T', '20t', 'Agbara', 'Abuja', 'outside_ibadan', 350000, 'Yes', 'Standard rate'],
    ['XYZ Transport', 'BUA Cement', '10T', '10t', 'Lagos', 'Ibadan', 'within_ibadan', 150000, 'Yes', 'Local delivery'],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vendor Rates');
  XLSX.writeFile(wb, 'vendor-rates-template.xlsx');
};

export const generateDieselRateTemplate = (): void => {
  const headers = [
    'Route Name',
    'Origin',
    'Destination',
    'Distance (km)',
    'Truck Type',
    'Diesel Agreed (Liters)',
    'Cost per Liter',
    'Notes'
  ];
  
  const sampleData = [
    ['Lagos-Abuja', 'Agbara', 'FCT Abuja', 750, '20t', 280, 950, 'Via Lokoja'],
    ['Lagos-Ibadan', 'Lagos', 'Ibadan', 130, '10t', 50, 950, 'Express route'],
  ];
  
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Diesel Rates');
  XLSX.writeFile(wb, 'diesel-rates-template.xlsx');
};

export const generateHistoricalDataTemplate = (): void => {
  // Complete 50+ field template matching Google Sheets format
  // Order matches: "All Month breakdown All Biz" sheet
  const headers = [
    'Transaction Type',
    'Date',
    'Customer Name',
    'Week Num',
    'Month',
    'Month Name',
    'Year',
    '3PL Vendor',
    'Pick off',
    'Drop point',
    'Route Cluster',
    'KM Covered',
    'Tonnage Loaded',
    'Driver name',
    'Tonnage',
    'Truck number',
    'Waybill No',
    'No of Customers /Deliveries',
    'AMOUNT (VATABLE)',
    'Amount (Not Vatable)',
    'Amount',
    'Extra drop off',
    'Cost per Extra dropoff',
    'Total Vendor Cost (+ VAT)',
    'Sub-Total',
    'Total Vat on Invoice',
    'Total Rev Vat Incl',
    'Gross Profit',
    'WHT Payment status',
    'Vendor Bill number',
    'Vendor Invoice Status',
    'Customer Payment status',
    'Invoice Status',
    'Payment Reciept date',
    'WHT deducted',
    'Bank Payment was recieved',
    'Bank Debited',
    'Invoice Amount Paid',
    'Cutomer Invoice - Balance Owed',
    'Invoice date',
    'Customer Invoice Number',
    'Payment Terms(Days)',
    'Due date',
    'Invoice Paid Date',
    'Gap In Payment',
    'Invoice Ageing',
    'Vendor invoice submission date',
    'Invoice Age(For Intrest Calculation)',
    'Daily Rate',
    'Total Interest on Cash - Paid',
    'Total Interest on Cash - NotPaid',
    'Notes'
  ];

  const sampleData = [
    [
      'Invoice',           // Transaction Type
      '2024-08-01',        // Date
      'Dangote Cement',    // Customer Name
      32,                  // Week Num
      8,                   // Month
      'August',            // Month Name
      2024,                // Year
      'ABC Logistics',     // 3PL Vendor
      'Lagos Depot',       // Pick off
      'Abuja Terminal',    // Drop point
      'North-Central',     // Route Cluster
      750,                 // KM Covered
      30,                  // Tonnage Loaded
      'John Driver',       // Driver name
      '30T',               // Tonnage
      'ABC-123-XY',        // Truck number
      'WB-001,WB-002',     // Waybill No
      2,                   // No of Customers /Deliveries
      350000,              // AMOUNT (VATABLE)
      0,                   // Amount (Not Vatable)
      350000,              // Amount
      1,                   // Extra drop off
      15000,               // Cost per Extra dropoff
      280000,              // Total Vendor Cost (+ VAT)
      322625,              // Sub-Total
      27375,               // Total Vat on Invoice
      392375,              // Total Rev Vat Incl
      112375,              // Gross Profit
      'Pending',           // WHT Payment status
      'VB-001',            // Vendor Bill number
      'Paid',              // Vendor Invoice Status
      'Paid',              // Customer Payment status
      'Closed',            // Invoice Status
      '2024-09-15',        // Payment Reciept date
      17500,               // WHT deducted
      'Yes',               // Bank Payment was recieved
      'GTBank',            // Bank Debited
      392375,              // Invoice Amount Paid
      0,                   // Cutomer Invoice - Balance Owed
      '2024-08-05',        // Invoice date
      'INV-2024-001',      // Customer Invoice Number (after Invoice date)
      30,                  // Payment Terms(Days)
      '2024-09-05',        // Due date
      '2024-09-15',        // Invoice Paid Date
      10,                  // Gap In Payment (days late)
      0,                   // Invoice Ageing (0 if paid)
      '2024-08-10',        // Vendor invoice submission date
      45,                  // Invoice Age(For Intrest Calculation)
      0.0001,              // Daily Rate (0.01%)
      0,                   // Total Interest on Cash - Paid
      0,                   // Total Interest on Cash - NotPaid
      'Sample record'      // Notes
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  // Set column widths
  ws['!cols'] = headers.map((_, i) => ({ wch: i < 5 ? 15 : 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historical Data');
  XLSX.writeFile(wb, 'historical-data-template-complete.xlsx');
};
