import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import UsersClient from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch users via admin client
  const admin = createAdminClient()
  const { data: authData } = await admin.auth.admin.listUsers()
  const { data: profiles } = await admin.from('profiles').select('id, role, full_name')

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])

  const users = (authData?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    role: (profileMap.get(u.id)?.role ?? 'staff') as 'admin' | 'staff',
    full_name: profileMap.get(u.id)?.full_name ?? '',
  }))

  return <UsersClient initialUsers={users} currentUserId={user.id} />
}
