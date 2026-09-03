-- Add per-worker Sunday OT multiplier.
-- Defaults to 1.5 so all existing workers keep current behaviour.
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS sunday_ot_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5;
