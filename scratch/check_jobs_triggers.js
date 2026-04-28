const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.rpc('inspect_triggers', { table_name: 'jobs' });
  if (data) console.log(data);
  else console.log("No inspect_triggers RPC or error:", error?.message);
}

main();
