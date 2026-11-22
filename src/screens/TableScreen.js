import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { formatBytes, displayDate } from '../utils/format';

const getHeatColor = (bytes) => {
  if (!bytes || bytes <= 0) return '#0d1117';
  const mb = bytes / (1024 * 1024);
  if (mb < 30) return '#161b22';
  if (mb < 100) return '#1f2a44';
  if (mb < 300) return '#1e3a6e';
  if (mb < 800) return '#1d4ed8';
  if (mb < 2000) return '#2563eb';
  return '#3b82f6';
};

const getTextColor = (bytes) => {
  const mb = bytes / (1024 * 1024);
  return mb > 150 ? '#ffffff' : '#e5e7eb';
};

export default function TableScreen({ dailyData, summary }) {
  const renderRow = ({ item }) => (
    <View style={styles.row}>
      <Text style={[styles.cell, styles.dateCell]}>{displayDate(item.date)}</Text>
      <View style={[styles.heatCell, { backgroundColor: getHeatColor(item.mobile) }]}>
        <Text style={[styles.cellText, { color: getTextColor(item.mobile) }]}>{formatBytes(item.mobile)}</Text>
      </View>
      <View style={[styles.heatCell, { backgroundColor: getHeatColor(item.wifi) }]}>
        <Text style={[styles.cellText, { color: getTextColor(item.wifi) }]}>{formatBytes(item.wifi)}</Text>
      </View>
      <View style={[styles.heatCell, { backgroundColor: getHeatColor(item.mobile + item.wifi) }]}>
        <Text style={[styles.cellText, { color: getTextColor(item.mobile + item.wifi) }]}>{formatBytes(item.mobile + item.wifi)}</Text>
      </View>
    </View>
  );

  return (
    <>
      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.dateCell]}>Date</Text>
        <Text style={styles.headerCell}>Mobile</Text>
        <Text style={styles.headerCell}>WiFi</Text>
        <Text style={styles.headerCell}>Total</Text>
      </View>
      <FlatList
        data={dailyData}
        keyExtractor={(item) => item.date}
        renderItem={renderRow}
        style={styles.list}
        ListFooterComponent={() => (
          <View>
            {[
              { label: 'Last 7 days', data: summary.last7 },
              { label: 'Last 30 days', data: summary.last30 },
              { label: 'This Month', data: summary.thisMonth },
            ].map((s) => (
              <View key={s.label} style={styles.summaryRow}>
                <Text style={[styles.cell, styles.dateCell, styles.summaryText]}>{s.label}</Text>
                <View style={[styles.heatCell, { backgroundColor: getHeatColor(s.data.mobile) }]}>
                  <Text style={[styles.cellText, styles.summaryText, { color: getTextColor(s.data.mobile) }]}>{formatBytes(s.data.mobile)}</Text>
                </View>
                <View style={[styles.heatCell, { backgroundColor: getHeatColor(s.data.wifi) }]}>
                  <Text style={[styles.cellText, styles.summaryText, { color: getTextColor(s.data.wifi) }]}>{formatBytes(s.data.wifi)}</Text>
                </View>
                <View style={[styles.heatCell, { backgroundColor: getHeatColor(s.data.mobile + s.data.wifi) }]}>
                  <Text style={[styles.cellText, styles.summaryText, { color: getTextColor(s.data.mobile + s.data.wifi) }]}>{formatBytes(s.data.mobile + s.data.wifi)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerCell: { flex: 1, color: '#aaa', fontWeight: '600', textAlign: 'center', fontSize: 13 },
  dateCell: { flex: 1.5, textAlign: 'left', paddingLeft: 12, color: '#ddd' },
  row: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    alignItems: 'center',
  },
  heatCell: { flex: 1, paddingVertical: 14, justifyContent: 'center', alignItems: 'center' },
  cellText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  list: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    alignItems: 'center',
  },
  summaryText: { color: '#fff', fontWeight: '600' },
  cell: {},
});
