-- Allow all authenticated users to read staff profiles
-- This is necessary so they can see names of assigned technicians on jobs
CREATE POLICY "Allow authenticated users to read profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Ensure profiles exist for all users in auth.users
-- This is often done with a trigger, but I'll add a manual catch-all for existing users
-- In case some profiles are missing roles
UPDATE public.profiles SET role = 'staff' WHERE role IS NULL;
