'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import WorkersTab from './WorkersTab'
import OtEntriesTab from './OtEntriesTab'
import BonusEntriesTab from './BonusEntriesTab'
import PayslipsTab from './PayslipsTab'
import * as salaryActions from '@/app/actions/salaryActions'

interface SalaryClientProps {
  role: 'admin' | 'staff'
  userId: string
  initialWorkers: any[]
  initialPayslips: any[]
  initialOtEntries: any[]
  initialBonusEntries: any[]
  initialMonth: number
  initialYear: number
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function IconDollar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

type Tab = 'workers' | 'ot' | 'bonus' | 'payslips'

export default function SalaryClient({
  role, userId, initialWorkers, initialPayslips, initialOtEntries, initialBonusEntries, initialMonth, initialYear,
}: SalaryClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>(role === 'staff' ? 'ot' : 'workers')
  const [workers, setWorkers] = useState(initialWorkers)
  const [payslips, setPayslips] = useState(initialPayslips)
  const [otEntries, setOtEntries] = useState(initialOtEntries)
  const [bonusEntries, setBonusEntries] = useState(initialBonusEntries)
  const [month, setMonth] = useState(initialMonth)
  const [year, setYear] = useState(initialYear)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Refresh data when month/year changes
  async function changeMonthYear(m: number, y: number) {
    setMonth(m); setYear(y)
    const [payRes, otRes, bonusRes] = await Promise.all([
      salaryActions.getPayslips(m, y),
      salaryActions.getOtEntries(m, y),
      salaryActions.getBonusEntries(m, y),
    ])
    setPayslips(!('error' in payRes) ? payRes.payslips ?? [] : [])
    setOtEntries(!('error' in otRes) ? otRes.entries ?? [] : [])
    setBonusEntries(!('error' in bonusRes) ? bonusRes.entries ?? [] : [])
  }

  // Worker actions
  async function handleCreateWorker(data: any) {
    const result = await salaryActions.createWorker(data)
    if (result && !('error' in result) && result.worker) setWorkers(prev => [...prev, result.worker].sort((a, b) => a.name.localeCompare(b.name)))
    return result
  }

  async function handleUpdateWorker(id: string, data: any) {
    const result = await salaryActions.updateWorker(id, data)
    if (result && !('error' in result) && result.worker) setWorkers(prev => prev.map(w => w.id === id ? result.worker : w))
    return result
  }

  async function handleDeleteWorker(id: string) {
    const result = await salaryActions.deleteWorker(id)
    if (result && !('error' in result) && result.success) setWorkers(prev => prev.filter(w => w.id !== id))
    return result
  }

  // OT actions
  async function handleAddOtEntry(data: any) {
    const result = await salaryActions.addOtEntry(data)
    if (result && !('error' in result) && result.entry) setOtEntries(prev => [...prev, result.entry].sort((a: any, b: any) => a.entry_date.localeCompare(b.entry_date)))
    return result
  }

  async function handleAddBulkOtEntries(entries: any[]) {
    const result = await salaryActions.addBulkOtEntries(entries)
    if (result && !('error' in result) && result.entries) {
      setOtEntries(prev => [...prev, ...result.entries].sort((a: any, b: any) => a.entry_date.localeCompare(b.entry_date)))
    }
    return result
  }

  async function handleDeleteOtEntry(id: string) {
    const result = await salaryActions.deleteOtEntry(id)
    if (result && !('error' in result) && result.success) setOtEntries(prev => prev.filter((e: any) => e.id !== id))
    return result
  }

  // Bonus actions
  async function handleAddBonusEntry(data: any) {
    const result = await salaryActions.addBonusEntry(data)
    if (result && !('error' in result) && result.entry) setBonusEntries(prev => [...prev, result.entry].sort((a: any, b: any) => a.entry_date.localeCompare(b.entry_date)))
    return result
  }

  async function handleAddBulkBonusEntries(entries: any[]) {
    const result = await salaryActions.addBulkBonusEntries(entries)
    if (result && !('error' in result) && result.entries) {
      setBonusEntries(prev => [...prev, ...result.entries].sort((a: any, b: any) => a.entry_date.localeCompare(b.entry_date)))
    }
    return result
  }

  async function handleDeleteBonusEntry(id: string) {
    const result = await salaryActions.deleteBonusEntry(id)
    if (result && !('error' in result) && result.success) setBonusEntries(prev => prev.filter((e: any) => e.id !== id))
    return result
  }

  // Payslip actions
  async function handleCreatePayslips(m: number, y: number, workingDays?: number) {
    const result = await salaryActions.createMonthlyPayslips(m, y, workingDays)
    if (result && !('error' in result) && result.payslips) setPayslips(result.payslips)
    return result
  }

  async function handleSignPayslip(id: string, signatureData?: string) {
    const result = await salaryActions.signPayslip(id, signatureData)
    if (result && !('error' in result) && result.payslip) setPayslips(prev => prev.map((p: any) => p.id === id ? result.payslip : p))
    return result
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'workers', label: 'Workers', icon: '👷' },
    { key: 'ot', label: 'OT Entries', icon: '⏱' },
    { key: 'bonus', label: 'Bonus', icon: '🎁' },
    { key: 'payslips', label: 'Payslips', icon: '📋' },
  ]

