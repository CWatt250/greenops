import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Invoice, InvoiceLineItem, Payment } from '@/types';

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#1C2B1A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  brandName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#3D6B2C' },
  brandSub: { fontSize: 9, color: '#666', marginTop: 2 },
  invoiceTitle: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#3D6B2C', textAlign: 'right' },
  invoiceMeta: { fontSize: 9, color: '#444', textAlign: 'right', marginTop: 4 },
  sectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#3D6B2C', color: '#fff', padding: 6, borderRadius: 2, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', padding: 5, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  colDesc: { flex: 3 },
  colNum: { width: 60, textAlign: 'right' },
  totalsBox: { alignSelf: 'flex-end', width: 220, marginTop: 12 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 4 },
  totalsLabel: { color: '#555' },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#3D6B2C', borderRadius: 2, fontFamily: 'Helvetica-Bold', color: '#fff' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#C9A84C', borderRadius: 2, fontFamily: 'Helvetica-Bold', color: '#fff', marginTop: 4 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 3, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  notes: { marginTop: 20, padding: 10, backgroundColor: '#f9f9f7', borderRadius: 4 },
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, textAlign: 'center', fontSize: 8, color: '#999' },
});

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

interface Props {
  invoice: Invoice & { client?: { name: string; service_address?: string } | null };
  lineItems: InvoiceLineItem[];
  payments: Payment[];
  companyName?: string;
}

export function InvoiceDocument({ invoice, lineItems, payments, companyName = 'TLC Landscape Management' }: Props) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>{companyName}</Text>
            <Text style={styles.brandSub}>Professional Landscape Services</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceMeta}>#{invoice.invoice_number}</Text>
            <Text style={styles.invoiceMeta}>Issued: {invoice.issued_date}</Text>
            {invoice.due_date && <Text style={styles.invoiceMeta}>Due: {invoice.due_date}</Text>}
          </View>
        </View>

        {/* Bill to */}
        <View style={styles.row}>
          <View>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 11 }}>{invoice.client?.name ?? ''}</Text>
            {invoice.client?.service_address && (
              <Text style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{invoice.client.service_address}</Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.sectionLabel}>Status</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold', color: '#3D6B2C', textTransform: 'uppercase' }}>
              {invoice.status}
            </Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Description</Text>
          <Text style={styles.colNum}>Qty</Text>
          <Text style={styles.colNum}>Unit Price</Text>
          <Text style={styles.colNum}>Total</Text>
        </View>
        {lineItems.map((item) => (
          <View key={item.id} style={styles.tableRow}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colNum}>{String(item.quantity)}</Text>
            <Text style={styles.colNum}>{fmt(item.unit_price)}</Text>
            <Text style={styles.colNum}>{fmt(item.total)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text>{fmt(invoice.subtotal)}</Text>
          </View>
          {invoice.tax_rate > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Tax ({(invoice.tax_rate * 100).toFixed(1)}%)</Text>
              <Text>{fmt(invoice.tax_amount)}</Text>
            </View>
          )}
          <View style={styles.grandTotal}>
            <Text>Total</Text>
            <Text>{fmt(invoice.total)}</Text>
          </View>
        </View>

        {/* Payments */}
        {payments.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={styles.sectionLabel}>Payments Received</Text>
            {payments.map((p) => (
              <View key={p.id} style={styles.payRow}>
                <Text>{p.payment_date} · {p.method}{p.reference_number ? ` #${p.reference_number}` : ''}</Text>
                <Text>{fmt(p.amount)}</Text>
              </View>
            ))}
            <View style={styles.balanceRow}>
              <Text>Balance Due</Text>
              <Text>{fmt(invoice.balance_due)}</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={{ fontSize: 9 }}>{invoice.notes}</Text>
          </View>
        )}

        <Text style={styles.footer}>Thank you for your business — {companyName}</Text>
      </Page>
    </Document>
  );
}
