import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet,
} from '@react-pdf/renderer';
import {
  totalsByType, estimatedMowingPerVisit, estimatedAnnualMowing,
  SHAPE_TYPE_COLORS, AREA_TYPE_LABELS, LINE_TYPE_LABELS,
  type MeasuredShape,
} from '@/lib/measurement';

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 10, color: '#0B0B0B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  brandName: {
    fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#0B0B0B',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  brandSub: { fontSize: 9, color: '#F15A24', fontFamily: 'Helvetica-Oblique', marginTop: 2 },
  docTitle: {
    fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#F15A24',
    textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1,
  },
  meta: { fontSize: 9, color: '#444', textAlign: 'right', marginTop: 6 },
  sectionLabel: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888',
    textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  mapBox: {
    border: '1pt solid #E0DCCD', padding: 4, marginBottom: 16, borderRadius: 4,
  },
  mapImage: { width: '100%', height: 280, objectFit: 'cover' },
  noMapBox: {
    border: '1pt solid #E0DCCD', padding: 24, marginBottom: 16, borderRadius: 4,
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#0B0B0B', color: '#fff', padding: 6,
    marginBottom: 2, fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row', padding: 5,
    borderBottomWidth: 0.5, borderBottomColor: '#E0DCCD',
  },
  colDot: { width: 14 },
  colLabel: { flex: 3 },
  colKind: { width: 60 },
  colType: { width: 70 },
  colNum: { width: 80, textAlign: 'right' },
  totalsBox: { alignSelf: 'flex-end', width: 240, marginTop: 12 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 4 },
  hero: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 10, backgroundColor: '#FFE3CF', borderRadius: 4, marginBottom: 6,
  },
  heroLabel: { color: '#D14816', fontFamily: 'Helvetica-Bold' },
  heroValue: { color: '#D14816', fontFamily: 'Helvetica-Bold', fontSize: 16 },
  pricingBox: {
    backgroundColor: '#F15A24', color: '#fff',
    padding: 10, borderRadius: 4, marginTop: 4,
  },
  pricingRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 2 },
  footer: {
    position: 'absolute', bottom: 24, left: 36, right: 36,
    textAlign: 'center', fontSize: 8, color: '#999',
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, marginRight: 4,
  },
});

interface Props {
  shapes: MeasuredShape[];
  address?: string | null;
  clientName?: string | null;
  measuredBy?: string | null;
  staticMapUrl?: string | null;
  measuredAt?: string;
  companyName?: string;
}

function fmtMoney(n: number) {
  return `$${n.toFixed(2)}`;
}

export function MeasurementDocument({
  shapes,
  address,
  clientName,
  measuredBy,
  staticMapUrl,
  measuredAt = new Date().toLocaleDateString(),
  companyName = 'TLC Landscape Management',
}: Props) {
  const totals = totalsByType(shapes);
  const perVisit = estimatedMowingPerVisit(totals.turf);
  const annual = estimatedAnnualMowing(totals.turf);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>TLC</Text>
            <Text style={styles.brandSub}>by Watt Systems</Text>
            <Text style={{ fontSize: 9, color: '#666', marginTop: 6 }}>
              {companyName}
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Measurement</Text>
            <Text style={styles.meta}>Date: {measuredAt}</Text>
            {measuredBy && <Text style={styles.meta}>Measured by: {measuredBy}</Text>}
          </View>
        </View>

        {/* Property */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Property</Text>
            {clientName && (
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold' }}>
                {clientName}
              </Text>
            )}
            {address && (
              <Text style={{ marginTop: 2, color: '#555' }}>{address}</Text>
            )}
          </View>
        </View>

        {/* Map snapshot */}
        {staticMapUrl ? (
          <View style={styles.mapBox}>
            <Image src={staticMapUrl} style={styles.mapImage} />
          </View>
        ) : (
          <View style={styles.noMapBox}>
            <Text style={{ color: '#888' }}>
              Map preview unavailable for this measurement (URL too long).
            </Text>
          </View>
        )}

        {/* Itemized list */}
        <View style={styles.tableHeader}>
          <Text style={styles.colDot}> </Text>
          <Text style={styles.colLabel}>Label</Text>
          <Text style={styles.colKind}>Kind</Text>
          <Text style={styles.colType}>Type</Text>
          <Text style={styles.colNum}>Measurement</Text>
        </View>
        {shapes.map((s) => (
          <View key={s.id} style={styles.tableRow}>
            <View style={styles.colDot}>
              <View style={[styles.dot, { backgroundColor: SHAPE_TYPE_COLORS[s.type] }]} />
            </View>
            <Text style={styles.colLabel}>{s.label}</Text>
            <Text style={styles.colKind}>
              {s.kind === 'polygon' ? 'Area' : 'Line'}
            </Text>
            <Text style={styles.colType}>
              {s.kind === 'polygon'
                ? AREA_TYPE_LABELS[s.type as keyof typeof AREA_TYPE_LABELS] ?? s.type
                : LINE_TYPE_LABELS[s.type as keyof typeof LINE_TYPE_LABELS] ?? s.type}
            </Text>
            <Text style={styles.colNum}>
              {s.kind === 'polygon'
                ? `${s.area_sqft.toLocaleString()} sf`
                : `${s.length_ft.toLocaleString()} ft`}
            </Text>
          </View>
        ))}
        {shapes.length === 0 && (
          <Text style={{ padding: 12, color: '#888', textAlign: 'center' }}>
            No shapes measured.
          </Text>
        )}

        {/* Totals */}
        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={{ color: '#555' }}>Hardscape</Text>
            <Text>{totals.hardscape.toLocaleString()} sf</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={{ color: '#555' }}>Beds</Text>
            <Text>{totals.bed.toLocaleString()} sf</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={{ color: '#555' }}>Other area</Text>
            <Text>{totals.other.toLocaleString()} sf</Text>
          </View>
          {totals.lineLength > 0 && (
            <View style={styles.totalsRow}>
              <Text style={{ color: '#555' }}>Total line length</Text>
              <Text>{totals.lineLength.toLocaleString()} ft</Text>
            </View>
          )}
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>Total turf</Text>
            <Text style={styles.heroValue}>
              {totals.turf.toLocaleString()} sf
            </Text>
          </View>
          <View style={styles.pricingBox}>
            <View style={styles.pricingRow}>
              <Text>Mowing per visit</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(perVisit)}</Text>
            </View>
            <View style={styles.pricingRow}>
              <Text>Annual contract value</Text>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtMoney(annual)}</Text>
            </View>
            <Text style={{ fontSize: 8, opacity: 0.85, marginTop: 4 }}>
              $0.008/sq ft × 26 weekly visits — adjust per service in catalog.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Generated by the TLC Management Platform · {companyName}
        </Text>
      </Page>
    </Document>
  );
}
