import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

const BLUE = '#7bc7fb';
const BLACK = '#000000';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingBottom: 50,
    fontFamily: 'Times-Roman',
    fontSize: 10.5,
    color: '#000',
  },

  /* ── Header ── */
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  logo: {
    width: 105,
    marginBottom: 5,
  },
  companyInfo: {
    fontSize: 8.5,
    lineHeight: 1.45,
  },
  bold: { fontFamily: 'Times-Bold' },

  invoiceBlock: {
    alignItems: 'flex-start',
  },
  invoiceTitle: {
    fontFamily: 'Times-Bold',
    fontSize: 28,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  detailLabel: {
    fontFamily: 'Times-Bold',
    width: 75,
    fontSize: 10.5,
  },
  detailValue: {
    fontSize: 10.5,
  },

  /* ── Section title box ── */
  sectionBox: {
    backgroundColor: BLUE,
    borderWidth: 1,
    borderColor: BLACK,
    paddingVertical: 3,
    paddingHorizontal: 5,
    marginBottom: 6,
  },
  sectionBoxText: {
    fontFamily: 'Times-Bold',
    fontSize: 10.5,
  },

  /* ── Bill To ── */
  billRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  billLabel: {
    fontFamily: 'Times-Bold',
    marginRight: 4,
    fontSize: 10.5,
  },
  billValue: {
    fontSize: 10.5,
    flex: 1,
  },

  /* ── Table ── */
  table: {
    borderWidth: 1.5,
    borderColor: BLACK,
    marginTop: 8,
  },

  // Header row
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: BLACK,
    backgroundColor: '#ffffff',
  },
  thNo: { width: '8%', borderRightWidth: 1.5, borderColor: BLACK, paddingVertical: 5, paddingHorizontal: 3, fontFamily: 'Times-Bold', textAlign: 'center', fontSize: 10.5 },
  thDesc: { width: '62%', borderRightWidth: 1.5, borderColor: BLACK, paddingVertical: 5, paddingHorizontal: 3, fontFamily: 'Times-Bold', textAlign: 'center', fontSize: 10.5 },
  thQty: { width: '15%', borderRightWidth: 1.5, borderColor: BLACK, paddingVertical: 5, paddingHorizontal: 3, fontFamily: 'Times-Bold', textAlign: 'center', fontSize: 10.5 },
  thAmt: { width: '15%', paddingVertical: 5, paddingHorizontal: 3, fontFamily: 'Times-Bold', textAlign: 'center', fontSize: 10.5 },

  // Body row
  tableBody: {
    position: 'relative',
    minHeight: 220,
  },
  tableBodyBorders: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tdNo: {
    width: '8%',
    padding: 6,
    fontSize: 10.5,
    textAlign: 'center',
  },
  tdDesc: {
    width: '62%',
    padding: 6,
    fontSize: 10.5,
    lineHeight: 1.5,
  },
  tdQty: {
    width: '15%',
    padding: 6,
    textAlign: 'center',
    fontSize: 10.5,
  },
  tdAmt: {
    width: '15%',
    padding: 6,
    textAlign: 'center',
    fontSize: 10.5,
  },

  // Within description column
  descItem: {
    marginBottom: 2,
  },
  descBold: {
    fontFamily: 'Times-Bold',
    marginBottom: 1,
  },
  bulletLine: {
    flexDirection: 'row',
    marginBottom: 1,
    paddingLeft: 4,
    alignItems: 'flex-start',
  },
  bulletDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
    backgroundColor: '#000000',
    marginTop: 4.5,
    marginRight: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 10.5,
  },
  spacer: { marginTop: 7 },
  smallSpacer: { marginTop: 4 },
  blankLine: { height: 6 },

  // Totals
  totalsRow: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: BLACK,
  },
  totalsLeftCell: {
    width: '70%',
    borderRightWidth: 1.5,
    borderColor: BLACK,
  },
  totalsRightCol: {
    width: '30%',
  },
  totalLine: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: BLACK,
  },
  totalLabelCell: {
    width: '50%',
    borderRightWidth: 1.5,
    borderColor: BLACK,
    paddingVertical: 5,
    textAlign: 'center',
    fontFamily: 'Times-Bold',
    fontSize: 10.5,
  },
  totalValueCell: {
    width: '50%',
    paddingVertical: 5,
    textAlign: 'center',
    fontSize: 10.5,
  },
  balanceBg: {
    backgroundColor: '#00ff00',
  },
  balancePaidBg: {
    backgroundColor: '#dcfce7',
  },
  balancePaidText: {
    color: '#15803d',
    fontFamily: 'Times-Bold',
  },

  /* ── PAID stamp watermark ── */
  paidStamp: {
    position: 'absolute',
    top: '38%',
    left: '18%',
    width: '64%',
    textAlign: 'center',
    fontFamily: 'Times-Bold',
    fontSize: 88,
    color: '#16a34a',
    opacity: 0.13,
    transform: 'rotate(-30deg)',
  },

  /* ── Footer ── */
  footer: {
    marginTop: 14,
    fontSize: 10.5,
    lineHeight: 1.5,
  },
  footerBold: {
    fontFamily: 'Times-Bold',
    marginBottom: 2,
  },
});

