import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedStaffProfiles } from '@/lib/staffCache'
import { requireAdmin } from '@/lib/auth'
import UsersClient from './UsersClient'

export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  // Admin-only: redirects non-admins away before any user data is fetched.
  const authUser = await requireAdmin()

  // Fetch users via admin client
  const admin = createAdminClient()
  const [{ data: authData }, profiles] = await Promise.all([
    admin.auth.admin.listUsers(),
    getCachedStaffProfiles(),
  ])

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])

  const users = (authData?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    role: (profileMap.get(u.id)?.role ?? 'staff') as 'admin' | 'staff',
    full_name: profileMap.get(u.id)?.full_name ?? '',
  }))

  return <UsersClient initialUsers={users} currentUserId={authUser.id} />
}
