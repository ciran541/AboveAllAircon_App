import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE variables in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function seed() {
  console.log("Fetching users...");
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  
  if (usersError || !usersData?.users?.length) {
      console.log('No users found! Please log in/create an account via the UI first.');
      process.exit(1);
  }
  
  const adminId = usersData.users[0].id;
  const staffId = usersData.users.length > 1 ? usersData.users[1].id : adminId;

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  console.log("Generating dummy jobs...");
  const dummyJobs = [
    {
      created_by: adminId,
      assigned_to: null,
      stage: 'New Enquiry',
      customer_name: 'Ahmad Razali',
      phone: '8123 4567',
      address: 'Blk 123 Ang Mo Kio Ave 3 #04-123',
      service_type: 'Servicing',
      ac_brand: 'Daikin',
      unit_count: 3,
      visit_date: null,
      job_date: null,
      payment_status: 'Pending',
      notes: 'Customer reported aircon not cold. Needs standard servicing.',
    },
    {
      created_by: adminId,
      assigned_to: staffId,
      stage: 'Site Visit Scheduled',
      customer_name: 'Sarah Tan',
      phone: '9876 5432',
      address: '10 Marina Boulevard, Tower 2',
      service_type: 'Repair',
      ac_brand: 'Mitsubishi',
      unit_count: 1,
      visit_date: tomorrowStr,
      job_date: null,
      payment_status: 'Pending',
      notes: 'Aircon making weird noise and leaking water. Visit scheduled for check.',
    },
    {
      created_by: adminId,
      assigned_to: staffId,
      stage: 'Quotation Sent',
      customer_name: 'David Lim',
      phone: '9123 8888',
      address: '45 Orchard Road',
      service_type: 'Installation',
      ac_brand: 'Panasonic',
      unit_count: 4,
      visit_date: null,
      job_date: null,
      payment_status: 'Pending',
      notes: 'Needs 4 units installed in new office space. Sent quote $4500.',
    },
    {
      created_by: adminId,
      assigned_to: null,
      stage: 'Job Scheduled',
      customer_name: 'Rachel Wong',
      phone: '8234 5678',
      address: 'Blk 456 Tampines St 42 #12-456',
      service_type: 'Servicing',
      ac_brand: 'Midea',
      unit_count: 2,
      visit_date: null,
      job_date: tomorrowStr,
      payment_status: 'Pending',
      notes: 'General servicing for 2 units in living room and master bedroom.',
    },
    {
      created_by: adminId,
      assigned_to: staffId,
      stage: 'In Progress',
      customer_name: 'Michael Chen',
      phone: '9988 7766',
      address: '72 Serangoon Garden Way',
      service_type: 'Repair',
      ac_brand: 'LG',
      unit_count: 1,
      visit_date: null,
      job_date: todayStr,
      payment_status: 'Pending',
      notes: 'Replacing faulty compressor on site.',
    },
    {
      created_by: adminId,
      assigned_to: adminId,
      stage: 'In Progress',
      customer_name: 'Faizal Hassan',
      phone: '8666 4433',
      address: '22 Jurong East St 21',
      service_type: 'Servicing',
      ac_brand: 'Toshiba',
      unit_count: 3,
      visit_date: null,
      job_date: todayStr,
      payment_status: 'Pending',
      notes: 'Chemical wash for 3 units.',
    },
    {
      created_by: adminId,
      assigned_to: staffId,
      stage: 'Completed',
      customer_name: 'Jessica Lee',
      phone: '8877 6655',
      address: 'Blk 789 Woodlands Ring Rd #08-789',
      service_type: 'Servicing',
      ac_brand: 'Daikin',
      unit_count: 2,
      visit_date: null,
      job_date: null,
      payment_status: 'Paid',
      notes: 'Completed successfully. Cleaned filters and topped up gas.',
    },
    {
      created_by: adminId,
      assigned_to: staffId,
      stage: 'Completed',
      customer_name: 'Kenneth Koh',
      phone: '9111 2222',
      address: '12 Bukit Timah Road',
      service_type: 'Installation',
      ac_brand: 'Hitachi',
      unit_count: 1,
      visit_date: null,
      job_date: null,
      payment_status: 'Paid',
      notes: 'Installed new System 1 unit in master bedroom.',
    }
  ];

  const { data, error } = await supabase.from('jobs').insert(dummyJobs).select();
  
  if (error) {
    console.error('Error seeding jobs:', error);
  } else {
    console.log(`Successfully seeded ${data.length} jobs!`);
  }
}

seed();
