const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Manually parse .env.local
const envFile = path.resolve('c:/Users/work/aircon-app/.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envFile));

const url = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const key = envConfig.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);

async function debug() {
  const { data: jobs } = await supabase.from('jobs').select('id, stage, assigned_to, created_at, job_date, payment_status');
  console.log('JOBS:', JSON.stringify(jobs, null, 2));

  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
  console.log('PROFILES:', JSON.stringify(profiles, null, 2));

  // Check the counts
  const completedJobs = jobs?.filter(j => j.stage === 'Completed') || [];
  console.log('Total Completed Jobs:', completedJobs.length);
}

debug();
