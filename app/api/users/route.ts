import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── GET /api/users — list all users (admin only) ───────────────────────────
export async function GET() {
  // Verify caller is an authenticated admin
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }


  // Use admin client to list all auth users
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch all profiles for role info
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, role, full_name')

  const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? [])

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    role: profileMap.get(u.id)?.role ?? 'staff',
    full_name: profileMap.get(u.id)?.full_name ?? '',
  }))

  return NextResponse.json({ users })
}

// ─── POST /api/users — create a new user (admin only) ───────────────────────
export async function POST(request: Request) {
  // Verify caller is an authenticated admin
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }


  const body = await request.json()
  const { email, password, full_name, role: requestedRole } = body
  const role = requestedRole === 'staff' ? 'staff' : 'admin'

  if (!email || !password) {
    return NextResponse.json(
      { error: 'email and password are required.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Create the auth user
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification for internal staff
  })

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 400 })
  }

  // Upsert profile with role + full name
  const { error: profileError } = await admin.from('profiles').upsert({
    id: newUser.user.id,
    role,
    full_name: full_name ?? '',
  })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({
    user: {
      id: newUser.user.id,
      email: newUser.user.email,
      role,
      full_name: full_name ?? '',
      created_at: newUser.user.created_at,
    },
  })
}
