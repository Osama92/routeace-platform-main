import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Zoho API endpoints
const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com';
const ZOHO_BOOKS_URL = 'https://books.zoho.com/api/v3';

interface ZohoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getZohoAccessToken(): Promise<string> {
  const clientId = Deno.env.get('ZOHO_CLIENT_ID');
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET');
  const refreshToken = Deno.env.get('ZOHO_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Zoho credentials');
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Zoho token error:', errorText);
    throw new Error(`Failed to get Zoho access token (${response.status}): ${errorText}`);
  }

  const data: ZohoTokenResponse = await response.json();
  return data.access_token;
}

async function syncInvoiceToZoho(
  accessToken: string,
  organizationId: string,
  invoice: any,
  customerName: string
): Promise<string | null> {
  console.log('Syncing invoice to Zoho:', invoice.invoice_number);

  // First, check if customer exists in Zoho or create one
  const customersResponse = await fetch(
    `${ZOHO_BOOKS_URL}/contacts?organization_id=${organizationId}&contact_name_contains=${encodeURIComponent(customerName)}`,
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  let zohoCustomerId: string;
  const customersData = await customersResponse.json();

  if (customersData.contacts && customersData.contacts.length > 0) {
    zohoCustomerId = customersData.contacts[0].contact_id;
  } else {
    // Create customer in Zoho
    const createCustomerResponse = await fetch(
      `${ZOHO_BOOKS_URL}/contacts?organization_id=${organizationId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contact_name: customerName,
          contact_type: 'customer',
        }),
      }
    );
    const createCustomerData = await createCustomerResponse.json();
    zohoCustomerId = createCustomerData.contact?.contact_id;
    
    if (!zohoCustomerId) {
      console.error('Failed to create customer in Zoho:', createCustomerData);
      return null;
    }
  }

  // Create invoice in Zoho
  const zohoInvoiceData = {
    customer_id: zohoCustomerId,
    invoice_number: invoice.invoice_number,
    date: invoice.created_at.split('T')[0],
    due_date: invoice.due_date || undefined,
    line_items: [
      {
        name: 'Delivery Service',
        quantity: 1,
        rate: invoice.amount,
        tax_id: invoice.tax_amount > 0 ? undefined : undefined,
      },
    ],
    notes: invoice.notes || '',
    status: invoice.status === 'paid' ? 'paid' : 'draft',
  };

  const createInvoiceResponse = await fetch(
    `${ZOHO_BOOKS_URL}/invoices?organization_id=${organizationId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zohoInvoiceData),
    }
  );

  const invoiceResult = await createInvoiceResponse.json();
  
  if (invoiceResult.invoice?.invoice_id) {
    console.log('Invoice synced to Zoho:', invoiceResult.invoice.invoice_id);
    return invoiceResult.invoice.invoice_id;
  }

  console.error('Failed to create invoice in Zoho:', invoiceResult);
  return null;
}

async function syncExpenseToZoho(
  accessToken: string,
  organizationId: string,
  expense: any
): Promise<string | null> {
  console.log('Syncing expense to Zoho:', expense.description);

  const zohoExpenseData = {
    account_id: undefined, // Will use default expense account
    date: expense.expense_date,
    amount: expense.amount,
    description: expense.description,
    reference_number: expense.id,
  };

  const createExpenseResponse = await fetch(
    `${ZOHO_BOOKS_URL}/expenses?organization_id=${organizationId}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(zohoExpenseData),
    }
  );

  const expenseResult = await createExpenseResponse.json();
  
  if (expenseResult.expense?.expense_id) {
    console.log('Expense synced to Zoho:', expenseResult.expense.expense_id);
    return expenseResult.expense.expense_id;
  }

  console.error('Failed to create expense in Zoho:', expenseResult);
  return null;
}

async function fetchInvoicesFromZoho(accessToken: string, organizationId: string) {
  console.log('Fetching invoices from Zoho...');
  
  const response = await fetch(
    `${ZOHO_BOOKS_URL}/invoices?organization_id=${organizationId}`,
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();
  return data.invoices || [];
}

async function fetchExpensesFromZoho(accessToken: string, organizationId: string) {
  console.log('Fetching expenses from Zoho...');
  
  const response = await fetch(
    `${ZOHO_BOOKS_URL}/expenses?organization_id=${organizationId}`,
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const data = await response.json();
  return data.expenses || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const organizationId = Deno.env.get('ZOHO_ORGANIZATION_ID');

    if (!organizationId) {
      throw new Error('Missing ZOHO_ORGANIZATION_ID');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, invoiceId, expenseId, direction = 'to_zoho' } = await req.json();
    console.log('Zoho sync request:', { action, invoiceId, expenseId, direction });

    const accessToken = await getZohoAccessToken();

    let result: any = { success: true };

    switch (action) {
      case 'sync_invoice': {
        // Fetch invoice with customer info
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .select('*, customers(company_name)')
          .eq('id', invoiceId)
          .single();

        if (invoiceError || !invoice) {
          throw new Error(`Invoice not found: ${invoiceError?.message}`);
        }

        const zohoInvoiceId = await syncInvoiceToZoho(
          accessToken,
          organizationId,
          invoice,
          invoice.customers?.company_name || 'Unknown Customer'
        );

        if (zohoInvoiceId) {
          await supabase
            .from('invoices')
            .update({ zoho_invoice_id: zohoInvoiceId, zoho_synced_at: new Date().toISOString() })
            .eq('id', invoiceId);
          result.zoho_invoice_id = zohoInvoiceId;
        } else {
          result.success = false;
          result.error = 'Failed to sync invoice to Zoho';
        }
        break;
      }

      case 'sync_expense': {
        const { data: expense, error: expenseError } = await supabase
          .from('expenses')
          .select('*')
          .eq('id', expenseId)
          .single();

        if (expenseError || !expense) {
          throw new Error(`Expense not found: ${expenseError?.message}`);
        }

        const zohoExpenseId = await syncExpenseToZoho(accessToken, organizationId, expense);

        if (zohoExpenseId) {
          await supabase
            .from('expenses')
            .update({ zoho_expense_id: zohoExpenseId, zoho_synced_at: new Date().toISOString() })
            .eq('id', expenseId);
          result.zoho_expense_id = zohoExpenseId;
        } else {
          result.success = false;
          result.error = 'Failed to sync expense to Zoho';
        }
        break;
      }

      case 'sync_all_invoices': {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('*, customers(company_name)')
          .is('zoho_invoice_id', null);

        let synced = 0;
        let failed = 0;

        for (const invoice of invoices || []) {
          const zohoInvoiceId = await syncInvoiceToZoho(
            accessToken,
            organizationId,
            invoice,
            invoice.customers?.company_name || 'Unknown Customer'
          );

          if (zohoInvoiceId) {
            await supabase
              .from('invoices')
              .update({ zoho_invoice_id: zohoInvoiceId, zoho_synced_at: new Date().toISOString() })
              .eq('id', invoice.id);
            synced++;
          } else {
            failed++;
          }
        }

        result.synced = synced;
        result.failed = failed;
        break;
      }

      case 'sync_all_expenses': {
        const { data: expenses } = await supabase
          .from('expenses')
          .select('*')
          .is('zoho_expense_id', null);

        let synced = 0;
        let failed = 0;

        for (const expense of expenses || []) {
          const zohoExpenseId = await syncExpenseToZoho(accessToken, organizationId, expense);

          if (zohoExpenseId) {
            await supabase
              .from('expenses')
              .update({ zoho_expense_id: zohoExpenseId, zoho_synced_at: new Date().toISOString() })
              .eq('id', expense.id);
            synced++;
          } else {
            failed++;
          }
        }

        result.synced = synced;
        result.failed = failed;
        break;
      }

      case 'fetch_from_zoho': {
        const zohoInvoices = await fetchInvoicesFromZoho(accessToken, organizationId);
        const zohoExpenses = await fetchExpensesFromZoho(accessToken, organizationId);
        result.invoices = zohoInvoices;
        result.expenses = zohoExpenses;
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Zoho sync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
