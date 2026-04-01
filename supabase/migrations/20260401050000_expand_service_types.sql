-- Expand allowed service_type values for jobs table.
-- Adds: Chemical Wash, Chemical Overhaul, Gas Top-Up, Dismantling

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_service_type_check;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_service_type_check
CHECK (service_type IN (
  'Servicing',
  'Repair',
  'Installation',
  'Chemical Wash',
  'Chemical Overhaul',
  'Gas Top-Up',
  'Dismantling'
));
