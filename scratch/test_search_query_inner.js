const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const q = 'a'; // Test search
  
  const query = supabase
    .from('jobs')
    .select('id, customers!inner(name, phone)') // Force inner join
    .or(`ac_brand.ilike.%${q}%,notes.ilike.%${q}%,customers.name.ilike.%${q}%,customers.phone.ilike.%${q}%`)
    .limit(5);

  const { data, error } = await query;
  
  if (error) {
    console.log('Search Error:', error.message);
    console.log('Error details:', error);
  } else {
    console.log('Search Success, results found:', data.length);
  }
}

main();
