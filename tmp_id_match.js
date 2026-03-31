const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data: jobs } = await supabase.from('jobs').select('id, assigned_to').not('assigned_to', 'is', null);
  console.log("Job IDs and their Assigned Tech IDs:");
  jobs.forEach(j => console.log(`Job: ${j.id}, Tech: ${j.assigned_to}`));

  const { data: ps } = await supabase.from('profiles').select('id, name, full_name');
  console.log("Profiles in DB:");
  ps.forEach(p => console.log(`Profile: ${p.id}, name: ${p.name}, full_name: ${p.full_name}`));
}

main();
