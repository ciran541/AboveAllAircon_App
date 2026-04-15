-- Update jobs_stage_check allowed values
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_stage_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (
  stage IN (
    'Site Visit Scheduled',
    'Quotation Sent',
    'Job Scheduled',
    'In Progress',
    'Second Visit',
    'Job Done (Payment Pending)',
    'Completed'
  )
);
