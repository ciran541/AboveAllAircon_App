import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser } from '@/lib/auth'
import SalaryClient from './SalaryClient'

export const dynamic = 'force-dynamic'

export default async function SalaryPage() {
  const authUser = await getAuthUser()

  // Fetch initial data
  const supabase = await createClient()

  const { data: workers } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .order('name')

  // Default to current month/year
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const { data: payslips } = await supabase
    .from('salary_payslips')
    .select('*')
    .eq('month', currentMonth)
    .eq('year', currentYear)
    .order('worker_name')

  // Get OT entries for current month
  const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
  const endMonth = currentMonth === 12 ? 1 : currentMonth + 1
  const endYear = currentMonth === 12 ? currentYear + 1 : currentYear
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const { data: otEntries } = await supabase
    .from('ot_entries')
    .select('*')
    .gte('entry_date', startDate)
    .lt('entry_date', endDate)
    .order('entry_date')

  return (
    <SalaryClient
      role={authUser.role}
      userId={authUser.id}
      initialWorkers={workers ?? []}
      initialPayslips={payslips ?? []}
      initialOtEntries={otEntries ?? []}
      initialMonth={currentMonth}
      initialYear={currentYear}
    />
  )
}
