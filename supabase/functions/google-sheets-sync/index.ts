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
  // For sheet names with spaces/special chars, we need to:
  // 1. Wrap in single quotes for the range notation
  // 2. URL-encode the entire range string properly
  // The key is to encode the quotes as part of the range
  const rangeNotation = `'${sheetName}'!A:BZ`;

  // Use encodeURIComponent but be careful - Google Sheets API sometimes has issues
  // Try using the range as a query parameter instead of path parameter
  const url = new URL(`${GOOGLE_SHEETS_API}/${spreadsheetId}/values:batchGet`);
  url.searchParams.append('ranges', rangeNotation);

  const response = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    // If batchGet fails, try the direct path approach with different encoding
    console.log('batchGet failed, trying direct path approach...', errorText);

    // Try without quotes if the sheet name has no special chars that require them
    const directRange = sheetName.includes(' ') || sheetName.includes("'")
      ? encodeURIComponent(`'${sheetName}'!A:BZ`)
      : encodeURIComponent(`${sheetName}!A:BZ`);

    const directResponse = await fetch(
      `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${directRange}`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!directResponse.ok) {
      const directErrorText = await directResponse.text();
      throw new Error(`Failed to read sheet: ${directErrorText}`);
    }

    const directData = await directResponse.json();
    return directData.values || [];
  }

  const data = await response.json();
  // batchGet returns valueRanges array
  return data.valueRanges?.[0]?.values || [];
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

