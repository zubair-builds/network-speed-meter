import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { formatBytes } from '../utils/format';

export default function AppsScreen({ apps, hasAccess, todayTotal, onOpenSettings }) {
  const renderApp = ({ item }) => (
    <View style={styles.appRow}>
      <Text style={styles.appLabel} numberOfLines={1}>{item.label}</Text>
      <Text style={styles.appBytes}>{formatBytes(item.bytes)}</Text>
    </View>
  );

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.headerValue}>{formatBytes(todayTotal)}</Text>
        <Text style={styles.headerLabel}>Today's Usage</Text>
      </View>
      {!hasAccess ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Usage access required</Text>
          <Text style={styles.emptyText}>Grant usage access to see per-app data.</Text>
          <TouchableOpacity style={styles.grantButton} onPress={onOpenSettings}>
            <Text style={styles.grantButtonText}>Open settings</Text>
          </TouchableOpacity>
        </View>
      ) : apps.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No app usage yet today.</Text>
        </View>
      ) : (
        <FlatList
          data={apps}
          keyExtractor={(item) => item.packageName}
          renderItem={renderApp}
          style={styles.list}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: '#1e3a5f', paddingVertical: 16, alignItems: 'center' },
  headerValue: { color: '#fff', fontSize: 22, fontWeight: '600' },
  headerLabel: { color: '#a0c4e8', fontSize: 12, marginTop: 2 },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  appLabel: { flex: 1, color: '#e5e7eb', fontSize: 15 },
  appBytes: { color: '#9ca3af', fontSize: 14, fontVariant: ['tabular-nums'] },
  list: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center' },
  grantButton: { marginTop: 20, backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 4 },
  grantButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
