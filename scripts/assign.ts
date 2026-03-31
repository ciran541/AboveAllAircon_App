import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  process.exit(1);
}

const supabase = createClient(url, key);

async function assign() {
  const staffId = 'fc244a2d-5f13-4770-a8cc-2ff4dc49a96c';

  // Get active jobs (not completed)
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id')
    .neq('stage', 'Completed')
    .limit(4);

  if (error || !jobs) {
    console.error(error);
    return;
  }

  const ids = jobs.map(j => j.id);
  const { error: updateError } = await supabase
    .from('jobs')
    .update({ assigned_to: staffId })
    .in('id', ids);

  if (updateError) {
    console.error(updateError);
  } else {
    console.log(`Successfully assigned 4 jobs to staff -> ${staffId}`);
  }
}

assign();
