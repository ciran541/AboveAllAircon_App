'use client'

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

interface Job {
  id: string
  stage: string
  status: string
  service_type: string | null
  source: string | null
  final_payment_collected: number | null
  quoted_amount: number | null
  payment_status: string | null
  payment_collected_at: string | null
  created_at: string
  closed_at: string | null
  loss_reason: string | null
  deposit_collected: number | null
}

interface Payslip {
  id: string
  month: number
  year: number
  total_salary: number
  basic_salary: number
  total_ot_amount: number
  total_bonus: number
}

interface PendingJob {
  id: string
  service_type: string | null
  quoted_amount: number | null
  final_payment_collected: number | null
  deposit_collected: number | null
  created_at: string
  customers: { name: string } | { name: string }[] | null
}

interface Props {
  jobs: Job[]
  payslips: Payslip[]
  pendingPaymentJobs: PendingJob[]
}

type Period = 'month' | '3months' | '6months' | 'year'

// ── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'month', label: 'This Month' },
  { value: '3months', label: 'Last 3 Months' },
  { value: '6months', label: 'Last 6 Months' },
  { value: 'year', label: 'This Year' },
]

// Exact DB stage values in pipeline order (from migrations)
const STAGE_ORDER = [
  'Site Visit Scheduled',
  'Quotation Sent',
  'Job Scheduled',
  'In Progress',                  // displayed as "First Visit" in UI
  'Second Visit',
  'Job Done (Payment Pending)',
  'Completed',
]

// Match the display labels the user sees in the pipeline
const STAGE_SHORT: Record<string, string> = {
  'Site Visit Scheduled':        'Site Visit',
  'Quotation Sent':              'Quotation',
  'Job Scheduled':               'Scheduled',
  'In Progress':                 'First Visit',
  'Second Visit':                '2nd Visit',
  'Job Done (Payment Pending)':  'Pmt Pending',
  'Completed':                   'Completed',
}

const CHART_COLORS = ['#7c3aed', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899']

function fmtSGD(n: number) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', maximumFractionDigits: 0 }).format(n)
}

function fmtSGDShort(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

function getPeriodStart(period: Period): Date {
  const now = new Date()
  switch (period) {
    case 'month':   return new Date(now.getFullYear(), now.getMonth(), 1)
    case '3months': return new Date(now.getFullYear(), now.getMonth() - 2, 1)
    case '6months': return new Date(now.getFullYear(), now.getMonth() - 5, 1)
    case 'year':    return new Date(now.getFullYear(), 0, 1)
  }
}

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-SG', { month: 'short', year: '2-digit' })
}

function last6Months(): { year: number; month: number; label: string }[] {
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1, label: monthLabel(d.getFullYear(), d.getMonth() + 1) }
  })
}

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CurrencyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 8, padding: '10px 14px', fontSize: 12.5 }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: '#374151' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>{p.name}: {fmtSGD(p.value)}</p>
      ))}
    </div>
  )
}

function CountTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 8, padding: '10px 14px', fontSize: 12.5 }}>
      <p style={{ fontWeight: 600, marginBottom: 4, color: '#374151' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>{p.value} jobs</p>
      ))}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: '18px 20px', flex: 1, minWidth: 160 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: '-0.5px' }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

