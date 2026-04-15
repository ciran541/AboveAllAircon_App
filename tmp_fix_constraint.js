const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function main() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
  
  const fetch_ = (await import('node-fetch')).default;
  
  const sql = `
    ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_stage_check;
    ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (
      stage IN (
        'Site Visit Scheduled',
        'Quotation Sent',
        'Job Scheduled',
        'In Progress',
        'Second Visit',
        'Job Done (Payment Pending)',
        'Completed'
      )
    );
  `;

  console.log('Updating jobs_stage_check constraint...');
  
  const res = await fetch_(`${url}/rest/v1/rpc/exec_sql`, {
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
    console.log('Successfully updated database constraint.');
  } else {
    console.error('Failed to update database constraint.');
    console.error('Response:', text);
  }
}

main().catch(console.error);
