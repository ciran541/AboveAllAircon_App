
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

async function checkNullability() {
  const result = await fetch(`${supabaseUrl}/rest/v1/job_materials?select=*`, {
    method: 'OPTIONS',
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  const json = await result.json();
  const props = json.definitions.job_materials.properties;
  const required = json.definitions.job_materials.required || [];
  
  console.log('Required columns in job_materials:', required);
  console.log('Column details:', Object.keys(props).map(k => `${k}: ${props[k].description || ''}`));
}

checkNullability();
