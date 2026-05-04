import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

const BLUE = '#7bc7fb';
const BLACK = '#000000';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Times-Roman',
    fontSize: 11,
    color: '#000',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  logo: {
    width: 105,
    marginBottom: 5,
  },
  companyInfo: {
    fontSize: 9,
    lineHeight: 1.5,
  },
  bold: { fontFamily: 'Times-Bold' },
  titleBlock: {
    alignItems: 'flex-end',
  },
  title: {
    fontFamily: 'Times-Bold',
    fontSize: 24,
    marginBottom: 8,
  },
  periodText: {
    fontSize: 12,
    color: '#333',
  },

  // Section styling
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontFamily: 'Times-Bold',
    fontSize: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    marginBottom: 10,
  },

  // Grid for details
  gridRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  gridLabel: {
    width: '30%',
    fontFamily: 'Times-Bold',
  },
  gridValue: {
    width: '70%',
  },

  // Table
  table: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginTop: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableHeader: {
    backgroundColor: '#f8fafc',
    fontFamily: 'Times-Bold',
  },
  tableCellDesc: {
    width: '60%',
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  tableCellValue: {
    width: '40%',
    padding: 8,
    textAlign: 'right',
  },
  
  // Totals
  totalsContainer: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  totalRow: {
    flexDirection: 'row',
    width: '50%',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 6,
  },
  totalLabel: {
    width: '60%',
    fontFamily: 'Times-Bold',
  },
  totalValue: {
    width: '40%',
    textAlign: 'right',
  },
  grandTotalRow: {
    flexDirection: 'row',
    width: '50%',
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: BLACK,
    borderBottomWidth: 2,
    borderBottomColor: BLACK,
    marginTop: 4,
  },
  grandTotalLabel: {
    width: '60%',
    fontFamily: 'Times-Bold',
    fontSize: 14,
  },
  grandTotalValue: {
    width: '40%',
    textAlign: 'right',
    fontFamily: 'Times-Bold',
    fontSize: 14,
  },

  // Signature
  signatureBlock: {
    marginTop: 60,
    width: 250,
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: BLACK,
    marginBottom: 8,
    minHeight: 30,
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  signatureText: {
    fontSize: 10,
    color: '#10b981', // green for signed
    fontFamily: 'Times-Italic',
  },
  signatureLabel: {
    fontFamily: 'Times-Bold',
    fontSize: 10,
  }
});

export interface PayslipData {
  monthName: string;
  year: number;
  workerName: string;
  wpNumber: string;
  bankAccount: string;
  basicSalary: number;
  workingDays: number;
  otPerHour: number;
  additional3hrOt: number;
  additionalOt: number;
  totalOt: number;
  totalOtAmount: number;
  totalSalary: number;
  signedAt: string | null;
}

const formatCurrency = (n: number) => `S$${n.toFixed(2)}`;

const PayslipPDF: React.FC<{ data: PayslipData }> = ({ data }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Image src="/logo.png" style={styles.logo} />
            <View style={styles.companyInfo}>
              <Text style={styles.bold}>ABOVE ALL AIRCON PTE LTD</Text>
              <Text>UEN: 202538280D</Text>
              <Text>21 BUKIT BATOK CRESCENT</Text>
              <Text>#12-78 WCEGA TOWER</Text>
            </View>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>SALARY PAYSLIP</Text>
            <Text style={styles.periodText}>For the month of {data.monthName} {data.year}</Text>
          </View>
        </View>

        {/* Worker Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Worker Details</Text>
          <View style={styles.gridRow}>
            <Text style={styles.gridLabel}>Name:</Text>
            <Text style={styles.gridValue}>{data.workerName}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridLabel}>WP Number:</Text>
            <Text style={styles.gridValue}>{data.wpNumber || '—'}</Text>
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridLabel}>Bank Account:</Text>
            <Text style={styles.gridValue}>{data.bankAccount || '—'}</Text>
          </View>
        </View>

        {/* Salary Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Salary Breakdown</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <Text style={styles.tableCellDesc}>Description</Text>
              <Text style={styles.tableCellValue}>Amount</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableCellDesc}>Basic Salary</Text>
              <Text style={styles.tableCellValue}>{formatCurrency(data.basicSalary)}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableCellDesc}>
                Overtime ({data.totalOt.toFixed(1)} hrs @ {formatCurrency(data.otPerHour)}/hr)
                {'\n'}
                <Text style={{ fontSize: 9, color: '#64748b' }}>
                  Includes: Default ({data.additional3hrOt.toFixed(0)} hrs) + Additional ({data.additionalOt.toFixed(1)} hrs)
                </Text>
              </Text>
              <Text style={styles.tableCellValue}>{formatCurrency(data.totalOtAmount)}</Text>
            </View>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total OT Amount:</Text>
            <Text style={styles.totalValue}>{formatCurrency(data.totalOtAmount)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Net Salary:</Text>
            <Text style={styles.grandTotalValue}>{formatCurrency(data.totalSalary)}</Text>
          </View>
        </View>

        {/* Signature */}
        <View style={styles.signatureBlock}>
          <View style={styles.signatureLine}>
            {data.signedAt ? (
              <Text style={styles.signatureText}>
                Digitally acknowledged on {new Date(data.signedAt).toLocaleDateString('en-SG', { 
                  day: 'numeric', month: 'short', year: 'numeric', 
                  hour: '2-digit', minute: '2-digit' 
                })}
              </Text>
            ) : null}
          </View>
          <Text style={styles.signatureLabel}>Worker Signature / Acknowledgment</Text>
        </View>

      </Page>
    </Document>
  );
};

export default PayslipPDF;