// Update a specific column for multiple rows (for status updates)
async function updateColumnValues(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string,
  column: string,
  startRow: number,
  values: string[]
): Promise<void> {
  // Use single quotes around sheet name to handle spaces and special characters
  const range = encodeURIComponent(`'${sheetName}'!${column}${startRow}:${column}${startRow + values.length - 1}`);

  const response = await fetch(
    `${GOOGLE_SHEETS_API}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: values.map(v => [v]) }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to update column ${column}:`, errorText);
    // Don't throw - status update failure shouldn't fail the import
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

  // Headers matching the ACTUAL Google Sheet format (52 columns)
  // Order matches: "All Month breakdown All Biz" sheet - verified against user's actual sheet
  const headers = [
    'Transaction Type',           // 1
    'Date',                       // 2
    'Customer Name',              // 3
    'Week Num',                   // 4
    'Month',                      // 5
    'Month Name',                 // 6
    'Year',                       // 7
    '3PL Vendor',                 // 8
    'Pick off',                   // 9
    'Drop point',                 // 10
    'Route Clauster',             // 11 - Note: typo in original sheet
    'KM Covered',                 // 12
    'Tonnage Loaded',             // 13
    'Driver name',                // 14
    'Tonnage',                    // 15
    'Truck number',               // 16
    'Waybill No',                 // 17
    'No of Customers /Deliveries', // 18
    'AMOUNT (VATABLE)',           // 19
    'Amount (Not Vatable)',       // 20
    'Amount',                     // 21
    'Extra drop off',             // 22
    'Cost per Extra dropoff',     // 23
    'Total Vendor Cost (+ VAT)',  // 24
    'Sub-Total',                  // 25
    'Total Vat on Invoice',       // 26
    'Customer Invoice Number',    // 27 - First occurrence (invoice_number)
    'Total Rev Vat Incl',         // 28
    'Gross Profit',               // 29
    'WHT Payment status',         // 30
    'Vendor Bill number',         // 31
    'Vendor Invoice Status',      // 32
    'Customer Payment status',    // 33
    'Invoice Status',             // 34
    'Payment Reciept date',       // 35 - Note: typo in original sheet
    'WHT deducted',               // 36
    'Bank Payment was recieved',  // 37 - Note: typo in original sheet
    'Bank Debited',               // 38
    'Invoice Amount Paid',        // 39
    'Cutomer Invoice - Balance Owed', // 40 - Note: typo in original sheet
    'Invoice date',               // 41
    'Customer Invoice Number',    // 42 - Second occurrence (duplicate)
    'Payment Terms(Days)',        // 43
    'Due date',                   // 44
    'Invoice Paid Date',          // 45
    'Gap In Payment',             // 46
    'Invoice Ageing',             // 47
    'Vendor invoice submission date', // 48
    'Invoice Age(For Intrest Calculation)', // 49 - Note: typo in original sheet
    'Daily Rate',                 // 50
    'Total Interest on Cash - Paid', // 51
    'Total Interest on Cash - NotPaid' // 52
  ];

  // Month names for conversion
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Prepare data rows - order matches ACTUAL "All Month breakdown All Biz" sheet (52 columns)
  const rows = (transactions || []).map((t: any) => [
    t.transaction_type || '',                              // 1: Transaction Type
    t.transaction_date || '',                              // 2: Date
    t.customer_name || '',                                 // 3: Customer Name
    t.week_num || t.week_number || '',                     // 4: Week Num
    t.period_month || '',                                  // 5: Month
    t.month_name || monthNames[t.period_month] || '',      // 6: Month Name
    t.period_year || '',                                   // 7: Year
    t.vendor_name || '',                                   // 8: 3PL Vendor
    t.pick_off || t.pickup_location || '',                 // 9: Pick off
    t.drop_point || t.delivery_location || '',             // 10: Drop point
    t.route_cluster || '',                                 // 11: Route Clauster
    t.km_covered || '',                                    // 12: KM Covered
    t.tonnage_loaded || '',                                // 13: Tonnage Loaded
    t.driver_name || '',                                   // 14: Driver name
    t.tonnage || '',                                       // 15: Tonnage
    t.truck_number || '',                                  // 16: Truck number
    t.waybill_number || '',                                // 17: Waybill No
    t.num_deliveries || t.trips_count || '',               // 18: No of Customers/Deliveries
    t.amount_vatable || '',                                // 19: AMOUNT (VATABLE)
    t.amount_not_vatable || '',                            // 20: Amount (Not Vatable)
    t.total_amount || '',                                  // 21: Amount
    t.extra_dropoffs || '',                                // 22: Extra drop off
    t.extra_dropoff_cost || '',                            // 23: Cost per Extra dropoff
    t.total_vendor_cost || t.total_cost || '',             // 24: Total Vendor Cost (+ VAT)
    t.sub_total || '',                                     // 25: Sub-Total
    t.vat_amount || '',                                    // 26: Total Vat on Invoice
    t.invoice_number || '',                                // 27: Customer Invoice Number (1st)
    t.total_revenue || '',                                 // 28: Total Rev Vat Incl
    t.gross_profit || '',                                  // 29: Gross Profit
    t.wht_status || '',                                    // 30: WHT Payment status
    t.vendor_bill_number || '',                            // 31: Vendor Bill number
    t.vendor_invoice_status || '',                         // 32: Vendor Invoice Status
    t.customer_payment_status || '',                       // 33: Customer Payment status
    t.invoice_status || '',                                // 34: Invoice Status
    t.payment_receipt_date || '',                          // 35: Payment Reciept date
    t.wht_deducted || '',                                  // 36: WHT deducted
    t.bank_payment_received || '',                         // 37: Bank Payment was recieved
    t.bank_debited || '',                                  // 38: Bank Debited
    t.invoice_amount_paid || '',                           // 39: Invoice Amount Paid
    t.balance_owed || '',                                  // 40: Cutomer Invoice - Balance Owed
    t.invoice_date || '',                                  // 41: Invoice date
    t.invoice_number || '',                                // 42: Customer Invoice Number (2nd - duplicate)
    t.payment_terms_days || '',                            // 43: Payment Terms(Days)
    t.due_date || '',                                      // 44: Due date
    t.invoice_paid_date || '',                             // 45: Invoice Paid Date
    t.gap_in_payment || '',                                // 46: Gap In Payment
    t.invoice_ageing || '',                                // 47: Invoice Ageing
    t.vendor_invoice_submission_date || '',                // 48: Vendor invoice submission date
    t.invoice_age_for_interest || '',                      // 49: Invoice Age(For Intrest Calculation)
    t.daily_rate || '',                                    // 50: Daily Rate
    t.interest_paid || '',                                 // 51: Total Interest on Cash - Paid
    t.interest_not_paid || '',                             // 52: Total Interest on Cash - NotPaid
  ]);

  // Clear and update sheet
  await clearSheet(accessToken, config.spreadsheet_id, config.sheet_name);
  await updateSheetData(accessToken, config.spreadsheet_id, config.sheet_name, [headers, ...rows]);

  return { exported: rows.length };
}

// Helper functions for entity lookup (used when creating historical dispatches)
async function lookupCustomerByName(supabase: any, name: string): Promise<{ id: string } | null> {
  if (!name) return null;
  const { data } = await supabase
    .from('customers')
    .select('id')
    .ilike('company_name', `%${name}%`)
    .limit(1)
    .single();
  return data;
}