  return (
    <>
      {/* Top Bar */}
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid #e4e9f0', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, background: '#f5f3ff', borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', flexShrink: 0,
          }}>
            <IconDollar />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>Salary Management</h1>
            <p style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2 }}>Workers payroll, OT tracking & payslips</p>
          </div>
        </div>

        {/* Month/Year Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={month} onChange={e => changeMonthYear(parseInt(e.target.value), year)}
            style={{ padding: '7px 32px 7px 10px', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
            {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" min="2020" max="2030" value={year} onChange={e => changeMonthYear(month, parseInt(e.target.value) || year)}
            style={{ width: 72, padding: '7px 10px', border: '1.5px solid #e4e9f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', textAlign: 'center' }} />
        </div>
      </div>

      {/* Tabs — horizontally scrollable on mobile */}
      <div style={{ padding: '0 20px', background: '#fff', borderBottom: '1px solid #e4e9f0', display: 'flex', gap: 0, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 16px', background: 'none', border: 'none', borderBottom: activeTab === tab.key ? '2px solid #7c3aed' : '2px solid transparent',
              color: activeTab === tab.key ? '#7c3aed' : '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            }}>
            <span style={{ fontSize: 14 }}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
        {activeTab === 'workers' && (
          <WorkersTab workers={workers} role={role} onCreateWorker={handleCreateWorker} onUpdateWorker={handleUpdateWorker} onDeleteWorker={handleDeleteWorker} />
        )}
        {activeTab === 'ot' && (
          <OtEntriesTab workers={workers} entries={otEntries} month={month} year={year} userId={userId} onAddEntry={handleAddOtEntry} onAddBulkEntries={handleAddBulkOtEntries} onDeleteEntry={handleDeleteOtEntry} />
        )}
        {activeTab === 'bonus' && (
          <BonusEntriesTab workers={workers} entries={bonusEntries} month={month} year={year} userId={userId} onAddEntry={handleAddBonusEntry} onAddBulkEntries={handleAddBulkBonusEntries} onDeleteEntry={handleDeleteBonusEntry} />
        )}
        {activeTab === 'payslips' && (
          <PayslipsTab 
            payslips={payslips} 
            otEntries={otEntries}
            bonusEntries={bonusEntries}
            workers={workers}
            month={month} 
            year={year} 
            role={role} 
            onCreatePayslips={handleCreatePayslips} 
            onSignPayslip={handleSignPayslip} 
          />
        )}
      </div>
    </>
  )
}
