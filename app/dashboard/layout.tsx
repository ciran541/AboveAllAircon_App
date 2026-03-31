import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from './Sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const email = user.email ?? ''

  // Fetch role + full name from profiles table
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'staff'
  const fullName = profile?.full_name ?? ''

  return (
    <div className="dashboard-shell">
      <Sidebar email={email} role={role} fullName={fullName} />
      <div className="dashboard-main">
        {children}
      </div>
    </div>
  )
}
