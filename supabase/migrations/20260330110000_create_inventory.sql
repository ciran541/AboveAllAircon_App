create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text not null,
  stock_quantity integer not null default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.inventory_items enable row level security;

-- Admin can do everything on inventory
create policy "Admins have full access to inventory" on public.inventory_items
  for all using (
    auth.uid() in (select id from public.profiles where role = 'admin')
  );

-- Staff can view inventory to select items
create policy "Staff can view inventory" on public.inventory_items
  for select using (
    auth.uid() in (select id from public.profiles where role = 'staff')
  );

create table public.job_materials (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity_used integer not null check (quantity_used > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamp with time zone default now()
);

alter table public.job_materials enable row level security;

-- Anyone can view job materials if they can view the job (for simplicity, true)
create policy "Users can view job materials" on public.job_materials
  for select using (true);

-- Users can insert job materials
create policy "Users can insert job materials" on public.job_materials
  for insert with check (auth.uid() = created_by);

-- Function and trigger to auto-reduce stock securely
create or replace function reduce_inventory_stock()
returns trigger
security definer
as $$
declare
  current_stock integer;
begin
  -- Reduce stock
  update public.inventory_items
  set stock_quantity = stock_quantity - NEW.quantity_used
  where id = NEW.item_id
  returning stock_quantity into current_stock;
  
  -- Prevent negative stock
  if current_stock < 0 then
    raise exception 'Not enough stock available. Quantity requested: %, Available before deduction: %', NEW.quantity_used, current_stock + NEW.quantity_used;
  end if;

  return NEW;
end;
$$ language plpgsql;

create trigger tr_reduce_inventory_stock
  after insert on public.job_materials
  for each row
  execute function reduce_inventory_stock();
