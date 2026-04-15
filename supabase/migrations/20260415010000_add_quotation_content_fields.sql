-- Add quotation breakdown and materials fields so WhatsApp template content
-- flows into the PDF quotation/invoice automatically
alter table public.jobs add column if not exists quotation_breakdown text;
alter table public.jobs add column if not exists quotation_materials text;
