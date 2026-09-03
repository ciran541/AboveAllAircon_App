-- Snapshot Sunday OT breakdown on each payslip row.
-- Allows re-reading / re-downloading with correct rates at any time.
ALTER TABLE salary_payslips
  ADD COLUMN IF NOT EXISTS weekday_ot_hours    NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekday_ot_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sunday_ot_hours     NUMERIC(8,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sunday_ot_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS sunday_ot_amount    NUMERIC(10,2) NOT NULL DEFAULT 0;
