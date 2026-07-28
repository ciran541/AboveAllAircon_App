import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardShell from './DashboardShell'
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const fullName = profile?.full_name ?? ''
  // Admin-only app: a missing profile row must not silently downgrade a real
  // user. Explicit role='staff' rows (if reintroduced) are still honored.
  const role = (profile?.role as UserRole) ?? 'admin'

  return (
    <>
      <NavigationProgress />
      <DashboardShell email={email} fullName={fullName} role={role}>
        {children}
      </DashboardShell>
    </>
  )
}
