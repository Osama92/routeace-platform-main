-- Cleanup script to clear historical dispatches and invoice data for fresh import
-- Run this before re-importing from Google Sheets

-- Step 1: Delete historical dispatches (those imported from Google Sheets)
DELETE FROM public.dispatches
WHERE is_historical = true;

-- Step 2: Clear all historical invoice data
DELETE FROM public.historical_invoice_data;

-- Verify cleanup
-- SELECT COUNT(*) as remaining_historical_dispatches FROM public.dispatches WHERE is_historical = true;
-- SELECT COUNT(*) as remaining_historical_invoice_data FROM public.historical_invoice_data;