export interface InvoiceData {
  invoiceNo: string;
  dateStr: string;
  attnBy: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  // Line 1: labor description  e.g. "Labor, materials for aircon installation for system 4 with new pippings, 2 trips"
  laborDesc: string;
  // Line 2: supply description  e.g. "Supply 1 set of Mitsubishi Starmex system 4"
  supplyDesc: string;
  // Brand/model heading  e.g. "Mitsubishi Starmex R32 5Ticks"
  brandHeading: string;
  // Individual unit lines
  units: string[];           // e.g. ["MXY4H33VG (Outdoor Unit)", "MSXYFP24VG (Indoor Unit)", ...]
  systemLabel: string;       // e.g. "System 4"
  // Materials bullets
  materials: string[];       // e.g. ["22swg copper pipings", ...]
  // Warranty bullets
  warranty: string[];        // e.g. ["5 years compressor by Mitsubishi", ...]
  quotedAmount: number;
  depositCollected: number;
  balance: number;
  jobDateStr: string;        // e.g. "March 25th, 2026" or "TBD"
  isQuotation?: boolean;
  cvRedeemed?: boolean;
  cvAmount?: number;
  paymentCompany?: 'Above All Aircon' | 'Letswork';
  hideSupplyDesc?: boolean;
  hideMaterialsHeading?: boolean;
  fullyPaid?: boolean;       // When true: shows PAID stamp + zero balance
  finalPaymentCollected?: number; // Amount collected as final balance payment
}

interface InvoicePDFProps {
  data: InvoiceData;
}

/** react-pdf drops whitespace at the start of a line during layout, so convert
 *  leading spaces/tabs to non-breaking spaces to keep the indentation as typed. */
const keepIndent = (s: string) => s.replace(/^[ \t]+/, m => String.fromCharCode(0xA0).repeat(m.length));

/** Small helper — one bullet point line */
const Bullet: React.FC<{ text: string }> = ({ text }) => {
  // A blank line becomes a compact vertical gap (no dot), so spacing is preserved.
  if (!text.trim()) {
    return <View style={styles.blankLine} />;
  }
  // Strip only a leading bullet glyph (and one adjacent space); keep any indentation.
  const cleanedText = keepIndent(text.replace(/^[•✔✅\-\*]+ ?/, ''));
  return (
    <View style={styles.bulletLine}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{cleanedText}</Text>
    </View>
  );
};

