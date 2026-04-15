-- Add CV amount and final payment fields
alter table public.jobs add column if not exists cv_amount numeric;
alter table public.jobs add column if not exists final_payment_collected numeric;
--- cv_redeemed is a boolean to track if the climate voucher was applied
alter table public.jobs add column if not exists cv_redeemed boolean default false;
