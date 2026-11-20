import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  FlatList,
  StatusBar,
  Platform,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkUsage from './modules/expo-network-usage';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec || bytesPerSec < 0) return '0 KB/s';
  if (bytesPerSec < 1024) return '0 KB/s';
  if (bytesPerSec < 1024 * 1024) return `${Math.round(bytesPerSec / 1024)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
};

const formatDuration = (ms) => {
  if (!ms || ms < 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const toISODate = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const displayDate = (iso) => {
  const [y, m, d] = iso.split('-');
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const parseISODate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export default function App() {
  const [tab, setTab] = useState('speed');
  const [dailyData, setDailyData] = useState([]);
  const [summary, setSummary] = useState({
    last7: { mobile: 0, wifi: 0 },
    last30: { mobile: 0, wifi: 0 },
    thisMonth: { mobile: 0, wifi: 0 },
  });
  const [downloadSpeed, setDownloadSpeed] = useState('0 KB/s');
  const [uploadSpeed, setUploadSpeed] = useState('0 KB/s');

  const [apps, setApps] = useState([]);
  const [sessionStart, setSessionStart] = useState(0);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [hasAccess, setHasAccess] = useState(true);

  const lastBytesRef = useRef({ totalRx: 0, totalTx: 0, time: Date.now() });
  const dailyDataRef = useRef([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    dailyDataRef.current = dailyData;
  }, [dailyData]);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'android') return;
      try {
        await Notifications.requestPermissionsAsync();
        await NetworkUsage.startSpeedService?.();
        const access = await NetworkUsage.hasUsageAccess?.();
        setHasAccess(!!access);
        if (access) {
          const start = await NetworkUsage.startSession?.();
          if (start) setSessionStart(start);
        }
      } catch (e) {
        console.log('Init error:', e);
      }
    })();
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      updateSpeed();
      refreshTodayFromService();
      if (tab === 'apps') refreshApps();
      if (sessionStart > 0) {
        setSessionElapsed(Date.now() - sessionStart);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tab, sessionStart]);

  const loadData = async () => {
    try {
      const stored = await AsyncStorage.getItem('dailyUsage');
      if (stored) {
        const parsed = JSON.parse(stored);
        setDailyData(parsed);
        dailyDataRef.current = parsed;
        calculateSummary(parsed);
      } else {
        setDailyData([]);
        dailyDataRef.current = [];
        calculateSummary([]);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const refreshTodayFromService = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const totals = await NetworkUsage.getTodayTotals?.();
      if (!totals) return;

      const todayISO = toISODate(new Date());
      let data = [...dailyDataRef.current];
      let todayEntry = data.find(d => d.date === todayISO);

      if (!todayEntry) {
        todayEntry = { date: todayISO, mobile: 0, wifi: 0 };
        data.unshift(todayEntry);
      }

      todayEntry.mobile = totals.mobile || 0;
      todayEntry.wifi = totals.wifi || 0;

      dailyDataRef.current = data;
      setDailyData([...data]);
      calculateSummary(data);

      AsyncStorage.setItem('dailyUsage', JSON.stringify(data)).catch(() => {});
    } catch (e) {}
  };

  const updateSpeed = async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (!NetworkUsage || typeof NetworkUsage.getTotalBytes !== 'function') return;
      const total = await NetworkUsage.getTotalBytes();
      if (!total || total.rx < 0) {
        setDownloadSpeed('Unsupported');
        return;
      }

      const now = Date.now();
      const last = lastBytesRef.current;
      const elapsed = (now - last.time) / 1000;

      lastBytesRef.current = {
        totalRx: total.rx,
        totalTx: total.tx,
        time: now,
      };

      if (elapsed > 0 && last.totalRx > 0) {
        const deltaRx = Math.max(0, total.rx - last.totalRx);
        const deltaTx = Math.max(0, total.tx - last.totalTx);
        setDownloadSpeed(formatSpeed(deltaRx / elapsed));
        setUploadSpeed(formatSpeed(deltaTx / elapsed));
      }
    } catch (e) {
      console.log('Speed error:', e.message || e);
    }
  };

  const refreshApps = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const list = await NetworkUsage.getAppUsage?.();
      if (Array.isArray(list)) setApps(list);
    } catch (e) {}
  };

  const openSettings = async () => {
    try {
      await NetworkUsage.openUsageAccessSettings?.();
    } catch (e) {}
  };

  const calculateSummary = (data) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last7 = { mobile: 0, wifi: 0 };
    const last30 = { mobile: 0, wifi: 0 };
    const thisMonth = { mobile: 0, wifi: 0 };

    data.forEach(item => {
      const d = parseISODate(item.date);
      const diffDays = Math.round((today - d) / (1000 * 60 * 60 * 24));

      if (diffDays >= 0 && diffDays < 7) {
        last7.mobile += item.mobile;
        last7.wifi += item.wifi;
      }
      if (diffDays >= 0 && diffDays < 30) {
        last30.mobile += item.mobile;
        last30.wifi += item.wifi;
      }
      if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
        thisMonth.mobile += item.mobile;
        thisMonth.wifi += item.wifi;
      }
    });
    setSummary({ last7, last30, thisMonth });
  };

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

  const sessionTotal = apps.reduce((sum, a) => sum + (a.bytes || 0), 0);

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

  const renderApp = ({ item }) => (
    <View style={styles.appRow}>
      <Text style={styles.appLabel} numberOfLines={1}>{item.label}</Text>
      <Text style={styles.appBytes}>{formatBytes(item.bytes)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />

      {tab === 'speed' ? (
        <>
          <View style={styles.topBar}>
            <Text style={styles.speedLabel}>↓ {downloadSpeed}</Text>
            <Text style={styles.speedLabel}>↑ {uploadSpeed}</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Internet Speed Meter</Text>
          </View>
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
      ) : (
        <>
          <View style={styles.sessionBar}>
            <View style={styles.sessionItem}>
              <Text style={styles.sessionValue}>{formatDuration(sessionElapsed)}</Text>
              <Text style={styles.sessionLabel}>Session Time</Text>
            </View>
            <View style={styles.sessionDivider} />
            <View style={styles.sessionItem}>
              <Text style={styles.sessionValue}>{formatBytes(sessionTotal)}</Text>
              <Text style={styles.sessionLabel}>Session Usage</Text>
            </View>
          </View>

          {!hasAccess ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Usage access required</Text>
              <Text style={styles.emptyText}>
                Grant usage access to see per-app data.
              </Text>
              <TouchableOpacity style={styles.grantButton} onPress={openSettings}>
                <Text style={styles.grantButtonText}>Open settings</Text>
              </TouchableOpacity>
            </View>
          ) : apps.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No app usage yet this session.</Text>
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
      )}

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === 'speed' && styles.tabActive]}
          onPress={() => setTab('speed')}
        >
          <Text style={[styles.tabText, tab === 'speed' && styles.tabTextActive]}>Speed</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'apps' && styles.tabActive]}
          onPress={() => setTab('apps')}
        >
          <Text style={[styles.tabText, tab === 'apps' && styles.tabTextActive]}>Apps</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  speedLabel: { color: '#4CAF50', fontSize: 16, fontWeight: '600' },
  header: { backgroundColor: '#1a1a1a', padding: 14 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
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
  heatCell: {
    flex: 1,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
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

  sessionBar: {
    backgroundColor: '#1e3a5f',
    flexDirection: 'row',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  sessionItem: { flex: 1, alignItems: 'center' },
  sessionValue: { color: '#fff', fontSize: 22, fontWeight: '600' },
  sessionLabel: { color: '#a0c4e8', fontSize: 12, marginTop: 4 },
  sessionDivider: { width: 1, backgroundColor: '#2a5a8a', marginVertical: 4 },

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

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 14, textAlign: 'center' },
  grantButton: {
    marginTop: 20,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
  },
  grantButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: { borderTopWidth: 2, borderTopColor: '#4CAF50' },
  tabText: { color: '#888', fontSize: 14 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
});
