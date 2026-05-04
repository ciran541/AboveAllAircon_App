const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://hypkgwxiefojoxhigskd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGtnd3hpZWZvam94aGlnc2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg0NDg0MywiZXhwIjoyMDkwNDIwODQzfQ.gCmkKSEk42PbQnbulL2t66ZF1szsXPqI87gmIXDRFrA',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Helper function from salaryService to generate payslips
async function createPayslips(month, year, workingDays = 26) {
  const { data: workers, error: workersError } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    
  if (!workers || workers.length === 0) return
  
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
  
  const { data: otEntries } = await supabase
    .from('ot_entries')
    .select('*')
    .gte('entry_date', startDate)
    .lt('entry_date', endDate)
    
  const otByWorker = {}
  for (const entry of (otEntries ?? [])) {
    otByWorker[entry.worker_id] = (otByWorker[entry.worker_id] ?? 0) + Number(entry.hours)
  }
  
  const payslipRows = workers.map(w => {
    const basicSalary = Number(w.basic_salary)
    const otPerHour = basicSalary / 26 / 8 * 1.5
    const additional3hrOt = workingDays * 3
    const additionalOt = otByWorker[w.id] ?? 0
    const totalOt = additional3hrOt + additionalOt
    const totalOtAmount = totalOt * otPerHour
    const totalSalary = basicSalary + totalOtAmount
    
    return {
      worker_id: w.id,
      month,
      year,
      worker_name: w.name,
      wp_number: w.wp_number ?? '',
      basic_salary: basicSalary,
      bank_account: w.bank_account ?? '',
      working_days: workingDays,
      ot_per_hour: Math.round(otPerHour * 100) / 100,
      additional_3hr_ot: additional3hrOt,
      additional_ot: additionalOt,
      total_ot: totalOt,
      total_ot_amount: Math.round(totalOtAmount * 100) / 100,
      total_salary: Math.round(totalSalary * 100) / 100,
    }
  })
  
  await supabase.from('salary_payslips').delete().eq('month', month).eq('year', year)
  await supabase.from('salary_payslips').insert(payslipRows)
}

async function run() {
  console.log('=== Adding Dummy Salary Data ===')
  
  // 1. Get admin user id for created_by
  const { data: adminProfile } = await supabase.from('profiles').select('id').eq('role', 'admin').limit(1).single()
  const adminId = adminProfile?.id || null
  
  // 2. Clear existing data
  console.log('Clearing old data...')
  await supabase.from('ot_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('salary_payslips').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('workers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  
  // 3. Add 4 workers
  console.log('Adding 4 workers...')
  const { data: workers, error: workerErr } = await supabase.from('workers').insert([
    { name: 'John Tan', wp_number: 'WP12345678', basic_salary: 1800, bank_account: 'DBS 123-45678-9' },
    { name: 'Ahmad Razali', wp_number: 'WP23456789', basic_salary: 1600, bank_account: 'POSB 987-65432-1' },
    { name: 'Muthu Kumar', wp_number: 'WP34567890', basic_salary: 2000, bank_account: 'OCBC 456-78901-2' },
    { name: 'David Lee', wp_number: 'WP45678901', basic_salary: 2200, bank_account: 'UOB 321-09876-5' },
  ]).select()
  
  if (workerErr) {
    console.error('Error adding workers:', workerErr.message)
    return
  }
  
  // 4. Add some OT entries for the current month
  console.log('Adding OT entries...')
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()
  
  const otData = [
    // John: 2 entries, total 6.5 hours
    { worker_id: workers[0].id, entry_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-05`, hours: 3.5, notes: 'Emergency repair at Bukit Batok', created_by: adminId },
    { worker_id: workers[0].id, entry_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-12`, hours: 3.0, notes: 'Late installation', created_by: adminId },
    
    // Ahmad: 3 entries, total 10 hours
    { worker_id: workers[1].id, entry_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-02`, hours: 4.0, notes: '', created_by: adminId },
    { worker_id: workers[1].id, entry_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-15`, hours: 2.0, notes: 'Cleaning job extended', created_by: adminId },
    { worker_id: workers[1].id, entry_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-20`, hours: 4.0, notes: 'Weekend call', created_by: adminId },
    
    // Muthu: 1 entry, 2 hours
    { worker_id: workers[2].id, entry_date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-10`, hours: 2.0, notes: '', created_by: adminId },
    
    // David has no additional OT
  ]
  
  await supabase.from('ot_entries').insert(otData)
  
  // 5. Generate payslips
  console.log(`Generating payslips for ${currentMonth}/${currentYear}...`)
  await createPayslips(currentMonth, currentYear)
  
  // 6. Sign one of them to show the signed state
  const { data: payslips } = await supabase.from('salary_payslips').select('id').eq('worker_id', workers[0].id).limit(1).single()
  if (payslips) {
    await supabase.from('salary_payslips').update({ signed_at: new Date().toISOString() }).eq('id', payslips.id)
  }
  
  console.log('\n✅ Dummy data added successfully!')
}

run().catch(console.error)
