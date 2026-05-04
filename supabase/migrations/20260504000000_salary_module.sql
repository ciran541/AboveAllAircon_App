-- ═══════════════════════════════════════════════════════════════════════════
-- Salary Module — workers, ot_entries, salary_payslips
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Workers ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  wp_number   text DEFAULT '',
  basic_salary numeric(10,2) NOT NULL DEFAULT 0,
  bank_account text DEFAULT '',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins full access workers"
ON public.workers FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Staff: read-only active workers
CREATE POLICY "Staff read active workers"
ON public.workers FOR SELECT
USING (
  is_active = true
  AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff')
);


-- ── OT Entries ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ot_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  entry_date  date NOT NULL,
  hours       numeric(5,2) NOT NULL DEFAULT 0,
  notes       text DEFAULT '',
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ot_entries ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins full access ot_entries"
ON public.ot_entries FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Staff: can read and insert
CREATE POLICY "Staff read ot_entries"
ON public.ot_entries FOR SELECT
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));

CREATE POLICY "Staff insert ot_entries"
ON public.ot_entries FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));

CREATE POLICY "Staff delete own ot_entries"
ON public.ot_entries FOR DELETE
USING (
  created_by = auth.uid()
  AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff')
);


-- ── Salary Payslips ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salary_payslips (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id       uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  month           integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year            integer NOT NULL CHECK (year >= 2020),
  -- Snapshot fields (not linked to current worker data)
  worker_name     text NOT NULL,
  wp_number       text DEFAULT '',
  basic_salary    numeric(10,2) NOT NULL DEFAULT 0,
  bank_account    text DEFAULT '',
  -- Calculation fields
  working_days    integer NOT NULL DEFAULT 26,
  ot_per_hour     numeric(10,2) NOT NULL DEFAULT 0,
  additional_3hr_ot numeric(10,2) NOT NULL DEFAULT 0,
  additional_ot   numeric(10,2) NOT NULL DEFAULT 0,
  total_ot        numeric(10,2) NOT NULL DEFAULT 0,
  total_ot_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_salary    numeric(10,2) NOT NULL DEFAULT 0,
  -- Signature
  signed_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Prevent duplicate payslips for same worker/month
  UNIQUE (worker_id, month, year)
);

ALTER TABLE public.salary_payslips ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins full access salary_payslips"
ON public.salary_payslips FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Staff: read + update (for signing)
CREATE POLICY "Staff read salary_payslips"
ON public.salary_payslips FOR SELECT
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));

CREATE POLICY "Staff sign salary_payslips"
ON public.salary_payslips FOR UPDATE
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));

-- Index for month/year lookups
CREATE INDEX IF NOT EXISTS idx_salary_payslips_month_year ON public.salary_payslips(year, month);
CREATE INDEX IF NOT EXISTS idx_ot_entries_worker_date ON public.ot_entries(worker_id, entry_date);
