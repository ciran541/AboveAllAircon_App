'use client'

import { useState } from 'react'

interface Worker { id: string; name: string }
interface BonusEntry { id: string; worker_id: string; entry_date: string; amount: number; notes: string; created_by: string }

interface BonusEntriesTabProps {
  workers: Worker[]
  entries: BonusEntry[]
  month: number
  year: number
  userId: string
  onAddEntry: (data: { worker_id: string; entry_date: string; amount: number; notes?: string }) => Promise<any>
  onAddBulkEntries: (entries: Array<{ worker_id: string; entry_date: string; amount: number; notes?: string }>) => Promise<any>
  onDeleteEntry: (id: string) => Promise<any>
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 2 }).format(n)
}

function IconPlus() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function IconTrash() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
}
function IconX() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
}

export default function BonusEntriesTab({ workers, entries, month, year, userId, onAddEntry, onAddBulkEntries, onDeleteEntry }: BonusEntriesTabProps) {
  const [showModal, setShowModal] = useState(false)
  const [bulkForm, setBulkForm] = useState<{ entry_date: string; notes: string; amounts: Record<string, string> }>({ entry_date: '', notes: '', amounts: {} })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null)

  // Group entries by worker
  const byWorker: Record<string, { worker: Worker; entries: BonusEntry[]; total: number }> = {}
  for (const w of workers) {
    byWorker[w.id] = { worker: w, entries: [], total: 0 }
  }
  for (const e of entries) {
    if (byWorker[e.worker_id]) {
      byWorker[e.worker_id].entries.push(e)
      byWorker[e.worker_id].total += Number(e.amount)
    }
  }

  const grandTotal = entries.reduce((s, e) => s + Number(e.amount), 0)

  function openAdd() {
    setBulkForm({ entry_date: '', notes: '', amounts: {} })
    setError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!bulkForm.entry_date) { setError('Select a date'); return }

    const entriesToSubmit = []
    for (const [workerId, amountStr] of Object.entries(bulkForm.amounts)) {
      const amount = parseFloat(amountStr)
      if (!isNaN(amount) && amount > 0) {
        entriesToSubmit.push({ worker_id: workerId, entry_date: bulkForm.entry_date, amount, notes: bulkForm.notes })
      }
    }

    if (entriesToSubmit.length === 0) { setError('Please enter an amount for at least one worker'); return }

    setLoading(true)
    const result = await onAddBulkEntries(entriesToSubmit)
    setLoading(false)
    if (result?.error) { setError(result.error); return }
    setShowModal(false)
  }

  function handleDelete(id: string) {
    setConfirmDialog({
      isOpen: true, title: 'Delete Bonus Entry', message: 'Are you sure you want to delete this bonus entry?',
      onConfirm: async () => { setConfirmDialog(null); await onDeleteEntry(id) }
    })
  }

  const workerList = Object.values(byWorker).sort((a, b) => a.worker.name.localeCompare(b.worker.name))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Bonus Entries</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{MONTH_NAMES[month]} {year} — Total: <span style={{ fontWeight: 700, color: '#7c3aed' }}>{formatCurrency(grandTotal)}</span></p>
        </div>
        <button id="add-bonus-btn" onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
          background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 1px 3px rgba(124,58,237,0.3)',
        }}>
          <IconPlus /> Add Bonus
        </button>
      </div>

      {workerList.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e4e9f0' }}>
          No workers yet. Add workers first in the Workers tab.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workerList.map(({ worker, entries: wEntries, total }) => (
            <div key={worker.id} style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              {/* Worker header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#f8fafc', borderBottom: wEntries.length > 0 ? '1px solid #e4e9f0' : 'none', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{worker.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Total Bonus:</span>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    color: total > 0 ? '#7c3aed' : '#94a3b8',
                    background: total > 0 ? '#f5f3ff' : '#f8fafc',
                    padding: '3px 12px', borderRadius: 6,
                    border: total > 0 ? '1px solid rgba(124,58,237,0.2)' : '1px solid #e4e9f0',
                  }}>
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>

              {/* Entries */}
              {wEntries.length > 0 && (
                <div>
                  {wEntries.map((entry, i) => (
                    <div key={entry.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 20px', borderBottom: i < wEntries.length - 1 ? '1px solid #f1f5f9' : 'none',
                      flexWrap: 'wrap', gap: 8,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, color: '#64748b', fontFamily: 'monospace', minWidth: 90 }}>
                          {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#7c3aed' }}>{formatCurrency(Number(entry.amount))}</span>
                        {entry.notes && <span style={{ fontSize: 12, color: '#94a3b8' }}>— {entry.notes}</span>}
                      </div>
                      <button onClick={() => handleDelete(entry.id)} style={{
                        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: '1px solid transparent', borderRadius: 6,
                        cursor: 'pointer', color: '#cbd5e1', transition: 'all 0.15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca' }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.borderColor = 'transparent' }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Bonus Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)' }}>
            <div style={{ padding: 28, paddingBottom: 16, borderBottom: '1px solid #e4e9f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Add Bonus Entries</h2>
                  <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>Add bonus for multiple workers on a single date</p>
                </div>
                <button onClick={() => setShowModal(false)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #e4e9f0', borderRadius: 8, cursor: 'pointer', color: '#9ca3af' }}><IconX /></button>
              </div>

              {error && <div style={{ padding: '10px 14px', marginBottom: 16, background: '#fef2f2', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>⚠ {error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Date *</label>
                  <input className="form-input" type="date" required value={bulkForm.entry_date} onChange={e => setBulkForm(f => ({ ...f, entry_date: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13.5 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Notes (optional)</label>
                  <input className="form-input" value={bulkForm.notes} onChange={e => setBulkForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Performance bonus" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13.5 }} />
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 12 }}>Bonus Amount (SGD)</div>
                {workers.sort((a, b) => a.name.localeCompare(b.name)).map(w => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: '#111827' }}>{w.name}</div>
                    <input
                      type="number" step="0.01" min="0"
                      value={bulkForm.amounts[w.id] || ''}
                      onChange={e => setBulkForm(f => ({ ...f, amounts: { ...f.amounts, [w.id]: e.target.value } }))}
                      placeholder="$ Amount"
                      style={{ width: 100, padding: '6px 10px', border: '1.5px solid #e4e9f0', borderRadius: 6, fontSize: 13, textAlign: 'right' }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '18px 28px', borderTop: '1px solid #e4e9f0', background: '#f8fafc', borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }}>
                <button type="button" onClick={() => setShowModal(false)} disabled={loading} style={{ padding: '9px 18px', background: '#fff', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ padding: '9px 20px', background: loading ? '#c4b5fd' : '#7c3aed', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{loading ? 'Adding…' : 'Add Entries'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmDialog?.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#111827', marginBottom: 8 }}>{confirmDialog.title}</h3>
            <p style={{ fontSize: 13.5, color: '#4b5563', marginBottom: 24, lineHeight: 1.5 }}>{confirmDialog.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setConfirmDialog(null)} style={{ padding: '8px 16px', background: '#fff', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={confirmDialog.onConfirm} style={{ padding: '8px 16px', background: '#dc2626', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
