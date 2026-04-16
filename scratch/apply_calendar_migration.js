const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function main() {
  const envPath = path.join(process.cwd(), '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  envContent.split('\n').filter(line => line.trim().length > 0 && !line.startsWith('#')).forEach(line => {
    const parts = line.split('=');
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/"/g, '').replace(/'/g, '');
    env[key] = val;
  });

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  const sql = `
    alter table public.jobs
    add column if not exists google_calendar_event_id text;

    create index if not exists idx_jobs_google_calendar_event_id
    on public.jobs(google_calendar_event_id);
  `;

  console.log('Applying migration to add google_calendar_event_id...');

  const { default: fetch } = await import('node-fetch');

  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ sql }),
  });

  const text = await res.text();
  if (res.ok) {
    console.log('Successfully applied migration.');
  } else {
    console.error('Failed to apply migration.');
    console.error('Response:', text);
  }
}

main().catch(console.error);