const InvoicePDF: React.FC<InvoicePDFProps> = ({ data }) => {
  const logoUrl = '/logo.png';

  const formattedDeposit = `S$${data.depositCollected.toFixed(0)}`;
  const depositLabel = data.isQuotation 
    ? formattedDeposit 
    : (data.depositCollected > 0 ? `${formattedDeposit}\nCollected` : formattedDeposit);

  // For fully-paid receipts, balance displayed is always $0
  const displayBalance = data.fullyPaid ? 0 : data.balance;

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap={false}>

        {/* ── PAID WATERMARK (only on fully-paid receipts) ── */}
        {data.fullyPaid && (
          <Text style={styles.paidStamp}>PAID</Text>
        )}

        {/* ── HEADER ── */}
        <View style={styles.headerRow}>
          {/* Left: logo + company info */}
          <View>
            <Image src={logoUrl} style={styles.logo} />
            <View style={styles.companyInfo}>
              <Text style={styles.bold}>UEN: 202538280D</Text>
              <Text style={styles.bold}>21 BUKIT BATOK CRESCENT</Text>
              <Text style={styles.bold}>#12-78 WCEGA TOWER</Text>
              <Text style={styles.bold}>TEL: +65 98596637</Text>
            </View>
          </View>

          {/* Right: Invoice title + details */}
          <View style={styles.invoiceBlock}>
            <Text style={styles.invoiceTitle}>{data.isQuotation ? 'Quotation' : 'Invoice'}</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{data.isQuotation ? 'Quotation No:' : 'Invoice No:'}</Text>
              <Text style={styles.detailValue}>{data.invoiceNo}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Date:</Text>
              <Text style={styles.detailValue}>{data.dateStr}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Attn by:</Text>
              <Text style={styles.detailValue}>{data.attnBy}</Text>
            </View>
          </View>
        </View>

        {/* ── BILL TO ── */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionBoxText}>Bill to</Text>
        </View>
        {data.customerName ? (
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Name:</Text>
            <Text style={styles.billValue}>{data.customerName}</Text>
          </View>
        ) : null}
        <View style={styles.billRow}>
          <Text style={styles.billLabel}>Address:</Text>
          <Text style={styles.billValue}>{data.customerAddress}</Text>
        </View>
        <View style={[styles.billRow, { marginBottom: 10 }]}>
          <Text style={styles.billLabel}>Hp:</Text>
          <Text style={styles.billValue}>{data.customerPhone}</Text>
        </View>

        {/* ── PRODUCT SERVICES ── */}
        <View style={styles.sectionBox}>
          <Text style={styles.sectionBoxText}>Product Services</Text>
        </View>

        {/* ── TABLE ── */}
        <View style={styles.table}>

          {/* Table header */}
          <View style={styles.tableHead}>
            <Text style={styles.thNo}>No</Text>
            <Text style={styles.thDesc}>Job description</Text>
            <Text style={styles.thQty}>Quantity</Text>
            <Text style={styles.thAmt}>Amount</Text>
          </View>

          {/* Table body */}
          <View style={styles.tableBody}>
            {/* Borders Underlay */}
            <View style={styles.tableBodyBorders}>
              <View style={{ width: '8%', borderRightWidth: 1.5, borderColor: BLACK }} />
              <View style={{ width: '62%', borderRightWidth: 1.5, borderColor: BLACK }} />
              <View style={{ width: '15%', borderRightWidth: 1.5, borderColor: BLACK }} />
              <View style={{ width: '15%' }} />
            </View>

            <View style={{ flexDirection: 'column' }}>
              {/* Row 1 — a quotation lists only the unit lines, so the labor,
                  supply and brand rows below are invoice/receipt only. */}
              {!data.isQuotation && (
                <View style={styles.tableRow}>
                  <View style={styles.tdNo}>
                    <Text>1</Text>
                  </View>
                  <View style={[styles.tdDesc, { paddingBottom: 0 }]}>
                    <Text style={styles.descItem}>{keepIndent(data.laborDesc)}</Text>
                  </View>
                  <View style={styles.tdQty} />
                  <View style={styles.tdAmt} />
                </View>
              )}

              {/* Row 2.1: Supply */}
              {!data.isQuotation && !data.hideSupplyDesc && (
                <View style={styles.tableRow}>
                  <View style={[styles.tdNo, { paddingTop: 7 }]}>
                    <Text>2</Text>
                  </View>
                  <View style={[styles.tdDesc, { paddingTop: 7, paddingBottom: 0 }]}>
                    <Text style={styles.descItem}>{keepIndent(data.supplyDesc)}</Text>
                  </View>
                  <View style={styles.tdQty} />
                  <View style={styles.tdAmt} />
                </View>
              )}

              {/* Row 2.2: Brand */}
              {!data.isQuotation && (
                <View style={styles.tableRow}>
                  <View style={[styles.tdNo, { paddingTop: data.hideSupplyDesc ? 7 : 0 }]}>
                    {data.hideSupplyDesc && <Text>2</Text>}
                  </View>
                  <View style={[styles.tdDesc, { paddingTop: data.hideSupplyDesc ? 7 : 4, paddingBottom: 0 }]}>
                    <Text style={styles.descBold}>{keepIndent(data.brandHeading)}</Text>
                  </View>
                  <View style={styles.tdQty} />
                  <View style={styles.tdAmt} />
                </View>
              )}

              {/* Row 2.3: Units & QTY & AMT — numbered itself on a quotation,
                  where nothing precedes it. */}
              <View style={styles.tableRow}>
                <View style={[styles.tdNo, { paddingTop: data.isQuotation ? 7 : 0 }]}>
                  {data.isQuotation && <Text>1</Text>}
                </View>
                <View style={[styles.tdDesc, { paddingTop: data.isQuotation ? 7 : 4, paddingBottom: 0 }]}>
                  {data.units.map((u, i) => (
                    u.trim()
                      ? <Text key={i} style={styles.descBold}>{keepIndent(u)}</Text>
                      : <View key={i} style={styles.blankLine} />
                  ))}
                </View>
                <View style={[styles.tdQty, { paddingTop: 4, paddingBottom: 0 }]}>
                  <Text>1</Text>
                </View>
                <View style={[styles.tdAmt, { paddingTop: 4, paddingBottom: 0 }]}>
                  <Text>S${data.quotedAmount.toFixed(0)}</Text>
                </View>
              </View>

              {/* Row 2.4: System Label */}
              <View style={styles.tableRow}>
                <View style={styles.tdNo} />
                <View style={[styles.tdDesc, { paddingTop: 2, paddingBottom: 0 }]}>
                  <Text style={[styles.descBold, { marginTop: 0 }]}>{keepIndent(data.systemLabel)}</Text>
                </View>
                <View style={styles.tdQty} />
                <View style={styles.tdAmt} />
              </View>

              {/* Row 2.5: Materials & Warranty */}
              <View style={styles.tableRow}>
                <View style={styles.tdNo} />
                <View style={[styles.tdDesc, { paddingTop: 7 }]}>
                  {!data.hideMaterialsHeading && (
                    <>
                      <Text style={styles.descItem}>Installation with Full Upgraded Materials as below:</Text>
                      <View style={styles.smallSpacer} />
                    </>
                  )}
                  {data.materials.map((m, i) => (
                    <Bullet key={i} text={m} />
                  ))}

                  <View style={styles.spacer} />
                  <Text style={styles.descItem}>Warranty</Text>
                  {data.warranty.map((w, i) => (
                    <Bullet key={i} text={w} />
                  ))}
                </View>
                <View style={styles.tdQty} />
                <View style={styles.tdAmt} />
              </View>
            </View>
          </View>

          {/* Totals */}
          <View style={styles.totalsRow}>
            <View style={styles.totalsLeftCell} />
            <View style={styles.totalsRightCol}>
              <View style={styles.totalLine}>
                <Text style={styles.totalLabelCell}>Total</Text>
                <Text style={styles.totalValueCell}>S${data.quotedAmount.toFixed(0)}</Text>
              </View>
              {data.cvRedeemed && (
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLabelCell, { color: '#10b981' }]}>CV Redeemed</Text>
                  <Text style={[styles.totalValueCell, { color: '#10b981' }]}>
                    S${(data.cvAmount || 0).toFixed(0)}
                  </Text>
                </View>
              )}
              <View style={styles.totalLine}>
                <Text style={styles.totalLabelCell}>{data.isQuotation ? 'Deposit' : 'Deposit'}</Text>
                <Text style={styles.totalValueCell}>{depositLabel}</Text>
              </View>
              {data.fullyPaid && (data.finalPaymentCollected || 0) > 0 && (
                <View style={styles.totalLine}>
                  <Text style={styles.totalLabelCell}>Final Payment{`\n`}Collected</Text>
                  <Text style={styles.totalValueCell}>S${(data.finalPaymentCollected || 0).toFixed(0)}{`\n`}Collected</Text>
                </View>
              )}
              {data.fullyPaid ? (
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLabelCell, styles.balancePaidBg, styles.balancePaidText]}>Balance</Text>
                  <Text style={[styles.totalValueCell, styles.balancePaidBg, styles.balancePaidText]}>
                    S$0{`\n`}FULLY PAID
                  </Text>
                </View>
              ) : (
                <View style={styles.totalLine}>
                  <Text style={[styles.totalLabelCell, styles.balanceBg]}>Balance</Text>
                  <Text style={[styles.totalValueCell, styles.balanceBg]}>
                    S${displayBalance.toFixed(0)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.footer}>
          {data.cvRedeemed && (
            <Text style={[styles.footerBold, { marginBottom: 12, color: '#10b981' }]}>
              CV redeemed (SG Climate Voucher)
            </Text>
          )}
          {data.fullyPaid ? (
            <Text style={[styles.footerBold, { marginBottom: 12, color: '#15803d' }]}>
              ✓ Payment fully received. Thank you!
            </Text>
          ) : !data.isQuotation ? (
            <Text style={[styles.footerBold, { marginBottom: 12 }]}>
              Job will take place and be completed on {data.jobDateStr}
            </Text>
          ) : null}
          {!data.fullyPaid && (
            <Text style={styles.footerBold}>
              Please make a paynow transfer to our company UEN
            </Text>
          )}
          {data.paymentCompany === 'Letswork' ? (
            <Text style={styles.footerBold}>UEN: 202213844N (Letswork Pte Ltd)</Text>
          ) : (
            <Text style={styles.footerBold}>UEN: 202538280D (Above All Aircon Pte Ltd)</Text>
          )}
          <Text style={{ marginTop: 18 }}>
            Thank you for choosing {data.paymentCompany === 'Letswork' ? 'Letswork Pte Ltd' : 'Above All Aircon Pte Ltd'}!
          </Text>
        </View>

      </Page>
    </Document>
  );
};

export default InvoicePDF;
