-- Add 'ID' (Interior Designer referrals) as a valid jobs.source value.
-- Note: 'Meta' is unchanged here — it now displays as "YME" in the UI only
-- (see lib/constants.ts SOURCE_DISPLAY), the DB value stays 'Meta'.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_check;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_source_check
  CHECK (source IN ('WhatsApp', 'Call', 'Referral', 'Website', 'Meta', 'ID', 'Other'));
