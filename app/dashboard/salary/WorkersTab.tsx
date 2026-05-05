'use client'

import { useState } from 'react'

interface Worker {
  id: string
  name: string
  wp_number: string
  basic_salary: number
  bank_account: string
}

interface WorkersTabProps {
  workers: Worker[]
  role: 'admin' | 'staff'
  onCreateWorker: (data: { name: string; wp_number: string; basic_salary: number; bank_account: string }) => Promise<any>
  onUpdateWorker: (id: string, data: Partial<Worker>) => Promise<any>
  onDeleteWorker: (id: string) => Promise<any>
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(n)
}

export default function WorkersTab({ workers, role, onCreateWorker, onUpdateWorker, onDeleteWorker }: WorkersTabProps) {
  const [showModal, setShowModal] = useState(false)
  const [editWorker, setEditWorker] = useState<Worker | null>(null)
  const [form, setForm] = useState({ name: '', wp_number: '', basic_salary: '', bank_account: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Custom confirm state
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null)

  function openCreate() {
    setEditWorker(null)
    setForm({ name: '', wp_number: '', basic_salary: '', bank_account: '' })
    setError(null)
    setShowModal(true)
  }

  function openEdit(w: Worker) {
    setEditWorker(w)
    setForm({ name: w.name, wp_number: w.wp_number, basic_salary: String(w.basic_salary), bank_account: w.bank_account })
    setError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const salary = parseFloat(form.basic_salary)
    if (isNaN(salary) || salary <= 0) { setError('Invalid salary'); setLoading(false); return }

    let result
    if (editWorker) {
      result = await onUpdateWorker(editWorker.id, { name: form.name, wp_number: form.wp_number, basic_salary: salary, bank_account: form.bank_account })
    } else {
      result = await onCreateWorker({ name: form.name, wp_number: form.wp_number, basic_salary: salary, bank_account: form.bank_account })
    }
    setLoading(false)
    if (result?.error) { setError(result.error); return }
    setShowModal(false)
  }

  function handleDelete(id: string) {
    setConfirmDialog({
      isOpen: true,
      title: 'Remove Worker',
      message: 'Are you sure you want to remove this worker? Previous payslip data will be preserved.',
      onConfirm: async () => {
        setConfirmDialog(null)
        await onDeleteWorker(id)
      }
    })
  }

  const isAdmin = role === 'admin'

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px' }}>Workers Details</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{workers.length} active workers</p>
        </div>
        {isAdmin && (
          <button id="add-worker-btn" onClick={openCreate} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px',
            background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
          }}>
            <IconPlus /> Add Worker
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e4e9f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 600 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: isAdmin ? '1.5fr 1fr 1fr 1.2fr 80px' : '1.5fr 1fr 1fr 1.2fr',
              gap: 12, padding: '10px 20px', background: '#f8fafc', borderBottom: '1px solid #e4e9f0',
            }}>
              {['Name', 'WP Number', 'Basic Salary', 'Bank Account', ...(isAdmin ? ['Actions'] : [])].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</div>
              ))}
            </div>

        {workers.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>👷</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>No workers yet</div>
            <div style={{ fontSize: 13 }}>Add your first worker above.</div>
          </div>
        )}

        {workers.map((w, i) => (
          <div key={w.id} style={{
            display: 'grid', gridTemplateColumns: isAdmin ? '1.5fr 1fr 1fr 1.2fr 80px' : '1.5fr 1fr 1fr 1.2fr',
            gap: 12, padding: '14px 20px',
            borderBottom: i < workers.length - 1 ? '1px solid #f1f5f9' : 'none',
            alignItems: 'center', transition: 'background 0.12s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827' }}>{w.name}</div>
            <div style={{ fontSize: 13, color: '#4b5563', fontFamily: 'monospace' }}>{w.wp_number || '—'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{formatCurrency(w.basic_salary)}</div>
            <div style={{ fontSize: 13, color: '#4b5563' }}>{w.bank_account || '—'}</div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => openEdit(w)} style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: '1px solid #e4e9f0', borderRadius: 6, cursor: 'pointer', color: '#64748b',
                  transition: 'all 0.15s',
                }} title="Edit">
                  <IconEdit />
                </button>
                <button onClick={() => handleDelete(w.id)} style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: '1px solid #e4e9f0', borderRadius: 6, cursor: 'pointer', color: '#64748b',
                  transition: 'all 0.15s',
                }} title="Remove">
                  <IconTrash />
                </button>
              </div>
            )}
          </div>
        ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{editWorker ? 'Edit Worker' : 'Add Worker'}</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>{editWorker ? 'Update worker details' : 'Add a new worker to the system'}</p>
              </div>
              <button onClick={() => setShowModal(false)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid #e4e9f0', borderRadius: 8, cursor: 'pointer', color: '#9ca3af' }}>
                <IconX />
              </button>
            </div>

            {error && <div style={{ padding: '10px 14px', marginBottom: 16, background: '#fef2f2', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>⚠ {error}</div>}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Full Name *</label>
                <input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ahmad Razali" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>WP Number</label>
                <input className="form-input" value={form.wp_number} onChange={e => setForm(f => ({ ...f, wp_number: e.target.value }))} placeholder="Work permit number" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Basic Salary (SGD) *</label>
                <input className="form-input" type="number" step="0.01" min="0" required value={form.basic_salary} onChange={e => setForm(f => ({ ...f, basic_salary: e.target.value }))} placeholder="e.g. 2000" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Bank Account</label>
                <input className="form-input" value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} placeholder="e.g. POSB 123-45678-9" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 18, borderTop: '1px solid #e4e9f0' }}>
                <button type="button" onClick={() => setShowModal(false)} disabled={loading} style={{ padding: '9px 18px', background: '#fff', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ padding: '9px 20px', background: loading ? '#93c5fd' : '#2563eb', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{loading ? 'Saving…' : (editWorker ? 'Update' : 'Add Worker')}</button>
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
