const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  const { data: profiles } = await supabase.from('profiles').select('id');
  
  const profileIds = new Set(profiles.map(p => p.id));
  const missing = authUsers.users.filter(u => !profileIds.has(u.id));
  
  console.log("Missing Profiles for Admin/Staff IDs:", missing.map(m => m.id));
}

main();
