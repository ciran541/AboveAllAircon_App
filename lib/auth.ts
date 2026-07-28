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
 * Resolves the current user + role, or null if not authenticated.
 * A missing profile row defaults to 'admin': this is an admin-only app, so
 * anyone who can authenticate is a trusted operator, and a missing/broken
 * profile row must never silently lock the real user out of admin surfaces.
 * (Staff accounts, if reintroduced, get role='staff' written explicitly in
 * profiles and are gated correctly regardless of this default.)
 */
async function resolveAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    email: user.email ?? '',
    role: (profile?.role as UserRole) ?? 'admin',
    fullName: profile?.full_name ?? '',
  }
}

/**
 * Returns the currently authenticated user with their role.
 * Redirects to /login if not authenticated. Use in Server Components / pages.
 */
export async function getAuthUser(): Promise<AuthUser> {
  const authUser = await resolveAuthUser()
  if (!authUser) {
    redirect('/login')
  }
  return authUser
}

/**
 * Like getAuthUser but returns null instead of redirecting — for API routes,
 * where a thrown redirect would produce a bogus response instead of clean JSON.
 */
export async function getApiAuthUser(): Promise<AuthUser | null> {
  return resolveAuthUser()
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
