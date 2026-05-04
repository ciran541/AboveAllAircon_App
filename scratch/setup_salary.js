const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://hypkgwxiefojoxhigskd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGtnd3hpZWZvam94aGlnc2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg0NDg0MywiZXhwIjoyMDkwNDIwODQzfQ.gCmkKSEk42PbQnbulL2t66ZF1szsXPqI87gmIXDRFrA',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function run() {
  // Create staff account
  console.log('=== Creating Staff Account ===')
  
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const staffExists = existingUsers?.users?.find(u => u.email === 'ciranjivigokul@gmail.com')
  
  if (staffExists) {
    console.log('Staff user already exists:', staffExists.id)
    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: staffExists.id,
      role: 'staff',
      full_name: 'Staff Supervisor',
    })
    console.log('Profile updated to staff:', profileErr ? profileErr.message : 'OK ✓')
  } else {
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: 'ciranjivigokul@gmail.com',
      password: 'AboveAllAircon_2026',
      email_confirm: true,
    })
    
    if (createErr) {
      console.log('Error creating user:', createErr.message)
    } else {
      console.log('Staff user created:', newUser.user.id)
      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: newUser.user.id,
        role: 'staff',
        full_name: 'Staff Supervisor',
      })
      console.log('Profile created with staff role:', profileErr ? profileErr.message : 'OK ✓')
    }
  }

  console.log('\n✅ Staff account ready!')
}

run().catch(console.error)
