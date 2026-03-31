-- Add outcome tracking to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS loss_reason TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Update existing null statuses to 'open'
UPDATE jobs SET status = 'open' WHERE status IS NULL;
