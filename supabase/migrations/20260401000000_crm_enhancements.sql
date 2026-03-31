-- CRM Enhancements for Jobs and Customers
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'Medium' CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'Other' CHECK (source IN ('WhatsApp', 'Call', 'Referral', 'Website', 'Facebook', 'Other'));
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS service_report_no TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS quoted_date DATE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Add email to profiles if missing (for better team tracking)
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
-- Add phone to profiles if missing
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
