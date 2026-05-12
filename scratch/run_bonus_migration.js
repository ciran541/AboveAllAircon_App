const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
const projectRef = url.replace('https://', '').split('.')[0];

const statements = [
  `CREATE TABLE IF NOT EXISTS public.bonus_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    entry_date date NOT NULL,
    amount numeric(10,2) NOT NULL DEFAULT 0,
    notes text DEFAULT '',
    created_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE public.bonus_entries ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins full access bonus_entries') THEN
      CREATE POLICY "Admins full access bonus_entries" ON public.bonus_entries FOR ALL
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
      WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff read bonus_entries') THEN
      CREATE POLICY "Staff read bonus_entries" ON public.bonus_entries FOR SELECT
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff insert bonus_entries') THEN
      CREATE POLICY "Staff insert bonus_entries" ON public.bonus_entries FOR INSERT
      WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff delete own bonus_entries') THEN
      CREATE POLICY "Staff delete own bonus_entries" ON public.bonus_entries FOR DELETE
      USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS idx_bonus_entries_worker_date ON public.bonus_entries(worker_id, entry_date)`,
  `ALTER TABLE public.salary_payslips ADD COLUMN IF NOT EXISTS signature_data text`,
  `ALTER TABLE public.salary_payslips ADD COLUMN IF NOT EXISTS total_bonus numeric(10,2) NOT NULL DEFAULT 0`,
];

async function main() {
  const { default: fetchFn } = await import('node-fetch');
  for (const sql of statements) {
    const res = await fetchFn(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ query: sql }),
    });
    const data = await res.json();
    if (data.error || (!res.ok && res.status !== 200)) {
      console.error('ERR:', res.status, JSON.stringify(data).substring(0, 200), '\nSQL:', sql.substring(0, 80));
    } else {
      console.log('OK:', sql.substring(0, 80));
    }
  }
  console.log('Migration complete.');
}
main().catch(console.error);
