const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://hypkgwxiefojoxhigskd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGtnd3hpZWZvam94aGlnc2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg0NDg0MywiZXhwIjoyMDkwNDIwODQzfQ.gCmkKSEk42PbQnbulL2t66ZF1szsXPqI87gmIXDRFrA',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function run() {
  console.log('=== Updating Staff Account Password ===')
  
  const { data: existingUsers } = await supabase.auth.admin.listUsers()
  const staffExists = existingUsers?.users?.find(u => u.email === 'ciranjivigokul@gmail.com')
  
  if (staffExists) {
    console.log('Staff user found:', staffExists.id)
    const { data, error } = await supabase.auth.admin.updateUserById(
      staffExists.id,
      { password: 'AboveAllAircon_2026', email_confirm: true }
    )
    
    if (error) {
      console.log('Error updating password:', error.message)
    } else {
      console.log('Password updated successfully! ✓')
    }
  } else {
    console.log('Staff user not found!')
  }
}

run().catch(console.error)
