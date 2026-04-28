const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const users = [
    { id: '9513fb36-5251-4232-99dd-b344dd6bbc9b', email: 'aboveallairconsg@gmail.com', full_name: 'Main Admin' },
    { id: '34c87d41-438d-4083-8ffb-8c31d1eb0e2a', email: 'ciran@aircon.com.sg', full_name: 'Ciran Admin' }
  ];
  
  for (const u of users) {
    console.log(`Processing ${u.email}...`);
    const { data, error } = await supabase.from('profiles').upsert({
      id: u.id,
      role: 'admin',
      name: u.full_name, // Using 'name' as well just in case
      full_name: u.full_name
    });
    
    if (error) {
      console.log(`Error for ${u.email}: ${error.message}`);
    } else {
      console.log(`Success for ${u.email}`);
    }
  }
}

main();