function ChartCard({ title, children, height = 240 }: { title: string; children: React.ReactNode; height?: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: '18px 20px' }}>
      <p style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginBottom: 16 }}>{title}</p>
      <div style={{ height }}>{children}</div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AnalyticsClient({ jobs, payslips, pendingPaymentJobs }: Props) {
  const [period, setPeriod] = useState<Period>('month')

  // ── Filtered jobs by period ─────────────────────────────────────────────────
  // For paid jobs, use payment_collected_at (when money was received) as the
  // date — a job created in May but paid in June belongs to June revenue.
  // For all other jobs use created_at.
  const filteredJobs = useMemo(() => {
    const start = getPeriodStart(period)
    return jobs.filter(j => {
      const dateStr = j.payment_status === 'Paid' && j.payment_collected_at
        ? j.payment_collected_at
        : j.created_at
      return new Date(dateStr) >= start
    })
  }, [jobs, period])

  // ── KPI: Revenue collected in period ───────────────────────────────────────
  // Use quoted_amount for Paid jobs — matches what the pipeline card displays.
  // final_payment_collected is often not populated when marking a job as Paid.
  const revenue = useMemo(
    () => filteredJobs
      .filter(j => j.payment_status === 'Paid')
      .reduce((s, j) => s + Number(j.quoted_amount || 0), 0),
    [filteredJobs],
  )

  // ── KPI: Outstanding (pending payment, not yet completed) ──────────────────
  // status is never written as 'closed' in the codebase — use stage instead.
  const outstanding = useMemo(
    () => jobs
      .filter(j => j.payment_status === 'Pending' && j.stage !== 'Completed')
      .reduce((s, j) => s + Math.max(0, Number(j.quoted_amount || 0) - Number(j.final_payment_collected || 0) - Number(j.deposit_collected || 0)), 0),
    [jobs],
  )

  // ── KPI: Jobs completed in period ──────────────────────────────────────────
  // status='closed' is never written — use stage='Completed' as the signal.
  const jobsWon = useMemo(
    () => filteredJobs.filter(j => j.stage === 'Completed').length,
    [filteredJobs],
  )

  // ── KPI: Payroll in period ──────────────────────────────────────────────────
  const payrollCost = useMemo(() => {
    const start = getPeriodStart(period)
    return payslips
      .filter(p => new Date(p.year, p.month - 1, 1) >= start)
      .reduce((s, p) => s + Number(p.total_salary || 0), 0)
  }, [payslips, period])

  // ── Chart: Monthly Revenue Trend (fixed 6 months) ──────────────────────────
  const monthlyRevenue = useMemo(() => last6Months().map(({ year, month, label }) => ({
    label,
    revenue: jobs
      .filter(j => {
        if (j.payment_status !== 'Paid') return false
        const d = new Date(j.payment_collected_at ?? j.created_at)
        return d.getFullYear() === year && d.getMonth() + 1 === month
      })
      .reduce((s, j) => s + Number(j.quoted_amount || 0), 0),
  })), [jobs])

  // ── Chart: Current Pipeline (open jobs by stage) ───────────────────────────
  const pipelineData = useMemo(() => {
    const openJobs = jobs.filter(j => j.status === 'open')
    return STAGE_ORDER
      .map(stage => ({ stage: STAGE_SHORT[stage] ?? stage, count: openJobs.filter(j => j.stage === stage).length }))
      .filter(s => s.count > 0)
  }, [jobs])

  // ── Chart: Revenue by Service Type ─────────────────────────────────────────
  const serviceTypeData = useMemo(() => {
    const byType: Record<string, number> = {}
    for (const j of filteredJobs) {
      const t = j.service_type || 'Other'
      byType[t] = (byType[t] || 0) + Number(j.final_payment_collected || 0)
    }
    return Object.entries(byType)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 7)
  }, [filteredJobs])

  // ── Chart: Labour vs Revenue (fixed 6 months) ──────────────────────────────
  const labourVsRevenue = useMemo(() => last6Months().map(({ year, month, label }) => ({
    label,
    revenue: jobs
      .filter(j => {
        if (j.payment_status !== 'Paid') return false
        const d = new Date(j.payment_collected_at ?? j.created_at)
        return d.getFullYear() === year && d.getMonth() + 1 === month
      })
      .reduce((s, j) => s + Number(j.quoted_amount || 0), 0),
    labour: payslips
      .filter(p => p.year === year && p.month === month)
      .reduce((s, p) => s + Number(p.total_salary || 0), 0),
  })), [jobs, payslips])

  // ── Win / Loss funnel ───────────────────────────────────────────────────────
  // status='closed' is never written — derive from stage and loss_reason instead.
  const winLoss = useMemo(() => {
    const won  = filteredJobs.filter(j => j.stage === 'Completed').length
    const lost = filteredJobs.filter(j => !!j.loss_reason).length
    const total = filteredJobs.length
    return { won, lost, open: total - won - lost, total, rate: total > 0 ? Math.round((won / total) * 100) : 0 }
  }, [filteredJobs])

  const lossReasons = useMemo(() => {
    const byReason: Record<string, number> = {}
    for (const j of filteredJobs.filter(j => !!j.loss_reason)) {
      byReason[j.loss_reason!] = (byReason[j.loss_reason!] || 0) + 1
    }
    return Object.entries(byReason).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
  }, [filteredJobs])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #e4e9f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, background: '#faf5ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>Analytics</h1>
            <p style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2 }}>Business & finance overview</p>
          </div>
        </div>

        {/* Period Selector */}
        <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 3, gap: 2, flexWrap: 'wrap' }}>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setPeriod(opt.value)}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap', background: period === opt.value ? '#fff' : 'transparent', color: period === opt.value ? '#111827' : '#6b7280', boxShadow: period === opt.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>

        {/* KPI Cards */}
        <div className="analytics-kpi-grid">
          <KpiCard label="Revenue Collected" value={fmtSGD(revenue)} sub="payments received" color="#10b981" />
          <KpiCard label="Outstanding" value={fmtSGD(outstanding)} sub="open pending jobs" color="#ef4444" />
          <KpiCard label="Jobs Completed" value={String(jobsWon)} sub={`of ${filteredJobs.length} created`} color="#7c3aed" />
          <KpiCard label="Payroll Cost" value={fmtSGD(payrollCost)} sub="salary + OT + bonus" color="#f59e0b" />
        </div>

        {/* Row 2: Monthly Revenue Trend + Pipeline */}
        <div className="analytics-chart-grid" style={{ marginTop: 16 }}>
          <ChartCard title="Monthly Revenue — Last 6 Months">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmtSGDShort} width={46} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Current Pipeline — Open Jobs by Stage">
            {pipelineData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>No open jobs</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineData} layout="vertical" margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="stage" tick={{ fontSize: 11.5, fill: '#374151' }} axisLine={false} tickLine={false} width={76} />
                  <Tooltip content={<CountTooltip />} />
                  <Bar dataKey="count" name="Jobs" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {pipelineData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Row 3: Revenue by Service Type (full width) */}
        <div style={{ marginTop: 16 }}>
          <ChartCard title="Revenue by Service Type">
            {serviceTypeData.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serviceTypeData} layout="vertical" margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmtSGDShort} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11.5, fill: '#374151' }} axisLine={false} tickLine={false} width={96} />
                  <Tooltip content={<CurrencyTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {serviceTypeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        {/* Row 4: Labour vs Revenue */}
        <div style={{ marginTop: 16 }}>
          <ChartCard title="Revenue vs Payroll Cost — Last 6 Months" height={260}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={labourVsRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11.5, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={fmtSGDShort} width={46} />
                <Tooltip content={<CurrencyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12.5, paddingTop: 8 }} />
                <Bar dataKey="revenue" name="Revenue" fill="#7c3aed" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="labour" name="Payroll" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 5: Win/Loss + Pending Payments */}
        <div className="analytics-chart-grid" style={{ marginTop: 16, alignItems: 'start' }}>

          {/* Win / Loss */}
          <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Jobs Funnel</p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Created', value: winLoss.total, color: '#6b7280' },
                { label: 'Still Open', value: winLoss.open, color: '#3b82f6' },
                { label: 'Won', value: winLoss.won, color: '#10b981' },
                { label: 'Lost', value: winLoss.lost, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, minWidth: 72, background: '#f9fafb', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
                  <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{s.label}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: winLoss.rate >= 50 ? '#f0fdf4' : '#fff7ed', borderRadius: 8, marginBottom: lossReasons.length > 0 ? 14 : 0 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: winLoss.rate >= 50 ? '#10b981' : '#f59e0b' }}>{winLoss.rate}%</span>
              <span style={{ fontSize: 12.5, color: '#6b7280' }}>conversion rate (won / created)</span>
            </div>

            {lossReasons.length > 0 && (
              <>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Loss Reasons</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lossReasons.map(lr => (
                    <div key={lr.reason} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#fef2f2', borderRadius: 6 }}>
                      <span style={{ fontSize: 12.5, color: '#374151' }}>{lr.reason}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#ef4444' }}>{lr.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Pending Payments */}
          <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: '18px 20px' }}>
            <p style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', marginBottom: 16 }}>Pending Payments</p>

            {pendingPaymentJobs.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No outstanding payments</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingPaymentJobs.map(j => {
                  const owed = Math.max(0, Number(j.quoted_amount || 0) - Number(j.final_payment_collected || 0) - Number(j.deposit_collected || 0))
                  const days = daysSince(j.created_at)
                  return (
                    <div key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: '#fafafa', borderRadius: 8, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(Array.isArray(j.customers) ? j.customers[0]?.name : j.customers?.name) ?? 'Unknown Customer'}
                        </p>
                        <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 1 }}>
                          {j.service_type ?? '—'} · {days}d ago
                        </p>
                      </div>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>{fmtSGD(owed)}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      <style>{`
        .analytics-kpi-grid {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .analytics-kpi-grid > * { flex: 1; min-width: 140px; }

        .analytics-chart-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        @media (max-width: 768px) {
          .analytics-chart-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </>
  )
}
