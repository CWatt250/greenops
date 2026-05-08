import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { Estimate, EstimateLineItem } from '@/types';
import { FREQUENCY_LABELS } from '@/lib/proposal-pricing';

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#0B0B0B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  brandName: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#0B0B0B', textTransform: 'uppercase', letterSpacing: 1 },
  brandSub: { fontSize: 9, color: '#F15A24', fontFamily: 'Helvetica-Oblique', marginTop: 2 },
  proposalTitle: { fontSize: 26, fontFamily: 'Helvetica-Bold', color: '#F15A24', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1 },
  proposalMeta: { fontSize: 9, color: '#444', textAlign: 'right', marginTop: 6 },
  sectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0B0B0B', color: '#fff', padding: 6, marginBottom: 2, fontFamily: 'Helvetica-Bold' },
  tableRow: { flexDirection: 'row', padding: 5, borderBottomWidth: 0.5, borderBottomColor: '#E0DCCD' },
  colDesc: { flex: 3 },
  colMid: { width: 70, textAlign: 'right' },
  colNum: { width: 70, textAlign: 'right' },
  totalsBox: { alignSelf: 'flex-end', width: 240, marginTop: 12 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 4 },
  totalsLabel: { color: '#555' },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, backgroundColor: '#F15A24', borderRadius: 2, fontFamily: 'Helvetica-Bold', color: '#fff', fontSize: 12, marginTop: 4 },
  annualRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#FFE3CF', color: '#D14816', fontFamily: 'Helvetica-Bold', marginTop: 4 },
  notes: { marginTop: 20, padding: 10, backgroundColor: '#FAF7F2', borderRadius: 4 },
  acceptance: { marginTop: 28, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#0B0B0B' },
  signatureLine: { marginTop: 28, flexDirection: 'row', justifyContent: 'space-between' },
  sigBlock: { flex: 1, marginRight: 12 },
  sigUnderline: { borderBottomWidth: 0.7, borderBottomColor: '#0B0B0B', marginTop: 24, marginBottom: 4 },
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, textAlign: 'center', fontSize: 8, color: '#999' },
});

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

interface Props {
  proposal: Estimate & { client?: { name: string; service_address?: string | null } | null };
  lineItems: EstimateLineItem[];
  companyName?: string;
  annualValue?: number;
}

export function ProposalDocument({
  proposal,
  lineItems,
  companyName = 'TLC Landscape Management',
  annualValue,
}: Props) {
  const subtotal = lineItems.reduce((s, li) => s + Number(li.total ?? 0), 0);
  const taxAmount = subtotal * (Number(proposal.tax_rate ?? 0) / 100);
  const grandTotal = subtotal + taxAmount;

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>TLC</Text>
            <Text style={styles.brandSub}>by Watt Systems</Text>
            <Text style={{ fontSize: 9, color: '#666', marginTop: 6 }}>{companyName}</Text>
          </View>
          <View>
            <Text style={styles.proposalTitle}>Proposal</Text>
            <Text style={styles.proposalMeta}>
              Date: {new Date(proposal.created_at).toLocaleDateString()}
            </Text>
            {proposal.valid_until && (
              <Text style={styles.proposalMeta}>
                Valid through: {new Date(proposal.valid_until).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>

        {/* Client + meta */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Prepared for</Text>
            <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold' }}>
              {proposal.client?.name ?? '—'}
            </Text>
            {proposal.client?.service_address && (
              <Text style={{ marginTop: 2, color: '#555' }}>
                {proposal.client.service_address}
              </Text>
            )}
          </View>
          <View style={{ width: 220 }}>
            <Text style={styles.sectionLabel}>Reference</Text>
            <Text>{proposal.title}</Text>
            <Text style={{ marginTop: 4, color: '#555' }}>
              Status: {proposal.status}
            </Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>Service</Text>
          <Text style={styles.colMid}>Frequency</Text>
          <Text style={styles.colMid}>Qty × Price</Text>
          <Text style={styles.colNum}>Total</Text>
        </View>
        {lineItems.map((li) => {
          const freqLabel = li.frequency
            ? FREQUENCY_LABELS[li.frequency]
            : 'One-time';
          return (
            <View key={li.id} style={styles.tableRow}>
              <Text style={styles.colDesc}>{li.description}</Text>
              <Text style={styles.colMid}>{freqLabel}</Text>
              <Text style={styles.colMid}>
                {li.quantity} × {fmt(Number(li.unit_price))}
              </Text>
              <Text style={styles.colNum}>{fmt(Number(li.total ?? 0))}</Text>
            </View>
          );
        })}

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text>{fmt(subtotal)}</Text>
          </View>
          {Number(proposal.tax_rate ?? 0) > 0 && (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                Tax ({Number(proposal.tax_rate ?? 0)}%)
              </Text>
              <Text>{fmt(taxAmount)}</Text>
            </View>
          )}
          <View style={styles.grandTotal}>
            <Text>Total per visit</Text>
            <Text>{fmt(grandTotal)}</Text>
          </View>
          {typeof annualValue === 'number' && annualValue > 0 && (
            <View style={styles.annualRow}>
              <Text>Annual contract value</Text>
              <Text>{fmt(annualValue)}</Text>
            </View>
          )}
        </View>

        {proposal.notes && (
          <View style={styles.notes}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text>{proposal.notes}</Text>
          </View>
        )}

        {/* Acceptance */}
        <View style={styles.acceptance}>
          <Text style={styles.sectionLabel}>Payment terms</Text>
          <Text>{proposal.payment_terms ?? 'Net 30'}</Text>
          <Text style={{ marginTop: 12 }}>
            By signing below, the client accepts the services, pricing, and
            terms described in this proposal.
          </Text>
          <View style={styles.signatureLine}>
            <View style={styles.sigBlock}>
              <View style={styles.sigUnderline} />
              <Text style={{ fontSize: 8, color: '#666' }}>Client signature</Text>
            </View>
            <View style={styles.sigBlock}>
              <View style={styles.sigUnderline} />
              <Text style={{ fontSize: 8, color: '#666' }}>Date</Text>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          {companyName} · Built with the TLC Management Platform
        </Text>
      </Page>
    </Document>
  );
}
