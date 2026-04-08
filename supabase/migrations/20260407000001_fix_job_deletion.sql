-- Fix for job deletion error

-- 1. Drop the foreign key constraint that blocks logging when a job is being deleted. 
-- Since inventory_logs is an audit table, we want to retain the job_id even after the job is deleted anyway.
ALTER TABLE public.inventory_logs
DROP CONSTRAINT IF EXISTS inventory_logs_job_id_fkey;

-- 2. Drop any existing triggers to prevent 'already exists' errors
DROP TRIGGER IF EXISTS tr_job_materials_change ON public.job_materials;
DROP TRIGGER IF EXISTS tr_job_materials_change_after ON public.job_materials;
DROP TRIGGER IF EXISTS tr_job_materials_change_before ON public.job_materials;

-- 3. Create the clean triggers safely
CREATE TRIGGER tr_job_materials_change_after
AFTER INSERT OR UPDATE ON public.job_materials
FOR EACH ROW EXECUTE FUNCTION handle_job_materials_change();

CREATE TRIGGER tr_job_materials_change_before
BEFORE DELETE ON public.job_materials
FOR EACH ROW EXECUTE FUNCTION handle_job_materials_change();
