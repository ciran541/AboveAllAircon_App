create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.customers enable row level security;

create policy "Users can view customers" on public.customers for select using (true);
create policy "Users can insert customers" on public.customers for insert with check (true);
create policy "Users can update customers" on public.customers for update using (true);

alter table public.jobs add column customer_id uuid references public.customers(id) on delete restrict;

-- Data Migration
do $$
declare
  job_record record;
  new_customer_id uuid;
begin
  for job_record in select id, customer_name, phone, address from public.jobs where customer_name is not null loop
    select id into new_customer_id from public.customers 
      where name = job_record.customer_name limit 1;
      
    if new_customer_id is null then
      insert into public.customers (name, phone, address) 
      values (job_record.customer_name, job_record.phone, job_record.address)
      returning id into new_customer_id;
    end if;
    
    update public.jobs set customer_id = new_customer_id where id = job_record.id;
  end loop;
end;
$$;

alter table public.jobs drop column customer_name;
alter table public.jobs drop column phone;
alter table public.jobs drop column address;
