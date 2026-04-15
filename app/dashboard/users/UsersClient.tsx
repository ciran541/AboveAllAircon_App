'use client'

import { useState } from 'react'

export type AppUser = {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'staff'
  created_at: string
}

// ─── SVG Icons ─────────────────────────────────────────────────────────────
function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" />
    </svg>
  )
}

function IconUserSmall() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function getInitials(name: string, email: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0].substring(0, 2).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Create User Modal ─────────────────────────────────────────────────────
function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (user: AppUser) => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'staff'>('staff')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName, role }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error ?? 'Failed to create user.')
      return
    }

    onCreated(json.user)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(17,24,39,0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12), 0 10px 10px -5px rgba(0,0,0,0.05)',
          padding: 28,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>
              Add Team Member
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>
              Create a new account for your team.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32,
              background: 'none', border: '1px solid #e4e9f0',
              borderRadius: 8, color: '#9ca3af', cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <IconX />
          </button>
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', marginBottom: 16,
            background: '#fef2f2', border: '1px solid rgba(220,38,38,0.25)',
            borderRadius: 8, color: '#dc2626', fontSize: 13,
          }}>
            <span>⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
              Full Name
            </label>
            <input
              className="form-input"
              placeholder="e.g. Ahmad Razali"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
              Email Address
            </label>
            <input
              id="new-user-email"
              type="email"
              required
              className="form-input"
              placeholder="staff@airconpro.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
              Temporary Password
            </label>
            <input
              id="new-user-password"
              type="password"
              required
              minLength={6}
              className="form-input"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Role selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 8 }}>
              Role
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Staff option */}
              <button
                type="button"
                onClick={() => setRole('staff')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 14px',
                  border: `2px solid ${role === 'staff' ? '#2563eb' : '#e4e9f0'}`,
                  borderRadius: 10,
                  background: role === 'staff' ? '#eff6ff' : '#fff',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #059669, #0d9488)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                }}>
                  <IconUserSmall />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827' }}>Staff</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>Can view and manage assigned jobs</div>
                </div>
              </button>

              {/* Admin option */}
              <button
                type="button"
                onClick={() => setRole('admin')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 14px',
                  border: `2px solid ${role === 'admin' ? '#2563eb' : '#e4e9f0'}`,
                  borderRadius: 10,
                  background: role === 'admin' ? '#eff6ff' : '#fff',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                }}>
                  <IconShield />
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111827' }}>Admin</div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>Full access including user management</div>
                </div>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10,
            paddingTop: 18, borderTop: '1px solid #e4e9f0',
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              style={{
                padding: '9px 18px',
                background: '#fff', border: '1.5px solid #e4e9f0',
                borderRadius: 8, fontSize: 13.5, fontWeight: 500,
                color: '#374151', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              id="create-user-submit"
              type="submit"
              disabled={loading}
              style={{
                padding: '9px 20px',
                background: loading ? '#93c5fd' : '#2563eb',
                border: 'none', borderRadius: 8,
                fontSize: 13.5, fontWeight: 600,
                color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              {loading ? 'Creating…' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main UsersClient ──────────────────────────────────────────────────────
export default function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AppUser[]
  currentUserId: string
}) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers)
  const [showModal, setShowModal] = useState(false)

  function handleCreated(user: AppUser) {
    setUsers((prev) => [user, ...prev])
    setShowModal(false)
  }

  const adminCount = users.filter((u) => u.role === 'admin').length
  const staffCount = users.filter((u) => u.role === 'staff').length

  return (
    <>
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '16px 28px',
        borderBottom: '1px solid #e4e9f0',
        background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 16, flexShrink: 0,
      }}>
        {/* Left */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40,
            background: '#eff6ff',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2563eb', flexShrink: 0,
          }}>
            <IconUsers />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#111827', letterSpacing: '-0.3px' }}>
              Team Members
            </h1>
            <p style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2 }}>
              {users.length} accounts · {adminCount} admin · {staffCount} staff
            </p>
          </div>
        </div>

        {/* Add Member button */}
        <button
          id="open-create-user-modal"
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '9px 18px',
            background: '#2563eb', color: '#fff',
            border: 'none', borderRadius: 8,
            fontSize: 13.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap', flexShrink: 0,
            boxShadow: '0 1px 3px rgba(37,99,235,0.3)',
          }}
        >
          <IconPlus />
          Add Member
        </button>
      </div>

      {/* ── Page Content ────────────────────────────────────────────────── */}
      <div style={{ padding: '24px 28px' }}>

        {/* Stats Row */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#fff', border: '1px solid #e4e9f0',
          borderRadius: 12, padding: '0 24px',
          marginBottom: 20,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '18px 28px 18px 0' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#111827', lineHeight: 1, letterSpacing: '-0.5px' }}>
              {users.length}
            </div>
            <div style={{ fontSize: 11.5, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>
              Total Users
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: '#e4e9f0', marginRight: 28, flexShrink: 0 }} />
          <div style={{ padding: '18px 28px 18px 0' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb', lineHeight: 1, letterSpacing: '-0.5px' }}>
              {adminCount}
            </div>
            <div style={{ fontSize: 11.5, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>
              Administrators
            </div>
          </div>
          <div style={{ width: 1, height: 36, background: '#e4e9f0', marginRight: 28, flexShrink: 0 }} />
          <div style={{ padding: '18px 0' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#059669', lineHeight: 1, letterSpacing: '-0.5px' }}>
              {staffCount}
            </div>
            <div style={{ fontSize: 11.5, color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 4 }}>
              Staff Members
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div style={{
          background: '#fff', border: '1px solid #e4e9f0',
          borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}>
          {/* Table Head */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr 110px 130px',
            gap: 12, padding: '10px 20px',
            background: '#f8fafc', borderBottom: '1px solid #e4e9f0',
          }}>
            {['Member', 'Email', 'Role', 'Joined'].map((h) => (
              <div key={h} style={{
                fontSize: 11, fontWeight: 700, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '0.8px',
              }}>
                {h}
              </div>
            ))}
          </div>

          {/* Empty */}
          {users.length === 0 && (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>No users yet</div>
              <div style={{ fontSize: 13 }}>Add your first team member above.</div>
            </div>
          )}

          {/* Rows */}
          {users.map((u, i) => {
            const isMe = u.id === currentUserId
            const initials = getInitials(u.full_name, u.email)
            const avatarBg = u.role === 'admin'
              ? 'linear-gradient(135deg,#2563eb,#7c3aed)'
              : 'linear-gradient(135deg,#059669,#0d9488)'

            return (
              <div
                key={u.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.2fr 110px 130px',
                  gap: 12, padding: '14px 20px',
                  borderBottom: i < users.length - 1 ? '1px solid #f1f5f9' : 'none',
                  alignItems: 'center',
                  background: i % 2 === 1 ? '#fafbfc' : '#fff',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 1 ? '#fafbfc' : '#fff')}
              >
                {/* Member */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: avatarBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12.5, fontWeight: 700, color: '#fff',
                    flexShrink: 0, letterSpacing: '-0.3px',
                  }}>
                    {initials}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.full_name || '—'}
                    </span>
                    {isMe && (
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        background: '#eff6ff', color: '#2563eb',
                        padding: '1px 6px', borderRadius: 99,
                        border: '1px solid rgba(37,99,235,0.2)',
                        flexShrink: 0,
                      }}>
                        You
                      </span>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#4b5563', fontSize: 13, minWidth: 0 }}>
                  <span style={{ flexShrink: 0, color: '#9ca3af' }}><IconMail /></span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</span>
                </div>

                {/* Role pill */}
                <div>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 99,
                    fontSize: 11.5, fontWeight: 600, textTransform: 'capitalize',
                    ...(u.role === 'admin'
                      ? { background: '#eff6ff', color: '#2563eb', border: '1px solid rgba(37,99,235,0.2)' }
                      : { background: '#ecfdf5', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }
                    )
                  }}>
                    {u.role === 'admin' ? <IconShield /> : <IconUserSmall />}
                    {u.role}
                  </span>
                </div>

                {/* Joined date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9ca3af', fontSize: 12.5 }}>
                  <IconCalendar />
                  {formatDate(u.created_at)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {showModal && (
        <CreateUserModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}
    </>
  )
}
