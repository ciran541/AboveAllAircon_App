const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
  
  const supabase = createClient(url, key);

  console.log("Checking for available RPCs...");
  
  // We can't directly list RPCs via client, 
  // but we can try to call common names or use a view if we have access.
  
  const { data, error } = await supabase.from('pg_proc').select('proname').limit(10);
  if (error) {
    console.log("Cannot access pg_proc directly:", error.message);
  } else {
    console.log("Procedures:", data.map(d => d.proname));
  }
}

main();
