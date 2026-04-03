CREATE TABLE IF NOT EXISTS bills (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_number text,
  vendor_id uuid REFERENCES partners(id) ON DELETE SET NULL,
  vendor_name text,
  bill_date date NOT NULL,
  due_date date,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  paid_amount numeric(15,2) NOT NULL DEFAULT 0,
  paid_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft','open','partial','paid','overdue','void')),
  notes text,
  zoho_bill_id text,
  zoho_synced_at timestamptz,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bills_vendor_id ON bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_bill_date ON bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_zoho_bill_id ON bills(zoho_bill_id);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage bills"
  ON bills FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
