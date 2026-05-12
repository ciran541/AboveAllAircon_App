import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import PayslipPDF, { type PayslipData } from '@/components/PayslipPDF'
import SignatureModal from '@/components/SignatureModal'

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(mod => mod.PDFDownloadLink),
  { ssr: false }
)

interface Payslip {
  id: string; worker_id: string; month: number; year: number
  worker_name: string; wp_number: string; basic_salary: number; bank_account: string
  working_days: number; ot_per_hour: number; additional_3hr_ot: number
  additional_ot: number; total_ot: number; total_ot_amount: number
  total_bonus: number; total_salary: number
  signed_at: string | null; signature_data: string | null; created_at: string
}

interface PayslipsTabProps {
  payslips: Payslip[]
  otEntries: any[]
  bonusEntries: any[]
  workers: any[]
  month: number; year: number
  role: 'admin' | 'staff'
  onCreatePayslips: (month: number, year: number, workingDays?: number) => Promise<any>
  onSignPayslip: (id: string, signatureData?: string) => Promise<any>
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 }).format(n)
}

function IconCheck() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
}

function IconDownload() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
}

function IconRefresh() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
}

export default function PayslipsTab({ payslips, otEntries, bonusEntries, workers, month, year, role, onCreatePayslips, onSignPayslip }: PayslipsTabProps) {
  const [creating, setCreating] = useState(false)
  const [workingDays, setWorkingDays] = useState(26)
  const [signingId, setSigningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [signatureTarget, setSignatureTarget] = useState<{ id: string; name: string } | null>(null)
  
  // Custom confirm state
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void, confirmText?: string, confirmColor?: string } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isAdmin = role === 'admin'
  const hasPayslips = payslips.length > 0

  // Check if payslips are stale (live OT/Bonus sums don't match snapshot)
  const isStale = useMemo(() => {
    if (!hasPayslips) return false
    
    // Sum current entries
    const liveOt: Record<string, number> = {}
    otEntries.forEach(e => liveOt[e.worker_id] = (liveOt[e.worker_id] ?? 0) + Number(e.hours))
    
    const liveBonus: Record<string, number> = {}
    bonusEntries.forEach(e => liveBonus[e.worker_id] = (liveBonus[e.worker_id] ?? 0) + Number(e.amount))

    // Compare with unsigned payslips
    return payslips.some(p => {
      if (p.signed_at) return false // Ignore signed
      const currentOt = liveOt[p.worker_id] ?? 0
      const currentBonus = liveBonus[p.worker_id] ?? 0
      
      // Basic check (rounding to 2 decimals)
      const otMatch = Math.abs(currentOt - Number(p.additional_ot)) < 0.01
      const bonusMatch = Math.abs(currentBonus - Number(p.total_bonus || 0)) < 0.01
      
      return !otMatch || !bonusMatch
    })
  }, [payslips, otEntries, bonusEntries, hasPayslips])

  function handleCreate() {
    setConfirmDialog({
      isOpen: true,
      title: 'Generate Payslips',
      message: `Generate payslips for ${MONTH_NAMES[month]} ${year}? Existing signed payslips will be PRESERVED. Unsigned payslips will be replaced with new calculations.`,
      confirmText: 'Generate',
      confirmColor: '#2563eb',
      onConfirm: async () => {
        setConfirmDialog(null)
        setCreating(true); setError(null)
        const result = await onCreatePayslips(month, year, workingDays)
        setCreating(false)
        if (result?.error) setError(result.error)
      }
    })
  }

  function handleSign(id: string, workerName: string) {
    setSignatureTarget({ id, name: workerName })
  }

  async function handleSignatureSubmit(signatureData: string) {
    if (!signatureTarget) return
    setSignatureTarget(null)
    setSigningId(signatureTarget.id)
    const result = await onSignPayslip(signatureTarget.id, signatureData)
    setSigningId(null)
    if (result?.error) setError(result.error)
  }

  // Totals
  const totalBasic = payslips.reduce((s, p) => s + Number(p.basic_salary), 0)
  const totalOtAmt = payslips.reduce((s, p) => s + Number(p.total_ot_amount), 0)
  const totalBonus = payslips.reduce((s, p) => s + Number(p.total_bonus || 0), 0)
  const totalSalary = payslips.reduce((s, p) => s + Number(p.total_salary), 0)

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Salary Payslips</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{MONTH_NAMES[month]} {year}</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Working Days:</label>
              <input type="number" min="1" max="31" value={workingDays} onChange={e => setWorkingDays(parseInt(e.target.value) || 26)}
                style={{ width: 56, padding: '6px 8px', border: '1.5px solid #e4e9f0', borderRadius: 6, fontSize: 13, textAlign: 'center', fontFamily: 'inherit' }} />
            </div>
            <button id="create-payslips-btn" onClick={handleCreate} disabled={creating} style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
              background: creating ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
              fontSize: 13.5, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
              boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
            }}>
              {creating ? 'Generating…' : 'Create Payslips'}
            </button>
          </div>
        )}
      </div>

      {isStale && isAdmin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 20,
          background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 12, color: '#92400e', fontSize: 13,
          boxShadow: '0 2px 4px rgba(146,64,14,0.05)',
        }}>
          <div style={{ fontSize: 18 }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700 }}>Data Out of Sync:</span> OT or Bonus entries have changed. Click <strong>"Create Payslips"</strong> to update the records below.
          </div>
          <button onClick={handleCreate} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            background: '#d97706', color: '#fff', border: 'none', borderRadius: 6,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit'
          }}>
            <IconRefresh /> Sync Now
          </button>
        </div>
      )}

      {error && <div style={{ padding: '10px 14px', marginBottom: 16, background: '#fef2f2', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>⚠ {error}</div>}

      {!hasPayslips ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e4e9f0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>No payslips for {MONTH_NAMES[month]} {year}</div>
          <div style={{ fontSize: 13 }}>{isAdmin ? 'Click "Create Payslips" to generate payslips for all workers.' : 'Payslips have not been generated yet for this month.'}</div>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Basic', value: formatCurrency(totalBasic), color: '#2563eb', bg: '#eff6ff' },
              { label: 'Total OT Pay', value: formatCurrency(totalOtAmt), color: '#059669', bg: '#ecfdf5' },
              { label: 'Total Bonus', value: formatCurrency(totalBonus), color: '#d97706', bg: '#fffbeb' },
              { label: 'Total Salary', value: formatCurrency(totalSalary), color: '#7c3aed', bg: '#f5f3ff' },
            ].map(c => (
              <div key={c.label} style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.color, letterSpacing: '-0.5px' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Mobile: Card layout / Desktop: Table */}
          {/* Desktop table */}
          <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, overflow: 'auto', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }} className="payslip-table-wrapper">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 900 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e4e9f0' }}>
                  {['Name', 'WP No', 'Basic', 'OT/Hr', '3Hr OT', 'Add OT', 'Total OT', 'OT Pay', 'Bonus', 'Total', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payslips.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < payslips.length - 1 ? '1px solid #f1f5f9' : 'none', transition: 'background 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '12px 10px', fontWeight: 600, color: '#0f172a' }}>{p.worker_name}</td>
                    <td style={{ padding: '12px 10px', color: '#64748b', fontFamily: 'monospace', fontSize: 11 }}>{p.wp_number || '—'}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 600, color: '#0f172a' }}>{formatCurrency(p.basic_salary)}</td>
                    <td style={{ padding: '12px 10px', color: '#64748b', fontSize: 11 }}>{formatCurrency(p.ot_per_hour)}</td>
                    <td style={{ padding: '12px 10px', color: '#64748b', fontSize: 11 }}>{Number(p.additional_3hr_ot).toFixed(0)}h</td>
                    <td style={{ padding: '12px 10px', color: Number(p.additional_ot) > 0 ? '#2563eb' : '#94a3b8', fontWeight: Number(p.additional_ot) > 0 ? 600 : 400, fontSize: 11 }}>{Number(p.additional_ot).toFixed(1)}h</td>
                    <td style={{ padding: '12px 10px', fontWeight: 600, color: '#0f172a', fontSize: 11 }}>{Number(p.total_ot).toFixed(1)}h</td>
                    <td style={{ padding: '12px 10px', fontWeight: 600, color: '#059669' }}>{formatCurrency(p.total_ot_amount)}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 600, color: Number(p.total_bonus || 0) > 0 ? '#d97706' : '#94a3b8' }}>{formatCurrency(Number(p.total_bonus || 0))}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: '#7c3aed', fontSize: 13 }}>{formatCurrency(p.total_salary)}</td>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {p.signed_at ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#ecfdf5', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}>
                              <IconCheck /> Signed
                            </span>
                            {p.signature_data && (
                              <img src={p.signature_data} alt="Signature" style={{ height: 24, borderRadius: 4, border: '1px solid #e4e9f0' }} />
                            )}
                          </div>
                        ) : (
                          <button onClick={() => handleSign(p.id, p.worker_name)} disabled={signingId === p.id} style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
                            background: '#fffbeb', color: '#d97706', border: '1px solid rgba(217,119,6,0.25)',
                            cursor: signingId === p.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                            transition: 'all 0.15s',
                          }}>
                            {signingId === p.id ? 'Signing…' : 'Sign & Acknowledge'}
                          </button>
                        )}
                        
                          {mounted && (
                            <PDFDownloadLink
                              document={<PayslipPDF data={{
                                monthName: MONTH_NAMES[p.month],
                                year: p.year,
                                workerName: p.worker_name,
                                wpNumber: p.wp_number || '',
                                bankAccount: p.bank_account || '',
                                basicSalary: Number(p.basic_salary),
                                workingDays: Number(p.working_days),
                                otPerHour: Number(p.ot_per_hour),
                                additional3hrOt: Number(p.additional_3hr_ot),
                                additionalOt: Number(p.additional_ot),
                                totalOt: Number(p.total_ot),
                                totalOtAmount: Number(p.total_ot_amount),
                                totalBonus: Number(p.total_bonus || 0),
                                totalSalary: Number(p.total_salary),
                                signedAt: p.signed_at,
                                signatureData: p.signature_data || undefined,
                              }} />}
                              fileName={`Payslip_${p.worker_name.replace(/\s+/g, '_')}_${MONTH_NAMES[p.month]}_${p.year}.pdf`}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
                                borderRadius: 6, background: '#f1f5f9', color: '#64748b', textDecoration: 'none',
                                transition: 'all 0.15s'
                              }}
                            >
                              <IconDownload />
                            </PDFDownloadLink>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card layout - shown via CSS media query */}
          <div className="payslip-mobile-cards">
            {payslips.map(p => (
              <div key={p.id + '-mobile'} style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{p.worker_name}</div>
                    {p.wp_number && <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginTop: 2 }}>{p.wp_number}</div>}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#7c3aed' }}>{formatCurrency(p.total_salary)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div><span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Basic</span><div style={{ fontSize: 13, fontWeight: 600 }}>{formatCurrency(p.basic_salary)}</div></div>
                  <div><span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>OT Pay</span><div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{formatCurrency(p.total_ot_amount)}</div></div>
                  <div><span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Bonus</span><div style={{ fontSize: 13, fontWeight: 600, color: '#d97706' }}>{formatCurrency(Number(p.total_bonus || 0))}</div></div>
                  <div><span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Total OT</span><div style={{ fontSize: 13, fontWeight: 600 }}>{Number(p.total_ot).toFixed(1)} hrs</div></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                  {p.signed_at ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: '#ecfdf5', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}>
                        <IconCheck /> Signed
                      </span>
                      {p.signature_data && <img src={p.signature_data} alt="Sig" style={{ height: 20, borderRadius: 3, border: '1px solid #e4e9f0' }} />}
                    </div>
                  ) : (
                    <button onClick={() => handleSign(p.id, p.worker_name)} disabled={signingId === p.id} style={{
                      padding: '8px 16px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                      background: '#fffbeb', color: '#d97706', border: '1px solid rgba(217,119,6,0.25)',
                      cursor: signingId === p.id ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    }}>
                      {signingId === p.id ? 'Signing…' : '✍️ Sign & Acknowledge'}
                    </button>
                  )}
                  {mounted && (
                    <PDFDownloadLink
                      document={<PayslipPDF data={{
                        monthName: MONTH_NAMES[p.month], year: p.year, workerName: p.worker_name,
                        wpNumber: p.wp_number || '', bankAccount: p.bank_account || '',
                        basicSalary: Number(p.basic_salary), workingDays: Number(p.working_days),
                        otPerHour: Number(p.ot_per_hour), additional3hrOt: Number(p.additional_3hr_ot),
                        additionalOt: Number(p.additional_ot), totalOt: Number(p.total_ot),
                        totalOtAmount: Number(p.total_ot_amount), totalBonus: Number(p.total_bonus || 0),
                        totalSalary: Number(p.total_salary), signedAt: p.signed_at,
                        signatureData: p.signature_data || undefined,
                      }} />}
                      fileName={`Payslip_${p.worker_name.replace(/\s+/g, '_')}_${MONTH_NAMES[p.month]}_${p.year}.pdf`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', color: '#64748b', textDecoration: 'none' }}
                    >
                      <IconDownload />
                    </PDFDownloadLink>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Signature Modal */}
      <SignatureModal
        isOpen={!!signatureTarget}
        workerName={signatureTarget?.name || ''}
        onClose={() => setSignatureTarget(null)}
        onSubmit={handleSignatureSubmit}
      />

      {/* Confirm Modal */}
      {confirmDialog?.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{confirmDialog.title}</h3>
            <p style={{ fontSize: 13.5, color: '#4b5563', marginBottom: 24, lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{ padding: '8px 16px', background: '#fff', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmDialog.onConfirm} style={{ padding: '8px 16px', background: confirmDialog.confirmColor || '#dc2626', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        .payslip-mobile-cards { display: none; }
        @media (max-width: 768px) {
          .payslip-table-wrapper { display: none !important; }
          .payslip-mobile-cards { display: flex; flex-direction: column; gap: 12px; }
        }
      `}</style>
    </>
  )
}
