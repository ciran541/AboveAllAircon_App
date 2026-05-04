import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from './Sidebar'
import NavigationProgress from '@/components/NavigationProgress'

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
    .select('full_name')
    .eq('id', user.id)
    .single()

  const fullName = profile?.full_name ?? ''

  return (
    <div className="dashboard-shell">
      <NavigationProgress />
      <Sidebar email={email} fullName={fullName} />
      <div className="dashboard-main">
        {children}
      </div>
    </div>
  )
}
