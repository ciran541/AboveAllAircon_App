-- Add payment_collected_at timestamp to jobs
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS payment_collected_at timestamp with time zone;
