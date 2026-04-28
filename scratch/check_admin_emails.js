const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function main() {
  const ids = ['9513fb36-5251-4232-99dd-b344dd6bbc9b', '34c87d41-438d-4083-8ffb-8c31d1eb0e2a'];
  
  for (const id of ids) {
    const { data: user, error } = await supabase.auth.admin.getUserById(id);
    if (user) {
      console.log(`ID: ${id}, Email: ${user.user.email}`);
    } else {
      console.log(`ID: ${id}, Error: ${error.message}`);
    }
  }
}

main();
