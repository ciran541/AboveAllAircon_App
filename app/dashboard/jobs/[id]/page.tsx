import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import JobDetailClient from './JobDetailClient'
import Link from 'next/link'

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { id } = await params
  
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const adminClient = createAdminClient();

  // 1. Kick off all independent queries concurrently
  const userPromise = supabase.auth.getUser();
  
  const jobPromise = supabase
    .from('jobs')
    .select(`
      *,
      customers (id, name, phone, email, address, unit_type)
    `)
    .eq('id', id)
    .single();

  const materialsPromise = supabase
    .from('job_materials')
    .select(`
      id, item_id, quantity_used, cost_at_time, price_at_time,
      inventory_items (name, unit)
    `)
    .eq('job_id', id);

  const staffProfilesPromise = adminClient
    .from('profiles')
    .select('id, full_name, role, name');

  // 2. Await them all at once (huge latency drop)
  const [
    { data: authData },
    { data: job, error },
    { data: materials },
    { data: staffProfiles }
  ] = await Promise.all([userPromise, jobPromise, materialsPromise, staffProfilesPromise]);

  if (error || !job) {
    console.error('Job Detail Fetch Error:', error);
    return notFound();
  }


  // 4. Map staff relationships in-memory (0 extra DB queries!)
  const assignedStaff = staffProfiles?.find(p => p.id === job.assigned_to) || null;
  const createdByStaff = staffProfiles?.find(p => p.id === job.created_by) || null;

  const enrichedJob = {
    ...job,
    assigned_staff: assignedStaff,
    created_by_staff: createdByStaff
  };

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
      />
    </div>
  )
}
