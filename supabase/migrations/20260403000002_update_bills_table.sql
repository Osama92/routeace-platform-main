ALTER TABLE bills ADD COLUMN IF NOT EXISTS order_number text;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'due_on_receipt';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS adjustment numeric(15,2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS subtotal numeric(15,2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS tax_amount numeric(15,2) DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS line_items jsonb DEFAULT '[]';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS attachment_url text;
