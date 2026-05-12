'use client'

import { useState } from 'react'
import Sidebar from './Sidebar'
import type { UserRole } from '@/lib/auth'
import Image from 'next/image'

interface DashboardShellProps {
  children: React.ReactNode
  email: string
  fullName: string
  role: UserRole
}

export default function DashboardShell({ children, email, fullName, role }: DashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="dashboard-shell">
      {/* Mobile Topbar */}
      <header className="mobile-topbar">
        <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="mobile-logo">
          <Image src="/logo.png" alt="Logo" width={100} height={30} style={{ objectFit: 'contain' }} />
        </div>
        <div style={{ width: 40 }} /> {/* Spacer to center logo */}
      </header>

      <Sidebar 
        email={email} 
        fullName={fullName} 
        role={role} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      
      <main className="dashboard-main">
        {children}
      </main>
    </div>
  )
}
