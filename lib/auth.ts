/**
 * lib/auth.ts
 *
 * Server-side auth helpers for role-based access control.
 * Import only from server components and API routes.
 */

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export type UserRole = 'admin' | 'staff'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  fullName: string
}

/**
 * Returns the currently authenticated user with their role.
 * Redirects to /login if not authenticated.
 */
export async function getAuthUser(): Promise<AuthUser> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    email: user.email ?? '',
    role: (profile?.role as UserRole) ?? 'staff',
    fullName: profile?.full_name ?? '',
  }
}

/**
 * Throws a redirect to /dashboard if the current user is not an admin.
 * Use at the top of admin-only pages/API routes.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const authUser = await getAuthUser()
  if (authUser.role !== 'admin') {
    redirect('/dashboard/salary')
  }
  return authUser
}
