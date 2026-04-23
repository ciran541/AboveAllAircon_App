import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

// --- SVGs ---
function IconBriefcase() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  )
}
function IconLoader() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  )
}
function IconCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
function IconInventory() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
      <line x1="12" y1="22.08" x2="12" y2="12"></line>
    </svg>
  )
}
function IconTeam() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
function IconBox() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    </svg>
  )
}
function IconWarning() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  )
}
function IconCross() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  )
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(amount)
}

export const dynamic = 'force-dynamic'

export default async function DashboardPage({ searchParams }: { searchParams: { filter?: string, tab?: string } }) {
  const supabase = await createClient()

  // URL Params
  const params = await searchParams;
  const filter = params.filter || 'last7days';
  const tab = params.tab || 'financial';

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  let startDate = new Date();
  if (filter === 'today') {
    startDate.setHours(0,0,0,0);
  } else if (filter === 'yesterday') {
    startDate.setDate(today.getDate() - 1);
    startDate.setHours(0,0,0,0);
    // Note: To be precise for "Only Yesterday", we'd need an endDate too. 
    // But for "From Yesterday onwards", this works.
  } else if (filter === 'last7days') {
    startDate.setDate(today.getDate() - 7);
  } else if (filter === 'last30days') {
    startDate.setDate(today.getDate() - 30);
  } else if (filter === 'custom') {
    startDate.setDate(today.getDate() - 30);
  }
  const startDateStr = startDate.toISOString();

  // ── Dashboard metrics — single RPC round-trip ──
  const startDateOnly = startDateStr.split('T')[0];

  const { data: metrics } = await supabase
    .rpc('get_admin_dashboard_metrics', { p_start_date: startDateOnly });

  const m = (metrics as any) || {};

  const revenueCollected   = Number(m.revenue_collected)   || 0;
  const pendingReceivables = Number(m.pending_receivables) || 0;
  const pipelineValue      = Number(m.pipeline_value)      || 0;
  const pendingEnquiries   = Number(m.pending_enquiries)   || 0;
  const completedCount     = Number(m.completed_count)     || 0;
  const totalPeriodJobs    = Number(m.total_period_jobs)   || 0;
  const jobsTodayCount     = Number(m.jobs_today_count)    || 0;
  const healthyStock       = Number(m.healthy_stock)       || 0;
  const lowStock           = Number(m.low_stock)           || 0;
  const outOfStock         = Number(m.out_of_stock)        || 0;

  const serviceMix: Record<string, number> = {
    Servicing: 0, Repair: 0, Installation: 0,
    'Chemical Wash': 0, 'Chemical Overhaul': 0, 'Gas Top-Up': 0, Dismantling: 0,
    ...(m.service_mix || {}),
  };

  const todaysAdminJobs: any[] = Array.isArray(m.todays_jobs) ? m.todays_jobs : [];
  const safeItems: any[]       = Array.isArray(m.inv_alerts)  ? m.inv_alerts  : [];

  // Staff performance — merge RPC data with full profile names
  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name');
  const staffPerformance: Record<string, { count: number; revenue: number; name: string }> = {};
  if (profiles) {
    profiles.forEach(p => {
      staffPerformance[p.id] = { count: 0, revenue: 0, name: p.full_name || p.email };
    });
  }
  const rpcStaffPerf: Record<string, { count: number; revenue: number }> = m.staff_perf || {};
  Object.entries(rpcStaffPerf).forEach(([id, s]: [string, any]) => {
    if (!staffPerformance[id]) staffPerformance[id] = { count: 0, revenue: 0, name: 'Staff #' + id.substring(0, 4) };
    staffPerformance[id].count   = Number(s.count)   || 0;
    staffPerformance[id].revenue = Number(s.revenue) || 0;
  });

  const leaderboard    = Object.values(staffPerformance).filter(s => s.count > 0).sort((a, b) => b.count - a.count);
  const completionRate = totalPeriodJobs > 0 ? Math.round((completedCount / totalPeriodJobs) * 100) : 0;


  // --- Styles ---
  const filterBadgeStyle = (currentFilter: string) => ({
    padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
    cursor: 'pointer', color: filter === currentFilter ? '#fff' : '#64748b',
    background: filter === currentFilter ? '#2563eb' : '#f1f5f9',
    textDecoration: 'none', transition: 'all 0.15s ease'
  })

  const tabStyle = (currentTab: string) => ({
    display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 0 10px',
    borderBottom: tab === currentTab ? '2px solid #1e293b' : '2px solid transparent',
    color: tab === currentTab ? '#1e293b' : '#64748b',
    fontSize: '13px', fontWeight: 700, textTransform: 'uppercase' as const,
    letterSpacing: '0.5px', cursor: 'pointer', textDecoration: 'none', transition: 'all 0.2s',
  })

  const MetricCard = ({ title, amount, subtitle, icon, valueComponent, customColor }: any) => (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px',
      display: 'flex', flexDirection: 'column', gap: '16px',
      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', background: customColor?.bg || '#f8fafc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: customColor?.icon || '#475569' }}>
          {icon}
        </div>
      </div>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
          {title}
        </div>
        {valueComponent ? valueComponent : (
          <div style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', letterSpacing: '-1px' }}>
            {amount}
          </div>
        )}
        <div style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
          {subtitle}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '32px 40px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              Service Hub <span style={{ color: '#cbd5e1' }}>—</span> Reports
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
              Real-time analytics for your aircon business
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ padding: '6px 14px', background: '#f1f5f9', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
              LIVE
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', paddingRight: '8px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
          </div>
          <Link href={`?filter=today&tab=${tab}`} style={filterBadgeStyle('today')}>TODAY</Link>
          <Link href={`?filter=yesterday&tab=${tab}`} style={filterBadgeStyle('yesterday')}>YESTERDAY</Link>
          <Link href={`?filter=last7days&tab=${tab}`} style={filterBadgeStyle('last7days')}>LAST 7 DAYS</Link>
          <Link href={`?filter=last30days&tab=${tab}`} style={filterBadgeStyle('last30days')}>LAST 30 DAYS</Link>
          <Link href={`?filter=custom&tab=${tab}`} style={filterBadgeStyle('custom')}>CUSTOM</Link>
        </div>

        <div style={{ display: 'flex', gap: '32px' }}>
          <Link href={`?filter=${filter}&tab=financial`} style={tabStyle('financial')}>
            <IconBriefcase /> Financial
          </Link>
          <Link href={`?filter=${filter}&tab=operations`} style={tabStyle('operations')}>
            <IconCalendar /> Operations
          </Link>
          <Link href={`?filter=${filter}&tab=service`} style={tabStyle('service')}>
            <IconLoader /> Service Mix
          </Link>
          <Link href={`?filter=${filter}&tab=inventory`} style={tabStyle('inventory')}>
            <IconInventory /> Inventory
          </Link>
          <Link href={`?filter=${filter}&tab=performance`} style={tabStyle('performance')}>
            <IconTeam /> Performance
          </Link>
        </div>
      </div>

      <div style={{ padding: '40px' }}>
        
        {tab === 'financial' && (
          <div>
             <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Financial Summary</h2>
             <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>Revenue, Quotes, and Cash Flow — {filter.toUpperCase()}</p>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>
               <MetricCard title="Revenue Collected" amount={formatCurrency(revenueCollected)} subtitle="Completed & Paid Jobs"
                 icon={<svg width="20" height="20" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>} />
               <MetricCard title="Pending Receivables" amount={formatCurrency(pendingReceivables)} subtitle="Completed jobs awaiting payment"
                 icon={<svg width="20" height="20" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>} />
               <MetricCard title="Pipeline Value" amount={formatCurrency(pipelineValue)} subtitle="Total value of Sent Quotations"
                 icon={<svg width="20" height="20" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>} />
             </div>
          </div>
        )}

        {tab === 'operations' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Operations & Workload</h2>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginTop: '24px' }}>
               <MetricCard title="Jobs Scheduled Today" amount={jobsTodayCount ?? 0} subtitle="Appointments for today" icon={<IconCalendar />} />
               <MetricCard title="Pending Enquiries" amount={pendingEnquiries} subtitle="Leads requiring followup action"
                 icon={<svg width="20" height="20" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>} />
               <MetricCard title="Completion Rate" 
                 valueComponent={
                   <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                     <div style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', letterSpacing: '-1px' }}>{completionRate}%</div>
                     <div style={{ fontSize: '14px', fontWeight: 600, color: '#22c55e' }}>{completedCount} / {totalPeriodJobs}</div>
                   </div>
                 }
                 subtitle="Jobs completed vs total scheduled" icon={<IconCheck />} />
             </div>

             <div style={{ marginTop: '40px' }}>
               <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginBottom: '16px' }}>Today's Active Dispatches</h3>
               {todaysAdminJobs.length === 0 ? (
                 <div style={{ padding: '32px', textAlign: 'center', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#64748b' }}>
                   No active jobs scheduled for today across all staff.
                 </div>
               ) : (
                 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                   {todaysAdminJobs.map((job) => (
                     <div key={job.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 2px 4px -1px rgba(0,0,0,0.02)' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                         <div>
                           <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e293b' }}>{(job.customers as any)?.name || 'Unknown'}</div>
                           <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{(job.customers as any)?.address || 'No Address'}</div>
                         </div>
                         <div style={{ fontSize: '11px', fontWeight: 700, background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: '6px' }}>
                           {job.stage}
                         </div>
                       </div>
                       
                       <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', fontSize: '12px', color: '#334155' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                           <span style={{ fontWeight: 600, color: '#64748b' }}>Tech:</span>
                           <span style={{ fontWeight: 700, color: '#0f172a' }}>{job.assigned_to ? (staffPerformance[job.assigned_to]?.name || 'Unknown') : 'Unassigned'}</span>
                         </div>
                         <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                           <span style={{ fontWeight: 600, color: '#64748b' }}>Service:</span>
                           <span style={{ fontWeight: 700, color: '#2563eb' }}>{job.service_type}</span>
                         </div>
                       </div>
                       
                       <Link href={`/dashboard/jobs/${job.id}`} style={{ 
                         marginTop: 'auto', display: 'block', textAlign: 'center', background: '#eff6ff', color: '#2563eb', padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700, textDecoration: 'none'
                       }}>
                         View Details
                       </Link>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          </div>
        )}

        {tab === 'service' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '24px' }}>Service Mix Breakdown</h2>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '32px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
               <div style={{ width: '100%', height: '24px', borderRadius: '12px', display: 'flex', overflow: 'hidden', marginBottom: '32px' }}>
                 {(totalPeriodJobs > 0) ? (
                   <>
                     {Object.entries(serviceMix)
                       .filter(([, count]) => count > 0)
                       .map(([label, count], i) => {
                         const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#64748b'];
                         return (
                           <div key={label} style={{ width: `${(count / totalPeriodJobs) * 100}%`, background: colors[i % colors.length] }}></div>
                         );
                       })}
                   </>
                 ) : (
                   <div style={{ width: '100%', background: '#f1f5f9' }}></div>
                 )}
               </div>
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                 {Object.entries(serviceMix)
                   .filter(([, count]) => count > 0 || totalPeriodJobs === 0)
                   .slice(0, 6)
                   .map(([label, count], i) => {
                     const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#64748b'];
                     const bgs = ['#eff6ff','#f5f3ff','#ecfdf5','#fffbeb','#fef2f2','#ecfeff','#f8fafc'];
                     return (
                       <div key={label} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                         <div>
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                             <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: colors[i % colors.length] }}></div>
                             {label}
                           </div>
                           <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{count}</div>
                         </div>
                         <div style={{ fontSize: '14px', fontWeight: 600, color: colors[i % colors.length], background: bgs[i % bgs.length], padding: '4px 10px', borderRadius: '8px' }}>
                           {totalPeriodJobs > 0 ? Math.round((count / totalPeriodJobs) * 100) : 0}%
                         </div>
                       </div>
                     );
                   })}
               </div>
             </div>
          </div>
        )}

        {tab === 'inventory' && (
          <div>
             <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Inventory Status</h2>
             <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>Current stock levels across all products (live)</p>
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '32px' }}>
               <MetricCard title="Total Products" amount={safeItems.length} customColor={{bg: '#eff6ff', icon: '#2563eb'}} icon={<IconBox />} subtitle="Registered items" />
               <MetricCard title="Healthy Stock" amount={healthyStock} customColor={{bg: '#ecfdf5', icon: '#059669'}} icon={<IconCheck />} subtitle="Items with > 5 stock" />
               <MetricCard title="Low Stock" amount={lowStock} customColor={{bg: '#fffbeb', icon: '#d97706'}} icon={<IconWarning />} subtitle="Items with 1-5 stock" />
               <MetricCard title="Out of Stock" amount={outOfStock} customColor={{bg: '#fef2f2', icon: '#dc2626'}} icon={<IconCross />} subtitle="Depleted items" />
             </div>

             <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                   NEEDS ATTENTION ({lowStock + outOfStock})
                </h3>
                {(lowStock + outOfStock === 0) ? (
                   <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '14px', fontWeight: 600 }}>
                      <IconCheck /> All products are well-stocked!
                   </div>
                ) : (
                   <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {safeItems.filter(i => i.stock_quantity <= 5).map(item => (
                         <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', borderRadius: '10px' }}>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.name}</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: item.stock_quantity === 0 ? '#dc2626' : '#d97706' }}>
                               {item.stock_quantity} {item.unit} remaining
                            </div>
                         </div>
                      ))}
                   </div>
                )}
             </div>
          </div>
        )}

        {tab === 'performance' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Staff Performance</h2>
            <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>Completed jobs & revenue contribution — {filter.toUpperCase()}</p>
            
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
              {leaderboard.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>No completed jobs recorded for this period.</div>
              ) : (
                leaderboard.map((staff, idx) => (
                  <div key={idx} style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                    padding: '20px 24px', borderBottom: idx < leaderboard.length - 1 ? '1px solid #f1f5f9' : 'none' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ 
                        width: '40px', height: '40px', borderRadius: '12px', background: '#f1f5f9', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#475569', fontSize: '14px' 
                      }}>
                        {staff.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '15px' }}>{staff.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{staff.count} jobs completed</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: '#10b981' }}>{formatCurrency(staff.revenue)}</div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Revenue Contribution</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}


      </div>
    </div>
  )
}
