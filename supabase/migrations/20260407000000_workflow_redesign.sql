-- Add unit_type to customers table
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS unit_type text CHECK (unit_type IN ('BTO', 'Resale', 'Condo', 'Landed', 'Commercial'));

-- Add site visit fields to jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS visit_time text,
  ADD COLUMN IF NOT EXISTS visit_phone text;

-- Add deposit tracking fields to jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(10, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_collected numeric(10, 2) DEFAULT 0;
