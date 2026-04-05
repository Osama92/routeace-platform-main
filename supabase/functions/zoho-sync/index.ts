import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Zoho API endpoints
// Auth uses accounts.zoho.com, but API calls must use zohoapis.com domain
// Regional domains: zohoapis.com (US), zohoapis.eu (EU), zohoapis.in (India), zohoapis.com.au (Australia)
const getZohoRegion = () => Deno.env.get('ZOHO_REGION') || 'com'; // com, eu, in, com.au
const ZOHO_ACCOUNTS_URL = () => `https://accounts.zoho.${getZohoRegion()}`;
const ZOHO_BOOKS_URL = () => `https://www.zohoapis.${getZohoRegion()}/books/v3`;

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

  const response = await fetch(`${ZOHO_ACCOUNTS_URL()}/oauth/v2/token`, {
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

// Parse line items from the notes string stored in the DB
// Format: "Description (location): qty x ₦price|t:tonnage|v:vatType|sc:serviceCharge|scv:serviceChargeVat; ..."
function parseLineItemsFromNotes(notes: string | null): Array<{
  description: string;
  location: string;
  quantity: number;
  price: number;
  tonnage: string;
  vatType: string;
  serviceCharge: number;
  serviceChargeVat: string;
}> {
  if (!notes) return [];
  const itemsSection = notes.split('\n\nNotes:')[0];
  const rawItems = itemsSection.split('; ').map(raw => raw.trim()).filter(Boolean);
  const parsed = rawItems.map(raw => {
    const [itemPart, ...metaParts] = raw.split('|');
    const match = itemPart.match(/^(.+?)(?:\s*\(([^)]+)\))?\s*:\s*(\d+(?:\.\d+)?)\s*x\s*₦?([\d,]+(?:\.\d+)?)/);
    if (!match) return null;
    const meta: Record<string, string> = {};
    metaParts.forEach(m => { const [k, v] = m.split(':'); if (k && v !== undefined) meta[k.trim()] = v.trim(); });
    return {
      description: match[1].trim(),
      location: match[2] || '',
      quantity: parseFloat(match[3]) || 1,
      price: parseFloat(match[4].replace(/,/g, '')) || 0,
      tonnage: meta['t'] || '',
      vatType: meta['v'] || 'none',
      serviceCharge: meta['sc'] ? parseFloat(meta['sc']) : 0,
      serviceChargeVat: meta['scv'] || 'none',
    };
  }).filter(Boolean) as any[];
  return parsed;
}

async function resolveZohoCustomerId(
  accessToken: string,
  organizationId: string,
  customerName: string
): Promise<string | null> {
  const customersResponse = await fetch(
    `${ZOHO_BOOKS_URL()}/contacts?organization_id=${organizationId}&contact_name_contains=${encodeURIComponent(customerName)}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  const customersData = await customersResponse.json();
  if (customersData.contacts && customersData.contacts.length > 0) {
    return customersData.contacts[0].contact_id;
  }
  // Create customer in Zoho
  const createCustomerResponse = await fetch(
    `${ZOHO_BOOKS_URL()}/contacts?organization_id=${organizationId}`,
    {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_name: customerName, contact_type: 'customer' }),
    }
  );
  const createCustomerData = await createCustomerResponse.json();
  const id = createCustomerData.contact?.contact_id;
  if (!id) console.error('Failed to create customer in Zoho:', createCustomerData);
  return id || null;
}

function buildZohoLineItems(invoice: any, vatTaxId?: string): any[] {
  const parsedItems = parseLineItemsFromNotes(invoice.notes);
  if (parsedItems.length > 0) {
    return parsedItems.flatMap(item => {
      // Zoho line item: name = item/product name, description = free-text detail shown below item name
      // We put tonnage in the name so it appears in the item column, and location in description
      const tonnagePart = item.tonnage ? ` [${item.tonnage}T]` : '';
      const itemName = `${item.description}${tonnagePart}`;
      const itemDescription = item.location || undefined;

      // For inclusive VAT, extract the net rate (rate ÷ 1.075) so that when Zoho applies
      // its exclusive 7.5% on top it arrives at the same gross total as the platform.
      // Zoho does not honour is_inclusive_tax at line-item level on invoices.
      const mainRate = item.vatType === 'inclusive'
        ? Math.round((item.price / 1.075) * 100) / 100
        : item.price;

      const mainLine: any = {
        name: itemName,
        description: itemDescription,
        quantity: item.quantity,
        rate: mainRate,
      };

      // Apply VAT on main line item (always as exclusive in Zoho — rate already adjusted above)
      if (vatTaxId && item.vatType !== 'none') {
        mainLine.tax_id = vatTaxId;
      }

      const lines: any[] = [mainLine];

      if (item.serviceCharge > 0) {
        const scRate = item.serviceChargeVat === 'inclusive'
          ? Math.round((item.serviceCharge / 1.075) * 100) / 100
          : item.serviceCharge;

        const scLine: any = {
          name: `${item.description} - Service Charge${tonnagePart}`,
          description: itemDescription,
          quantity: 1,
          rate: scRate,
        };
        // Apply VAT on service charge line
        if (vatTaxId && item.serviceChargeVat !== 'none') {
          scLine.tax_id = vatTaxId;
        }
        lines.push(scLine);
      }

      return lines;
    });
  }
  return [{ name: 'Delivery Service', quantity: 1, rate: invoice.amount }];
}

async function resolveVatTaxId(accessToken: string, organizationId: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${ZOHO_BOOKS_URL()}/settings/taxes?organization_id=${organizationId}`, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    const taxes: any[] = data.taxes || [];
    // Look for a 7.5% VAT tax (Nigerian standard VAT)
    const vat = taxes.find((t: any) => Math.abs(Number(t.tax_percentage) - 7.5) < 0.01)
      || taxes.find((t: any) => t.tax_name?.toLowerCase().includes('vat'));
    if (vat) {
      console.log('Found Zoho VAT tax:', vat.tax_name, vat.tax_id);
      return vat.tax_id;
    }
    console.warn('No VAT tax found in Zoho — line item taxes will be omitted');
    return undefined;
  } catch (e) {
    console.error('Failed to fetch Zoho taxes:', e);
    return undefined;
  }
}

async function syncInvoiceToZoho(
  accessToken: string,
  organizationId: string,
  invoice: any,
  customerName: string
): Promise<string | null> {
  console.log('Syncing invoice to Zoho:', invoice.invoice_number, 'existing zoho_id:', invoice.zoho_invoice_id || 'none');

  const zohoCustomerId = await resolveZohoCustomerId(accessToken, organizationId, customerName);
  if (!zohoCustomerId) return null;

  const vatTaxId = await resolveVatTaxId(accessToken, organizationId);
  const zohoLineItems = buildZohoLineItems(invoice, vatTaxId);
  const userNotes = invoice.notes?.includes('\n\nNotes:')
    ? invoice.notes.split('\n\nNotes:')[1].trim() : '';

  // Base payload shared by create and update
  const baseInvoiceData: any = {
    customer_id: zohoCustomerId,
    date: invoice.invoice_date || invoice.created_at.split('T')[0],
    due_date: invoice.due_date || undefined,
    line_items: zohoLineItems,
    notes: userNotes || undefined,
    // Required by Zoho when updating a sent invoice
    reason: 'Invoice updated via RouteAce platform',
  };

  // If invoice already exists in Zoho → UPDATE (PUT) it instead of creating a duplicate
  // NOTE: invoice_number is intentionally omitted from PUT — Zoho treats it as immutable
  // and returns "Invoice number already exists" if you re-send it on an update.
  if (invoice.zoho_invoice_id) {
    console.log('Updating existing Zoho invoice:', invoice.zoho_invoice_id);

    // Zoho rejects PUT on sent/void invoices — try to convert back to draft first
    try {
      const markDraftResponse = await fetch(
        `${ZOHO_BOOKS_URL()}/invoices/${invoice.zoho_invoice_id}/status/draft?organization_id=${organizationId}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
        }
      );
      const draftText = await markDraftResponse.text();
      const draftResult = draftText ? JSON.parse(draftText) : {};
      if (draftResult.code !== 0) {
        console.warn('Could not mark invoice as draft before update:', draftResult.message || draftResult.code);
      }
    } catch (e) {
      console.warn('Draft status call failed (non-critical), proceeding with PUT:', e);
    }

    const updateResponse = await fetch(
      `${ZOHO_BOOKS_URL()}/invoices/${invoice.zoho_invoice_id}?organization_id=${organizationId}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(baseInvoiceData),
      }
    );
    const updateResult = await updateResponse.json();
    if (updateResult.invoice?.invoice_id) {
      console.log('Zoho invoice updated:', updateResult.invoice.invoice_id);
      return updateResult.invoice.invoice_id;
    }
    // If Zoho returns "Invoice does not exist", fall through to create a new one
    if (updateResult.code === 1002 || updateResult.code === 5) {
      console.warn('Zoho invoice not found by ID, creating new one instead');
    } else {
      console.error('Failed to update invoice in Zoho:', JSON.stringify(updateResult));
      throw new Error(updateResult.message || `Zoho PUT failed (code ${updateResult.code})`);
    }
  }

  // CREATE new invoice in Zoho (include invoice_number only on create)
  console.log('Creating new Zoho invoice');
  const createPayload = { ...baseInvoiceData, invoice_number: invoice.invoice_number };
  const createResponse = await fetch(
    `${ZOHO_BOOKS_URL()}/invoices?organization_id=${organizationId}`,
    {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
    }
  );
  const invoiceResult = await createResponse.json();

  if (invoiceResult.invoice?.invoice_id) {
    console.log('Invoice created in Zoho:', invoiceResult.invoice.invoice_id);
    return invoiceResult.invoice.invoice_id;
  }

  console.error('Failed to create invoice in Zoho:', invoiceResult);
  throw new Error(invoiceResult.message || 'Failed to create invoice in Zoho');
}

// Map RouteAce expense categories to Zoho account names
const expenseCategoryToZohoAccount: Record<string, string> = {
  'fuel': 'Fuel/Mileage Expenses',
  'maintenance': 'Repairs and Maintenance',
  'repairs': 'Repairs and Maintenance',
  'driver_salary': 'Salaries and Employee Wages',
  'employee_salary': 'Salaries and Employee Wages',
  'insurance': 'Insurance',
  'toll': 'Travel Expenses',
  'tolls': 'Travel Expenses',
  'loading': 'Cost of Goods Sold',
  'cogs': 'Cost of Goods Sold',
  'parking': 'Travel Expenses',
  'administrative': 'Office Supplies',
  'marketing': 'Advertising And Marketing',
  'utilities': 'Electricity and Gas',
  'rent': 'Rent Expense',
  'equipment': 'Equipment Rental',
  'vat': 'Tax Expense',
  'interest_payment': 'Interest Expense',
  'commission': 'Commission Expense',
  'other': 'Miscellaneous Expenses',
};

async function getExpenseAccountId(
  accessToken: string,
  organizationId: string,
  category?: string
): Promise<string | null> {
  const targetAccountName = category ? expenseCategoryToZohoAccount[category] : null;

  // Fetch ALL chart of accounts (no filter) to avoid case-sensitivity issues with account_type param
  const accountsResponse = await fetch(
    `${ZOHO_BOOKS_URL()}/chartofaccounts?organization_id=${organizationId}`,
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const accountsData = await accountsResponse.json();

  if (!accountsData.chartofaccounts || accountsData.chartofaccounts.length === 0) {
    console.error('No accounts found in Zoho Chart of Accounts');
    return null;
  }

  // Filter to only expense-type accounts (expense, cost_of_goods_sold)
  const expenseAccountTypes = ['expense', 'cost_of_goods_sold'];
  const accounts = accountsData.chartofaccounts.filter((acc: any) =>
    expenseAccountTypes.includes(acc.account_type?.toLowerCase())
  );

  console.log(`Found ${accounts.length} expense accounts in Zoho (out of ${accountsData.chartofaccounts.length} total)`);

  if (accounts.length === 0) {
    console.error('No expense-type accounts found in Zoho. Available account types:',
      [...new Set(accountsData.chartofaccounts.map((a: any) => a.account_type))]);
    return null;
  }

  // Try to find a matching account by name
  if (targetAccountName) {
    const matchingAccount = accounts.find((acc: any) =>
      acc.account_name.toLowerCase().includes(targetAccountName.toLowerCase()) ||
      targetAccountName.toLowerCase().includes(acc.account_name.toLowerCase())
    );
    if (matchingAccount) {
      console.log(`Found matching Zoho account for category "${category}":`, matchingAccount.account_name, matchingAccount.account_id);
      return matchingAccount.account_id;
    }
    console.log(`No exact match for "${targetAccountName}", trying fallbacks...`);
  }

  // Fallback: Look for common expense account names
  const fallbackNames = ['Miscellaneous Expenses', 'Other Expenses', 'Operating Expenses', 'General Expenses', 'Office Supplies'];
  for (const name of fallbackNames) {
    const fallbackAccount = accounts.find((acc: any) =>
      acc.account_name.toLowerCase().includes(name.toLowerCase())
    );
    if (fallbackAccount) {
      console.log(`Using fallback Zoho expense account:`, fallbackAccount.account_name, fallbackAccount.account_id);
      return fallbackAccount.account_id;
    }
  }

  // Last resort: use the first expense account available
  console.log(`Using first available Zoho expense account:`, accounts[0].account_name, accounts[0].account_id);
  return accounts[0].account_id;
}

async function syncExpenseToZoho(
  accessToken: string,
  organizationId: string,
  expense: any,
  supabase?: any
): Promise<string | null> {
  console.log('Syncing expense to Zoho:', expense.description);

  // Get appropriate expense account ID based on category
  const accountId = await getExpenseAccountId(accessToken, organizationId, expense.category);

  if (!accountId) {
    console.error('Could not find a valid expense account in Zoho');
    return null;
  }

  const zohoExpenseData: Record<string, any> = {
    account_id: accountId,
    date: expense.expense_date,
    amount: expense.amount,
    description: expense.description || `${expense.category || 'Expense'} - ${expense.expense_date}`,
    reference_number: expense.id?.substring(0, 50), // Zoho has a limit on reference number length
  };

  // Add paid_through_account_id if a bank account is linked
  if (expense.payment_account_id) {
    // Look up the Zoho account ID from our bank_accounts table
    const { data: bankAccount } = await supabase
      .from('bank_accounts')
      .select('zoho_account_id')
      .eq('id', expense.payment_account_id)
      .maybeSingle();
    if (bankAccount?.zoho_account_id) {
      zohoExpenseData.paid_through_account_id = bankAccount.zoho_account_id;
    }
  }

  // Add vendor if available (for driver salary expenses)
  if (expense.driver_id) {
    zohoExpenseData.vendor_name = expense.notes?.includes('Salary payment')
      ? expense.description?.split(' - ')[1]?.split(' (')[0] || 'Driver'
      : undefined;
  }

  // Add notes if available
  if (expense.notes) {
    zohoExpenseData.description = `${zohoExpenseData.description}\n${expense.notes}`;
  }

  const createExpenseResponse = await fetch(
    `${ZOHO_BOOKS_URL()}/expenses?organization_id=${organizationId}`,
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

  const errorMsg = expenseResult?.message || JSON.stringify(expenseResult);
  console.error('Failed to create expense in Zoho:', errorMsg);
  throw new Error(`Zoho API error: ${errorMsg}`);
}

async function fetchInvoicesFromZoho(accessToken: string, organizationId: string) {
  console.log('Fetching invoices from Zoho...');
  
  const response = await fetch(
    `${ZOHO_BOOKS_URL()}/invoices?organization_id=${organizationId}`,
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
    `${ZOHO_BOOKS_URL()}/expenses?organization_id=${organizationId}`,
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

    const { action, invoiceId, expenseId, billId, direction = 'to_zoho' } = await req.json();
    console.log('Zoho sync request:', { action, invoiceId, expenseId, billId, direction });

    const accessToken = await getZohoAccessToken();

    let result: any = { success: true };

    switch (action) {
      case 'test_connection': {
        // Simple test to verify credentials work
        // If getZohoAccessToken() succeeded (called above), connection is good
        result.success = true;
        result.message = 'Successfully connected to Zoho API';
        break;
      }

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

        if (!zohoInvoiceId) throw new Error('Failed to sync invoice to Zoho');
        await supabase
          .from('invoices')
          .update({ zoho_invoice_id: zohoInvoiceId, zoho_synced_at: new Date().toISOString() })
          .eq('id', invoiceId);
        result.zoho_invoice_id = zohoInvoiceId;
        result.action = invoice.zoho_invoice_id ? 'updated' : 'created';
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

        // Only sync approved expenses
        if (expense.approval_status && expense.approval_status !== 'approved') {
          throw new Error('Expense must be approved before syncing to Zoho');
        }

        const zohoExpenseId = await syncExpenseToZoho(accessToken, organizationId, expense, supabase);
        await supabase
          .from('expenses')
          .update({ zoho_expense_id: zohoExpenseId, zoho_synced_at: new Date().toISOString() })
          .eq('id', expenseId);
        result.zoho_expense_id = zohoExpenseId;
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
          .is('zoho_expense_id', null)
          .eq('approval_status', 'approved');

        let synced = 0;
        let failed = 0;

        for (const expense of expenses || []) {
          const zohoExpenseId = await syncExpenseToZoho(accessToken, organizationId, expense, supabase);

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

      case 'fetch_bank_accounts': {
        // Fetch bank and cash accounts from Zoho chart of accounts
        const accountsResponse = await fetch(
          `${ZOHO_BOOKS_URL()}/chartofaccounts?organization_id=${organizationId}`,
          {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const accountsData = await accountsResponse.json();
        const bankAccountTypes = ['bank', 'cash', 'other_current_asset'];
        const bankAccounts = (accountsData.chartofaccounts || []).filter((acc: any) =>
          bankAccountTypes.includes(acc.account_type?.toLowerCase())
        );
        // Sync into local bank_accounts table: delete all and re-insert for simplicity
        const upsertRows = bankAccounts.map((acc: any) => ({
          zoho_account_id: acc.account_id,
          name: acc.account_name,
          account_type: acc.account_type,
          currency_code: acc.currency_code || 'NGN',
          is_active: acc.is_inactive === true ? false : true,
        }));
        if (upsertRows.length > 0) {
          // Delete existing rows then insert fresh to avoid constraint issues
          await supabase.from('bank_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('bank_accounts').insert(upsertRows);
        }
        result.bank_accounts = upsertRows;
        result.count = upsertRows.length;
        break;
      }

      case 'fetch_customers': {
        // Fetch all customers (contacts of type 'customer') from Zoho and upsert into local customers table
        let page = 1;
        const allContacts: any[] = [];
        while (true) {
          const res = await fetch(
            `${ZOHO_BOOKS_URL()}/contacts?organization_id=${organizationId}&contact_type=customer&page=${page}&per_page=200`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          const data = await res.json();
          const contacts: any[] = data.contacts || [];
          allContacts.push(...contacts);
          if (!data.page_context?.has_more_page) break;
          page++;
        }

        let upserted = 0;
        let skipped = 0;
        for (const contact of allContacts) {
          if (!contact.contact_name) { skipped++; continue; }
          const phone = contact.phone || contact.mobile || '';
          const email = contact.email || contact.contact_persons?.[0]?.email || '';
          const contactPerson = contact.contact_persons?.[0];
          const contactName = contactPerson
            ? `${contactPerson.first_name || ''} ${contactPerson.last_name || ''}`.trim() || contact.contact_name
            : contact.contact_name;

          // Check if customer already exists by zoho_contact_id or company name
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('zoho_contact_id', contact.contact_id)
            .maybeSingle();

          if (existing) {
            // Update existing
            await supabase.from('customers').update({
              company_name: contact.contact_name,
              contact_name: contactName,
              email: email || existing.id, // preserve existing email if Zoho has none
              phone: phone,
              zoho_contact_id: contact.contact_id,
            }).eq('id', existing.id);
          } else {
            // Check by company name before inserting
            const { data: byName } = await supabase
              .from('customers')
              .select('id, email')
              .ilike('company_name', contact.contact_name)
              .maybeSingle();

            if (byName) {
              await supabase.from('customers').update({
                zoho_contact_id: contact.contact_id,
                phone: phone || undefined,
              }).eq('id', byName.id);
            } else {
              if (!email) { skipped++; continue; } // email is required
              await supabase.from('customers').insert({
                company_name: contact.contact_name,
                contact_name: contactName,
                email: email,
                phone: phone || 'N/A',
                zoho_contact_id: contact.contact_id,
              });
            }
          }
          upserted++;
        }

        result.total = allContacts.length;
        result.upserted = upserted;
        result.skipped = skipped;
        break;
      }

      case 'fetch_bills': {
        // Pull vendor bills from Zoho Books and upsert into local bills table
        let page = 1;
        let hasMore = true;
        let upserted = 0;

        while (hasMore) {
          const res = await fetch(
            `${ZOHO_BOOKS_URL()}/bills?organization_id=${organizationId}&page=${page}&per_page=200`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          const data = await res.json();
          const zohoBills: any[] = data.bills || [];
          hasMore = data.page_context?.has_more_page === true;
          page++;

          for (const zb of zohoBills) {
            // Try to match vendor by name to a local partner
            let vendorId: string | null = null;
            if (zb.vendor_name) {
              const { data: partner } = await supabase
                .from('partners')
                .select('id')
                .ilike('company_name', zb.vendor_name)
                .maybeSingle();
              vendorId = partner?.id || null;
            }

            const billPayload = {
              bill_number: zb.bill_number || zb.reference_number || null,
              vendor_id: vendorId,
              vendor_name: zb.vendor_name || null,
              bill_date: zb.date || new Date().toISOString().split('T')[0],
              due_date: zb.due_date || null,
              amount: Number(zb.total || 0),
              paid_amount: Number(zb.payment_made || 0),
              status: zb.status === 'paid' ? 'paid' : zb.status === 'open' ? 'open' : zb.status === 'partial' ? 'partial' : zb.status === 'void' ? 'void' : 'open',
              zoho_bill_id: zb.bill_id,
              zoho_synced_at: new Date().toISOString(),
            };

            // Upsert by zoho_bill_id
            const { data: existing } = await supabase
              .from('bills' as any)
              .select('id')
              .eq('zoho_bill_id', zb.bill_id)
              .maybeSingle();

            if (existing) {
              await supabase.from('bills' as any).update(billPayload).eq('id', existing.id);
            } else {
              await supabase.from('bills' as any).insert({ ...billPayload, paid_amount: billPayload.paid_amount || 0 });
            }
            upserted++;
          }

          if (zohoBills.length < 200) hasMore = false;
        }

        result.success = true;
        result.upserted = upserted;
        break;
      }

      case 'sync_bill': {
        // Push a local bill to Zoho Books as a vendor bill
        const { data: bill, error: billErr } = await supabase
          .from('bills' as any)
          .select('*')
          .eq('id', billId)
          .single();

        if (billErr || !bill) throw new Error('Bill not found: ' + billId);

        // Resolve vendor contact in Zoho
        let zohoVendorId: string | null = null;
        if ((bill as any).vendor_name) {
          const contactsRes = await fetch(
            `${ZOHO_BOOKS_URL()}/contacts?organization_id=${organizationId}&contact_name=${encodeURIComponent((bill as any).vendor_name)}&contact_type=vendor`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
          );
          const contactsData = await contactsRes.json();
          zohoVendorId = contactsData.contacts?.[0]?.contact_id || null;
        }

        if (!zohoVendorId) throw new Error(`Vendor "${(bill as any).vendor_name}" not found in Zoho. Please add them as a vendor contact in Zoho Books first.`);

        // Build line items from stored JSON, falling back to single line
        // Fetch chart of accounts to resolve account_id from account names
        const coaRes = await fetch(
          `${ZOHO_BOOKS_URL()}/chartofaccounts?organization_id=${organizationId}`,
          { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
        );
        const coaData = await coaRes.json();
        const allAccounts: any[] = coaData.chartofaccounts || [];

        const resolveAccountId = (name: string): string | undefined => {
          if (!name) return undefined;
          const match = allAccounts.find((a: any) =>
            a.account_name.toLowerCase() === name.toLowerCase() ||
            a.account_name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(a.account_name.toLowerCase())
          );
          return match?.account_id;
        };

        const storedLines: any[] = (bill as any).line_items || [];
        const zohoLineItems = storedLines.length > 0
          ? storedLines.map((l: any) => {
              const item: any = {
                description: l.item_details || l.description || 'Line item',
                quantity: Number(l.quantity) || 1,
                rate: Number(l.rate) || 0,
              };
              // Resolve account_id from the stored display name
              const acctId = resolveAccountId(l.account);
              if (acctId) item.account_id = acctId;
              // VAT: exclusive adds tax_percentage; inclusive = tax embedded; none = no tax
              if (l.vat_type === 'exclusive') {
                item.tax_percentage = 7.5;
              }
              return item;
            })
          : (() => {
              const fallbackAcctId = resolveAccountId('Miscellaneous Expenses') || allAccounts[0]?.account_id;
              return [{ description: (bill as any).notes || 'Vendor bill', quantity: 1, rate: Number((bill as any).amount), account_id: fallbackAcctId }];
            })();

        const billPayload: any = {
          vendor_id: zohoVendorId,
          date: (bill as any).bill_date,
          due_date: (bill as any).due_date || undefined,
          bill_number: (bill as any).bill_number || undefined,
          notes: (bill as any).notes || undefined,
          line_items: zohoLineItems,
        };

        // Apply discount if present
        if ((bill as any).discount_pct && Number((bill as any).discount_pct) > 0) {
          billPayload.discount = Number((bill as any).discount_pct);
          billPayload.is_discount_before_tax = true;
          billPayload.discount_type = 'entity_level';
        }

        // Apply adjustment if present
        if ((bill as any).adjustment && Number((bill as any).adjustment) !== 0) {
          billPayload.adjustment = Number((bill as any).adjustment);
        }

        let zohoBillId = (bill as any).zoho_bill_id;

        if (zohoBillId) {
          // Update existing
          const updateRes = await fetch(
            `${ZOHO_BOOKS_URL()}/bills/${zohoBillId}?organization_id=${organizationId}`,
            {
              method: 'PUT',
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(billPayload),
            }
          );
          const updateData = await updateRes.json();
          if (updateData.bill?.bill_id) zohoBillId = updateData.bill.bill_id;
          else throw new Error(updateData.message || 'Failed to update bill in Zoho');
        } else {
          // Create new
          const createRes = await fetch(
            `${ZOHO_BOOKS_URL()}/bills?organization_id=${organizationId}`,
            {
              method: 'POST',
              headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(billPayload),
            }
          );
          const createData = await createRes.json();
          if (createData.bill?.bill_id) zohoBillId = createData.bill.bill_id;
          else throw new Error(createData.message || 'Failed to create bill in Zoho');
        }

        await supabase.from('bills' as any)
          .update({ zoho_bill_id: zohoBillId, zoho_synced_at: new Date().toISOString() })
          .eq('id', billId);

        result.success = true;
        result.zoho_bill_id = zohoBillId;
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
    // Return 200 so supabase.functions.invoke populates `data` (not `error`),
    // allowing the frontend to read the actual error message from data.error
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
