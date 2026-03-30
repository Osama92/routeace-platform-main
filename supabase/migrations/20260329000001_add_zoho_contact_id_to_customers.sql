ALTER TABLE customers ADD COLUMN IF NOT EXISTS zoho_contact_id TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_zoho_contact_id ON customers(zoho_contact_id);
