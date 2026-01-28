-- Add 'cogs' to expense_category enum
ALTER TYPE expense_category ADD VALUE IF NOT EXISTS 'cogs';