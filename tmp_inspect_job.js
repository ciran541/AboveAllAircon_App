/**
 * READ-ONLY diagnostic: prints the saved document layout fields for jobs that
 * have an edited layout, so we can see why a line is duplicated.
 * Usage: node tmp_inspect_job.js
 */
const https = require('https');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const host = new URL(url).hostname;

function get(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path,
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function summarizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return '  (none)';
  return blocks
    .map((b, i) => {
      let content = '';
      if (b.type === 'text') content = JSON.stringify(b.text);
      else if (b.type === 'bullets') content = JSON.stringify(b.items);
      else if (b.type === 'priceRow') content = JSON.stringify(b.lines);
      else if (b.type === 'spacer') content = `size=${b.size}`;
      const flags = [b.hidden ? 'HIDDEN' : '', b.itemNumber != null ? `no=${b.itemNumber}` : '', b.slot ? `slot=${b.slot}` : '']
        .filter(Boolean).join(' ');
      return `  [${i}] ${b.type} ${flags}\n        ${content}`;
    })
    .join('\n');
}

async function main() {
  // Try jobs with a saved layout; also show quotation_* for comparison.
  const res = await get(
    '/rest/v1/jobs?select=id,document_blocks,quotation_materials,quotation_breakdown&document_blocks=not.is.null&limit=10'
  );
  console.log('HTTP', res.status);
  if (res.status !== 200) {
    console.log(res.body);
    return;
  }
  const rows = JSON.parse(res.body);
  if (!rows.length) {
    console.log('No jobs have document_blocks set (column empty or migration not applied with data).');
    return;
  }
  for (const r of rows) {
    console.log('\n══════════════════════════════════════════════════');
    console.log('JOB', r.id);
    console.log('document_blocks:');
    console.log(summarizeBlocks(r.document_blocks));
    console.log('quotation_materials:', JSON.stringify(r.quotation_materials));
  }
}

main();
