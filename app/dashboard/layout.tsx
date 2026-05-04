import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Sidebar from './Sidebar'
import NavigationProgress from '@/components/NavigationProgress'
import type { UserRole } from '@/lib/auth'

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

  // Parallelize profile fetch if needed (already sequentially awaited here, 
  // but we've optimized the pages which is the main win).
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const fullName = profile?.full_name ?? ''
  const role = (profile?.role as UserRole) ?? 'staff'

  // Staff can only access salary module
  if (role === 'staff') {
    const headersList = await headers()
    const url = headersList.get('x-url') || headersList.get('x-invoke-path') || ''
    // Use a simple pathname check from the referer or next-url header
    const nextUrl = headersList.get('x-next-url') || headersList.get('next-url') || ''
    // We'll enforce this on individual pages instead for reliability
  }

  return (
    <div className="dashboard-shell">
      <NavigationProgress />
      <Sidebar email={email} fullName={fullName} role={role} />
      <div className="dashboard-main">
        {children}
      </div>
    </div>
  )
}
