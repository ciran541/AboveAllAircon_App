import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import JobDetailClient from './JobDetailClient'
import Link from 'next/link'

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { id } = await params
  
  // Get active user role
  const { data: authData } = await supabase.auth.getUser()
  const currentUserId = authData?.user?.id
  const { data: currentUserProfile } = await supabase.from('profiles').select('role').eq('id', currentUserId).single()
  const userRole = currentUserProfile?.role || 'staff'

  // Fetch base job with customer
  const { data: job, error } = await supabase
    .from('jobs')
    .select(`
      *,
      customers (id, name, phone, email, address, unit_type)
    `)
    .eq('id', id)
    .single()

  if (error || !job) {
    if (error) {
      console.error('Job Detail Fetch Error:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
    }
    console.log('Attempted Job ID:', id);
    return notFound()
  }

  // Fetch staff profiles separately if linked
  let assignedStaff = null;
  let createdByStaff = null;

  // We should use an admin/service client here to ensure we can see profile names 
  // even if standard RLS restricts cross-profile visibility for staff members
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const adminClient = createAdminClient();

  if (job.assigned_to) {
    const { data: asData, error: asError } = await adminClient.from('profiles').select('id, full_name, name').eq('id', job.assigned_to).single();
    if (asData) {
      assignedStaff = asData;
    } else if (asError) {
      console.error(`DEBUG: Failed to fetch assigned staff profile for ID ${job.assigned_to}:`, asError.message);
    } else {
      console.warn(`DEBUG: No profile found for assigned_to ID ${job.assigned_to}`);
    }
  }
  if (job.created_by) {
    const { data: cbData, error: cbError } = await adminClient.from('profiles').select('id, full_name, name').eq('id', job.created_by).single();
    if (cbData) {
      createdByStaff = cbData;
    } else if (cbError) {
       console.error(`DEBUG: Failed to fetch created_by staff profile for ID ${job.created_by}:`, cbError.message);
    }
  }

  // Enrich the initialJob object for the client
  const enrichedJob = {
    ...job,
    assigned_staff: assignedStaff,
    created_by_staff: createdByStaff
  };

  console.log('DEBUG: enrichedJob assigned_staff:', !!enrichedJob.assigned_staff, {
    id: enrichedJob.id,
    assigned_to: enrichedJob.assigned_to,
    staff_name: enrichedJob.assigned_staff?.full_name || enrichedJob.assigned_staff?.name
  });

  // Fetch job materials
  const { data: materials } = await supabase
    .from('job_materials')
    .select(`
      id, item_id, quantity_used, cost_at_time, price_at_time,
      inventory_items (name, unit)
    `)
    .eq('job_id', id)

  // Fetch staff for assignment dropdown (admin/service role)
  const { data: staffProfiles } = await adminClient
    .from('profiles')
    .select('id, full_name, role, name')

  return (
    <div style={{ padding: '24px 40px', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link href="/dashboard/jobs" style={{ 
          textDecoration: 'none', color: '#64748b', fontSize: '14px', fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back to Pipeline
        </Link>
      </div>
      
      <JobDetailClient 
        initialJob={enrichedJob} 
        initialMaterials={materials || []} 
        staffProfiles={staffProfiles || []}
        userRole={userRole}
      />
    </div>
  )
}
