/**
 * app/services/salaryService.ts
 *
 * Server-only domain service for salary module.
 * All direct Supabase mutations for workers, OT entries, and payslips live here.
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

function invalidateSalaryCaches() {
  revalidatePath('/dashboard/salary')
}

// ── Workers ───────────────────────────────────────────────────────────────────

export async function getWorkers() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) return { error: error.message, workers: [] }
  return { workers: data ?? [] }
}

export async function createWorker(worker: {
  name: string
  wp_number?: string
  basic_salary: number
  bank_account?: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workers')
    .insert([{
      name: worker.name,
      wp_number: worker.wp_number ?? '',
      basic_salary: worker.basic_salary,
      bank_account: worker.bank_account ?? '',
    }])
    .select()
    .single()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { worker: data }
}

export async function updateWorker(
  id: string,
  updates: Partial<{
    name: string
    wp_number: string
    basic_salary: number
    bank_account: string
  }>
) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { worker: data }
}

export async function deleteWorker(id: string) {
  const supabase = await createClient()
  // Soft-delete
  const { error } = await supabase
    .from('workers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { success: true }
}

// ── OT Entries ────────────────────────────────────────────────────────────────

export async function getOtEntries(month: number, year: number) {
  const supabase = await createClient()

  // Calculate date range for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('ot_entries')
    .select('*')
    .gte('entry_date', startDate)
    .lt('entry_date', endDate)
    .order('entry_date', { ascending: true })

  if (error) return { error: error.message, entries: [] }
  return { entries: data ?? [] }
}

export async function addOtEntry(entry: {
  worker_id: string
  entry_date: string
  hours: number
  notes?: string
}, userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ot_entries')
    .insert([{
      worker_id: entry.worker_id,
      entry_date: entry.entry_date,
      hours: entry.hours,
      notes: entry.notes ?? '',
      created_by: userId,
    }])
    .select()
    .single()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { entry: data }
}

export async function addBulkOtEntries(entries: Array<{
  worker_id: string
  entry_date: string
  hours: number
  notes?: string
}>, userId: string) {
  if (entries.length === 0) return { success: true }
  
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ot_entries')
    .insert(entries.map(e => ({
      worker_id: e.worker_id,
      entry_date: e.entry_date,
      hours: e.hours,
      notes: e.notes ?? '',
      created_by: userId,
    })))
    .select()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { entries: data }
}

export async function deleteOtEntry(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('ot_entries')
    .delete()
    .eq('id', id)

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { success: true }
}

// ── Payslips ──────────────────────────────────────────────────────────────────

export async function getPayslips(month: number, year: number) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('salary_payslips')
    .select('*')
    .eq('month', month)
    .eq('year', year)
    .order('worker_name', { ascending: true })

  if (error) return { error: error.message, payslips: [] }
  return { payslips: data ?? [] }
}

/**
 * Core function: Creates monthly payslips for all active workers.
 * Snapshots worker data and calculates all OT fields.
 */
export async function createMonthlyPayslips(month: number, year: number, workingDays: number = 26) {
  const supabase = await createClient()

  // 1. Get all active workers
  const { data: workers, error: workersError } = await supabase
    .from('workers')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (workersError) return { error: workersError.message }
  if (!workers || workers.length === 0) return { error: 'No active workers found.' }

  // 2. Get OT entries for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const { data: otEntries, error: otError } = await supabase
    .from('ot_entries')
    .select('*')
    .gte('entry_date', startDate)
    .lt('entry_date', endDate)

  if (otError) return { error: otError.message }

  // 3. Sum OT hours per worker
  const otByWorker: Record<string, number> = {}
  for (const entry of (otEntries ?? [])) {
    otByWorker[entry.worker_id] = (otByWorker[entry.worker_id] ?? 0) + Number(entry.hours)
  }

  // 3.5 Fetch existing payslips for the month
  const { data: existingPayslips, error: existingError } = await supabase
    .from('salary_payslips')
    .select('id, worker_id, signed_at')
    .eq('month', month)
    .eq('year', year)
    
  if (existingError) return { error: existingError.message }
  
  // Find workers with signed payslips
  const signedWorkerIds = new Set(
    (existingPayslips ?? [])
      .filter(p => p.signed_at !== null)
      .map(p => p.worker_id)
  )

  // 4. Build payslip rows (skipping workers with signed payslips)
  const payslipRows = workers
    .filter(w => !signedWorkerIds.has(w.id))
    .map(w => {
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

  // 5. Delete existing UNSIGNED payslips for this month
  const unsignedPayslipIds = (existingPayslips ?? [])
    .filter(p => p.signed_at === null)
    .map(p => p.id)

  if (unsignedPayslipIds.length > 0) {
    await supabase
      .from('salary_payslips')
      .delete()
      .in('id', unsignedPayslipIds)
  }

  // 6. Insert new payslips
  if (payslipRows.length > 0) {
    const { error: insertError } = await supabase
      .from('salary_payslips')
      .insert(payslipRows)

    if (insertError) return { error: insertError.message }
  }

  // Refetch all to return the updated list including preserved signed ones
  const { data: finalPayslips } = await supabase
    .from('salary_payslips')
    .select('*')
    .eq('month', month)
    .eq('year', year)
    .order('worker_name', { ascending: true })

  invalidateSalaryCaches()
  return { payslips: finalPayslips ?? [] }
}

export async function signPayslip(payslipId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('salary_payslips')
    .update({ signed_at: new Date().toISOString() })
    .eq('id', payslipId)
    .select()
    .single()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { payslip: data }
}
