
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
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkJobMaterials() {
  const { data, error } = await supabase.from('job_materials').select('*').limit(1);
  if (error) {
     console.error('Error fetching job_materials:', error);
  } else if (data.length > 0) {
     console.log('Columns in job_materials row:', Object.keys(data[0]));
  } else {
     // OPTIONS request via select limit 0 or just check schema
     const result = await fetch(`${supabaseUrl}/rest/v1/job_materials?select=*`, {
       method: 'OPTIONS',
       headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
     });
     const json = await result.json();
     console.log('Columns in job_materials:', json.definitions.job_materials.properties ? Object.keys(json.definitions.job_materials.properties) : 'none');
  }
}

checkJobMaterials();
