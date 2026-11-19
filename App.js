import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  FlatList,
  StatusBar,
  Platform,
  Alert,
  AppState,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetworkTraffic } from '@hoanggbao00/expo-network-traffic';
import NetworkUsage from './modules/expo-network-usage';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
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

const splitSpeed = (speedStr) => {
  if (!speedStr) return { number: '0', unit: 'KB/s' };
  const match = speedStr.match(/^([\d.]+)\s*(.*)$/);
  if (match) return { number: match[1], unit: match[2] || 'KB/s' };
  return { number: speedStr, unit: '' };
};

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [connectionType, setConnectionType] = useState('unknown');
  const [dailyData, setDailyData] = useState([]);
  const [summary, setSummary] = useState({
    last7: { mobile: 0, wifi: 0 },
    last30: { mobile: 0, wifi: 0 },
    thisMonth: { mobile: 0, wifi: 0 },
  });

  const lastBytesRef = useRef({ total: 0, mobile: 0, time: Date.now() });
  const dailyDataRef = useRef([]);
  const intervalRef = useRef(null);
  const lastOverlayUpdate = useRef(0);
  const lastNotifUpdate = useRef(0);
  const notifScheduled = useRef(false);

  const { downStr, upStr } = useNetworkTraffic({
    interval: 1000,
    enabled: Platform.OS === 'android',
    decimals: 1,
  });

  const downloadSpeed = downStr || '0 KB/s';
  const uploadSpeed = upStr || '0 KB/s';

  useEffect(() => {
    dailyDataRef.current = dailyData;
  }, [dailyData]);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'android') return;
      try {
        await Notifications.setNotificationChannelAsync('speed', {
          name: 'Network Speed',
          importance: Notifications.AndroidImportance.DEFAULT,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        });
        await Notifications.requestPermissionsAsync();

        const can = await NetworkUsage.canDrawOverlay?.();
        if (!can) {
          Alert.alert(
            'Status Bar Overlay',
            'Allow "Display over other apps" so speed can appear in the status bar.',
            [
              { text: 'Later', style: 'cancel' },
              {
                text: 'Allow',
                onPress: async () => {
                  try {
                    await NetworkUsage.requestOverlayPermission?.();
                  } catch (e) {}
                },
              },
            ]
          );
        }
      } catch (e) {
        console.log('Init error:', e);
      }
    })();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        NetworkUsage.hideOverlay?.().catch(() => {});
      }
    });

    return () => {
      sub.remove();
      NetworkUsage.hideOverlay?.().catch(() => {});
    };
  }, []);

  const updateOverlay = useCallback(async () => {
    try {
      if (!NetworkUsage?.canDrawOverlay) return;
      const can = await NetworkUsage.canDrawOverlay();
      if (!can) return;
      const { number, unit } = splitSpeed(downloadSpeed);
      const text = `${number}\n${unit}`;
      await NetworkUsage.showOverlay?.(text);
    } catch (e) {
      console.log('Overlay error:', e?.message || e);
    }
  }, [downloadSpeed]);

  const showSpeedNotification = useCallback(async () => {
    try {
      const todayISO = toISODate(new Date());
      const today = dailyDataRef.current.find(d => d.date === todayISO);
      const mobileToday = today?.mobile || 0;
      const wifiToday = today?.wifi || 0;

      if (notifScheduled.current) {
        await Notifications.dismissNotificationAsync('speed-meter').catch(() => {});
      }

      await Notifications.scheduleNotificationAsync({
        identifier: 'speed-meter',
        content: {
          title: `Speed: ${downloadSpeed}`,
          body: `Mobile: ${formatBytes(mobileToday)}   WiFi: ${formatBytes(wifiToday)}`,
          sticky: true,
          autoDismiss: false,
          priority: Notifications.AndroidNotificationPriority.DEFAULT,
        },
        trigger: null,
      });
      notifScheduled.current = true;
    } catch (e) {
      console.log('Notification error:', e?.message || e);
    }
  }, [downloadSpeed]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const now = Date.now();
    if (now - lastOverlayUpdate.current > 1500) {
      lastOverlayUpdate.current = now;
      updateOverlay();
    }
    if (now - lastNotifUpdate.current > 4000) {
      lastNotifUpdate.current = now;
      showSpeedNotification();
    }
  }, [downloadSpeed, uploadSpeed, summary, updateOverlay, showSpeedNotification]);

  useEffect(() => {
    loadData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setConnectionType(state.type);
    });

    intervalRef.current = setInterval(() => {
      accumulateUsage();
    }, 5000);

    return () => {
      unsubscribe();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

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

  const accumulateUsage = async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (!NetworkUsage || typeof NetworkUsage.getTotalBytes !== 'function') return;
      const total = await NetworkUsage.getTotalBytes();
      const mobile = await NetworkUsage.getMobileBytes();
      if (!total || !mobile) return;

      const now = Date.now();
      const last = lastBytesRef.current;

      if (last.total > 0) {
        const totalNow = total.rx + total.tx;
        const mobileNow = mobile.rx + mobile.tx;

        const deltaTotal = Math.max(0, totalNow - last.total);
        const deltaMobile = Math.max(0, mobileNow - last.mobile);
        const deltaWifi = Math.max(0, deltaTotal - deltaMobile);

        if (deltaTotal > 0) {
          const todayISO = toISODate(new Date());
          let data = [...dailyDataRef.current];
          let todayEntry = data.find(d => d.date === todayISO);

          if (!todayEntry) {
            todayEntry = {
              date: todayISO,
              dateObj: new Date().toISOString(),
              mobile: 0,
              wifi: 0,
            };
            data.unshift(todayEntry);
          }

          // Mobile bytes always from mobile counter; everything else is WiFi
          todayEntry.mobile += deltaMobile;
          todayEntry.wifi += deltaWifi;

          if (data.length > 60) data = data.slice(0, 60);
          dailyDataRef.current = data;
          setDailyData([...data]);
          calculateSummary(data);
          await AsyncStorage.setItem('dailyUsage', JSON.stringify(data));
        }
      }

      lastBytesRef.current = {
        total: total.rx + total.tx,
        mobile: mobile.rx + mobile.tx,
        time: now,
      };
    } catch (e) {
      console.log('Usage tracking error:', e.message || e);
    }
  };

  const calculateSummary = (data) => {
    const now = new Date();
    const last7 = { mobile: 0, wifi: 0 };
    const last30 = { mobile: 0, wifi: 0 };
    const thisMonth = { mobile: 0, wifi: 0 };

    data.forEach(item => {
      const d = new Date(item.dateObj);
      const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        last7.mobile += item.mobile;
        last7.wifi += item.wifi;
      }
      if (diffDays < 30) {
        last30.mobile += item.mobile;
        last30.wifi += item.wifi;
      }
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <View style={styles.topBar}>
        <View style={styles.clockSection}>
          <Text style={styles.clockText}>
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
          <Text style={styles.dateSmall}>{displayDate(toISODate(currentTime))}</Text>
        </View>
        <View style={styles.speedSection}>
          <Text style={styles.speedLabel}>\u2193 {downloadSpeed}</Text>
          <Text style={styles.speedLabel}>\u2191 {uploadSpeed}</Text>
          <Text style={styles.netType}>{connectionType.toUpperCase()}</Text>
        </View>
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
            <View style={styles.legend}>
              <Text style={styles.legendLabel}>Low</Text>
              <View style={[styles.legendBox, { backgroundColor: '#161b22' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#1f2a44' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#1e3a6e' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#1d4ed8' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#2563eb' }]} />
              <View style={[styles.legendBox, { backgroundColor: '#3b82f6' }]} />
              <Text style={styles.legendLabel}>High</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  topBar: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clockSection: { alignItems: 'flex-start' },
  clockText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  dateSmall: { color: '#aaa', fontSize: 12 },
  speedSection: { alignItems: 'flex-end' },
  speedLabel: { color: '#4CAF50', fontSize: 14, fontWeight: '600' },
  netType: { color: '#64B5F6', fontSize: 12, marginTop: 2 },
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
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: '#121212',
  },
  legendBox: {
    width: 18,
    height: 18,
    marginHorizontal: 3,
    borderRadius: 3,
  },
  legendLabel: {
    color: '#888',
    fontSize: 12,
    marginHorizontal: 6,
  },
});
