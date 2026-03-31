"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from 'next/link';

export default function CustomerDetailClient({ 
  customer, 
  jobs, 
  materials 
}: { 
  customer: any; 
  jobs: any[]; 
  materials: any[];
}) {
  const [cust, setCust] = useState(customer);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'jobs' | 'materials'>('jobs');
  
  const supabase = createClient();

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get('name'),
      phone: formData.get('phone'),
      email: formData.get('email'),
      address: formData.get('address'),
    };

    const { data, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', cust.id)
      .select()
      .single();

    if (!error && data) {
      setCust(data);
      setIsEditing(false);
    } else {
      alert(error?.message);
    }
    setLoading(false);
  };

  const totalRevenue = jobs.reduce((sum, j) => sum + Number(j.quoted_amount || 0), 0);
  const avgJobValue = jobs.length > 0 ? totalRevenue / jobs.length : 0;
  
  // Aggregate materials
  const aggregatedMaterials = materials.reduce((acc: any, m: any) => {
    const name = m.inventory_items?.name;
    if (!acc[name]) {
      acc[name] = { 
        name, 
        unit: m.inventory_items?.unit, 
        totalQty: 0, 
        totalCost: 0 
      };
    }
    acc[name].totalQty += m.quantity_used;
    acc[name].totalCost += m.price_at_time * m.quantity_used;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* --- HEADER --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '4px 10px', borderRadius: '6px', textTransform: 'uppercase', marginBottom: '8px', display: 'inline-block' }}>
            Customer Profile
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.8px', margin: 0 }}>
            {cust.name}
          </h1>
        </div>
        <button 
          onClick={() => setIsEditing(!isEditing)}
          style={{ 
            padding: '10px 20px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', 
            fontSize: '14px', fontWeight: 600, color: '#475569', cursor: 'pointer' 
          }}
        >
          {isEditing ? 'Cancel Edit' : 'Edit Profile'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
        
        {/* --- LEFT: INFO & STATS --- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            {isEditing ? (
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Full Name</label>
                  <input name="name" defaultValue={cust.name} className="form-input" required />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Phone</label>
                  <input name="phone" defaultValue={cust.phone} className="form-input" />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Email</label>
                  <input name="email" defaultValue={cust.email} className="form-input" type="email" />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Address</label>
                  <textarea name="address" defaultValue={cust.address} className="form-input" rows={3} />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#0f172a', color: '#fff', borderRadius: '8px', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  {loading ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Contact Info</div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>{cust.phone || 'No phone'}</div>
                  <div style={{ fontSize: '14px', color: '#64748b' }}>{cust.email || 'No email'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Address</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: '#475569', lineHeight: 1.5 }}>{cust.address || 'No address provided'}</div>
                </div>
                <div style={{ paddingTop: '16px', borderTop: '1px solid #f1f5f9' }}>
                   <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>Customer ID</div>
                   <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{cust.id}</div>
                   <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>Joined {new Date(cust.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            )}
          </div>

          <div style={{ background: '#0f172a', padding: '24px', borderRadius: '16px', color: '#fff' }}>
             <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#94a3b8', marginBottom: '24px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Financial Summary</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Lifetime Value</div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#10b981' }}>${totalRevenue.toFixed(2)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Total Jobs</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{jobs.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px' }}>Avg Ticket</div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>${avgJobValue.toFixed(2)}</div>
                  </div>
                </div>
             </div>
          </div>

        </div>

        {/* --- RIGHT: HISTORY TABS --- */}
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          
          <div style={{ display: 'flex', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <button 
              onClick={() => setActiveTab('jobs')}
              style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 700, border: 'none', background: activeTab === 'jobs' ? '#fff' : 'transparent', color: activeTab === 'jobs' ? '#2563eb' : '#64748b', cursor: 'pointer', borderBottom: activeTab === 'jobs' ? '2px solid #2563eb' : 'none' }}>
              Service History
            </button>
            <button 
              onClick={() => setActiveTab('materials')}
              style={{ padding: '16px 24px', fontSize: '14px', fontWeight: 700, border: 'none', background: activeTab === 'materials' ? '#fff' : 'transparent', color: activeTab === 'materials' ? '#2563eb' : '#64748b', cursor: 'pointer', borderBottom: activeTab === 'materials' ? '2px solid #2563eb' : 'none' }}>
              Materials Consumed
            </button>
          </div>

          <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
            
            {activeTab === 'jobs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {jobs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No service history found.</div>
                ) : (
                  jobs.map(j => (
                    <Link key={j.id} href={`/dashboard/jobs/${j.id}`} style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', transition: 'all 0.1s' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{j.service_type} - {j.ac_brand || 'TBD'}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                          {new Date(j.created_at).toLocaleDateString()} • {j.stage} • Assigned to {j.assigned_staff?.full_name || j.assigned_staff?.name || 'Unassigned'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                         <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>${Number(j.quoted_amount).toFixed(2)}</div>
                         {j.payment_status === 'Paid' ? (
                           <span style={{ fontSize: '10px', color: '#059669', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Paid</span>
                         ) : (
                           <span style={{ fontSize: '10px', color: '#d97706', background: '#fffbeb', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>Unpaid</span>
                         )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            )}

            {activeTab === 'materials' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {Object.keys(aggregatedMaterials).length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No materials usage history.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Material Name</th>
                        <th style={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'center' }}>Total Qty</th>
                        <th style={{ paddingBottom: '12px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', textAlign: 'right' }}>Total Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(aggregatedMaterials).map((m: any) => (
                        <tr key={m.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '16px 0', fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{m.name}</td>
                          <td style={{ padding: '16px 0', fontSize: '14px', fontWeight: 500, color: '#475569', textAlign: 'center' }}>{m.totalQty} {m.unit}</td>
                          <td style={{ padding: '16px 0', fontSize: '14px', fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>${m.totalCost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
