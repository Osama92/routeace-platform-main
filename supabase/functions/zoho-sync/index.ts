import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Regional URL builders — all helpers receive `region` so per-org regions are honoured
const ZOHO_ACCOUNTS_URL = (region: string) => `https://accounts.zoho.${region}`;
const ZOHO_BOOKS_URL = (region: string) => `https://www.zohoapis.${region}/books/v3`;

interface ZohoCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  region: string;
}

interface ZohoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

async function getZohoAccessToken(creds: ZohoCreds): Promise<string> {
  const params = new URLSearchParams({
    refresh_token: creds.refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'refresh_token',
  });

  const response = await fetch(`${ZOHO_ACCOUNTS_URL(creds.region)}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get Zoho access token (${response.status}): ${errorText}`);
  }

  const data: ZohoTokenResponse = await response.json();
  return data.access_token;
}

// Parse line items from the notes string stored in the DB
// Format: "Description: qty x ₦price|t:tonnage|v:vatType|sc:serviceCharge|scv:serviceChargeVat; ..."
function parseLineItemsFromNotes(notes: string | null): Array<{
  description: string;
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
    const match = itemPart.match(/^(.+?)(?:\s*\([^)]+\))?\s*:\s*(\d+(?:\.\d+)?)\s*x\s*₦?([\d,]+(?:\.\d+)?)/);
    if (!match) return null;
    const meta: Record<string, string> = {};
    metaParts.forEach(m => { const [k, v] = m.split(':'); if (k && v !== undefined) meta[k.trim()] = v.trim(); });
    return {
      description: match[1].trim(),
      quantity: parseFloat(match[2]) || 1,
      price: parseFloat(match[3].replace(/,/g, '')) || 0,
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
  customerName: string,
  region: string
): Promise<string | null> {
  const customersResponse = await fetch(
    `${ZOHO_BOOKS_URL(region)}/contacts?organization_id=${organizationId}&contact_name_contains=${encodeURIComponent(customerName)}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  const customersData = await customersResponse.json();
  if (customersData.contacts && customersData.contacts.length > 0) {
    return customersData.contacts[0].contact_id;
  }
  const createCustomerResponse = await fetch(
    `${ZOHO_BOOKS_URL(region)}/contacts?organization_id=${organizationId}`,
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
      const tonnagePart = item.tonnage ? ` [${item.tonnage}]` : '';
      const rawName = `${item.description}${tonnagePart}`;
      const itemName = rawName.length > 200 ? rawName.substring(0, 197) + '...' : rawName;

      const mainRate = item.vatType === 'inclusive'
        ? Math.round((item.price / 1.075) * 100) / 100
        : item.price;

      const mainLine: any = { name: itemName, quantity: item.quantity, rate: mainRate };
      if (vatTaxId && item.vatType !== 'none') mainLine.tax_id = vatTaxId;

      const lines: any[] = [mainLine];

      if (item.serviceCharge > 0) {
        const scRate = item.serviceChargeVat === 'inclusive'
          ? Math.round((item.serviceCharge / 1.075) * 100) / 100
          : item.serviceCharge;
        const scLine: any = {
          name: (`${item.description} - Service Charge${tonnagePart}`).substring(0, 200),
          quantity: 1,
          rate: scRate,
        };
        if (vatTaxId && item.serviceChargeVat !== 'none') scLine.tax_id = vatTaxId;
        lines.push(scLine);
      }

      return lines;
    });
  }
  return [{ name: 'Delivery Service', quantity: 1, rate: invoice.amount }];
}

async function resolveVatTaxId(accessToken: string, organizationId: string, region: string): Promise<string | undefined> {
  try {
    const res = await fetch(`${ZOHO_BOOKS_URL(region)}/settings/taxes?organization_id=${organizationId}`, {
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
    });
    const data = await res.json();
    const taxes: any[] = data.taxes || [];
    const vat = taxes.find((t: any) => Math.abs(Number(t.tax_percentage) - 7.5) < 0.01)
      || taxes.find((t: any) => t.tax_name?.toLowerCase().includes('vat'));
    if (vat) return vat.tax_id;
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
  customerName: string,
  region: string
): Promise<string | null> {
  console.log('Syncing invoice to Zoho:', invoice.invoice_number);

  const zohoCustomerId = await resolveZohoCustomerId(accessToken, organizationId, customerName, region);
  if (!zohoCustomerId) return null;

  const vatTaxId = await resolveVatTaxId(accessToken, organizationId, region);
  const zohoLineItems = buildZohoLineItems(invoice, vatTaxId);
  const userNotes = invoice.notes?.includes('\n\nNotes:')
    ? invoice.notes.split('\n\nNotes:')[1].trim() : '';

  const baseInvoiceData: any = {
    customer_id: zohoCustomerId,
    date: invoice.invoice_date || invoice.created_at.split('T')[0],
    due_date: invoice.due_date || undefined,
    line_items: zohoLineItems,
    notes: userNotes || undefined,
    reason: 'Invoice updated via RouteAce platform',
  };

  if (invoice.zoho_invoice_id) {
    try {
      await fetch(
        `${ZOHO_BOOKS_URL(region)}/invoices/${invoice.zoho_invoice_id}/status/draft?organization_id=${organizationId}`,
        { method: 'POST', headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.warn('Draft status call failed (non-critical):', e);
    }

    const updateResponse = await fetch(
      `${ZOHO_BOOKS_URL(region)}/invoices/${invoice.zoho_invoice_id}?organization_id=${organizationId}`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(baseInvoiceData),
      }
    );
    const updateResult = await updateResponse.json();
    if (updateResult.invoice?.invoice_id) return updateResult.invoice.invoice_id;
    if (updateResult.code !== 1002 && updateResult.code !== 5) {
      throw new Error(updateResult.message || `Zoho PUT failed (code ${updateResult.code})`);
    }
  }

  const createPayload = { ...baseInvoiceData, invoice_number: invoice.invoice_number };
  const createResponse = await fetch(
    `${ZOHO_BOOKS_URL(region)}/invoices?organization_id=${organizationId}`,
    {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
    }
  );
  const invoiceResult = await createResponse.json();
  if (invoiceResult.invoice?.invoice_id) return invoiceResult.invoice.invoice_id;
  throw new Error(invoiceResult.message || 'Failed to create invoice in Zoho');
}

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
  region: string,
  category?: string
): Promise<string | null> {
  const targetAccountName = category ? expenseCategoryToZohoAccount[category] : null;

  const accountsResponse = await fetch(
    `${ZOHO_BOOKS_URL(region)}/chartofaccounts?organization_id=${organizationId}`,
    { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  const accountsData = await accountsResponse.json();

  if (!accountsData.chartofaccounts?.length) return null;

  const expenseAccountTypes = ['expense', 'cost_of_goods_sold'];
  const accounts = accountsData.chartofaccounts.filter((acc: any) =>
    expenseAccountTypes.includes(acc.account_type?.toLowerCase())
  );

  if (accounts.length === 0) return null;

  if (targetAccountName) {
    const match = accounts.find((acc: any) =>
      acc.account_name.toLowerCase().includes(targetAccountName.toLowerCase()) ||
      targetAccountName.toLowerCase().includes(acc.account_name.toLowerCase())
    );
    if (match) return match.account_id;
  }

  const fallbackNames = ['Miscellaneous Expenses', 'Other Expenses', 'Operating Expenses', 'General Expenses', 'Office Supplies'];
  for (const name of fallbackNames) {
    const fallback = accounts.find((acc: any) => acc.account_name.toLowerCase().includes(name.toLowerCase()));
    if (fallback) return fallback.account_id;
  }

  return accounts[0].account_id;
}

async function syncExpenseToZoho(
  accessToken: string,
  organizationId: string,
  region: string,
  expense: any,
  supabase?: any
): Promise<string | null> {
  const accountId = await getExpenseAccountId(accessToken, organizationId, region, expense.category);
  if (!accountId) throw new Error('Could not find a valid expense account in Zoho');

  const zohoExpenseData: Record<string, any> = {
    account_id: accountId,
    date: expense.expense_date,
    amount: expense.amount,
    description: expense.description || `${expense.category || 'Expense'} - ${expense.expense_date}`,
    reference_number: expense.id?.substring(0, 50),
  };

  if (expense.payment_account_id) {
    const { data: bankAccount } = await supabase
      .from('bank_accounts')
      .select('zoho_account_id')
      .eq('id', expense.payment_account_id)
      .maybeSingle();
    if (bankAccount?.zoho_account_id) {
      zohoExpenseData.paid_through_account_id = bankAccount.zoho_account_id;
    }
  }

  if (expense.notes) {
    zohoExpenseData.description = `${zohoExpenseData.description}\n${expense.notes}`;
  }

  const createExpenseResponse = await fetch(
    `${ZOHO_BOOKS_URL(region)}/expenses?organization_id=${organizationId}`,
    {
      method: 'POST',
      headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(zohoExpenseData),
    }
  );

  const expenseResult = await createExpenseResponse.json();
  if (expenseResult.expense?.expense_id) return expenseResult.expense.expense_id;
  throw new Error(`Zoho API error: ${expenseResult?.message || JSON.stringify(expenseResult)}`);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, orgId, invoiceId, expenseId, billId, direction = 'to_zoho', paymentAccountId, paymentDate } = body;

    // ── Resolve Zoho credentials ──────────────────────────────
    // 1. Try org_integrations table (per-tenant creds)
    // 2. Fall back to environment variables (Tenant 1 / legacy)
    let creds: ZohoCreds | null = null;

    if (orgId) {
      const { data: integration } = await supabase
        .from('org_integrations')
        .select('*')
        .eq('org_id', orgId)
        .maybeSingle();

      if (
        integration?.zoho_client_id &&
        integration?.zoho_client_secret &&
        integration?.zoho_refresh_token &&
        integration?.zoho_organization_id
      ) {
        creds = {
          clientId: integration.zoho_client_id,
          clientSecret: integration.zoho_client_secret,
          refreshToken: integration.zoho_refresh_token,
          organizationId: integration.zoho_organization_id,
          region: integration.zoho_region || 'com',
        };
      }
    }

    // Fallback to env vars
    if (!creds) {
      const clientId = Deno.env.get('ZOHO_CLIENT_ID');
      const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET');
      const refreshToken = Deno.env.get('ZOHO_REFRESH_TOKEN');
      const organizationId = Deno.env.get('ZOHO_ORGANIZATION_ID');
      const region = Deno.env.get('ZOHO_REGION') || 'com';

      if (!clientId || !clientSecret || !refreshToken || !organizationId) {
        throw new Error('No Zoho credentials found for this organization');
      }

      creds = { clientId, clientSecret, refreshToken, organizationId, region };
    }

    const accessToken = await getZohoAccessToken(creds);
    const { organizationId, region } = creds;

    let result: any = { success: true };

    switch (action) {
      case 'test_connection': {
        result.message = 'Successfully connected to Zoho API';
        break;
      }

      case 'sync_invoice': {
        const { data: invoice, error: invoiceError } = await supabase
          .from('invoices')
          .select('*, customers(company_name)')
          .eq('id', invoiceId)
          .single();

        if (invoiceError || !invoice) throw new Error(`Invoice not found: ${invoiceError?.message}`);

        const zohoInvoiceId = await syncInvoiceToZoho(
          accessToken, organizationId, invoice,
          invoice.customers?.company_name || 'Unknown Customer', region
        );

        if (!zohoInvoiceId) throw new Error('Failed to sync invoice to Zoho');
        await supabase.from('invoices')
          .update({ zoho_invoice_id: zohoInvoiceId, zoho_synced_at: new Date().toISOString() })
          .eq('id', invoiceId);
        result.zoho_invoice_id = zohoInvoiceId;
        result.action = invoice.zoho_invoice_id ? 'updated' : 'created';
        break;
      }

      case 'sync_expense': {
        const { data: expense, error: expenseError } = await supabase
          .from('expenses').select('*').eq('id', expenseId).single();

        if (expenseError || !expense) throw new Error(`Expense not found: ${expenseError?.message}`);
        if (expense.approval_status && expense.approval_status !== 'approved') {
          throw new Error('Expense must be approved before syncing to Zoho');
        }

        const zohoExpenseId = await syncExpenseToZoho(accessToken, organizationId, region, expense, supabase);
        await supabase.from('expenses')
          .update({ zoho_expense_id: zohoExpenseId, zoho_synced_at: new Date().toISOString() })
          .eq('id', expenseId);
        result.zoho_expense_id = zohoExpenseId;
        break;
      }

      case 'sync_all_invoices': {
        const { data: invoices } = await supabase
          .from('invoices').select('*, customers(company_name)').is('zoho_invoice_id', null);

        let synced = 0, failed = 0;
        for (const invoice of invoices || []) {
          try {
            const zohoInvoiceId = await syncInvoiceToZoho(
              accessToken, organizationId, invoice,
              invoice.customers?.company_name || 'Unknown Customer', region
            );
            if (zohoInvoiceId) {
              await supabase.from('invoices')
                .update({ zoho_invoice_id: zohoInvoiceId, zoho_synced_at: new Date().toISOString() })
                .eq('id', invoice.id);
              synced++;
            } else failed++;
          } catch { failed++; }
        }
        result.synced = synced;
        result.failed = failed;
        break;
      }

      case 'sync_all_expenses': {
        const { data: expenses } = await supabase
          .from('expenses').select('*').is('zoho_expense_id', null).eq('approval_status', 'approved');

        let synced = 0, failed = 0;
        for (const expense of expenses || []) {
          try {
            const zohoExpenseId = await syncExpenseToZoho(accessToken, organizationId, region, expense, supabase);
            if (zohoExpenseId) {
              await supabase.from('expenses')
                .update({ zoho_expense_id: zohoExpenseId, zoho_synced_at: new Date().toISOString() })
                .eq('id', expense.id);
              synced++;
            } else failed++;
          } catch { failed++; }
        }
        result.synced = synced;
        result.failed = failed;
        break;
      }

      case 'fetch_from_zoho': {
        const [invRes, expRes] = await Promise.all([
          fetch(`${ZOHO_BOOKS_URL(region)}/invoices?organization_id=${organizationId}`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
          }),
          fetch(`${ZOHO_BOOKS_URL(region)}/expenses?organization_id=${organizationId}`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
          }),
        ]);
        result.invoices = (await invRes.json()).invoices || [];
        result.expenses = (await expRes.json()).expenses || [];
        break;
      }

      case 'fetch_bank_accounts': {
        const accountsResponse = await fetch(
          `${ZOHO_BOOKS_URL(region)}/chartofaccounts?organization_id=${organizationId}`,
          { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
        );
        const accountsData = await accountsResponse.json();
        const bankAccountTypes = ['bank', 'cash', 'other_current_asset'];
        const bankAccounts = (accountsData.chartofaccounts || []).filter((acc: any) =>
          bankAccountTypes.includes(acc.account_type?.toLowerCase())
        );
        const upsertRows = bankAccounts.map((acc: any) => ({
          zoho_account_id: acc.account_id,
          name: acc.account_name,
          account_type: acc.account_type,
          currency_code: acc.currency_code || 'NGN',
          is_active: acc.is_inactive === true ? false : true,
        }));
        if (upsertRows.length > 0) {
          await supabase.from('bank_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('bank_accounts').insert(upsertRows);
        }
        result.bank_accounts = upsertRows;
        result.count = upsertRows.length;
        break;
      }

      case 'fetch_customers': {
        let page = 1;
        const allContacts: any[] = [];
        while (true) {
          const res = await fetch(
            `${ZOHO_BOOKS_URL(region)}/contacts?organization_id=${organizationId}&contact_type=customer&page=${page}&per_page=200`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          const data = await res.json();
          allContacts.push(...(data.contacts || []));
          if (!data.page_context?.has_more_page) break;
          page++;
        }

        let upserted = 0, skipped = 0;
        for (const contact of allContacts) {
          if (!contact.contact_name) { skipped++; continue; }
          const phone = contact.phone || contact.mobile || '';
          const email = contact.email || contact.contact_persons?.[0]?.email || '';
          const contactPerson = contact.contact_persons?.[0];
          const contactName = contactPerson
            ? `${contactPerson.first_name || ''} ${contactPerson.last_name || ''}`.trim() || contact.contact_name
            : contact.contact_name;

          const { data: existing } = await supabase
            .from('customers').select('id').eq('zoho_contact_id', contact.contact_id).maybeSingle();

          if (existing) {
            await supabase.from('customers').update({
              company_name: contact.contact_name,
              contact_name: contactName,
              phone: phone,
              zoho_contact_id: contact.contact_id,
            }).eq('id', existing.id);
          } else {
            const { data: byName } = await supabase
              .from('customers').select('id').ilike('company_name', contact.contact_name).maybeSingle();

            if (byName) {
              await supabase.from('customers').update({ zoho_contact_id: contact.contact_id, phone: phone || undefined }).eq('id', byName.id);
            } else {
              if (!email) { skipped++; continue; }
              await supabase.from('customers').insert({
                company_name: contact.contact_name,
                contact_name: contactName,
                email,
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

      case 'fetch_invoices': {
        let page = 1, hasMore = true, upserted = 0;
        while (hasMore) {
          const res = await fetch(
            `${ZOHO_BOOKS_URL(region)}/invoices?organization_id=${organizationId}&page=${page}&per_page=200`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          const data = await res.json();
          const zohoInvoices: any[] = data.invoices || [];
          hasMore = data.page_context?.has_more_page === true && zohoInvoices.length === 200;
          page++;

          for (const zi of zohoInvoices) {
            let customerId: string | null = null;
            if (zi.customer_name) {
              const { data: customer } = await supabase
                .from('customers').select('id').ilike('company_name', zi.customer_name).maybeSingle();
              customerId = customer?.id || null;
            }
            const invoicePayload: any = {
              invoice_number: zi.invoice_number || null,
              customer_id: customerId,
              amount: Number(zi.sub_total || 0),
              tax_amount: Number(zi.tax_total || 0),
              total_amount: Number(zi.total || 0),
              invoice_date: zi.date || new Date().toISOString().split('T')[0],
              due_date: zi.due_date || null,
              status: zi.status === 'paid' ? 'paid' : zi.status === 'void' ? 'void' : zi.status === 'draft' ? 'draft' : 'pending',
              notes: zi.notes || null,
              zoho_invoice_id: zi.invoice_id,
              zoho_synced_at: new Date().toISOString(),
            };
            const { data: existing } = await supabase
              .from('invoices').select('id').eq('zoho_invoice_id', zi.invoice_id).maybeSingle();
            if (existing) {
              await supabase.from('invoices').update(invoicePayload).eq('id', existing.id);
            } else {
              await supabase.from('invoices').insert(invoicePayload);
            }
            upserted++;
          }
        }
        result.upserted = upserted;
        break;
      }

      case 'fetch_bills': {
        let page = 1, hasMore = true, upserted = 0;
        while (hasMore) {
          const res = await fetch(
            `${ZOHO_BOOKS_URL(region)}/bills?organization_id=${organizationId}&page=${page}&per_page=200`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
          );
          const data = await res.json();
          const zohoBills: any[] = data.bills || [];
          hasMore = data.page_context?.has_more_page === true && zohoBills.length === 200;
          page++;

          for (const zb of zohoBills) {
            let vendorId: string | null = null;
            if (zb.vendor_name) {
              const { data: partner } = await supabase
                .from('partners').select('id').ilike('company_name', zb.vendor_name).maybeSingle();
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
            const { data: existing } = await supabase
              .from('bills' as any).select('id').eq('zoho_bill_id', zb.bill_id).maybeSingle();
            if (existing) {
              await supabase.from('bills' as any).update(billPayload).eq('id', existing.id);
            } else {
              await supabase.from('bills' as any).insert({ ...billPayload, paid_amount: billPayload.paid_amount || 0 });
            }
            upserted++;
          }
        }
        result.upserted = upserted;
        break;
      }

      case 'sync_bill': {
        const { data: bill, error: billErr } = await supabase
          .from('bills' as any).select('*').eq('id', billId).single();
        if (billErr || !bill) throw new Error('Bill not found: ' + billId);

        let zohoVendorId: string | null = null;
        const vendorName = (bill as any).vendor_name || '';

        if (vendorName) {
          const exactRes = await fetch(
            `${ZOHO_BOOKS_URL(region)}/contacts?organization_id=${organizationId}&contact_name=${encodeURIComponent(vendorName)}&contact_type=vendor`,
            { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
          );
          zohoVendorId = (await exactRes.json()).contacts?.[0]?.contact_id || null;

          if (!zohoVendorId) {
            const searchRes = await fetch(
              `${ZOHO_BOOKS_URL(region)}/contacts?organization_id=${organizationId}&search_text=${encodeURIComponent(vendorName)}&contact_type=vendor`,
              { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` } }
            );
            const vendorNameLower = vendorName.toLowerCase();
            const matched = ((await searchRes.json()).contacts || []).find((c: any) => {
              const n = (c.contact_name || '').toLowerCase();
              return n.includes(vendorNameLower) || vendorNameLower.includes(n);
            });
            zohoVendorId = matched?.contact_id || null;
          }

          if (!zohoVendorId) {
            const createRes = await fetch(
              `${ZOHO_BOOKS_URL(region)}/contacts?organization_id=${organizationId}`,
              {
                method: 'POST',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ contact_name: vendorName, contact_type: 'vendor' }),
              }
            );
            zohoVendorId = (await createRes.json()).contact?.contact_id || null;
            if (!zohoVendorId) throw new Error(`Failed to create vendor "${vendorName}" in Zoho`);
          }
        }

        if (!zohoVendorId) throw new Error('Vendor name is missing on this bill.');

        const coaRes = await fetch(
          `${ZOHO_BOOKS_URL(region)}/chartofaccounts?organization_id=${organizationId}`,
          { headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' } }
        );
        const allAccounts: any[] = (await coaRes.json()).chartofaccounts || [];
        const resolveAccountId = (name: string): string | undefined => {
          if (!name) return undefined;
          return allAccounts.find((a: any) =>
            a.account_name.toLowerCase() === name.toLowerCase() ||
            a.account_name.toLowerCase().includes(name.toLowerCase()) ||
            name.toLowerCase().includes(a.account_name.toLowerCase())
          )?.account_id;
        };

        const storedLines: any[] = (bill as any).line_items || [];
        const zohoLineItems = storedLines.length > 0
          ? storedLines.map((l: any) => {
              const item: any = {
                description: l.item_details || l.description || 'Line item',
                quantity: Number(l.quantity) || 1,
                rate: Number(l.rate) || 0,
              };
              const acctId = resolveAccountId(l.account) || resolveAccountId('Miscellaneous Expenses') || allAccounts[0]?.account_id;
              if (acctId) item.account_id = acctId;
              if (l.vat_type === 'exclusive') item.tax_percentage = 7.5;
              return item;
            })
          : [{ description: (bill as any).notes || 'Vendor bill', quantity: 1, rate: Number((bill as any).amount), account_id: resolveAccountId('Miscellaneous Expenses') || allAccounts[0]?.account_id }];

        const billPayload: any = {
          vendor_id: zohoVendorId,
          date: (bill as any).bill_date,
          due_date: (bill as any).due_date || undefined,
          bill_number: (bill as any).bill_number || undefined,
          notes: (bill as any).notes || undefined,
          line_items: zohoLineItems,
        };
        if ((bill as any).discount_pct && Number((bill as any).discount_pct) > 0) {
          billPayload.discount = Number((bill as any).discount_pct);
          billPayload.is_discount_before_tax = true;
          billPayload.discount_type = 'entity_level';
        }
        if ((bill as any).adjustment && Number((bill as any).adjustment) !== 0) {
          billPayload.adjustment = Number((bill as any).adjustment);
        }

        let zohoBillId = (bill as any).zoho_bill_id;
        if (zohoBillId) {
          const updateRes = await fetch(
            `${ZOHO_BOOKS_URL(region)}/bills/${zohoBillId}?organization_id=${organizationId}`,
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
          const createRes = await fetch(
            `${ZOHO_BOOKS_URL(region)}/bills?organization_id=${organizationId}`,
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
        result.zoho_bill_id = zohoBillId;
        break;
      }

      case 'sync_back_to_back': {
        const { data: expense, error: expErr } = await supabase
          .from('expenses').select('*').eq('id', expenseId).single();
        if (expErr || !expense) throw new Error(`Expense not found: ${expErr?.message}`);

        const { data: invoice, error: invErr } = await supabase
          .from('invoices').select('*, customers(company_name, zoho_contact_id)').eq('id', invoiceId).single();
        if (invErr || !invoice) throw new Error(`Invoice not found: ${invErr?.message}`);

        const zohoExpenseId = await syncExpenseToZoho(accessToken, organizationId, region, expense, supabase);
        if (zohoExpenseId) {
          await supabase.from('expenses')
            .update({ zoho_expense_id: zohoExpenseId, zoho_synced_at: new Date().toISOString() })
            .eq('id', expenseId);
        }

        const customerName = (invoice as any).customers?.company_name || 'Unknown Customer';
        const zohoInvoiceId = await syncInvoiceToZoho(accessToken, organizationId, invoice, customerName, region);
        if (zohoInvoiceId) {
          await supabase.from('invoices')
            .update({ zoho_invoice_id: zohoInvoiceId, zoho_synced_at: new Date().toISOString() })
            .eq('id', invoiceId);

          let zohoAccountId: string | null = null;
          if (paymentAccountId) {
            const { data: bankAccount } = await supabase
              .from('bank_accounts').select('zoho_account_id').eq('id', paymentAccountId).maybeSingle();
            zohoAccountId = bankAccount?.zoho_account_id || null;
          }

          const zohoContactId = (invoice as any).customers?.zoho_contact_id
            || await resolveZohoCustomerId(accessToken, organizationId, customerName, region);

          if (zohoContactId && zohoAccountId) {
            const paymentRes = await fetch(
              `${ZOHO_BOOKS_URL(region)}/customerpayments?organization_id=${organizationId}`,
              {
                method: 'POST',
                headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  customer_id: zohoContactId,
                  payment_mode: 'cash',
                  amount: invoice.total_amount,
                  date: paymentDate || new Date().toISOString().split('T')[0],
                  invoices: [{ invoice_id: zohoInvoiceId, amount_applied: invoice.total_amount }],
                  account_id: zohoAccountId,
                  description: `Back-to-back payment — ${invoice.invoice_number}`,
                }),
              }
            );
            const paymentResult = await paymentRes.json();
            if (paymentResult.code !== 0) {
              console.warn('Customer payment creation returned non-zero code:', paymentResult.message);
            }
          }
        }

        result.zoho_expense_id = zohoExpenseId;
        result.zoho_invoice_id = zohoInvoiceId;
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
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
