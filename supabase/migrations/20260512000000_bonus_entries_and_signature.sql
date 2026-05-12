-- ═══════════════════════════════════════════════════════════════════════════
-- Salary Module Phase 2 — bonus_entries table + payslip signature & bonus
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Bonus Entries ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bonus_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  entry_date  date NOT NULL,
  amount      numeric(10,2) NOT NULL DEFAULT 0,
  notes       text DEFAULT '',
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bonus_entries ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "Admins full access bonus_entries"
ON public.bonus_entries FOR ALL
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));

-- Staff: can read and insert
CREATE POLICY "Staff read bonus_entries"
ON public.bonus_entries FOR SELECT
USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));

CREATE POLICY "Staff insert bonus_entries"
ON public.bonus_entries FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));

CREATE POLICY "Staff delete own bonus_entries"
ON public.bonus_entries FOR DELETE
USING (
  created_by = auth.uid()
  AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff')
);

CREATE INDEX IF NOT EXISTS idx_bonus_entries_worker_date ON public.bonus_entries(worker_id, entry_date);

-- ── Add signature_data and total_bonus to salary_payslips ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'salary_payslips' AND column_name = 'signature_data'
  ) THEN
    ALTER TABLE public.salary_payslips ADD COLUMN signature_data text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'salary_payslips' AND column_name = 'total_bonus'
  ) THEN
    ALTER TABLE public.salary_payslips ADD COLUMN total_bonus numeric(10,2) NOT NULL DEFAULT 0;
  END IF;
END $$;
