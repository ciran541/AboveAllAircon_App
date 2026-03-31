create table public.jobs (
  id uuid primary key default gen_random_uuid(),

  created_by uuid references auth.users(id),
  assigned_to uuid references auth.users(id),

  stage text not null check (
    stage in (
      'New Enquiry',
      'Site Visit Scheduled',
      'Quotation Sent',
      'Job Scheduled',
      'In Progress',
      'Completed'
    )
  ) default 'New Enquiry',

  customer_name text,
  phone text,
  address text,

  service_type text check (
    service_type in ('Servicing', 'Repair', 'Installation')
  ),

  ac_brand text,
  unit_count integer,

  visit_date date,
  job_date date,

  payment_status text check (
    payment_status in ('Pending', 'Paid')
  ) default 'Pending',

  notes text,

  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.jobs enable row level security;

-- staff see only assigned jobs
create policy "Staff see assigned jobs"
on public.jobs
for select
using (
  assigned_to = auth.uid()
  OR created_by = auth.uid()
);

-- allow insert
create policy "Users can create jobs"
on public.jobs
for insert
with check (created_by = auth.uid());

-- allow update own jobs
create policy "Users update own jobs"
on public.jobs
for update
using (
  assigned_to = auth.uid()
  OR created_by = auth.uid()
);