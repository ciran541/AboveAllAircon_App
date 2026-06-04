import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import AnalyticsClient from './AnalyticsClient'

export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  await requireAdmin()

  const supabase = await createClient()

  // 13 months back to cover a full rolling year + current month
  const since = new Date()
  since.setMonth(since.getMonth() - 13)
  since.setDate(1)
  since.setHours(0, 0, 0, 0)

  const [
    { data: recentJobs },
    { data: olderOpenJobs },
    { data: payslips },
    { data: pendingPaymentJobs },
  ] = await Promise.all([
    // Jobs created in the last 13 months
    supabase
      .from('jobs')
      .select('id, stage, status, service_type, source, final_payment_collected, quoted_amount, payment_status, payment_collected_at, created_at, closed_at, loss_reason, deposit_collected')
      .gte('created_at', since.toISOString())
      .order('created_at'),

    // Open jobs older than 13 months still alive in pipeline
    supabase
      .from('jobs')
      .select('id, stage, status, service_type, source, final_payment_collected, quoted_amount, payment_status, payment_collected_at, created_at, closed_at, loss_reason, deposit_collected')
      .eq('status', 'open')
      .lt('created_at', since.toISOString()),

    // Payslips — last 200 records is more than enough for a small team
    supabase
      .from('salary_payslips')
      .select('id, month, year, total_salary, basic_salary, total_ot_amount, total_bonus')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(200),

    // Pending payment jobs with customer name
    supabase
      .from('jobs')
      .select('id, service_type, quoted_amount, final_payment_collected, deposit_collected, created_at, customers(name)')
      .eq('status', 'open')
      .eq('payment_status', 'Pending')
      .order('created_at', { ascending: true })
      .limit(15),
  ])

  // Merge recent + older open jobs, deduplicating by id
  const jobMap = new Map<string, any>()
  for (const j of recentJobs ?? []) jobMap.set(j.id, j)
  for (const j of olderOpenJobs ?? []) jobMap.set(j.id, j)

  return (
    <AnalyticsClient
      jobs={Array.from(jobMap.values())}
      payslips={payslips ?? []}
      pendingPaymentJobs={pendingPaymentJobs ?? []}
    />
  )
}
