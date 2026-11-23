import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  StatusBar,
  Platform,
  Pressable,
  Text,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkUsage from './modules/expo-network-usage';
import * as Notifications from 'expo-notifications';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { Ionicons } from '@expo/vector-icons';
import { useSpeedTracker } from './src/hooks/useSpeedTracker';
import TableScreen from './src/screens/TableScreen';
import ChartScreen from './src/screens/ChartScreen';
import AppsScreen from './src/screens/AppsScreen';
import TestScreen from './src/screens/TestScreen';
import { toISODate, parseISODate } from './src/utils/format';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function generateSampleData() {
  const data = [];
  const now = new Date();
  const amounts = [
    [1.37, 0.917], [1.86, 0.76], [0.694, 1.1], [0.456, 1.63],
    [1.32, 0.762], [0.847, 1.9], [1.1, 1.12], [4.31, 0.145],
    [1.54, 0.655], [1.34, 0.628], [1.07, 1.02], [0.366, 1.6],
    [2.63, 3.99], [1.35, 1.64], [2.14, 0], [1.87, 0.048],
    [1.28, 1.22], [1.1, 1.23], [2.13, 0.926], [1.4, 1.23],
    [0.422, 0.98], [0.303, 1.4], [3.94, 0.583], [1.44, 0.769],
    [2.44, 2.32], [2.5, 0.61], [1.08, 2.88], [0.8, 1.5],
    [1.2, 0.9], [0.6, 1.1],
  ];
  for (let i = 0; i < amounts.length; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const [mob, wifi] = amounts[i];
    data.push({
      date: toISODate(d),
      mobile: Math.round(mob * 1024 * 1024 * 1024),
      wifi: Math.round(wifi * 1024 * 1024 * 1024),
    });
  }
  return data;
}

export default function App() {
  const [tab, setTab] = useState('table');
  const [dailyData, setDailyData] = useState([]);
  const [summary, setSummary] = useState({
    last7: { mobile: 0, wifi: 0 },
    last30: { mobile: 0, wifi: 0 },
    thisMonth: { mobile: 0, wifi: 0 },
  });
  const [sampleInterval, setSampleInterval] = useState(30000);
  const [apps, setApps] = useState([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [todayTotal, setTodayTotal] = useState(0);
  const [adFailed, setAdFailed] = useState(false);

  const dailyDataRef = useRef([]);
  const lastPersisted = useRef({ mobile: -1, wifi: -1 });
  const lastPersistTime = useRef(0);
  const appTick = useRef(0);

  const speed = useSpeedTracker(sampleInterval);

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
        if (access) refreshApps();
        const saved = await AsyncStorage.getItem('sampleInterval');
        if (saved) {
          const ms = parseInt(saved, 10);
          if (ms > 0) setSampleInterval(ms);
        }
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && Platform.OS === 'android') {
        try {
          const access = await NetworkUsage.hasUsageAccess?.();
          setHasAccess(!!access);
          if (access) refreshApps();
        } catch (e) {}
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      refreshTodayFromService();
      appTick.current += 1;
      if (appTick.current % 3 === 0) refreshApps();
    }, 1000);
    return () => clearInterval(id);
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
        calculateSummary([]);
      }
    } catch (e) {}
  };

  const loadSampleData = async () => {
    const sample = generateSampleData();
    dailyDataRef.current = sample;
    setDailyData(sample);
    calculateSummary(sample);
    AsyncStorage.setItem('dailyUsage', JSON.stringify(sample)).catch(() => {});
  };

  const clearSampleData = async () => {
    dailyDataRef.current = [];
    setDailyData([]);
    calculateSummary([]);
    AsyncStorage.removeItem('dailyUsage').catch(() => {});
  };

  const changeInterval = async (ms) => {
    setSampleInterval(ms);
    AsyncStorage.setItem('sampleInterval', String(ms)).catch(() => {});
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

      const now = Date.now();
      const changed = lastPersisted.current.mobile !== todayEntry.mobile || lastPersisted.current.wifi !== todayEntry.wifi;
      if (changed && now - lastPersistTime.current > 10000) {
        lastPersisted.current = { mobile: todayEntry.mobile, wifi: todayEntry.wifi };
        lastPersistTime.current = now;
        AsyncStorage.setItem('dailyUsage', JSON.stringify(data)).catch(() => {});
      }
    } catch (e) {}
  };

  const refreshApps = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const list = await NetworkUsage.getAppUsage?.();
      if (Array.isArray(list)) {
        setApps(list);
        const sum = list.reduce((s, a) => s + (a.bytes || 0), 0);
        setTodayTotal(sum);
      }
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <View style={styles.content}>
        {tab === 'table' && <TableScreen dailyData={dailyData} summary={summary} />}
        {tab === 'chart' && (
          <ChartScreen
            {...speed}
            sampleInterval={sampleInterval}
            onChangeInterval={changeInterval}
            onLoadSample={loadSampleData}
            onClearSample={clearSampleData}
          />
        )}
        {tab === 'apps' && (
          <AppsScreen
            apps={apps}
            hasAccess={hasAccess}
            todayTotal={todayTotal}
            onOpenSettings={openSettings}
          />
        )}
        {tab === 'test' && <TestScreen />}
      </View>

      {!adFailed && (
        <View style={styles.adWrap}>
          <BannerAd
            unitId={TestIds.BANNER}
            size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={{ requestNonPersonalizedAdsOnly: true }}
            onAdFailedToLoad={() => setAdFailed(true)}
          />
        </View>
      )}

      <View style={styles.tabBar}>
        {[
          { id: 'table', label: 'Table', icon: 'grid-outline' },
          { id: 'chart', label: 'Chart', icon: 'stats-chart-outline' },
          { id: 'apps', label: 'Apps', icon: 'apps-outline' },
          { id: 'test', label: 'Test', icon: 'speedometer-outline' },
        ].map((item) => (
          <Pressable
            key={item.id}
            style={[styles.tab, tab === item.id && styles.tabActive]}
            onPress={() => setTab(item.id)}
          >
            <Ionicons
              name={item.icon}
              size={20}
              color={tab === item.id ? '#fff' : '#888'}
              style={styles.tabIcon}
            />
            <Text style={[styles.tabText, tab === item.id && styles.tabTextActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { flex: 1 },
  adWrap: { alignItems: 'center', backgroundColor: '#0a0a0a' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#121212',
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
    paddingVertical: 8,
    paddingHorizontal: 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 20,
    marginHorizontal: 4,
  },
  tabActive: { backgroundColor: '#1b5e20' },
  tabIcon: { marginBottom: 2 },
  tabText: { color: '#888', fontSize: 11 },
  tabTextActive: { color: '#fff', fontWeight: '600' },
});
