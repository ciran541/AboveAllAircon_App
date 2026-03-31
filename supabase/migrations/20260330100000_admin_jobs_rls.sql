-- Give admins full access to jobs
create policy "Admins have full access to jobs"
on public.jobs
for all
using (
  auth.uid() in (
    select id from public.profiles where role = 'admin'
  )
);
