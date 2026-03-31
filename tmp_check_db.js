
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
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
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
  const { data, error } = await supabase.from('jobs').select('*').limit(1);
  if (error) {
    console.error('Error fetching jobs:', error);
  } else if (data.length > 0) {
    console.log('Columns in jobs table:', Object.keys(data[0] || {}));
  } else {
    console.log('No jobs found to check columns by keys of the row, checking via postgrest explanation');
    const { data: cols, error: colErr } = await supabase.from('jobs').select('*').limit(0).csv();
    if (colErr) console.error(colErr);
    else console.log('CSV Header (Columns):', cols.split('\n')[0]);
  }
}

checkColumns();
