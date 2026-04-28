const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.from('profiles').select().limit(1);
  if (data && data.length > 0) {
    console.log("Columns in profiles:", Object.keys(data[0]));
  } else {
    console.log("No data in profiles table to check columns.");
    // Try to get columns from error or another way
    const { data: cols, error: err2 } = await supabase.rpc('inspect_columns', { table_name: 'profiles' });
    if (cols) console.log(cols);
    else console.log("Failed to inspect columns.");
  }
}

main();
