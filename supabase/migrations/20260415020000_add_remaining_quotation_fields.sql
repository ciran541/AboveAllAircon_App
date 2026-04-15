-- Add remaining quotation fields to support full persistence
-- This ensures that warranty details and the assigned engineer's name
-- are saved and flow correctly between the Quotation and Invoice modals.

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS quotation_warranty text,
ADD COLUMN IF NOT EXISTS engineer_name text;
