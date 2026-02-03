import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google Sheets API endpoints
const GOOGLE_OAUTH_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SheetConfig {
  spreadsheet_id: string;
  sheet_name: string;
  data_type: 'dispatches' | 'customers' | 'drivers' | 'vehicles' | 'invoices' | 'expenses' | 'transactions';
  sync_direction: 'export' | 'import' | 'both';
}

async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.');
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google token error:', errorText);
    throw new Error(`Failed to get Google access token: ${errorText}`);
  }

  const data: GoogleTokenResponse = await response.json();
  return data.access_token;
}

// Get sheet data
async function getSheetData(accessToken: string, spreadsheetId: string, sheetName: string): Promise<any[][]> {
  // Use single quotes around sheet name to handle spaces and special characters
  // Extended range to BZ (78 columns) to support 50+ fields
  const range = encodeURIComponent(`'${sheetName}'!A:BZ`);
  const response = await fetch(
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${range}`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to read sheet: ${errorText}`);
  }

  const data = await response.json();
  return data.values || [];
}

// Update sheet data
async function updateSheetData(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: any[][],
  startRow: number = 1
): Promise<void> {
  // Use single quotes around sheet name to handle spaces and special characters
  const range = encodeURIComponent(`'${sheetName}'!A${startRow}`);

  const response = await fetch(
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update sheet: ${errorText}`);
  }
}

// Append rows to sheet
async function appendToSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  values: any[][]
): Promise<void> {
  // Use single quotes around sheet name and extended range for 50+ columns
  const range = encodeURIComponent(`'${sheetName}'!A:BZ`);

  const response = await fetch(
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to append to sheet: ${errorText}`);
  }
}

// Clear sheet (except header)
async function clearSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  // Use single quotes around sheet name and extended range for 50+ columns
  const range = encodeURIComponent(`'${sheetName}'!A2:BZ10000`);

  const response = await fetch(
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${range}:clear`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to clear sheet: ${errorText}`);
  }
}

