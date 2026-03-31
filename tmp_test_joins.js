const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const { data: job, error } = await supabase.from('jobs').select('*').limit(1).single();
  if (error) { console.log('Job fetch error:', error); return; }
  console.log('Job ID:', job.id);
  
  // Try join profiles
  const { data: joinData, error: joinErr } = await supabase
    .from('jobs')
    .select('*, profiles!assigned_to(id)')
    .eq('id', job.id)
    .single();
  
  if (joinErr) {
    console.log('Profiles join failed with assigned_to hint:', joinErr.message);
    const { data: joinData2, error: joinErr2 } = await supabase
      .from('jobs')
      .select('*, profiles!jobs_assigned_to_profiles_fkey(id)')
      .eq('id', job.id)
      .single();
    if(joinErr2) {
        console.log('Profiles join failed with fkey hint:', joinErr2.message);
    } else {
        console.log('SUCCESS with fkey hint');
    }
  } else {
    console.log('SUCCESS with assigned_to hint');
  }
}
main();
