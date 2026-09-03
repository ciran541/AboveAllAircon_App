/**
 * app/services/salaryService.ts
 *
 * Server-only domain service for salary module.
 * All direct Supabase mutations for workers, OT entries, bonus entries, and payslips live here.
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
  fin_no?: string
  levy?: number
  sunday_ot_multiplier?: number
}) {
  const supabase = await createClient()
  const insertPayload: Record<string, any> = {
    name: worker.name,
    wp_number: worker.wp_number ?? '',
    basic_salary: worker.basic_salary,
    bank_account: worker.bank_account ?? '',
    fin_no: worker.fin_no ?? '',
    levy: worker.levy ?? 0,
    sunday_ot_multiplier: worker.sunday_ot_multiplier ?? 1.5,
  }

  let { data, error } = await supabase
    .from('workers')
    .insert([insertPayload])
    .select()
    .single()

  // Fallback if migration hasn't been run yet
  if (error && error.code === 'PGRST204') {
    delete insertPayload.sunday_ot_multiplier
    const retry = await supabase
      .from('workers')
      .insert([insertPayload])
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

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
    fin_no: string
    levy: number
    sunday_ot_multiplier: number
  }>
) {
  const supabase = await createClient()
  const updatePayload: Record<string, any> = { ...updates, updated_at: new Date().toISOString() }

  let { data, error } = await supabase
    .from('workers')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single()

  // Fallback if migration hasn't been run yet
  if (error && error.code === 'PGRST204') {
    delete updatePayload.sunday_ot_multiplier
    const retry = await supabase
      .from('workers')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()
    data = retry.data
    error = retry.error
  }

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

// ── Bonus Entries ─────────────────────────────────────────────────────────────

export async function getBonusEntries(month: number, year: number) {
  const supabase = await createClient()

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`

  const { data, error } = await supabase
    .from('bonus_entries')
    .select('*')
    .gte('entry_date', startDate)
    .lt('entry_date', endDate)
    .order('entry_date', { ascending: true })

  if (error) return { error: error.message, entries: [] }
  return { entries: data ?? [] }
}

export async function addBonusEntry(entry: {
  worker_id: string
  entry_date: string
  amount: number
  notes?: string
}, userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bonus_entries')
    .insert([{
      worker_id: entry.worker_id,
      entry_date: entry.entry_date,
      amount: entry.amount,
      notes: entry.notes ?? '',
      created_by: userId,
    }])
    .select()
    .single()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { entry: data }
}

export async function addBulkBonusEntries(entries: Array<{
  worker_id: string
  entry_date: string
  amount: number
  notes?: string
}>, userId: string) {
  if (entries.length === 0) return { success: true }
  
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bonus_entries')
    .insert(entries.map(e => ({
      worker_id: e.worker_id,
      entry_date: e.entry_date,
      amount: e.amount,
      notes: e.notes ?? '',
      created_by: userId,
    })))
    .select()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { entries: data }
}

export async function deleteBonusEntry(id: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('bonus_entries')
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

/** Baseline days used to prorate a worker's full monthly basic_salary. */
const STANDARD_WORKING_DAYS = 26

/** Returns true if a YYYY-MM-DD date string falls on a Sunday. */
function isSunday(dateStr: string): boolean {
  // Parse as local date to avoid timezone shifts changing the day
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 0
}

/**
 * Core function: Creates monthly payslips for all active workers.
 * Snapshots worker data and calculates all OT + bonus fields.
 * Sunday OT entries use each worker's configured sunday_ot_multiplier;
 * weekday OT always uses 1.5×.
 *
 * workingDaysByWorker maps worker_id -> days worked that month. Workers not
 * present in the map fall back to STANDARD_WORKING_DAYS (a full month).
 */
