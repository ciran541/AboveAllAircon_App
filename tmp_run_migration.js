const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

// Use the Management API to run raw postgres queries
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

async function main() {
  // Extract project ref from URL: https://<ref>.supabase.co
  const projectRef = url.replace('https://', '').split('.')[0];
  
  const statements = [
    `alter table public.jobs add column if not exists quotation_breakdown text`,
    `alter table public.jobs add column if not exists quotation_materials text`,
  ];

  const { default: fetchFn } = await import('node-fetch');
  
  for (const sql of statements) {
    const res = await fetchFn(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    const data = await res.json();
    if (data.error || !res.ok) {
      console.error('Error:', JSON.stringify(data), '\nSQL:', sql);
    } else {
      console.log('OK:', sql);
    }
  }
  console.log('Done.');
}

main().catch(console.error);
