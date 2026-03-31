const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  console.log("Checking Jobs and Profiles...");
  const { data: jobs } = await supabase.from('jobs').select('id, assigned_to').limit(5);
  console.log("Jobs assigned_to IDs:", jobs.map(j => j.assigned_to));

  const { data: profiles } = await supabase.from('profiles').select('id, full_name, name');
  console.log("Available Profile IDs:", profiles.map(p => p.id));
  console.log("Profile Names:", profiles.map(p => p.full_name || p.name));
  
  const { data: authUsers } = await supabase.auth.admin.listUsers();
  console.log("Auth User IDs:", authUsers.users.map(u => u.id));
}

main();
