
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').filter(line => line.trim().length > 0 && !line.startsWith('#')).forEach(line => {
  const parts = line.split('=');
  const key = parts[0].trim();
  const val = parts.slice(1).join('=').trim().replace(/"/g, '').replace(/'/g, '');
  env[key] = val;
});

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY; // Use admin key to check everything
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase.from('jobs').select('*').limit(1);
  if (error) {
    console.error('Error fetching jobs:', error);
  } else if (data.length > 0) {
    console.log('Columns in jobs row:', Object.keys(data[0]));
  } else {
    // Try to get a list of columns for the table
    const { data: cols, error: colErr } = await supabase.rpc('get_table_columns', { tname: 'jobs' });
    if (colErr) {
       console.log('RPC get_table_columns not found, trying query via RPC if exists...');
       // Use postgrest explanation
       const result = await fetch(`${supabaseUrl}/rest/v1/jobs?select=*`, {
         method: 'OPTIONS',
         headers: {
           'apikey': supabaseKey,
           'Authorization': `Bearer ${supabaseKey}`
         }
       });
       const json = await result.json();
       console.log('Schema definitions (columns):', json.definitions.jobs.properties ? Object.keys(json.definitions.jobs.properties) : 'not found');
    } else {
       console.log('Columns from RPC:', cols);
    }
  }
}

checkSchema();