export async function createMonthlyPayslips(
  month: number,
  year: number,
  workingDaysByWorker: Record<string, number> = {}
) {
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

  // 2b. Get bonus entries for the month
  const { data: bonusEntries, error: bonusError } = await supabase
    .from('bonus_entries')
    .select('*')
    .gte('entry_date', startDate)
    .lt('entry_date', endDate)

  if (bonusError) return { error: bonusError.message }

  // 3. Sum OT hours per worker, split into weekday vs Sunday
  const weekdayOtByWorker: Record<string, number> = {}
  const sundayOtByWorker: Record<string, number> = {}
  for (const entry of (otEntries ?? [])) {
    const hours = Number(entry.hours)
    if (isSunday(entry.entry_date)) {
      sundayOtByWorker[entry.worker_id] = (sundayOtByWorker[entry.worker_id] ?? 0) + hours
    } else {
      weekdayOtByWorker[entry.worker_id] = (weekdayOtByWorker[entry.worker_id] ?? 0) + hours
    }
  }

  // 3a. Sum bonus amounts per worker
  const bonusByWorker: Record<string, number> = {}
  for (const entry of (bonusEntries ?? [])) {
    bonusByWorker[entry.worker_id] = (bonusByWorker[entry.worker_id] ?? 0) + Number(entry.amount)
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
      const fullBasicSalary = Number(w.basic_salary)
      const workingDays = workingDaysByWorker[w.id] ?? STANDARD_WORKING_DAYS
      const basicSalary = fullBasicSalary * (workingDays / STANDARD_WORKING_DAYS)

      // Base hourly OT rate (1.5× of daily rate)
      const baseOtPerHour = fullBasicSalary / STANDARD_WORKING_DAYS / 8 * 1.5

      // Weekday OT at standard 1.5×
      const weekdayHours = weekdayOtByWorker[w.id] ?? 0
      const weekdayOtAmount = weekdayHours * baseOtPerHour

      // Sunday OT at worker's configured multiplier
      const sundayMultiplier = Number(w.sunday_ot_multiplier ?? 1.5)
      const sundayHours = sundayOtByWorker[w.id] ?? 0
      // Sunday rate = base_daily_rate × sunday_multiplier (base_daily = salary/26/8)
      const sundayOtPerHour = fullBasicSalary / STANDARD_WORKING_DAYS / 8 * sundayMultiplier
      const sundayOtAmount = sundayHours * sundayOtPerHour

      // Legacy fields kept for backward compatibility
      const additional3hrOt = workingDays * 3
      const additionalOt = weekdayHours + sundayHours  // total additional OT hours
      const totalOt = additional3hrOt + additionalOt
      // The 3-hr built-in OT uses base rate (1.5×)
      const builtInOtAmount = additional3hrOt * baseOtPerHour
      const totalOtAmount = builtInOtAmount + weekdayOtAmount + sundayOtAmount

      const totalBonus = bonusByWorker[w.id] ?? 0
      const totalSalary = basicSalary + totalOtAmount + totalBonus

      return {
        worker_id: w.id,
        month,
        year,
        worker_name: w.name,
        wp_number: w.wp_number ?? '',
        basic_salary: Math.round(basicSalary * 100) / 100,
        bank_account: w.bank_account ?? '',
        working_days: workingDays,
        ot_per_hour: Math.round(baseOtPerHour * 100) / 100,
        additional_3hr_ot: additional3hrOt,
        additional_ot: additionalOt,
        total_ot: totalOt,
        total_ot_amount: Math.round(totalOtAmount * 100) / 100,
        total_bonus: Math.round(totalBonus * 100) / 100,
        total_salary: Math.round(totalSalary * 100) / 100,
        // Sunday breakdown snapshot
        weekday_ot_hours: Math.round(weekdayHours * 100) / 100,
        weekday_ot_amount: Math.round(weekdayOtAmount * 100) / 100,
        sunday_ot_hours: Math.round(sundayHours * 100) / 100,
        sunday_ot_multiplier: sundayMultiplier,
        sunday_ot_amount: Math.round(sundayOtAmount * 100) / 100,
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
    let { error: insertError } = await supabase
      .from('salary_payslips')
      .insert(payslipRows)

    // Fallback if migration hasn't been run yet: strip Sunday breakdown columns
    if (insertError && insertError.code === 'PGRST204') {
      const fallbackRows = payslipRows.map(row => {
        const r = { ...row }
        delete (r as any).weekday_ot_hours
        delete (r as any).weekday_ot_amount
        delete (r as any).sunday_ot_hours
        delete (r as any).sunday_ot_multiplier
        delete (r as any).sunday_ot_amount
        return r
      })
      const retry = await supabase
        .from('salary_payslips')
        .insert(fallbackRows)
      insertError = retry.error
    }

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

export async function signPayslip(payslipId: string, signatureData?: string) {
  const supabase = await createClient()
  const updateData: Record<string, any> = { signed_at: new Date().toISOString() }
  if (signatureData) updateData.signature_data = signatureData

  const { data, error } = await supabase
    .from('salary_payslips')
    .update(updateData)
    .eq('id', payslipId)
    .select()
    .single()

  if (error) return { error: error.message }
  invalidateSalaryCaches()
  return { payslip: data }
}
