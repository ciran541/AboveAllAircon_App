const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase.rpc('get_foreign_keys_for_jobs');
  // If RPC doesn't exist, we can't use it.
  // Let's try raw query via postgrest if possible (unlikely).
  // Instead, let's try to join and let PostgREST error tell us more info if we use WRONG hint.
  
  const { error: queryErr } = await supabase
    .from('jobs')
    .select('id, profiles!created_by(id)')
    .limit(1);

  console.log('Query Error:', queryErr);
}

main();
