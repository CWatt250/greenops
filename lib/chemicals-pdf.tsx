import React from 'react';
import {
  Document, Page, Text, View, StyleSheet,
} from '@react-pdf/renderer';

interface Row {
  id: string;
  applied_at: string;
  amount_applied: number;
  amount_unit: string;
  area_treated_sqft: number | null;
  target_pest: string | null;
  reentry_until: string | null;
  notes: string | null;
  weather_temp_f: number | null;
  weather_wind_mph: number | null;
  weather_conditions: string | null;
  dilution_rate: string | null;
  total_solution_gallons: number | null;
  product: {
    name: string;
    epa_registration_number: string | null;
    active_ingredient: string | null;
  } | null;
  applicator: { full_name: string | null } | null;
  client: { name: string; service_address: string } | null;
}

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: '#0B0B0B' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  brandName: {
    fontSize: 18, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1,
  },
  brandSub: { fontSize: 8, color: '#F15A24', fontFamily: 'Helvetica-Oblique', marginTop: 2 },
  docTitle: {
    fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#F15A24',
    textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1,
  },
  meta: { fontSize: 8, color: '#444', textAlign: 'right', marginTop: 4 },
  table: { borderTopWidth: 1, borderTopColor: '#0B0B0B', marginTop: 12 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0DCCD',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  rowHeader: {
    flexDirection: 'row',
    backgroundColor: '#0B0B0B',
    color: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
  },
  cellDate: { width: 70 },
  cellSite: { flex: 1.4 },
  cellProduct: { flex: 1.5 },
  cellEpa: { width: 70, fontFamily: 'Helvetica' },
  cellAmount: { width: 70, textAlign: 'right' },
  cellPest: { width: 80 },
  cellApplicator: { width: 80 },
  cellWeather: { flex: 1 },
  footer: {
    position: 'absolute', bottom: 24, left: 36, right: 36,
    textAlign: 'center', fontSize: 7, color: '#888',
  },
});

export function ChemicalApplicationsDocument({
  rows,
  companyName = 'TLC Landscape Management',
}: {
  rows: Row[];
  companyName?: string;
}) {
  const dates = rows.map((r) => new Date(r.applied_at).getTime());
  const minDate = dates.length > 0 ? new Date(Math.min(...dates)).toLocaleDateString() : '—';
  const maxDate = dates.length > 0 ? new Date(Math.max(...dates)).toLocaleDateString() : '—';

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>TLC</Text>
            <Text style={styles.brandSub}>by Watt Systems</Text>
            <Text style={{ fontSize: 8, color: '#666', marginTop: 4 }}>{companyName}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>Chemical Applications</Text>
            <Text style={styles.meta}>WA State Compliance Record</Text>
            <Text style={styles.meta}>Period: {minDate} – {maxDate}</Text>
            <Text style={styles.meta}>Records: {rows.length}</Text>
            <Text style={styles.meta}>Generated: {new Date().toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={styles.rowHeader}>
          <Text style={styles.cellDate}>Date</Text>
          <Text style={styles.cellSite}>Site</Text>
          <Text style={styles.cellProduct}>Product</Text>
          <Text style={styles.cellEpa}>EPA #</Text>
          <Text style={styles.cellAmount}>Amount</Text>
          <Text style={styles.cellPest}>Pest</Text>
          <Text style={styles.cellApplicator}>Applicator</Text>
          <Text style={styles.cellWeather}>Weather / Notes</Text>
        </View>

        {rows.map((r) => (
          <View key={r.id} style={styles.row} wrap={false}>
            <Text style={styles.cellDate}>
              {new Date(r.applied_at).toLocaleDateString()}{'\n'}
              <Text style={{ fontSize: 7, color: '#888' }}>
                {new Date(r.applied_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Text>
            <Text style={styles.cellSite}>
              {r.client?.name ?? '—'}{'\n'}
              <Text style={{ fontSize: 7, color: '#666' }}>
                {r.client?.service_address ?? ''}
              </Text>
            </Text>
            <Text style={styles.cellProduct}>
              {r.product?.name ?? '—'}{'\n'}
              {r.product?.active_ingredient && (
                <Text style={{ fontSize: 7, color: '#666', fontStyle: 'italic' }}>
                  {r.product.active_ingredient}
                </Text>
              )}
            </Text>
            <Text style={styles.cellEpa}>{r.product?.epa_registration_number ?? '—'}</Text>
            <Text style={styles.cellAmount}>
              {r.amount_applied} {r.amount_unit}{'\n'}
              {r.dilution_rate && (
                <Text style={{ fontSize: 7, color: '#666' }}>{r.dilution_rate}</Text>
              )}
              {r.area_treated_sqft && (
                <Text style={{ fontSize: 7, color: '#666' }}>
                  {'\n'}{r.area_treated_sqft.toLocaleString()} sf
                </Text>
              )}
            </Text>
            <Text style={styles.cellPest}>{r.target_pest ?? '—'}</Text>
            <Text style={styles.cellApplicator}>{r.applicator?.full_name ?? '—'}</Text>
            <Text style={styles.cellWeather}>
              {r.weather_conditions ?? ''}
              {r.weather_temp_f != null ? ` ${r.weather_temp_f}°F` : ''}
              {r.weather_wind_mph != null ? ` · ${r.weather_wind_mph}mph wind` : ''}
              {r.notes && `\n${r.notes}`}
            </Text>
          </View>
        ))}

        <Text style={styles.footer}>
          {companyName} · Generated by TLC Management Platform · This record
          is maintained per Washington State Department of Agriculture (WSDA)
          requirements.
        </Text>
      </Page>
    </Document>
  );
}
