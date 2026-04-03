-- Fix created_by FK to reference auth.users instead of profiles
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_created_by_fkey;
ALTER TABLE bills ADD CONSTRAINT bills_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