async function lookupDriverByName(supabase: any, name: string): Promise<{ id: string } | null> {
  if (!name) return null;
  const { data } = await supabase
    .from('drivers')
    .select('id')
    .ilike('full_name', `%${name}%`)
    .limit(1)
    .single();
  return data;
}

async function lookupVehicleByRegistration(supabase: any, regNumber: string): Promise<{ id: string } | null> {
  if (!regNumber) return null;
  const { data } = await supabase
    .from('vehicles')
    .select('id')
    .ilike('registration_number', `%${regNumber}%`)
    .limit(1)
    .single();
  return data;
}

async function lookupPartnerByName(supabase: any, name: string): Promise<{ id: string } | null> {
  if (!name) return null;
  const { data } = await supabase
    .from('partners')
    .select('id')
    .ilike('company_name', `%${name}%`)
    .limit(1)
    .single();
  return data;
}

// Create historical dispatch from transaction data
async function createHistoricalDispatch(
  supabase: any,
  transactionId: string,
  transactionData: any,
  rowIndex: number
): Promise<{ success: boolean; error?: string; details?: any }> {
  try {
    console.log(`[createHistoricalDispatch] Processing row ${rowIndex}, transactionId: ${transactionId}`);
    console.log(`[createHistoricalDispatch] Input data:`, {
      customer_name: transactionData.customer_name,
      driver_name: transactionData.driver_name,
      truck_number: transactionData.truck_number,
      pickup: transactionData.pickup_location || transactionData.pick_off,
      dropoff: transactionData.delivery_location || transactionData.drop_point,
      transaction_date: transactionData.transaction_date
    });

    // Check if dispatch already exists for this transaction
    const { data: existingDispatch } = await supabase
      .from('dispatches')
      .select('id')
      .eq('historical_transaction_id', transactionId)
      .single();

    if (existingDispatch) {
      console.log(`[createHistoricalDispatch] Dispatch already exists for transaction ${transactionId}, skipping`);
      return { success: true, details: { skipped: true, existingDispatchId: existingDispatch.id } };
    }

    // Lookup related entities by name
    console.log(`[createHistoricalDispatch] Looking up customer: "${transactionData.customer_name}"`);
    let customer = await lookupCustomerByName(supabase, transactionData.customer_name);
    console.log(`[createHistoricalDispatch] Customer lookup result:`, customer);
    let customerAutoCreated = false;

    // If customer not found, auto-create it
    if (!customer?.id && transactionData.customer_name) {
      console.log(`[createHistoricalDispatch] Customer not found, auto-creating: "${transactionData.customer_name}"`);
      const { data: newCustomer, error: createError } = await supabase
        .from('customers')
        .insert({
          company_name: transactionData.customer_name.trim(),
          status: 'active',
          notes: 'Auto-created from Google Sheets import'
        })
        .select('id')
        .single();

      if (createError) {
        console.error(`[createHistoricalDispatch] Failed to create customer:`, createError);
        return {
          success: false,
          error: `Failed to create customer "${transactionData.customer_name}": ${createError.message}`,
          details: {
            skipped: true,
            reason: 'customer_creation_failed',
            customerName: transactionData.customer_name,
            errorDetails: createError
          }
        };
      }

      customer = newCustomer;
      customerAutoCreated = true;
      console.log(`[createHistoricalDispatch] Auto-created customer with ID:`, customer?.id);
    }

    // customer_id is required in dispatches table - skip if still not available
    if (!customer?.id) {
      console.log(`[createHistoricalDispatch] No customer available for "${transactionData.customer_name}", skipping dispatch creation`);
      return {
        success: false,
        error: `No customer available for "${transactionData.customer_name}"`,
        details: {
          skipped: true,
          reason: 'customer_not_found',
          customerName: transactionData.customer_name,
          hint: 'Customer name may be empty or invalid'
        }
      };
    }

    console.log(`[createHistoricalDispatch] Looking up driver: "${transactionData.driver_name}"`);
    const driver = await lookupDriverByName(supabase, transactionData.driver_name);
    console.log(`[createHistoricalDispatch] Driver lookup result:`, driver);

    console.log(`[createHistoricalDispatch] Looking up vehicle: "${transactionData.truck_number}"`);
    const vehicle = await lookupVehicleByRegistration(supabase, transactionData.truck_number);
    console.log(`[createHistoricalDispatch] Vehicle lookup result:`, vehicle);

    // Generate dispatch number
    const dateStr = transactionData.transaction_date
      ? transactionData.transaction_date.replace(/-/g, '')
      : `${transactionData.period_year}${String(transactionData.period_month).padStart(2, '0')}`;
    const dispatchNumber = `HST-${dateStr}-${String(rowIndex).padStart(4, '0')}`;

    // Create the historical dispatch
    const dispatchData = {
      dispatch_number: dispatchNumber,
      customer_id: customer.id,
      driver_id: driver?.id || null,
      vehicle_id: vehicle?.id || null,
      pickup_address: transactionData.pickup_location || transactionData.pick_off || 'N/A',
      delivery_address: transactionData.delivery_location || transactionData.drop_point || 'N/A',
      distance_km: transactionData.km_covered || null,
      cargo_weight_kg: transactionData.tonnage_loaded || null,
      cost: transactionData.total_amount || transactionData.total_revenue || null,
      status: 'delivered',
      actual_delivery: transactionData.transaction_date || null,
      is_historical: true,
      historical_transaction_id: transactionId,
      import_source: 'google_sheets',
      notes: `Imported from Google Sheets${transactionData.invoice_number ? ` - Invoice: ${transactionData.invoice_number}` : ''}${transactionData.waybill_number ? ` - Waybill: ${transactionData.waybill_number}` : ''}`,
    };

    console.log(`[createHistoricalDispatch] Inserting dispatch:`, dispatchData);

    const { data: insertedDispatch, error: dispatchError } = await supabase
      .from('dispatches')
      .insert(dispatchData)
      .select('id')
      .single();

    if (dispatchError) {
      console.error('[createHistoricalDispatch] Failed to create dispatch:', dispatchError);
      return {
        success: false,
        error: dispatchError.message,
        details: {
          dispatchData,
          errorCode: dispatchError.code,
          errorDetails: dispatchError.details
        }
      };
    }

    console.log(`[createHistoricalDispatch] Successfully created dispatch:`, insertedDispatch?.id);
    return {
      success: true,
      details: {
        dispatchId: insertedDispatch?.id,
        dispatchNumber,
        linkedCustomer: !!customer,
        linkedDriver: !!driver,
        linkedVehicle: !!vehicle,
        customerAutoCreated,
        customerName: customerAutoCreated ? transactionData.customer_name : undefined
      }
    };
  } catch (err: any) {
    console.error('[createHistoricalDispatch] Exception:', err);
    return { success: false, error: err.message, details: { exception: true } };
  }
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
  let duplicatesSkipped = 0;
  let dispatchesCreated = 0;
  let dispatchesSkipped = 0;
  let customersAutoCreated = 0;
  const errors: string[] = [];
  const skipReasons: string[] = [];
  const duplicateReasons: string[] = [];
  const missingCustomers: string[] = [];
  const autoCreatedCustomerNames: string[] = [];

  // Track import status for each row to write back to Google Sheet
  // Format: { rowIndex: number, status: string, message: string }
  const rowStatuses: { rowIndex: number; status: string; message: string }[] = [];

  // Helper to convert column number to letter (1=A, 2=B, ..., 27=AA, etc.)
  const colNumToLetter = (num: number): string => {
    let result = '';
    while (num > 0) {
      num--;
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26);
    }
    return result;
  };

  // Dynamically determine status columns - place them right after the last header
  // This ensures they're visible next to your data, not way out at column CA
  const lastHeaderCol = headers.length; // Number of columns with headers
  const STATUS_COLUMN = colNumToLetter(lastHeaderCol + 1); // Column right after headers
  const MESSAGE_COLUMN = colNumToLetter(lastHeaderCol + 2); // Column after status
  console.log(`[importTransactions] Status columns: ${STATUS_COLUMN} (status), ${MESSAGE_COLUMN} (message). Headers count: ${lastHeaderCol}`);

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
        rowStatuses.push({ rowIndex: i, status: 'SKIPPED', message: 'Empty row - no customer name' });
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
        route_cluster: getVal(row, 'route cluster', 'route clauster', 'route'),
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
        balance_owed: parseNum(getVal(row, 'customer invoice - balance owed', 'cutomer invoice - balance owed', 'balance owed')),

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

      // Check for duplicate before inserting
      // Use combination of: customer_name + transaction_date + invoice_number (primary)
      // Or: customer_name + transaction_date + pickup + dropoff (fallback if no invoice)
      let duplicateQuery = supabase
        .from('historical_invoice_data')
        .select('id')
        .eq('customer_name', transactionData.customer_name);

      if (transactionData.transaction_date) {
        duplicateQuery = duplicateQuery.eq('transaction_date', transactionData.transaction_date);
      }

      if (transactionData.invoice_number) {
        // Primary duplicate check: customer + date + invoice number
        duplicateQuery = duplicateQuery.eq('invoice_number', transactionData.invoice_number);
      } else if (transactionData.pickup_location || transactionData.pick_off) {
        // Fallback: customer + date + pickup + dropoff
        const pickup = transactionData.pickup_location || transactionData.pick_off;
        const dropoff = transactionData.delivery_location || transactionData.drop_point;
        if (pickup) duplicateQuery = duplicateQuery.eq('pickup_location', pickup);
        if (dropoff) duplicateQuery = duplicateQuery.eq('delivery_location', dropoff);
      }

      const { data: existingRecord } = await duplicateQuery.limit(1).single();

      if (existingRecord) {
        duplicatesSkipped++;
        if (duplicateReasons.length < 10) {
          duplicateReasons.push(`Row ${i + 2}: ${transactionData.customer_name} - ${transactionData.transaction_date || 'no date'} - ${transactionData.invoice_number || 'no invoice'}`);
        }
        rowStatuses.push({ rowIndex: i, status: 'DUPLICATE', message: 'Already imported' });
        continue; // Skip this row, it's a duplicate
      }

      // Insert transaction and get the ID back
      const { data: insertedData, error } = await supabase
        .from('historical_invoice_data')
        .insert(transactionData)
        .select('id')
        .single();

      if (error) {
        console.error(`Row ${i + 2} insert error:`, error);
        throw error;
      }

      // Create historical dispatch for this transaction
      if (insertedData?.id) {
        const dispatchResult = await createHistoricalDispatch(
          supabase,
          insertedData.id,
          transactionData,
          i + 1
        );
        if (dispatchResult.success) {
          dispatchesCreated++;
          // Track auto-created customers
          if (dispatchResult.details?.customerAutoCreated) {
            customersAutoCreated++;
            const custName = dispatchResult.details?.customerName;
            if (custName && !autoCreatedCustomerNames.includes(custName)) {
              autoCreatedCustomerNames.push(custName);
            }
            rowStatuses.push({ rowIndex: i, status: 'SUCCESS', message: `Imported + Customer "${custName}" auto-created` });
          } else {
            rowStatuses.push({ rowIndex: i, status: 'SUCCESS', message: 'Imported successfully' });
          }
        } else {
          dispatchesSkipped++;
          // Track missing customers for the report
          if (dispatchResult.details?.reason === 'customer_not_found' && missingCustomers.length < 20) {
            const custName = dispatchResult.details?.customerName || transactionData.customer_name;
            if (custName && !missingCustomers.includes(custName)) {
              missingCustomers.push(custName);
            }
          }
          rowStatuses.push({ rowIndex: i, status: 'PARTIAL', message: `Data imported but dispatch failed: ${dispatchResult.error}` });
          console.warn(`Row ${i + 2}: Transaction imported but dispatch creation skipped: ${dispatchResult.error}`);
        }
      }

      imported++;
    } catch (err: any) {
      const errorMsg = err.message || err.details || JSON.stringify(err);
      errors.push(`Row ${i + 2}: ${errorMsg}`);
      rowStatuses.push({ rowIndex: i, status: 'ERROR', message: errorMsg });
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

  // Write import status back to Google Sheet
  // First, add headers for status columns if not present
  let statusWriteResult = { success: false, message: '' };
  try {
    // Calculate the actual row numbers in the sheet (headerRowIndex + 1 for header, then +1 for each data row)
    const dataStartRow = headerRowIndex + 2; // +1 for 0-index, +1 for header row itself

    console.log(`[importTransactions] Writing status to sheet. HeaderRowIndex: ${headerRowIndex}, DataStartRow: ${dataStartRow}, DataRows: ${dataRows.length}, Statuses tracked: ${rowStatuses.length}`);

    // Prepare status and message arrays aligned to row positions
    const statusValues: string[] = [];
    const messageValues: string[] = [];

    // First add header row values for status columns
    // We need to write status for each data row
    for (let i = 0; i < dataRows.length; i++) {
      const rowStatus = rowStatuses.find(rs => rs.rowIndex === i);
      if (rowStatus) {
        statusValues.push(rowStatus.status);
        messageValues.push(rowStatus.message);
      } else {
        statusValues.push(''); // No status recorded for this row
        messageValues.push('');
      }
    }

    console.log(`[importTransactions] Prepared ${statusValues.length} status values. Sample: ${statusValues.slice(0, 3).join(', ')}`);

    // Write status header first (one row before data)
    console.log(`[importTransactions] Writing header to ${STATUS_COLUMN}${headerRowIndex + 1} and ${MESSAGE_COLUMN}${headerRowIndex + 1}`);
    await updateColumnValues(accessToken, config.spreadsheet_id, config.sheet_name, STATUS_COLUMN, headerRowIndex + 1, ['Import Status']);
    await updateColumnValues(accessToken, config.spreadsheet_id, config.sheet_name, MESSAGE_COLUMN, headerRowIndex + 1, ['Import Message']);

    // Write status values for each data row
    if (statusValues.length > 0) {
      console.log(`[importTransactions] Writing status values to ${STATUS_COLUMN}${dataStartRow}:${STATUS_COLUMN}${dataStartRow + statusValues.length - 1}`);
      await updateColumnValues(accessToken, config.spreadsheet_id, config.sheet_name, STATUS_COLUMN, dataStartRow, statusValues);
      await updateColumnValues(accessToken, config.spreadsheet_id, config.sheet_name, MESSAGE_COLUMN, dataStartRow, messageValues);
    }

    statusWriteResult = { success: true, message: `Status written to columns ${STATUS_COLUMN} and ${MESSAGE_COLUMN}` };
    console.log(`[importTransactions] Status write completed successfully`);
  } catch (statusErr: any) {
    console.error('[importTransactions] Failed to write status to Google Sheet:', statusErr);
    statusWriteResult = { success: false, message: statusErr.message || 'Failed to write status' };
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

  // Count historical dispatches created
  const { count: dispatchCount } = await supabase
    .from('dispatches')
    .select('*', { count: 'exact', head: true })
    .eq('is_historical', true);

  return {
    imported,
    skipped,
    duplicatesSkipped,
    dispatchesCreated,
    dispatchesSkipped,
    customersAutoCreated,
    errors: errors.slice(0, 10), // Limit errors to first 10
    missingCustomers: missingCustomers.length > 0 ? missingCustomers : undefined,
    autoCreatedCustomers: autoCreatedCustomerNames.length > 0 ? autoCreatedCustomerNames : undefined,
    duplicatesSample: duplicateReasons.length > 0 ? duplicateReasons : undefined,
    statusUpdate: statusWriteResult,
    debug: {
      totalRows: rows.length,
      headerRowIndex: headerRowIndex,
      dataRows: dataRows.length,
      headersFound: headers.slice(0, 15),
      skipReasons: skipReasons,
      sheetName: config.sheet_name,
      firstRowSample: firstRowSample,
      statusColumns: `${STATUS_COLUMN} (Import Status), ${MESSAGE_COLUMN} (Import Message)`,
      // Add error summary to debug for visibility
      errorCount: errors.length,
      firstError: errors[0] || 'No errors',
      duplicateNote: duplicatesSkipped > 0
        ? `${duplicatesSkipped} rows were skipped because they already exist in the database.`
        : undefined,
      dispatchNote: dispatchesSkipped > 0
        ? `${dispatchesSkipped} dispatches were not created because their customers don't exist in the system or have empty names.`
        : undefined,
      autoCreateNote: customersAutoCreated > 0
        ? `${customersAutoCreated} customers were auto-created during import.`
        : undefined
    },
    verification: {
      totalRecordsInTable: totalCount,
      countError: countError?.message || null,
      recentlyImported: recentRecords || [],
      recentError: recentError?.message || null,
      totalHistoricalDispatches: dispatchCount || 0
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

  // Create row data matching the ACTUAL Google Sheet format (52 columns - same as exportTransactions)
  const t = transaction;
  const rowData = [
    t.transaction_type || '',                              // 1: Transaction Type
    t.transaction_date || '',                              // 2: Date
    t.customer_name || '',                                 // 3: Customer Name
    t.week_num || t.week_number || '',                     // 4: Week Num
    t.period_month || '',                                  // 5: Month
    t.month_name || monthNames[t.period_month] || '',      // 6: Month Name
    t.period_year || '',                                   // 7: Year
    t.vendor_name || '',                                   // 8: 3PL Vendor
    t.pick_off || t.pickup_location || '',                 // 9: Pick off
    t.drop_point || t.delivery_location || '',             // 10: Drop point
    t.route_cluster || '',                                 // 11: Route Clauster
    t.km_covered || '',                                    // 12: KM Covered
    t.tonnage_loaded || '',                                // 13: Tonnage Loaded
    t.driver_name || '',                                   // 14: Driver name
    t.tonnage || '',                                       // 15: Tonnage
    t.truck_number || '',                                  // 16: Truck number
    t.waybill_number || '',                                // 17: Waybill No
    t.num_deliveries || t.trips_count || '',               // 18: No of Customers/Deliveries
    t.amount_vatable || '',                                // 19: AMOUNT (VATABLE)
    t.amount_not_vatable || '',                            // 20: Amount (Not Vatable)
    t.total_amount || '',                                  // 21: Amount
    t.extra_dropoffs || '',                                // 22: Extra drop off
    t.extra_dropoff_cost || '',                            // 23: Cost per Extra dropoff
    t.total_vendor_cost || t.total_cost || '',             // 24: Total Vendor Cost (+ VAT)
    t.sub_total || '',                                     // 25: Sub-Total
    t.vat_amount || '',                                    // 26: Total Vat on Invoice
    t.invoice_number || '',                                // 27: Customer Invoice Number (1st)
    t.total_revenue || '',                                 // 28: Total Rev Vat Incl
    t.gross_profit || '',                                  // 29: Gross Profit
    t.wht_status || '',                                    // 30: WHT Payment status
    t.vendor_bill_number || '',                            // 31: Vendor Bill number
    t.vendor_invoice_status || '',                         // 32: Vendor Invoice Status
    t.customer_payment_status || '',                       // 33: Customer Payment status
    t.invoice_status || '',                                // 34: Invoice Status
    t.payment_receipt_date || '',                          // 35: Payment Reciept date
    t.wht_deducted || '',                                  // 36: WHT deducted
    t.bank_payment_received || '',                         // 37: Bank Payment was recieved
    t.bank_debited || '',                                  // 38: Bank Debited
    t.invoice_amount_paid || '',                           // 39: Invoice Amount Paid
    t.balance_owed || '',                                  // 40: Cutomer Invoice - Balance Owed
    t.invoice_date || '',                                  // 41: Invoice date
    t.invoice_number || '',                                // 42: Customer Invoice Number (2nd - duplicate)
    t.payment_terms_days || '',                            // 43: Payment Terms(Days)
    t.due_date || '',                                      // 44: Due date
    t.invoice_paid_date || '',                             // 45: Invoice Paid Date
    t.gap_in_payment || '',                                // 46: Gap In Payment
    t.invoice_ageing || '',                                // 47: Invoice Ageing
    t.vendor_invoice_submission_date || '',                // 48: Vendor invoice submission date
    t.invoice_age_for_interest || '',                      // 49: Invoice Age(For Intrest Calculation)
    t.daily_rate || '',                                    // 50: Daily Rate
    t.interest_paid || '',                                 // 51: Total Interest on Cash - Paid
    t.interest_not_paid || '',                             // 52: Total Interest on Cash - NotPaid
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

      case 'preview_sheet': {
        // Preview sheet data without importing - helps debug what's in the sheet
        console.log('[preview_sheet] Fetching sheet data for preview...');
        const previewRows = await getSheetData(accessToken, config.spreadsheet_id, config.sheet_name);

        // Find header row
        let headerRowIndex = -1;
        const headerKeywords = ['customer name', 'customer', 'year', 'month', 'transaction type', 'date'];

        for (let i = 0; i < Math.min(previewRows.length, 20); i++) {
          const row = previewRows[i] || [];
          if (row.length === 0 || row.every((cell: any) => !cell || String(cell).trim() === '')) {
            continue;
          }
          const rowLower = row.map((cell: any) => String(cell || '').toLowerCase().trim());
          const matchCount = headerKeywords.filter(keyword => rowLower.includes(keyword)).length;
          if (matchCount >= 2) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = headerRowIndex >= 0 ? previewRows[headerRowIndex] : [];
        const dataStartIndex = headerRowIndex >= 0 ? headerRowIndex + 1 : 1;
        const sampleDataRows = previewRows.slice(dataStartIndex, dataStartIndex + 5);

        result = {
          success: true,
          preview: {
            totalRows: previewRows.length,
            headerRowIndex: headerRowIndex,
            headers: headers?.slice(0, 20), // First 20 headers
            headerCount: headers?.length || 0,
            dataRowsCount: previewRows.length - dataStartIndex,
            sampleRows: sampleDataRows.map((row: any[], idx: number) => ({
              rowNumber: dataStartIndex + idx + 1,
              cells: row?.slice(0, 15)?.map((cell: any) => String(cell || '').substring(0, 50))
            })),
            rawFirst5Rows: previewRows.slice(0, 5).map((row: any[], idx: number) => ({
              rowNumber: idx + 1,
              firstCells: row?.slice(0, 10)?.map((cell: any) => String(cell || '').substring(0, 30))
            }))
          }
        };
        break;
      }

      case 'diagnose_imports': {
        // Diagnose why historical dispatches may not be showing
        console.log('[diagnose_imports] Running diagnostic checks...');

        // Check historical_invoice_data count
        const { count: transactionCount, error: txErr } = await supabase
          .from('historical_invoice_data')
          .select('*', { count: 'exact', head: true });

        // Check dispatches with is_historical = true
        const { data: historicalDispatches, count: historicalCount, error: dispErr } = await supabase
          .from('dispatches')
          .select('id, dispatch_number, customer_id, driver_id, vehicle_id, status, is_historical, import_source, created_at', { count: 'exact' })
          .eq('is_historical', true)
          .order('created_at', { ascending: false })
          .limit(10);

        // Check all dispatches count
        const { count: totalDispatchCount } = await supabase
          .from('dispatches')
          .select('*', { count: 'exact', head: true });

        // Get sample of transactions that should have dispatches
        const { data: sampleTransactions } = await supabase
          .from('historical_invoice_data')
          .select('id, customer_name, driver_name, truck_number, transaction_date, period_year, period_month')
          .order('imported_at', { ascending: false })
          .limit(5);

        // Check if dispatches exist for these transactions
        const transactionDispatchStatus = [];
        for (const tx of sampleTransactions || []) {
          const { data: linkedDispatch } = await supabase
            .from('dispatches')
            .select('id, dispatch_number')
            .eq('historical_transaction_id', tx.id)
            .single();

          transactionDispatchStatus.push({
            transaction_id: tx.id,
            customer_name: tx.customer_name,
            driver_name: tx.driver_name,
            truck_number: tx.truck_number,
            has_linked_dispatch: !!linkedDispatch,
            dispatch_id: linkedDispatch?.id || null,
            dispatch_number: linkedDispatch?.dispatch_number || null
          });
        }

        // Check customer/driver/vehicle counts for matching
        const { count: customerCount } = await supabase
          .from('customers')
          .select('*', { count: 'exact', head: true });

        const { count: driverCount } = await supabase
          .from('drivers')
          .select('*', { count: 'exact', head: true });

        const { count: vehicleCount } = await supabase
          .from('vehicles')
          .select('*', { count: 'exact', head: true });

        result = {
          success: true,
          diagnosis: {
            transactions: {
              totalCount: transactionCount || 0,
              error: txErr?.message || null
            },
            dispatches: {
              totalCount: totalDispatchCount || 0,
              historicalCount: historicalCount || 0,
              error: dispErr?.message || null,
              recentHistorical: historicalDispatches || []
            },
            entityCounts: {
              customers: customerCount || 0,
              drivers: driverCount || 0,
              vehicles: vehicleCount || 0
            },
            transactionDispatchLinking: transactionDispatchStatus,
            recommendations: []
          }
        };

        // Add recommendations based on findings
        const recs = result.diagnosis.recommendations;
        if (transactionCount === 0) {
          recs.push('No transactions found in historical_invoice_data. Import transactions first.');
        }
        if (transactionCount > 0 && historicalCount === 0) {
          recs.push('Transactions exist but no historical dispatches. Check createHistoricalDispatch function logs.');
        }
        if (customerCount === 0) {
          recs.push('No customers in database. Import/create customers first so dispatches can be linked.');
        }
        if (historicalCount > 0 && historicalCount < transactionCount) {
          recs.push(`Only ${historicalCount} of ${transactionCount} transactions have dispatches. Some may have failed to create.`);
        }
        break;
      }

      case 'test_connection': {
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
      }

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
