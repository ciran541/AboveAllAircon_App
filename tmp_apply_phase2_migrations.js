/**
 * Applies the two Phase-2 migrations directly via the Supabase Management API.
 * Usage: node tmp_apply_phase2_migrations.js
 */
const https = require('https');
const fs    = require('fs');

// ── Credentials ───────────────────────────────────────────────────────────────
const env  = fs.readFileSync('.env.local', 'utf8');
const url  = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

// Extract the project ref from the URL, e.g. "hypkgwxiefojoxhigskd"
const ref  = new URL(url).hostname.split('.')[0];

const SQL_FILES = [
  'supabase/migrations/20260417000000_dashboard_metrics_rpc.sql',
  'supabase/migrations/20260417000001_performance_indexes_v2.sql',
];

function postSQL(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${ref}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${key}`,
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  for (const file of SQL_FILES) {
    const sql = fs.readFileSync(file, 'utf8');
    console.log(`\nApplying: ${file}`);
    try {
      const { status, body } = await postSQL(sql);
      if (status === 200 || status === 204) {
        console.log(`  ✅ OK (HTTP ${status})`);
      } else {
        console.error(`  ❌ HTTP ${status}:`, body);
      }
    } catch (err) {
      console.error(`  ❌ Error:`, err.message);
    }
  }
  console.log('\nDone.');
}

main();
