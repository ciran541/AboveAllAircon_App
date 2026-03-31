const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.from('inventory_items').select().limit(1);
  if (data && data.length > 0) {
    console.log("Columns in inventory_items:", Object.keys(data[0]));
  } else {
    console.log("No data or error:", error?.message);
  }
}

main();
