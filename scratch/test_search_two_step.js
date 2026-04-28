const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const q = 'a'; // Test search
  
  // 1. Search customers
  const { data: customerData } = await supabase
    .from('customers')
    .select('id')
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,address.ilike.%${q}%`)
    .limit(100);
    
  const customerIds = (customerData || []).map(c => c.id);
  console.log('Found customer IDs:', customerIds.length);

  // 2. Search jobs
  let query = supabase.from('jobs').select('id, ac_brand');
  
  const orParts = [`ac_brand.ilike.%${q}%`, `service_report_no.ilike.%${q}%`, `notes.ilike.%${q}%`, `visit_phone.ilike.%${q}%` ];
  if (customerIds.length > 0) {
    orParts.push(`customer_id.in.(${customerIds.join(',')})`);
  }
  
  const { data: jobs, error } = await query.or(orParts.join(',')).limit(5);
  
  if (error) {
    console.log('Search Error:', error.message);
  } else {
    console.log('Search Success, jobs found:', jobs.length);
  }
}

main();
