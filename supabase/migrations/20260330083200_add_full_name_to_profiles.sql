-- Add full_name to profiles if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'profiles'
      and column_name  = 'full_name'
  ) then
    alter table public.profiles add column full_name text default '';
  end if;
end $$;
