import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  process.exit(1);
}

const supabase = createClient(url, key);

async function seedInventoryAndMaterials() {
  console.log('Seeding inventory items...');

  const inventoryItems = [
    { name: 'Copper Pipe (3/8")', unit: 'meters', stock_quantity: 150 },
    { name: 'Armaflex Insulation', unit: 'rolls', stock_quantity: 40 },
    { name: 'Freon R32 Gas', unit: 'kg', stock_quantity: 85 },
    { name: 'Condenser Bracket', unit: 'set', stock_quantity: 30 },
    { name: 'PVC Drainage Pipe', unit: 'meters', stock_quantity: 200 },
    { name: 'Capacitor 45uF', unit: 'pcs', stock_quantity: 5 } // Low stock example
  ];

  const { data: insertedItems, error: invError } = await supabase
    .from('inventory_items')
    .insert(inventoryItems)
    .select();

  if (invError || !insertedItems) {
    console.error('Failed to insert inventory items:', invError);
    return;
  }
  
  console.log(`Successfully added ${insertedItems.length} inventory items.`);

  console.log('Fetching active jobs to assign materials...');
  const { data: jobs, error: jobError } = await supabase
    .from('jobs')
    .select('id, created_by')
    .limit(3);

  if (jobError || !jobs || jobs.length === 0) {
    console.error('Failed to fetch jobs or no jobs available:', jobError);
    return;
  }

  console.log(`Found ${jobs.length} jobs. Assigning materials...`);

  // Assign 1-2 random materials to each fetched job
  for (const job of jobs) {
    const materialsToLog = [
      {
        job_id: job.id,
        item_id: insertedItems[0].id, // Copper Pipe
        quantity_used: 5,
        created_by: job.created_by
      },
      {
        job_id: job.id,
        item_id: insertedItems[1].id, // Insulation
        quantity_used: 2,
        created_by: job.created_by
      }
    ];

    const { error: matError } = await supabase
      .from('job_materials')
      .insert(materialsToLog);

    if (matError) {
      console.error(`Failed to assign materials to job ${job.id}:`, matError);
    } else {
      console.log(`Assigned 2 items to job ${job.id}`);
    }
  }

  console.log('Seeding completed successfully!');
}

seedInventoryAndMaterials();
