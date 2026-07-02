'use client'

import { useMemo } from 'react'
import { JOB_STAGES, getStageDisplay, getSourceDisplay } from '@/lib/constants'

const SOURCE_LABEL = getSourceDisplay('Meta')

interface MetaLead {
  id: string
  created_at: string
  stage: string
  customers: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null
}

interface MonthRow {
  key: string
  label: string
  all: number
  qualified: number
  confirmed: number
  leads: MetaLead[]
}

// Qualified: the lead has been keyed in and reached "Site Visit Scheduled" —
// the first pipeline stage, so this covers every lead entered into the CRM.
const QUALIFIED_FROM = 'Site Visit Scheduled'
// Confirmed: the lead has been converted to a booked job (quote accepted).
const CONFIRMED_FROM = 'Job Scheduled'

function stageIndex(dbStage: string) {
  return JOB_STAGES.indexOf(getStageDisplay(dbStage) as any)
}

function customerOf(lead: MetaLead) {
  return Array.isArray(lead.customers) ? lead.customers[0] : lead.customers
}

function isQualified(lead: MetaLead) {
  return stageIndex(lead.stage) >= JOB_STAGES.indexOf(QUALIFIED_FROM)
}

function isConfirmed(lead: MetaLead) {
  return stageIndex(lead.stage) >= JOB_STAGES.indexOf(CONFIRMED_FROM)
}

function monthKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
}

function csvEscape(val: string) {
  if (/[",\n]/.test(val)) return `"${val.replace(/"/g, '""')}"`
  return val
}

const FILENAME_SLUG = SOURCE_LABEL.toLowerCase()

function downloadCsv(filename: string, leads: MetaLead[]) {
  const header = ['Name', 'Phone', 'Created Date', 'Stage', 'Qualified (Site Visit Scheduled+)', 'Confirmed (Job Scheduled+)']
  const rows = leads.map(l => {
    const c = customerOf(l)
    return [
      c?.name ?? '',
      c?.phone ?? '',
      new Date(l.created_at).toLocaleDateString('en-SG'),
      l.stage,
      isQualified(l) ? 'Yes' : 'No',
      isConfirmed(l) ? 'Yes' : 'No',
    ].map(v => csvEscape(String(v))).join(',')
  })
  const csv = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function MetaLeadsReport({ leads }: { leads: MetaLead[] }) {
  const monthRows = useMemo<MonthRow[]>(() => {
    const byMonth: Record<string, MetaLead[]> = {}
    for (const lead of leads) {
      const key = monthKey(lead.created_at)
      if (!byMonth[key]) byMonth[key] = []
      byMonth[key].push(lead)
    }
    return Object.entries(byMonth)
      .map(([key, monthLeads]) => ({
        key,
        label: monthLabel(key),
        all: monthLeads.length,
        qualified: monthLeads.filter(isQualified).length,
        confirmed: monthLeads.filter(isConfirmed).length,
        leads: monthLeads,
      }))
      .sort((a, b) => b.key.localeCompare(a.key))
  }, [leads])

  return (
    <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>{SOURCE_LABEL} Lead Report</p>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>For sharing with the ad agency — by month</p>
        </div>
        {leads.length > 0 && (
          <button
            onClick={() => downloadCsv(`${FILENAME_SLUG}-leads-all.csv`, leads)}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
          >
            Export All CSV
          </button>
        )}
      </div>

      {monthRows.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          No {SOURCE_LABEL}-sourced leads yet. Tag a lead's source as "{SOURCE_LABEL}" to see it here.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e9f0' }}>
                {['Month', 'All Leads', 'Qualified (Site Visit Scheduled+)', 'Confirmed (Job Scheduled+)', 'Conversion', ''].map(h => (
                  <th key={h} style={{ textAlign: h === 'Month' ? 'left' : 'center', padding: '8px 10px', fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthRows.map(row => {
                const rate = row.all > 0 ? Math.round((row.confirmed / row.all) * 100) : 0
                return (
                  <tr key={row.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px', fontWeight: 600, color: '#111827' }}>{row.label}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{row.all}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{row.qualified}</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{row.confirmed}</td>
                    <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700, color: rate >= 20 ? '#10b981' : '#f59e0b' }}>{rate}%</td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button
                        onClick={() => downloadCsv(`${FILENAME_SLUG}-leads-${row.key}.csv`, row.leads)}
                        style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
                      >
                        CSV
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
