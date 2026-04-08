const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function applyColumn(table, column, definition) {
  // Try adding via select to check if it exists, then add via a known pattern
  const { error } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`
  });
  if (error) {
    console.error(`  FAIL [${table}.${column}]:`, error.message);
  } else {
    console.log(`  OK: ${table}.${column}`);
  }
}

async function main() {
  console.log('Applying workflow redesign migration...');
  
  // We'll use the Supabase REST API directly with a raw HTTP call to the SQL endpoint
  const fetch_ = (await import('node-fetch')).default;
  
  const sqls = [
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS unit_type text CHECK (unit_type IN ('BTO', 'Resale', 'Condo', 'Landed', 'Commercial'))`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS visit_time text`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS visit_phone text`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_amount numeric(10,2) DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS deposit_collected numeric(10,2) DEFAULT 0`,
  ];

  for (const sql of sqls) {
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
      console.log('OK:', sql.substring(0, 70));
    } else {
      console.error('FAIL:', sql.substring(0, 70));
      console.error('  Response:', text);
    }
  }
  console.log('\nDone.');
}

main().catch(console.error);
