const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://hypkgwxiefojoxhigskd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGtnd3hpZWZvam94aGlnc2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg0NDg0MywiZXhwIjoyMDkwNDIwODQzfQ.gCmkKSEk42PbQnbulL2t66ZF1szsXPqI87gmIXDRFrA',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const statements = [
  // Workers table
  `CREATE TABLE IF NOT EXISTS public.workers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    wp_number text DEFAULT '',
    basic_salary numeric(10,2) NOT NULL DEFAULT 0,
    bank_account text DEFAULT '',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins full access workers') THEN
      CREATE POLICY "Admins full access workers" ON public.workers FOR ALL
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
      WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff read active workers') THEN
      CREATE POLICY "Staff read active workers" ON public.workers FOR SELECT
      USING (is_active = true AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,

  // OT Entries table
  `CREATE TABLE IF NOT EXISTS public.ot_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    entry_date date NOT NULL,
    hours numeric(5,2) NOT NULL DEFAULT 0,
    notes text DEFAULT '',
    created_by uuid REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE public.ot_entries ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins full access ot_entries') THEN
      CREATE POLICY "Admins full access ot_entries" ON public.ot_entries FOR ALL
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
      WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff read ot_entries') THEN
      CREATE POLICY "Staff read ot_entries" ON public.ot_entries FOR SELECT
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff insert ot_entries') THEN
      CREATE POLICY "Staff insert ot_entries" ON public.ot_entries FOR INSERT
      WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff delete own ot_entries') THEN
      CREATE POLICY "Staff delete own ot_entries" ON public.ot_entries FOR DELETE
      USING (created_by = auth.uid() AND auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,

  // Salary Payslips table
  `CREATE TABLE IF NOT EXISTS public.salary_payslips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id uuid REFERENCES public.workers(id) ON DELETE SET NULL,
    month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
    year integer NOT NULL CHECK (year >= 2020),
    worker_name text NOT NULL,
    wp_number text DEFAULT '',
    basic_salary numeric(10,2) NOT NULL DEFAULT 0,
    bank_account text DEFAULT '',
    working_days integer NOT NULL DEFAULT 26,
    ot_per_hour numeric(10,2) NOT NULL DEFAULT 0,
    additional_3hr_ot numeric(10,2) NOT NULL DEFAULT 0,
    additional_ot numeric(10,2) NOT NULL DEFAULT 0,
    total_ot numeric(10,2) NOT NULL DEFAULT 0,
    total_ot_amount numeric(10,2) NOT NULL DEFAULT 0,
    total_salary numeric(10,2) NOT NULL DEFAULT 0,
    signed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (worker_id, month, year)
  )`,
  `ALTER TABLE public.salary_payslips ENABLE ROW LEVEL SECURITY`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins full access salary_payslips') THEN
      CREATE POLICY "Admins full access salary_payslips" ON public.salary_payslips FOR ALL
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'))
      WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff read salary_payslips') THEN
      CREATE POLICY "Staff read salary_payslips" ON public.salary_payslips FOR SELECT
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Staff sign salary_payslips') THEN
      CREATE POLICY "Staff sign salary_payslips" ON public.salary_payslips FOR UPDATE
      USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'))
      WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'staff'));
    END IF;
  END $$`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_salary_payslips_month_year ON public.salary_payslips(year, month)`,
  `CREATE INDEX IF NOT EXISTS idx_ot_entries_worker_date ON public.ot_entries(worker_id, entry_date)`,
]

async function run() {
  console.log('=== Applying Salary Module Migration ===\n')
  
  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i]
    const label = sql.substring(0, 60).replace(/\n/g, ' ').trim()
    
    const { error } = await supabase.rpc('pg_temp_exec', { query: sql })
    
    if (error) {
      // Try alternative approach - direct query via postgrest won't work for DDL
      // We need to use the SQL endpoint
      console.log(`[${i+1}/${statements.length}] ${label}...`)
      console.log(`   ⚠ RPC not available, will use Supabase Dashboard`)
    } else {
      console.log(`[${i+1}/${statements.length}] ✓ ${label}...`)
    }
  }
  
  // Check if tables exist
  console.log('\n=== Checking Tables ===')
  
  const { error: w } = await supabase.from('workers').select('id').limit(1)
  console.log('workers:', w ? `❌ ${w.message}` : '✓ exists')
  
  const { error: o } = await supabase.from('ot_entries').select('id').limit(1)
  console.log('ot_entries:', o ? `❌ ${o.message}` : '✓ exists')
  
  const { error: s } = await supabase.from('salary_payslips').select('id').limit(1)
  console.log('salary_payslips:', s ? `❌ ${s.message}` : '✓ exists')
}

run().catch(console.error)
