-- Add second visit columns
ALTER TABLE jobs 
  ADD COLUMN IF NOT EXISTS second_visit_date text,
  ADD COLUMN IF NOT EXISTS second_visit_time text;

-- Temporarily drop the trigger if exists, or just drop the check constraint 
-- Unfortunately Supabase auto-names check constraints so it's a bit tricky to drop them.
-- Assuming the constraint is named jobs_stage_check:
do $$ 
begin
  if exists (select 1 from pg_constraint where conname = 'jobs_stage_check') then
    alter table jobs drop constraint jobs_stage_check;
  end if;
end $$;

-- Let's update any existing 'New Enquiry' to 'Site Visit Scheduled'
UPDATE jobs SET stage = 'Site Visit Scheduled' WHERE stage = 'New Enquiry';

-- Add the new check constraint for stages
ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (
  stage IN (
    'Site Visit Scheduled',
    'Quotation Sent',
    'Job Scheduled',
    'In Progress',
    'Second Visit',
    'Completed'
  )
);

-- Change the default stage
ALTER TABLE jobs ALTER COLUMN stage SET DEFAULT 'Site Visit Scheduled';
