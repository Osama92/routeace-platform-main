-- Fix storage RLS policies for expense-receipts bucket
-- The old policies used auth.role() = 'authenticated' which can fail with custom JWT claims
-- Replace with auth.uid() IS NOT NULL which is more reliable

DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own receipts" ON storage.objects;

CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update their own receipts"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete their own receipts"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'expense-receipts'
  AND auth.uid() IS NOT NULL
);
