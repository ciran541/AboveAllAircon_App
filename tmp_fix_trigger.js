const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

async function main() {
  console.log('Applying trigger fix...');
  const fetch_ = (await import('node-fetch')).default;
  
  const sqls = [
    `DROP TRIGGER IF EXISTS tr_job_materials_change ON public.job_materials;`,
    `CREATE TRIGGER tr_job_materials_change_after AFTER INSERT OR UPDATE ON public.job_materials FOR EACH ROW EXECUTE FUNCTION handle_job_materials_change();`,
    `CREATE TRIGGER tr_job_materials_change_before BEFORE DELETE ON public.job_materials FOR EACH ROW EXECUTE FUNCTION handle_job_materials_change();`
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
      console.log('OK:', sql.substring(0, 50));
    } else {
      console.error('FAIL:', sql.substring(0, 50));
      console.error('Response:', text);
    }
  }
}

main().catch(console.error);
