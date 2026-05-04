'use client'

import { useState } from 'react'

interface Worker { id: string; name: string }
interface OtEntry { id: string; worker_id: string; entry_date: string; hours: number; notes: string; created_by: string }

interface OtEntriesTabProps {
  workers: Worker[]
  entries: OtEntry[]
  month: number
  year: number
  userId: string
  onAddEntry: (data: { worker_id: string; entry_date: string; hours: number; notes?: string }) => Promise<any>
  onDeleteEntry: (id: string) => Promise<any>
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function IconPlus() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function IconTrash() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
}
function IconX() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
}

export default function OtEntriesTab({ workers, entries, month, year, userId, onAddEntry, onDeleteEntry }: OtEntriesTabProps) {
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ worker_id: '', entry_date: '', hours: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Custom confirm state
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null)

  // Group entries by worker
  const byWorker: Record<string, { worker: Worker; entries: OtEntry[]; total: number }> = {}
  for (const w of workers) {
    byWorker[w.id] = { worker: w, entries: [], total: 0 }
  }
  for (const e of entries) {
    if (byWorker[e.worker_id]) {
      byWorker[e.worker_id].entries.push(e)
      byWorker[e.worker_id].total += Number(e.hours)
    }
  }

  function openAdd() {
    setForm({ worker_id: workers[0]?.id ?? '', entry_date: '', hours: '', notes: '' })
    setError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const hours = parseFloat(form.hours)
    if (isNaN(hours) || hours <= 0) { setError('Invalid hours'); return }
    if (!form.worker_id) { setError('Select a worker'); return }
    if (!form.entry_date) { setError('Select a date'); return }
    setLoading(true)
    const result = await onAddEntry({ worker_id: form.worker_id, entry_date: form.entry_date, hours, notes: form.notes })
    setLoading(false)
    if (result?.error) { setError(result.error); return }
    setShowModal(false)
  }

  function handleDelete(id: string) {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete OT Entry',
      message: 'Are you sure you want to delete this OT entry?',
      onConfirm: async () => {
        setConfirmDialog(null)
        await onDeleteEntry(id)
      }
    })
  }

  const workerList = Object.values(byWorker).sort((a, b) => a.worker.name.localeCompare(b.worker.name))

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>OT Entries</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{MONTH_NAMES[month]} {year} — Additional OT hours (HR)</p>
        </div>
        <button id="add-ot-btn" onClick={openAdd} style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
          background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
        }}>
          <IconPlus /> Add OT Entry
        </button>
      </div>

      {/* Per-worker expandable sections */}
      {workerList.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af', background: '#fff', borderRadius: 12, border: '1px solid #e4e9f0' }}>
          No workers yet. Add workers first in the Workers tab.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {workerList.map(({ worker, entries: wEntries, total }) => (
            <div key={worker.id} style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              {/* Worker header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: '#f8fafc', borderBottom: wEntries.length > 0 ? '1px solid #e4e9f0' : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{worker.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Total Additional OT:</span>
                  <span style={{
                    fontSize: 14, fontWeight: 700,
                    color: total > 0 ? '#2563eb' : '#94a3b8',
                    background: total > 0 ? '#eff6ff' : '#f8fafc',
                    padding: '3px 12px', borderRadius: 6,
                    border: total > 0 ? '1px solid rgba(37,99,235,0.2)' : '1px solid #e4e9f0',
                  }}>
                    {total.toFixed(1)} hrs
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
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span style={{ fontSize: 12.5, color: '#64748b', fontFamily: 'monospace', minWidth: 90 }}>
                          {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{Number(entry.hours).toFixed(1)} hrs</span>
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

      {/* Add OT Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: 28, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Add OT Entry</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>Log additional overtime hours</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #e4e9f0', borderRadius: 8, cursor: 'pointer', color: '#9ca3af' }}><IconX /></button>
            </div>

            {error && <div style={{ padding: '10px 14px', marginBottom: 16, background: '#fef2f2', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>⚠ {error}</div>}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Worker *</label>
                <select className="form-input" required value={form.worker_id} onChange={e => setForm(f => ({ ...f, worker_id: e.target.value }))}>
                  <option value="">Select worker</option>
                  {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Date *</label>
                  <input className="form-input" type="date" required value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Hours *</label>
                  <input className="form-input" type="number" step="0.5" min="0.5" required value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="e.g. 2" />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Notes (optional)</label>
                <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Emergency repair" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 18, borderTop: '1px solid #e4e9f0' }}>
                <button type="button" onClick={() => setShowModal(false)} disabled={loading} style={{ padding: '9px 18px', background: '#fff', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ padding: '9px 20px', background: loading ? '#93c5fd' : '#2563eb', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{loading ? 'Adding…' : 'Add Entry'}</button>
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
