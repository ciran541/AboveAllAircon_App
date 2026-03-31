-- Update jobs foreign keys to point to public.profiles instead of auth.users
-- This allows PostgREST (Supabase JS) to perform joins successfully.

DO $$
BEGIN
    -- Drop existing inline unnamed foreign keys if they exist (PostgREST usually uses these)
    -- We can't easily find unnamed ones by name, so we just add the new ones.
    -- PG allows multiple FKs on the same column.
    
    ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
    ADD CONSTRAINT jobs_assigned_to_profiles_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);

EXCEPTION
    WHEN duplicate_object THEN
        NULL; -- Fine if already exists
END $$;
