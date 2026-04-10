-- Add indexes for commonly queried foreign keys to prevent sequential scans
CREATE INDEX IF NOT EXISTS idx_jobs_customer_id ON public.jobs (customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_to ON public.jobs (assigned_to);
CREATE INDEX IF NOT EXISTS idx_jobs_created_by ON public.jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_job_materials_job_id ON public.job_materials (job_id);
CREATE INDEX IF NOT EXISTS idx_job_materials_item_id ON public.job_materials (item_id);

-- Add index on frequently filtered fields
CREATE INDEX IF NOT EXISTS idx_jobs_stage ON public.jobs (stage);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON public.jobs (created_at DESC);
