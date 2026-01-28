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
  data_type: 'dispatches' | 'customers' | 'drivers' | 'vehicles' | 'invoices' | 'expenses';
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
  const range = encodeURIComponent(`${sheetName}!A:Z`);
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
  const range = encodeURIComponent(`${sheetName}!A${startRow}`);

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
  const range = encodeURIComponent(`${sheetName}!A:Z`);

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
  const range = encodeURIComponent(`${sheetName}!A2:Z10000`);

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

      case 'import_customers':
        result = { ...result, ...(await importCustomers(supabase, accessToken, config)) };
        break;

      case 'import_drivers':
        result = { ...result, ...(await importDrivers(supabase, accessToken, config)) };
        break;

      case 'import_vehicles':
        result = { ...result, ...(await importVehicles(supabase, accessToken, config)) };
        break;

      case 'test_connection':
        // Just test that we can access the spreadsheet
        await getSheetData(accessToken, config.spreadsheet_id, config.sheet_name || 'Sheet1');
        result.message = 'Connection successful';
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
