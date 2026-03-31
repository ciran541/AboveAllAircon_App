const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.rpc('inspect_table_fks', { table_name: 'jobs' });
  if (error) {
    // If no RPC, let's just use what we found in migrations: inline constraints.
    console.log("No inspect RPC. Migrations show inline references. PostgREST usually auto-names them.");
  } else {
    console.log(data);
  }
}
main();
