const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  'https://hypkgwxiefojoxhigskd.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGtnd3hpZWZvam94aGlnc2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg0NDg0MywiZXhwIjoyMDkwNDIwODQzfQ.gCmkKSEk42PbQnbulL2t66ZF1szsXPqI87gmIXDRFrA'
);

async function runMigration(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const { error } = await supabase.rpc('exec_sql', { query: sql }).catch(() => ({}));
  if (error) {
    // Try via the REST API directly
    const response = await fetch('https://hypkgwxiefojoxhigskd.supabase.co/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGtnd3hpZWZvam94aGlnc2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg0NDg0MywiZXhwIjoyMDkwNDIwODQzfQ.gCmkKSEk42PbQnbulL2t66ZF1szsXPqI87gmIXDRFrA',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5cGtnd3hpZWZvam94aGlnc2tkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg0NDg0MywiZXhwIjoyMDkwNDIwODQzfQ.gCmkKSEk42PbQnbulL2t66ZF1szsXPqI87gmIXDRFrA',
      },
      body: JSON.stringify({ query: sql }),
    });
    console.log('REST response status:', response.status);
  }
}

async function main() {
  const { createClient: createPgClient } = require('@supabase/supabase-js');
  
  const files = [
    path.join(__dirname, 'supabase/migrations/20260417000000_dashboard_metrics_rpc.sql'),
    path.join(__dirname, 'supabase/migrations/20260417000001_performance_indexes_v2.sql'),
  ];

  for (const file of files) {
    const sql = fs.readFileSync(file, 'utf8');
    console.log(`\nRunning: ${path.basename(file)}`);
    
    // Split on semicolons and run each statement
    const statements = sql.split(/;\s*\n/).filter(s => s.trim());
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      const { data, error } = await supabase.from('_').select().limit(0).throwOnError().catch(() => ({ error: null }));
      // Use raw SQL via postgres endpoint
    }

    // Use the management API approach - just log the SQL for manual run
    console.log('SQL ready. Run via Supabase dashboard SQL editor.');
    console.log('---');
  }
}

main();
