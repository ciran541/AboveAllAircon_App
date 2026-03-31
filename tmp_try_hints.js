const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data: fks, error } = await supabase.rpc('get_foreign_keys', { t_name: 'jobs' });
  if (error) {
    // try direct SQL if we have access (probably not via RPC)
    console.log("No RPC, using inspection select...");
    // Just try common names
    const hints = ['assigned_to', 'created_by', 'profiles_assigned_to_fkey', 'profiles_created_by_fkey'];
    for(const hint of hints) {
      const { error: err } = await supabase.from('jobs').select(`profiles!${hint}(id)`).limit(1);
      console.log(`Hint '${hint}':`, err ? err.message : 'SUCCESS');
    }
  } else {
    console.log(JSON.stringify(fks, null, 2));
  }
}

main();
