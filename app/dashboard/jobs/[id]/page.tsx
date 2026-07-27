import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import JobDetailClient from './JobDetailClient'
import Link from 'next/link'
import { getCachedStaffProfiles } from '@/lib/staffCache'

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

  const staffProfilesPromise = getCachedStaffProfiles();

  // Surface anything currently carrying an error, not just rows that have
  // exhausted all 5 attempts — attempts only increment on a save or the daily
  // cron, so waiting for status='failed' hid real failures for days.
  const syncIssuesPromise = adminClient
    .from('sync_queue')
    .select('id, integration, status, last_error')
    .eq('job_id', id)
    .not('last_error', 'is', null);

  // Timeline sources: what people changed, and what we told Google about it.
  const activityPromise = adminClient
    .from('job_activity')
    .select('id, actor_id, action, changes, created_at')
    .eq('job_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const calendarLogPromise = adminClient
    .from('calendar_event_log')
    .select('id, event_type, operation, success, error, created_at')
    .eq('job_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  // 2. Await them all at once (huge latency drop)
  const [
    { data: authData },
    { data: job, error },
    { data: materials },
    staffProfiles,
    { data: syncIssues },
    { data: activity },
    { data: calendarLog }
  ] = await Promise.all([
    userPromise,
    jobPromise,
    materialsPromise,
    staffProfilesPromise,
    syncIssuesPromise,
    activityPromise,
    calendarLogPromise,
  ]);

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

  // Merge "what a person changed" with "what we told Google" into one
  // chronological story — that pairing is the whole point of the timeline,
  // since either half alone fails to explain what happened to a job.
  const staffName = (actorId: string | null) => {
    if (!actorId) return null;
    const p: any = staffProfiles?.find((s: any) => s.id === actorId);
    return p?.full_name || p?.name || null;
  };

  const timeline = [
    ...(activity ?? []).map((a: any) => ({
      kind: 'activity' as const,
      id: a.id,
      at: a.created_at,
      actorName: staffName(a.actor_id),
      action: a.action,
      changes: Array.isArray(a.changes) ? a.changes : [],
    })),
    ...(calendarLog ?? []).map((c: any) => ({
      kind: 'calendar' as const,
      id: c.id,
      at: c.created_at,
      eventType: c.event_type,
      operation: c.operation,
      success: c.success,
      error: c.error,
    })),
  ]
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 60);

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
        initialSyncIssues={syncIssues || []}
        initialTimeline={timeline}
      />
    </div>
  )
}