// Export dispatches to Google Sheets
async function exportDispatches(supabase: any, accessToken: string, config: SheetConfig) {
  const { data: dispatches, error } = await supabase
    .from('dispatches')
    .select(`
      id,
      dispatch_number,
      pickup_address,
      delivery_address,
      status,
      scheduled_delivery,
      actual_delivery,
      distance_km,
      cost,
      notes,
      created_at,
      customers:customer_id (company_name),
      drivers:driver_id (full_name),
      vehicles:vehicle_id (registration_number)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Prepare header row
  const headers = [
    'Dispatch Number', 'Customer', 'Driver', 'Vehicle', 'Pickup Address',
    'Delivery Address', 'Status', 'Scheduled Delivery', 'Actual Delivery',
    'Distance (km)', 'Cost', 'Notes', 'Created At'
  ];

  // Prepare data rows
  const rows = (dispatches || []).map((d: any) => [
    d.dispatch_number,
    d.customers?.company_name || '',
    d.drivers?.full_name || '',
    d.vehicles?.registration_number || '',
    d.pickup_address || '',
    d.delivery_address || '',
    d.status,
    d.scheduled_delivery || '',
    d.actual_delivery || '',
    d.distance_km || '',
    d.cost || '',
    d.notes || '',
    d.created_at,
  ]);

  // Clear and update sheet
  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Export customers to Google Sheets
async function exportCustomers(supabase: any, accessToken: string, config: SheetConfig) {
  const { data: customers, error } = await supabase
    .from('customers')
    .select('*')
    .order('company_name');

  if (error) throw error;

  const headers = [
    'ID', 'Company Name', 'Contact Name', 'Email', 'Phone',
    'Address', 'Credit Limit', 'Payment Terms', 'Status', 'Created At'
  ];

  const rows = (customers || []).map((c: any) => [
    c.id,
    c.company_name || '',
    c.contact_name || '',
    c.email || '',
    c.phone || '',
    c.address || '',
    c.credit_limit || '',
    c.payment_terms || '',
    c.status || 'active',
    c.created_at,
  ]);

  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Export drivers to Google Sheets
async function exportDrivers(supabase: any, accessToken: string, config: SheetConfig) {
  const { data: drivers, error } = await supabase
    .from('drivers')
    .select('*')
    .order('full_name');

  if (error) throw error;

  const headers = [
    'ID', 'Full Name', 'Phone', 'Email', 'License Number',
    'License Expiry', 'Status', 'Rating', 'Created At'
  ];

  const rows = (drivers || []).map((d: any) => [
    d.id,
    d.full_name || '',
    d.phone || '',
    d.email || '',
    d.license_number || '',
    d.license_expiry || '',
    d.status || 'active',
    d.rating || '',
    d.created_at,
  ]);

  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Export vehicles to Google Sheets
async function exportVehicles(supabase: any, accessToken: string, config: SheetConfig) {
  const { data: vehicles, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('registration_number');

  if (error) throw error;

  const headers = [
    'ID', 'Registration Number', 'Make', 'Model', 'Year',
    'Capacity (kg)', 'Fuel Type', 'Status', 'Current Mileage', 'Created At'
  ];

  const rows = (vehicles || []).map((v: any) => [
    v.id,
    v.registration_number || '',
    v.make || '',
    v.model || '',
    v.year || '',
    v.capacity_kg || '',
    v.fuel_type || '',
    v.status || 'active',
    v.current_mileage || '',
    v.created_at,
  ]);

  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Export invoices to Google Sheets
async function exportInvoices(supabase: any, accessToken: string, config: SheetConfig) {
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      *,
      customers:customer_id (company_name),
      dispatches:dispatch_id (dispatch_number)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const headers = [
    'Invoice Number', 'Customer', 'Dispatch', 'Amount', 'Tax Amount',
    'Total Amount', 'Status', 'Due Date', 'Paid Date', 'Notes', 'Created At'
  ];

  const rows = (invoices || []).map((i: any) => [
    i.invoice_number,
    i.customers?.company_name || '',
    i.dispatches?.dispatch_number || '',
    i.amount || '',
    i.tax_amount || '',
    i.total_amount || '',
    i.status,
    i.due_date || '',
    i.paid_date || '',
    i.notes || '',
    i.created_at,
  ]);

  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Export expenses to Google Sheets
async function exportExpenses(supabase: any, accessToken: string, config: SheetConfig) {
  const { data: expenses, error } = await supabase
    .from('expenses')
    .select(`
      *,
      dispatches:dispatch_id (dispatch_number),
      vehicles:vehicle_id (registration_number)
    `)
    .order('expense_date', { ascending: false });

  if (error) throw error;

  const headers = [
    'ID', 'Category', 'Description', 'Amount', 'Expense Date',
    'Dispatch', 'Vehicle', 'Vendor', 'Receipt URL', 'Created At'
  ];

  const rows = (expenses || []).map((e: any) => [
    e.id,
    e.category || '',
    e.description || '',
    e.amount || '',
    e.expense_date || '',
    e.dispatches?.dispatch_number || '',
    e.vehicles?.registration_number || '',
    e.vendor || '',
    e.receipt_url || '',
    e.created_at,
  ]);

  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Export transactions (historical_invoice_data) to Google Sheets - Full 50+ field coverage
async function exportTransactions(supabase: any, accessToken: string, config: SheetConfig) {
  const { data: transactions, error } = await supabase
    .from('historical_invoice_data')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .order('transaction_date', { ascending: false });

  if (error) throw error;

  // Headers matching the original Google Sheet format (50+ columns)
  // Order matches: "All Month breakdown All Biz" sheet
  const headers = [
    'Transaction Type', 'Date', 'Customer Name', 'Week Num', 'Month', 'Month Name', 'Year',
    '3PL Vendor', 'Pick off', 'Drop point', 'Route Cluster', 'KM Covered', 'Tonnage Loaded',
    'Driver name', 'Tonnage', 'Truck number', 'Waybill No', 'No of Customers/Deliveries',
    'AMOUNT (VATABLE)', 'Amount (Not Vatable)', 'Amount', 'Extra drop off', 'Cost per Extra dropoff',
    'Total Vendor Cost (+ VAT)', 'Sub-Total', 'Total Vat on Invoice',
    'Total Rev Vat Incl', 'Gross Profit', 'WHT Payment status', 'Vendor Bill number',
    'Vendor Invoice Status', 'Customer Payment status', 'Invoice Status', 'Payment Receipt date',
    'WHT deducted', 'Bank Payment was received', 'Bank Debited', 'Invoice Amount Paid',
    'Customer Invoice - Balance Owed', 'Invoice date', 'Customer Invoice Number', 'Payment Terms(Days)', 'Due date',
    'Invoice Paid Date', 'Gap In Payment', 'Invoice Ageing', 'Vendor invoice submission date',
    'Invoice Age(For Interest Calculation)', 'Daily Rate', 'Total Interest on Cash - Paid',
    'Total Interest on Cash - NotPaid'
  ];

  // Month names for conversion
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Prepare data rows - order matches "All Month breakdown All Biz" sheet
  const rows = (transactions || []).map((t: any) => [
    t.transaction_type || '',
    t.transaction_date || '',
    t.customer_name || '',
    t.week_num || t.week_number || '',  // Support both column names
    t.period_month || '',
    t.month_name || monthNames[t.period_month] || '',
    t.period_year || '',
    t.vendor_name || '',
    t.pick_off || t.pickup_location || '',
    t.drop_point || t.delivery_location || '',  // Support both column names
    t.route_cluster || '',
    t.km_covered || '',
    t.tonnage_loaded || '',
    t.driver_name || '',
    t.tonnage || '',
    t.truck_number || '',
    t.waybill_number || '',
    t.num_deliveries || t.trips_count || '',
    t.amount_vatable || '',
    t.amount_not_vatable || '',
    t.total_amount || t.total_revenue || '',
    t.extra_dropoffs || '',
    t.extra_dropoff_cost || '',
    t.total_vendor_cost || t.vendor_cost || t.total_cost || '',  // Support all cost column names
    t.sub_total || '',
    t.vat_amount || '',
    t.total_revenue || '',
    t.gross_profit || '',
    t.wht_status || '',
    t.vendor_bill_number || '',
    t.vendor_invoice_status || '',
    t.customer_payment_status || '',
    t.invoice_status || '',
    t.payment_receipt_date || '',
    t.wht_deducted || '',
    t.bank_payment_received || '',
    t.bank_debited || '',
    t.invoice_amount_paid || '',
    t.balance_owed || '',
    t.invoice_date || '',
    t.invoice_number || '',  // Customer Invoice Number comes after Invoice date
    t.payment_terms_days || '',
    t.due_date || '',
    t.invoice_paid_date || '',
    t.gap_in_payment || '',
    t.invoice_ageing || '',
    t.vendor_invoice_submission_date || '',
    t.invoice_age_for_interest || '',
    t.daily_rate || '',
    t.interest_paid || '',
    t.interest_not_paid || '',
  ]);

  // Clear and update sheet
  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Import transactions from Google Sheets - Full 50+ field coverage
async function importTransactions(supabase: any, accessToken: string, config: SheetConfig) {
  console.log('Starting importTransactions with sheet:', config.sheet_name);

  const rows = await getSheetData(accessToken, config.spreadsheet_id, config.sheet_name);
  console.log('Rows fetched:', rows.length);

  if (rows.length < 2) {
    return { imported: 0, skipped: 0, errors: [], debug: { message: 'Less than 2 rows in sheet', rowCount: rows.length } };
  }

  // Auto-detect header row - find the first row that contains key headers
  // Check first 20 rows for headers (some sheets have title/summary rows at top)
  let headerRowIndex = -1;
  const headerKeywords = ['customer name', 'customer', 'year', 'month', 'transaction type', 'date'];

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i] || [];
    // Skip completely empty rows
    if (row.length === 0 || row.every((cell: any) => !cell || String(cell).trim() === '')) {
      continue;
    }

    const rowLower = row.map((cell: any) => String(cell || '').toLowerCase().trim());
    // Count how many header keywords are found in this row
    const matchCount = headerKeywords.filter(keyword => rowLower.includes(keyword)).length;

    // If we find at least 2 header keywords, this is likely the header row
    if (matchCount >= 2) {
      headerRowIndex = i;
      console.log(`Header row found at index ${i} with ${matchCount} keyword matches:`, row.slice(0, 5));
      break;
    }
  }

  // If no header row found, return with debug info
  if (headerRowIndex === -1) {
    // Show first few non-empty rows for debugging
    const sampleRows = rows.slice(0, 5).map((r: any[], idx: number) => ({
      row: idx + 1,
      firstCells: (r || []).slice(0, 5).map((c: any) => String(c || '').substring(0, 20))
    }));
    return {
      imported: 0,
      skipped: 0,
      errors: ['Could not find header row with expected columns (Customer Name, Year, Month, etc.)'],
      debug: {
        message: 'Header row not detected in first 20 rows',
        totalRows: rows.length,
        sampleRows: sampleRows,
        sheetName: config.sheet_name
      }
    };
  }

  const headers = rows[headerRowIndex].map((h: string) => h?.toLowerCase()?.trim() || '');
  const dataRows = rows.slice(headerRowIndex + 1);

  console.log('Header row index:', headerRowIndex);
  console.log('Headers found:', headers.slice(0, 10)); // Log first 10 headers
  console.log('Data rows count:', dataRows.length);

  // Month name to number mapping
  const monthNameToNum: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
  };

  // Helper to get column value by header variations
  const getVal = (row: any[], ...headerVariants: string[]): string | null => {
    for (const h of headerVariants) {
      const idx = headers.indexOf(h.toLowerCase());
      if (idx !== -1 && row[idx] !== undefined && row[idx] !== '') {
        return row[idx];
      }
    }
    return null;
  };

  const parseNum = (val: string | null): number | null => {
    if (!val) return null;
    const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    return isNaN(num) ? null : num;
  };

  const parseDate = (val: string | null): string | null => {
    if (!val) return null;
    try {
      const date = new Date(val);
      if (isNaN(date.getTime())) return null;
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  };

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const skipReasons: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    try {
      const customerName = getVal(row, 'customer name', 'customer');

      // Try to get year/month from dedicated columns first
      let year = parseNum(getVal(row, 'year'));
      let month = parseNum(getVal(row, 'month')) ||
        monthNameToNum[getVal(row, 'month name')?.toLowerCase() || ''];

      // If year or month is missing, try to extract from the date column
      const dateVal = getVal(row, 'date', 'transaction date');
      if (dateVal && (!year || !month)) {
        const parsedDate = parseDate(dateVal);
        if (parsedDate) {
          const dateObj = new Date(parsedDate);
          if (!year) year = dateObj.getFullYear();
          if (!month) month = dateObj.getMonth() + 1; // getMonth() is 0-indexed
        }
      }

      // Skip rows without customer name (likely empty or summary rows)
      if (!customerName) {
        if (skipReasons.length < 5) {
          skipReasons.push(`Row ${i + 2}: customerName=${customerName} (empty row)`);
        }
        skipped++;
        continue;
      }

      // If we still don't have year/month, log it but continue with null values
      // This allows partial data import rather than skipping entirely
      if (!year || !month) {
        // Log skip reason for first few rows to help debug
        if (skipReasons.length < 5) {
          skipReasons.push(`Row ${i + 2}: customerName=${customerName}, year=${year}, month=${month} (missing period data, will use defaults)`);
        }
        // Use current year/month as fallback if we have other valid data
        const now = new Date();
        if (!year) year = now.getFullYear();
        if (!month) month = now.getMonth() + 1;
      }

      // Month name helper
      const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

      // Full 51 column support for historical_invoice_data table
      const transactionData = {
        // Required fields
        customer_name: customerName,
        period_year: year,
        period_month: month,
        month_name: getVal(row, 'month name') || monthNames[month] || '',

        // Optional fields
        vendor_name: getVal(row, '3pl vendor', 'vendor', 'vendor name'),
        transaction_date: parseDate(getVal(row, 'date', 'transaction date')),
        transaction_type: getVal(row, 'transaction type'),
        week_num: parseNum(getVal(row, 'week num', 'week number')),

        // Route & delivery details
        pickup_location: getVal(row, 'pick off', 'pickup', 'pickup location'),
        pick_off: getVal(row, 'pick off'),
        delivery_location: getVal(row, 'drop point', 'delivery', 'delivery location'),
        drop_point: getVal(row, 'drop point'),
        route_cluster: getVal(row, 'route cluster', 'route clauster'),
        km_covered: parseNum(getVal(row, 'km covered', 'distance')),

        // Vehicle & driver info
        truck_number: getVal(row, 'truck number', 'truck'),
        driver_name: getVal(row, 'driver name', 'driver'),
        tonnage: getVal(row, 'tonnage'),
        tonnage_loaded: parseNum(getVal(row, 'tonnage loaded')),

        // Trip details
        waybill_number: getVal(row, 'waybill no', 'waybill number'),
        trips_count: parseNum(getVal(row, 'no of customers/deliveries', 'trips')) || 1,
        num_deliveries: parseNum(getVal(row, 'no of customers/deliveries', 'deliveries')),
        extra_dropoffs: parseNum(getVal(row, 'extra drop off', 'extra dropoffs')),
        extra_dropoff_cost: parseNum(getVal(row, 'cost per extra dropoff')),

        // Revenue & cost breakdown
        amount_vatable: parseNum(getVal(row, 'amount (vatable)', 'amount vatable')),
        amount_not_vatable: parseNum(getVal(row, 'amount (not vatable)', 'amount not vatable')),
        total_amount: parseNum(getVal(row, 'amount', 'total amount')),
        total_revenue: parseNum(getVal(row, 'total rev vat incl', 'revenue')) || 0,
        total_cost: parseNum(getVal(row, 'total vendor cost (+ vat)', 'vendor cost', 'cost')) || 0,
        total_vendor_cost: parseNum(getVal(row, 'total vendor cost (+ vat)')),
        vat_amount: parseNum(getVal(row, 'total vat on invoice', 'vat')),
        sub_total: parseNum(getVal(row, 'sub-total', 'subtotal')),
        gross_profit: parseNum(getVal(row, 'gross profit', 'profit')),

        // Invoice information
        invoice_number: getVal(row, 'customer invoice number', 'invoice number'),
        invoice_date: parseDate(getVal(row, 'invoice date')),
        invoice_status: getVal(row, 'invoice status'),
        payment_terms_days: parseNum(getVal(row, 'payment terms(days)', 'payment terms')),
        due_date: parseDate(getVal(row, 'due date')),

        // Vendor billing
        vendor_bill_number: getVal(row, 'vendor bill number'),
        vendor_invoice_status: getVal(row, 'vendor invoice status'),
        vendor_invoice_submission_date: parseDate(getVal(row, 'vendor invoice submission date')),

        // Payment tracking
        customer_payment_status: getVal(row, 'customer payment status', 'payment status'),
        payment_receipt_date: parseDate(getVal(row, 'payment receipt date', 'payment reciept date')),
        invoice_paid_date: parseDate(getVal(row, 'invoice paid date', 'paid date')),
        invoice_amount_paid: parseNum(getVal(row, 'invoice amount paid', 'amount paid')),
        balance_owed: parseNum(getVal(row, 'customer invoice - balance owed', 'balance owed')),

        // WHT (Withholding Tax)
        wht_status: getVal(row, 'wht payment status'),
        wht_deducted: parseNum(getVal(row, 'wht deducted')),

        // Bank info
        bank_payment_received: getVal(row, 'bank payment was received', 'bank payment was recieved'),
        bank_debited: getVal(row, 'bank debited'),

        // Payment analysis
        gap_in_payment: parseNum(getVal(row, 'gap in payment')),
        invoice_ageing: parseNum(getVal(row, 'invoice ageing')),
        invoice_age_for_interest: parseNum(getVal(row, 'invoice age(for interest calculation)', 'invoice age(for intrest calculation)')),

        // Interest calculations
        daily_rate: parseNum(getVal(row, 'daily rate')),
        interest_paid: parseNum(getVal(row, 'total interest on cash - paid')),
        interest_not_paid: parseNum(getVal(row, 'total interest on cash - notpaid')),
      };

      // Log first row's data for debugging
      if (i === 0) {
        console.log('First row transaction data:', JSON.stringify(transactionData, null, 2));
      }

      const { error } = await supabase
        .from('historical_invoice_data')
        .insert(transactionData);

      if (error) {
        console.error(`Row ${i + 2} insert error:`, error);
        throw error;
      }
      imported++;
    } catch (err: any) {
      const errorMsg = err.message || err.details || JSON.stringify(err);
      errors.push(`Row ${i + 2}: ${errorMsg}`);
      skipped++;
    }
  }

  // Include sample of first row data in debug for troubleshooting
  let firstRowSample = null;
  if (dataRows.length > 0) {
    const row = dataRows[0];
    firstRowSample = {
      customer_name: getVal(row, 'customer name', 'customer'),
      year: getVal(row, 'year'),
      month: getVal(row, 'month'),
      month_name: getVal(row, 'month name'),
      date: getVal(row, 'date', 'transaction date'),
      raw_first_10_cells: row?.slice(0, 10)
    };
  }

  // Verify data was actually inserted by querying the count
  const { count: totalCount, error: countError } = await supabase
    .from('historical_invoice_data')
    .select('*', { count: 'exact', head: true });

  // Get a sample of recently inserted records
  const { data: recentRecords, error: recentError } = await supabase
    .from('historical_invoice_data')
    .select('id, customer_name, period_year, period_month, total_revenue, imported_at')
    .order('imported_at', { ascending: false })
    .limit(3);

  return {
    imported,
    skipped,
    errors: errors.slice(0, 10), // Limit errors to first 10
    debug: {
      totalRows: rows.length,
      headerRowIndex: headerRowIndex,
      dataRows: dataRows.length,
      headersFound: headers.slice(0, 15),
      skipReasons: skipReasons,
      sheetName: config.sheet_name,
      firstRowSample: firstRowSample,
      // Add error summary to debug for visibility
      errorCount: errors.length,
      firstError: errors[0] || 'No errors'
    },
    verification: {
      totalRecordsInTable: totalCount,
      countError: countError?.message || null,
      recentlyImported: recentRecords || [],
      recentError: recentError?.message || null
    }
  };
}

// Import customers from Google Sheets
async function importCustomers(supabase: any, accessToken: string, config: SheetConfig) {
  const rows = await getSheetData(accessToken, config.spreadsheet_id, config.sheet_name);

  if (rows.length < 2) {
    return { imported: 0, skipped: 0, errors: [] };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dataRows) {
    try {
      const companyName = row[headers.indexOf('Company Name')] || row[1];
      if (!companyName) {
        skipped++;
        continue;
      }

      const customerData = {
        company_name: companyName,
        contact_name: row[headers.indexOf('Contact Name')] || row[2] || null,
        email: row[headers.indexOf('Email')] || row[3] || null,
        phone: row[headers.indexOf('Phone')] || row[4] || null,
        address: row[headers.indexOf('Address')] || row[5] || null,
        credit_limit: parseFloat(row[headers.indexOf('Credit Limit')] || row[6]) || null,
        payment_terms: row[headers.indexOf('Payment Terms')] || row[7] || null,
      };

      // Upsert based on company name
      const { error } = await supabase
        .from('customers')
        .upsert(customerData, { onConflict: 'company_name' });

      if (error) throw error;
      imported++;
    } catch (err: any) {
      errors.push(`Row ${imported + skipped + 2}: ${err.message}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

// Import drivers from Google Sheets
async function importDrivers(supabase: any, accessToken: string, config: SheetConfig) {
  const rows = await getSheetData(accessToken, config.spreadsheet_id, config.sheet_name);

  if (rows.length < 2) {
    return { imported: 0, skipped: 0, errors: [] };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dataRows) {
    try {
      const fullName = row[headers.indexOf('Full Name')] || row[1];
      if (!fullName) {
        skipped++;
        continue;
      }

      const driverData = {
        full_name: fullName,
        phone: row[headers.indexOf('Phone')] || row[2] || null,
        email: row[headers.indexOf('Email')] || row[3] || null,
        license_number: row[headers.indexOf('License Number')] || row[4] || null,
        license_expiry: row[headers.indexOf('License Expiry')] || row[5] || null,
        status: row[headers.indexOf('Status')] || row[6] || 'active',
      };

      const { error } = await supabase
        .from('drivers')
        .upsert(driverData, { onConflict: 'phone' });

      if (error) throw error;
      imported++;
    } catch (err: any) {
      errors.push(`Row ${imported + skipped + 2}: ${err.message}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

// Import vehicles from Google Sheets
async function importVehicles(supabase: any, accessToken: string, config: SheetConfig) {
  const rows = await getSheetData(accessToken, config.spreadsheet_id, config.sheet_name);

  if (rows.length < 2) {
    return { imported: 0, skipped: 0, errors: [] };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dataRows) {
    try {
      const regNumber = row[headers.indexOf('Registration Number')] || row[1];
      if (!regNumber) {
        skipped++;
        continue;
      }

      const vehicleData = {
        registration_number: regNumber,
        make: row[headers.indexOf('Make')] || row[2] || null,
        model: row[headers.indexOf('Model')] || row[3] || null,
        year: parseInt(row[headers.indexOf('Year')] || row[4]) || null,
        capacity_kg: parseFloat(row[headers.indexOf('Capacity (kg)')] || row[5]) || null,
        fuel_type: row[headers.indexOf('Fuel Type')] || row[6] || null,
        status: row[headers.indexOf('Status')] || row[7] || 'active',
      };

      const { error } = await supabase
        .from('vehicles')
        .upsert(vehicleData, { onConflict: 'registration_number' });

      if (error) throw error;
      imported++;
    } catch (err: any) {
      errors.push(`Row ${imported + skipped + 2}: ${err.message}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}

// Append a single transaction to Google Sheets (for auto-sync when new transaction is created)
async function appendTransaction(supabase: any, accessToken: string, config: SheetConfig & { transaction_id?: string }) {
  // Get the transaction by ID
  if (!config.transaction_id) {
    return { success: false, error: 'transaction_id is required' };
  }

  const { data: transaction, error } = await supabase
    .from('historical_invoice_data')
    .select('*')
    .eq('id', config.transaction_id)
    .single();

  if (error) {
    return { success: false, error: `Failed to fetch transaction: ${error.message}` };
  }

  if (!transaction) {
    return { success: false, error: 'Transaction not found' };
  }

  // Month names for conversion
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Create row data matching the Google Sheet format (same as exportTransactions)
  const t = transaction;
  const rowData = [
    t.transaction_type || '',
    t.transaction_date || '',
    t.customer_name || '',
    t.week_num || t.week_number || '',
    t.period_month || '',
    t.month_name || monthNames[t.period_month] || '',
    t.period_year || '',
    t.vendor_name || '',
    t.pick_off || t.pickup_location || '',
    t.drop_point || t.delivery_location || '',
    t.route_cluster || '',
    t.km_covered || '',
    t.tonnage_loaded || '',
    t.driver_name || '',
    t.tonnage || '',
    t.truck_number || '',
    t.waybill_number || '',
    t.num_deliveries || t.trips_count || '',
    t.amount_vatable || '',
    t.amount_not_vatable || '',
    t.total_amount || t.total_revenue || '',
    t.extra_dropoffs || '',
    t.extra_dropoff_cost || '',
    t.total_vendor_cost || t.vendor_cost || t.total_cost || '',
    t.sub_total || '',
    t.vat_amount || '',
    t.total_revenue || '',
    t.gross_profit || '',
    t.wht_status || '',
    t.vendor_bill_number || '',
    t.vendor_invoice_status || '',
    t.customer_payment_status || '',
    t.invoice_status || '',
    t.payment_receipt_date || '',
    t.wht_deducted || '',
    t.bank_payment_received || '',
    t.bank_debited || '',
    t.invoice_amount_paid || '',
    t.balance_owed || '',
    t.invoice_date || '',
    t.invoice_number || '',
    t.payment_terms_days || '',
    t.due_date || '',
    t.invoice_paid_date || '',
    t.gap_in_payment || '',
    t.invoice_ageing || '',
    t.vendor_invoice_submission_date || '',
    t.invoice_age_for_interest || '',
    t.daily_rate || '',
    t.interest_paid || '',
    t.interest_not_paid || '',
  ];

  // Append the row to the sheet
  await appendToSheet(accessToken, config.spreadsheet_id, config.sheet_name, [rowData]);

  return { success: true, appended: 1, transaction_id: config.transaction_id };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('=== Google Sheets Sync Function Called ===');

    // Log environment check
    const hasClientId = !!Deno.env.get('GOOGLE_CLIENT_ID');
    const hasClientSecret = !!Deno.env.get('GOOGLE_CLIENT_SECRET');
    const hasRefreshToken = !!Deno.env.get('GOOGLE_REFRESH_TOKEN');
    console.log('Credentials check:', { hasClientId, hasClientSecret, hasRefreshToken });

    if (!hasClientId || !hasClientSecret || !hasRefreshToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Google credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Edge Function secrets.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, config } = await req.json();
    console.log('Google Sheets sync request:', { action, config });

    const accessToken = await getGoogleAccessToken();
    console.log('Access token obtained successfully');

    let result: any = { success: true };

    switch (action) {
      case 'export_dispatches':
        result = { ...result, ...(await exportDispatches(supabase, accessToken, config)) };
        break;

      case 'export_customers':
        result = { ...result, ...(await exportCustomers(supabase, accessToken, config)) };
        break;

      case 'export_drivers':
        result = { ...result, ...(await exportDrivers(supabase, accessToken, config)) };
        break;

      case 'export_vehicles':
        result = { ...result, ...(await exportVehicles(supabase, accessToken, config)) };
        break;

      case 'export_invoices':
        result = { ...result, ...(await exportInvoices(supabase, accessToken, config)) };
        break;

      case 'export_expenses':
        result = { ...result, ...(await exportExpenses(supabase, accessToken, config)) };
        break;

      case 'export_transactions':
        result = { ...result, ...(await exportTransactions(supabase, accessToken, config)) };
        break;

      case 'import_transactions':
        result = { ...result, ...(await importTransactions(supabase, accessToken, config)) };
        break;

      case 'import_customers':
        result = { ...result, ...(await importCustomers(supabase, accessToken, config)) };
        break;

      case 'import_drivers':
        result = { ...result, ...(await importDrivers(supabase, accessToken, config)) };
        break;

      case 'import_vehicles':
        result = { ...result, ...(await importVehicles(supabase, accessToken, config)) };
        break;

      case 'append_transaction':
        // Append a single new transaction to the Google Sheet
        result = { ...result, ...(await appendTransaction(supabase, accessToken, config)) };
        break;

      case 'test_connection':
        // Test connection by fetching spreadsheet metadata (doesn't require specific sheet)
        const metaResponse = await fetch(
          `${GOOGLE_SHEETS_API}/${config.spreadsheet_id}?fields=properties.title,sheets.properties.title`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        if (!metaResponse.ok) {
          const errorText = await metaResponse.text();
          throw new Error(`Failed to access spreadsheet: ${errorText}`);
        }

        const metaData = await metaResponse.json();
        const sheetNames = metaData.sheets?.map((s: any) => s.properties?.title) || [];
        result.message = 'Connection successful';
        result.spreadsheet_title = metaData.properties?.title;
        result.available_sheets = sheetNames;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Log sync activity (ignore errors if table doesn't exist)
    try {
      await supabase.from('google_sheets_sync_logs').insert({
        action,
        spreadsheet_id: config?.spreadsheet_id,
        sheet_name: config?.sheet_name,
        result: JSON.stringify(result),
      });
    } catch {
      // Table might not exist, ignore
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Google Sheets sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
