-- Rename the 'Facebook' lead source to 'Meta' so ad-source tagging matches
-- how leads are actually acquired (Meta Lead Ads / WhatsApp CTA campaigns),
-- and so Meta-sourced leads can be filtered and exported back to the agency.

-- Backfill existing rows first, before the CHECK constraint is swapped.
UPDATE public.jobs SET source = 'Meta' WHERE source = 'Facebook';

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_check;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_source_check
  CHECK (source IN ('WhatsApp', 'Call', 'Referral', 'Website', 'Meta', 'Other'));
