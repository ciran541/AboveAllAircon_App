import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CustomerDetailClient from '@/app/dashboard/customers/[id]/CustomerDetailClient'
import Link from 'next/link'

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { id } = await params

  // Fetch customer details
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single()

  if (custError || !customer) {
    return notFound()
  }

  // Fetch all jobs for this customer
  const { data: rawJobs } = await supabase
    .from('jobs')
    .select(`
      *
    `)
    .eq('customer_id', id)
    .order('created_at', { ascending: false })

  // Fetch staff names for these jobs separately (admin role to bypass RLS)
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const adminClient = createAdminClient();

  const jobs = rawJobs ? await Promise.all(rawJobs.map(async (j) => {
    let assignedStaff = null;
    if (j.assigned_to) {
      const { data } = await adminClient.from('profiles').select('full_name, name').eq('id', j.assigned_to).single();
      assignedStaff = data;
    }
    return { ...j, assigned_staff: assignedStaff };
  })) : [];

  // Fetch all materials used across all jobs for this customer
  let materials: any[] = []
  if (jobs && jobs.length > 0) {
    const { data: matData } = await supabase
      .from('job_materials')
      .select(`
        id, quantity_used, cost_at_time, price_at_time, job_id,
        inventory_items (name, unit)
      `)
      .in('job_id', jobs.map(j => j.id))
    materials = matData || []
  }

  return (
    <div style={{ padding: '24px 40px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <Link href="/dashboard/customers" style={{ 
          textDecoration: 'none', color: '#64748b', fontSize: '14px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Directory
        </Link>
      </div>

      <CustomerDetailClient 
        customer={customer} 
        jobs={jobs || []} 
        materials={materials || []}
      />
    </div>
  )
}
