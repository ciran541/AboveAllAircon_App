"use client";

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import InvoicePDF, { InvoiceData } from './InvoicePDF';
import { saveJob } from '@/app/actions/jobActions';
import { useRouter } from 'next/navigation';

const PDFViewer = dynamic(
  () => import('@react-pdf/renderer').then(mod => mod.PDFViewer),
  { ssr: false }
);

const PDFDownloadLink = dynamic(
  () => import('@react-pdf/renderer').then(mod => mod.PDFDownloadLink),
  { ssr: false }
);

interface InvoicePreviewModalProps {
  job: any;
  onClose: () => void;
  documentType?: 'invoice' | 'quotation';
  onUpdateJob?: (updates: any) => void;
}

// Helper to join array fields for textarea editing
const arrToText = (arr: string[]) => arr.join('\n');
const textToArr = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean);

export default function InvoicePreviewModal({ job, onClose, documentType = 'invoice', onUpdateJob }: InvoicePreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  const isQuotation = documentType === 'quotation';
  const defaultQuoted = Number(job?.quoted_amount || 0);
  const existingDeposit = Number(job?.deposit_collected || 0);
  const defaultDeposit = (isQuotation && existingDeposit === 0) ? defaultQuoted * 0.4 : existingDeposit;

  // ── Structured PDF data ──────────────────────────────────────────────────
  const [data, setData] = useState<InvoiceData>({
    invoiceNo: (() => {
      const now = new Date();
      const day = now.getDate().toString().padStart(2, '0');
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const min = now.getMinutes().toString().padStart(2, '0');
      return `AA${day}${month}${min}`;
    })(),
    dateStr: job?.created_at ? new Date(job.created_at).toLocaleDateString('en-GB') : '',
    attnBy: job?.engineer_name || job?.assigned_staff?.full_name || job?.assigned_staff?.name || 'Jackie',
    customerName: job?.customers?.name || '',
    customerAddress: job?.customers?.address || '-',
    customerPhone: job?.customers?.phone || '-',

    laborDesc: `Labor, materials for aircon installation for system ${job?.unit_count || 1} with new pippings, 2 trips`,
    supplyDesc: `Supply 1 set of ${job?.ac_brand || 'Aircon'} system ${job?.unit_count || 1}`,
    brandHeading: `${job?.ac_brand || 'Mitsubishi'} Starmex R32 5Ticks`,

    units: job?.quotation_breakdown
      ? textToArr(job.quotation_breakdown)
      : [
          'MXY4H33VG (Outdoor Unit)',
          'MSXYFP24VG (Indoor Unit)',
          'MSXYFP13VG (Indoor Unit)',
          'MSXYFP10VG x 2 (Indoor Unit)',
          '24k, 12k, 9k, 9k BTU',
        ],
    systemLabel: `System ${job?.unit_count || 4}`,

    materials: job?.quotation_materials
      ? textToArr(job.quotation_materials)
      : [
          '22swg copper pipings',
          'Keystone cables 3c40/3c70 (local brand)',
          '1/2 inch class 0 kflex',
          '16mm drainage pipe with insulation',
          'DNE TRUNKINGS',
        ],
    warranty: job?.quotation_warranty
      ? textToArr(job.quotation_warranty)
      : [
          '5 years compressor by Mitsubishi',
          '1 year fan coil by Mitsubishi',
          '3 years workmanship for the new pippings work',
        ],

    quotedAmount: defaultQuoted,
    depositCollected: defaultDeposit,
    balance: defaultQuoted - defaultDeposit,
    jobDateStr: job?.job_date ? new Date(job.job_date).toLocaleDateString('en-GB') : 'TBD',
    isQuotation,
    cvRedeemed: job?.cv_redeemed || false,
    cvAmount: Number(job?.cv_amount || 300),
  });

  // ── Textarea mirror state (arrays → editable text) ───────────────────────
  const [unitsText, setUnitsText] = useState(() => arrToText(data.units));
  const [materialsText, setMaterialsText] = useState(() => arrToText(data.materials));
  const [warrantyText, setWarrantyText] = useState(() => arrToText(data.warranty));

  useEffect(() => { setMounted(true); }, []);

  // Generic scalar field handler
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type, checked } = target;
    setData(prev => {
      const next = { ...prev, [name]: type === 'checkbox' ? checked : value } as any;
      if (name === 'quotedAmount' || name === 'depositCollected' || name === 'cvAmount') {
        const q = parseFloat(next.quotedAmount) || 0;
        const d = parseFloat(next.depositCollected) || 0;
        const c = parseFloat(next.cvAmount) || 0;
        next.quotedAmount = q;
        next.depositCollected = d;
        next.cvAmount = c;
        next.balance = q - d;
      }
      return next as InvoiceData;
    });
  };

  // Array field handlers — keep textarea text in sync, push parsed array to data
  const handleUnitsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUnitsText(e.target.value);
    setData(prev => ({ ...prev, units: textToArr(e.target.value) }));
  };
  const handleMaterialsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMaterialsText(e.target.value);
    setData(prev => ({ ...prev, materials: textToArr(e.target.value) }));
  };
  const handleWarrantyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setWarrantyText(e.target.value);
    setData(prev => ({ ...prev, warranty: textToArr(e.target.value) }));
  };

  // ── Instant Sync (Local) ──
  // Push changes back to parent state immediately as user types
  useEffect(() => {
    if (!mounted || !onUpdateJob) return;
    onUpdateJob({
      quoted_amount: data.quotedAmount,
      deposit_collected: data.depositCollected,
      cv_redeemed: data.cvRedeemed,
      cv_amount: data.cvAmount,
      quotation_breakdown: arrToText(data.units),
      quotation_materials: arrToText(data.materials),
      quotation_warranty: arrToText(data.warranty),
      engineer_name: data.attnBy,
    });
  }, [data.quotedAmount, data.depositCollected, data.cvRedeemed, data.cvAmount, data.units, data.materials, data.warranty, data.attnBy, mounted]);

  // ── Background Auto-Save (DB) ──
  // Throttled DB persistence (1.5s delay)
  useEffect(() => {
    if (!mounted) return;
    const timer = setTimeout(() => {
      saveJob({
        id: job.id,
        quoted_amount: data.quotedAmount,
        deposit_collected: data.depositCollected,
        cv_redeemed: data.cvRedeemed,
        cv_amount: data.cvAmount,
        quotation_breakdown: arrToText(data.units),
        quotation_materials: arrToText(data.materials),
        quotation_warranty: arrToText(data.warranty),
        engineer_name: data.attnBy,
      }).catch(err => console.error("Auto-save error:", err));
    }, 1500);
    return () => clearTimeout(timer);
  }, [data.quotedAmount, data.depositCollected, data.cvRedeemed, data.cvAmount, data.units, data.materials, data.warranty, data.attnBy, job.id, mounted]);

  const handleClose = () => {
    // Final flush on close to ensure latest stats are captured without debounce delay
    saveJob({
      id: job.id,
      quoted_amount: data.quotedAmount,
      deposit_collected: data.depositCollected,
      cv_redeemed: data.cvRedeemed,
      cv_amount: data.cvAmount,
      quotation_breakdown: arrToText(data.units),
      quotation_materials: arrToText(data.materials),
      quotation_warranty: arrToText(data.warranty),
      engineer_name: data.attnBy,
    }).then(() => router.refresh());
    onClose();
  };

  if (!mounted) return null;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: 8, border: '1px solid #cbd5e1',
    borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#475569', marginBottom: 4,
  };
  const sectionHeadStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 800, color: '#64748b',
    textTransform: 'uppercase', marginBottom: 0,
  };
  const divider = <hr style={{ border: 0, height: 1, background: '#e2e8f0', margin: '8px 0' }} />;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 1400,
        height: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 24px', borderBottom: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#f8fafc',
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            📄 Preview &amp; Edit {isQuotation ? 'Quotation' : 'Invoice'}
          </h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={handleClose} style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1',
              background: '#fff', fontWeight: 600, cursor: 'pointer', color: '#475569',
            }}>Close</button>
            <PDFDownloadLink document={<InvoicePDF data={data} />} fileName={`${isQuotation ? 'Quotation' : 'Invoice'}_${data.invoiceNo}.pdf`}>
              {({ loading }) => (
                <button disabled={loading} style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#10b981', color: '#fff', fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}>
                  {loading ? 'Generating...' : '⬇ Download PDF'}
                </button>
              )}
            </PDFDownloadLink>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* ── Left: Editor ── */}
          <div style={{
            width: '40%', borderRight: '1px solid #e2e8f0',
            overflowY: 'auto', padding: 24, background: '#fff',
          }}>
            <h3 style={sectionHeadStyle}>Invoice Details</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>

              {/* Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>{isQuotation ? 'Quotation No' : 'Invoice No'}</label>
                  <input name="invoiceNo" value={data.invoiceNo} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input name="dateStr" value={data.dateStr} onChange={handleChange} style={inputStyle} />
                </div>
              </div>

              {/* Row 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Attn By (Staff)</label>
                  <input name="attnBy" value={data.attnBy} onChange={handleChange} style={inputStyle} />
                </div>
                {!isQuotation && (
                  <div>
                    <label style={labelStyle}>Job Date</label>
                    <input name="jobDateStr" value={data.jobDateStr} onChange={handleChange} style={inputStyle} />
                  </div>
                )}
              </div>

              {divider}
              <h3 style={sectionHeadStyle}>Customer Info</h3>

              <div>
                <label style={labelStyle}>Name</label>
                <input name="customerName" value={data.customerName} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <input name="customerAddress" value={data.customerAddress} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Phone (Hp)</label>
                <input name="customerPhone" value={data.customerPhone} onChange={handleChange} style={inputStyle} />
              </div>

              {divider}
              <h3 style={sectionHeadStyle}>Job Description</h3>

              <div>
                <label style={labelStyle}>Labor Description (Item 1)</label>
                <input name="laborDesc" value={data.laborDesc} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Supply Description (Item 2)</label>
                <input name="supplyDesc" value={data.supplyDesc} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Brand / Model Heading</label>
                <input name="brandHeading" value={data.brandHeading} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Unit Lines <span style={{ fontWeight: 400, color: '#94a3b8' }}>(one per line, shown bold)</span></label>
                <textarea value={unitsText} onChange={handleUnitsChange} rows={6} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>System Label</label>
                <input name="systemLabel" value={data.systemLabel} onChange={handleChange} style={inputStyle} />
              </div>

              {divider}
              <h3 style={sectionHeadStyle}>Materials &amp; Warranty</h3>

              <div>
                <label style={labelStyle}>Materials <span style={{ fontWeight: 400, color: '#94a3b8' }}>(one per line → bullet points)</span></label>
                <textarea value={materialsText} onChange={handleMaterialsChange} rows={5} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Warranty <span style={{ fontWeight: 400, color: '#94a3b8' }}>(one per line → bullet points)</span></label>
                <textarea value={warrantyText} onChange={handleWarrantyChange} rows={4} style={inputStyle} />
              </div>

              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="cvRedeemed" name="cvRedeemed" checked={data.cvRedeemed} onChange={handleChange} style={{ width: 16, height: 16, cursor: 'pointer' }} />
                <label htmlFor="cvRedeemed" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>Apply SG Climate Voucher (CV Redeemed)</label>
              </div>

              {data.cvRedeemed && (
                <div style={{ marginTop: 12 }}>
                  <label style={labelStyle}>CV Amount ($)</label>
                  <input name="cvAmount" type="number" value={data.cvAmount} onChange={handleChange} style={inputStyle} />
                </div>
              )}

              {divider}
              <h3 style={sectionHeadStyle}>Financials</h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingBottom: 32 }}>
                <div>
                  <label style={labelStyle}>Total Amount ($)</label>
                  <input name="quotedAmount" type="number" value={data.quotedAmount} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>{isQuotation ? 'Deposit ($)' : 'Deposit Collected ($)'}</label>
                  <input name="depositCollected" type="number" value={data.depositCollected} onChange={handleChange} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Balance ($)</label>
                  <input value={data.balance} readOnly style={{ ...inputStyle, background: '#f1fdf7', color: '#059669', fontWeight: 700 }} />
                </div>
              </div>

            </div>
          </div>

          {/* ── Right: PDF Viewer ── */}
          <div style={{ width: '60%', background: '#cbd5e1', display: 'flex', flexDirection: 'column' }}>
            <PDFViewer width="100%" height="100%" style={{ border: 'none' }}>
              <InvoicePDF data={data} />
            </PDFViewer>
          </div>

        </div>
      </div>
    </div>
  );
}