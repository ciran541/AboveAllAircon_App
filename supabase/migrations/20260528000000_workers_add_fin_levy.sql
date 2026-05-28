-- Add FIN number and levy fields to workers table
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS fin_no text DEFAULT '',
  ADD COLUMN IF NOT EXISTS levy numeric(10,2) NOT NULL DEFAULT 0;
