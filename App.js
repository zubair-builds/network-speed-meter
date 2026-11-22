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
  Dimensions,
  AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkUsage from './modules/expo-network-usage';
import * as Notifications from 'expo-notifications';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_HEIGHT = 220;
const GRAPH_WIDTH = SCREEN_WIDTH - 32;

const INTERVALS = [
  { label: '1s', ms: 1000 },
  { label: '30s', ms: 30000 },
  { label: '1m', ms: 60000 },
];

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

const formatAxis = (bytesPerSec) => {
  if (bytesPerSec < 1024 * 1024) return `${Math.round(bytesPerSec / 1024)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
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

function SpeedGraph({ data }) {
  if (!data || data.length < 2) {
    return (
      <View style={styles.graphEmpty}>
        <Text style={styles.graphEmptyText}>Collecting speed...</Text>
      </View>
    );
  }

  const max = Math.max(...data, 1);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * GRAPH_WIDTH;
    const y = GRAPH_HEIGHT - (v / max) * (GRAPH_HEIGHT - 20) - 10;
    return `${x},${y}`;
  }).join(' ');

  return (
    <View style={styles.graphWrap}>
      <Svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT}>
        <Line x1="0" y1={GRAPH_HEIGHT - 10} x2={GRAPH_WIDTH} y2={GRAPH_HEIGHT - 10} stroke="#333" strokeWidth="1" />
        <Polyline
          points={points}
          fill="none"
          stroke="#4CAF50"
          strokeWidth="2"
        />
        <SvgText x="4" y="14" fill="#888" fontSize="10">{formatAxis(max)}</SvgText>
        <SvgText x={GRAPH_WIDTH - 24} y={GRAPH_HEIGHT - 14} fill="#666" fontSize="10">60s</SvgText>
      </Svg>
    </View>
  );
}

export default function App() {
  const [tab, setTab] = useState('table');
  const [dailyData, setDailyData] = useState([]);
  const [summary, setSummary] = useState({
    last7: { mobile: 0, wifi: 0 },
    last30: { mobile: 0, wifi: 0 },
    thisMonth: { mobile: 0, wifi: 0 },
  });
  const [downloadSpeed, setDownloadSpeed] = useState('0 KB/s');
  const [uploadSpeed, setUploadSpeed] = useState('0 KB/s');
  const [speedHistory, setSpeedHistory] = useState([]);
  const [dayMaxMobile, setDayMaxMobile] = useState(0);
  const [dayAvgMobile, setDayAvgMobile] = useState(0);
  const [dayMaxWifi, setDayMaxWifi] = useState(0);
  const [dayAvgWifi, setDayAvgWifi] = useState(0);
  const [sampleInterval, setSampleInterval] = useState(30000);

  const [apps, setApps] = useState([]);
  const [sessionStart, setSessionStart] = useState(0);
  const [sessionElapsed, setSessionElapsed] = useState(0);
  const [hasAccess, setHasAccess] = useState(false);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [testSpeed, setTestSpeed] = useState(0);
  const [testRunning, setTestRunning] = useState(false);
  const [testDone, setTestDone] = useState(false);

  const lastBytesRef = useRef({ totalRx: 0, totalTx: 0, time: Date.now() });
  const dailyDataRef = useRef([]);
  const intervalRef = useRef(null);
  const historyRef = useRef([]);
  const appTick = useRef(0);
  const mobileSamplesRef = useRef([]);
  const wifiSamplesRef = useRef([]);
  const lastSampleTime = useRef(0);
  const sampleIntervalRef = useRef(30000);
  const lastMobileRef = useRef(null);

  useEffect(() => {
    dailyDataRef.current = dailyData;
  }, [dailyData]);

  useEffect(() => {
    sampleIntervalRef.current = sampleInterval;
  }, [sampleInterval]);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'android') return;
      try {
        await Notifications.requestPermissionsAsync();
        await NetworkUsage.startSpeedService?.();
        const access = await NetworkUsage.hasUsageAccess?.();
        setHasAccess(!!access);
        if (access) refreshApps();
        const start = await NetworkUsage.startSession?.();
        if (start) setSessionStart(start);
        await loadDaySamples();
        const saved = await AsyncStorage.getItem('sampleInterval');
        if (saved) {
          const ms = parseInt(saved, 10);
          if (ms > 0) {
            setSampleInterval(ms);
            sampleIntervalRef.current = ms;
          }
        }
      } catch (e) {
        console.log('Init error:', e);
      }
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
    intervalRef.current = setInterval(() => {
      updateSpeed();
      refreshTodayFromService();
      appTick.current += 1;
      if (appTick.current % 3 === 0) {
        refreshApps();
      }
      if (sessionStart > 0) {
        setSessionElapsed(Date.now() - sessionStart);
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [sessionStart]);

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

  const loadDaySamples = async () => {
    try {
      const today = toISODate(new Date());
      const [mRaw, wRaw] = await Promise.all([
        AsyncStorage.getItem(`speedSamples_mobile_${today}`),
        AsyncStorage.getItem(`speedSamples_wifi_${today}`),
      ]);
      const mParsed = mRaw ? JSON.parse(mRaw) : [];
      const wParsed = wRaw ? JSON.parse(wRaw) : [];
      mobileSamplesRef.current = Array.isArray(mParsed) ? mParsed : [];
      wifiSamplesRef.current = Array.isArray(wParsed) ? wParsed : [];
      updateDayStats();
    } catch (e) {}
  };

  const statsOf = (samples) => {
    if (!samples || !samples.length) return { max: 0, avg: 0 };
    const max = Math.max(...samples);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { max, avg };
  };

  const updateDayStats = () => {
    const m = statsOf(mobileSamplesRef.current);
    const w = statsOf(wifiSamplesRef.current);
    setDayMaxMobile(m.max);
    setDayAvgMobile(m.avg);
    setDayMaxWifi(w.max);
    setDayAvgWifi(w.avg);
  };

  const saveDaySample = async (bps, kind) => {
    const today = toISODate(new Date());
    const ref = kind === 'mobile' ? mobileSamplesRef : wifiSamplesRef;
    const key = kind === 'mobile' ? `speedSamples_mobile_${today}` : `speedSamples_wifi_${today}`;
    ref.current.push(bps);
    if (ref.current.length > 8640) {
      ref.current = ref.current.slice(-8640);
    }
    updateDayStats();
    AsyncStorage.setItem(key, JSON.stringify(ref.current)).catch(() => {});
  };

  const changeInterval = async (ms) => {
    setSampleInterval(ms);
    sampleIntervalRef.current = ms;
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
      let mobile = null;
      try {
        mobile = await NetworkUsage.getMobileBytes?.();
      } catch (e) {}

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
        const rxBps = deltaRx / elapsed;
        setDownloadSpeed(formatSpeed(rxBps));
        setUploadSpeed(formatSpeed(deltaTx / elapsed));

        const hist = [...historyRef.current, rxBps];
        if (hist.length > 60) hist.shift();
        historyRef.current = hist;
        setSpeedHistory([...hist]);

        let isMobile = false;
        let mobileReady = false;
        if (mobile && mobile.rx >= 0) {
          const prevM = lastMobileRef.current;
          if (prevM) {
            const dMobile = Math.max(0, (mobile.rx - prevM.rx) + (mobile.tx - prevM.tx));
            const dTotal = deltaRx + deltaTx;
            isMobile = dTotal > 0 && dMobile >= dTotal * 0.5;
            mobileReady = true;
          }
          lastMobileRef.current = { rx: mobile.rx, tx: mobile.tx };
        }

        if (mobileReady && now - lastSampleTime.current >= sampleIntervalRef.current) {
          lastSampleTime.current = now;
          saveDaySample(rxBps, isMobile ? 'mobile' : 'wifi');
        }
      }
    } catch (e) {
      console.log('Speed error:', e.message || e);
    }
  };

  const runSpeedTest = async () => {
    if (testRunning) return;
    setTestRunning(true);
    setTestDone(false);
    setTestSpeed(0);
    try {
      const sizes = [1000000, 5000000, 10000000];
      let totalBytes = 0;
      const start = Date.now();
      for (const size of sizes) {
        const url = `https://speed.cloudflare.com/__down?bytes=${size}`;
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        totalBytes += buf.byteLength;
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed > 0) setTestSpeed(totalBytes / elapsed);
      }
      setTestDone(true);
    } catch (e) {
      console.log('Speed test error:', e);
      setTestSpeed(0);
    } finally {
      setTestRunning(false);
    }
  };

  const refreshApps = async () => {
    if (Platform.OS !== 'android') return;
    try {
      const list = await NetworkUsage.getAppUsage?.();
      if (Array.isArray(list)) {
        setApps(list);
        const sum = list.reduce((s, a) => s + (a.bytes || 0), 0);
        setSessionTotal(sum);
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

  const renderApp = ({ item }) => (
    <View style={styles.appRow}>
      <Text style={styles.appLabel} numberOfLines={1}>{item.label}</Text>
      <Text style={styles.appBytes}>{formatBytes(item.bytes)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />

      <View style={styles.content}>
      {tab === 'table' && (
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
      )}

      {tab === 'chart' && (
        <>
          <View style={styles.sessionBar}>
            <View style={styles.sessionItem}>
              <Text style={styles.sessionValue}>{formatDuration(sessionElapsed)}</Text>
              <Text style={styles.sessionLabel}>Session Time</Text>
            </View>
            <View style={styles.sessionDivider} />
            <View style={styles.sessionItem}>
              <Text style={styles.sessionValue}>{formatBytes(sessionTotal)}</Text>
              <Text style={styles.sessionLabel}>Today's Usage</Text>
            </View>
          </View>

          <View style={styles.topBar}>
            <Text style={styles.speedLabel}>↓ {downloadSpeed}</Text>
            <Text style={styles.speedLabel}>↑ {uploadSpeed}</Text>
          </View>

          <SpeedGraph data={speedHistory} />

          <View style={styles.dayStats}>
            <View style={styles.dayStatCol}>
              <Text style={styles.dayStatLabel}>Mobile</Text>
              <Text style={styles.dayStatText}>Max  {formatSpeed(dayMaxMobile)}</Text>
              <Text style={styles.dayStatText}>Avg  {formatSpeed(dayAvgMobile)}</Text>
            </View>
            <View style={styles.dayStatCol}>
              <Text style={styles.dayStatLabel}>WiFi</Text>
              <Text style={styles.dayStatText}>Max  {formatSpeed(dayMaxWifi)}</Text>
              <Text style={styles.dayStatText}>Avg  {formatSpeed(dayAvgWifi)}</Text>
            </View>
          </View>

          <View style={styles.intervalRow}>
            <Text style={styles.intervalLabel}>Sample every</Text>
            {INTERVALS.map((opt) => (
              <Pressable
                key={opt.ms}
                style={[styles.intervalBtn, sampleInterval === opt.ms && styles.intervalBtnActive]}
                onPress={() => changeInterval(opt.ms)}
              >
                <Text style={[styles.intervalBtnText, sampleInterval === opt.ms && styles.intervalBtnTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.sampleRow}>
            <Pressable style={styles.sampleBtn} onPress={loadSampleData}>
              <Text style={styles.sampleBtnText}>Load sample data</Text>
            </Pressable>
            <Pressable style={styles.sampleBtn} onPress={clearSampleData}>
              <Text style={styles.sampleBtnText}>Clear</Text>
            </Pressable>
          </View>
        </>
      )}

      {tab === 'apps' && (
        <>
          <View style={styles.sessionBar}>
            <View style={styles.sessionItem}>
              <Text style={styles.sessionValue}>{formatDuration(sessionElapsed)}</Text>
              <Text style={styles.sessionLabel}>Session Time</Text>
            </View>
            <View style={styles.sessionDivider} />
            <View style={styles.sessionItem}>
              <Text style={styles.sessionValue}>{formatBytes(sessionTotal)}</Text>
              <Text style={styles.sessionLabel}>Today's Usage</Text>
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
      )}

      {tab === 'test' && (
        <View style={styles.testScreen}>
          <Text style={styles.testNumber}>
            {testSpeed > 0 ? (testSpeed / (1024 * 1024)).toFixed(1) : '—'}
          </Text>
          <Text style={styles.testUnit}>Mbps</Text>
          <Text style={styles.testHint}>
            {testRunning ? 'Testing…' : testDone ? 'Complete' : 'Download speed'}
          </Text>
          <Pressable
            style={[styles.testButton, testRunning && styles.testButtonDisabled]}
            onPress={runSpeedTest}
            disabled={testRunning}
          >
            <Text style={styles.testButtonText}>
              {testRunning ? 'Testing' : testDone ? 'Test again' : 'Start'}
            </Text>
          </Pressable>
        </View>
      )}
      </View>

      <View style={styles.adWrap}>
        <BannerAd
          unitId={TestIds.BANNER}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === 'table' && styles.tabActive]}
          onPress={() => setTab('table')}
        >
          <Text style={[styles.tabText, tab === 'table' && styles.tabTextActive]}>Table</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'chart' && styles.tabActive]}
          onPress={() => setTab('chart')}
        >
          <Text style={[styles.tabText, tab === 'chart' && styles.tabTextActive]}>Chart</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'apps' && styles.tabActive]}
          onPress={() => setTab('apps')}
        >
          <Text style={[styles.tabText, tab === 'apps' && styles.tabTextActive]}>Apps</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'test' && styles.tabActive]}
          onPress={() => setTab('test')}
        >
          <Text style={[styles.tabText, tab === 'test' && styles.tabTextActive]}>Test</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  content: { flex: 1 },
  topBar: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  speedLabel: { color: '#4CAF50', fontSize: 16, fontWeight: '600' },
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
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sessionItem: { flex: 1, alignItems: 'center' },
  sessionValue: { color: '#fff', fontSize: 22, fontWeight: '600' },
  sessionLabel: { color: '#a0c4e8', fontSize: 12, marginTop: 2 },
  sessionDivider: { width: 1, backgroundColor: '#2a5a8a', marginVertical: 4 },

  graphWrap: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  graphEmpty: {
    height: GRAPH_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  graphEmptyText: { color: '#666', fontSize: 13 },

  dayStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
  },
  dayStatCol: { alignItems: 'center' },
  dayStatLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  dayStatText: { color: '#aaa', fontSize: 13 },

  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingBottom: 8,
    gap: 8,
  },
  intervalLabel: { color: '#666', fontSize: 12, marginRight: 4 },
  intervalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  intervalBtnActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  intervalBtnText: { color: '#888', fontSize: 12 },
  intervalBtnTextActive: { color: '#fff', fontWeight: '600' },

  sampleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    paddingBottom: 16,
    gap: 12,
  },
  sampleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  sampleBtnText: { color: '#ccc', fontSize: 12 },

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

  adWrap: {
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingBottom: Platform.OS === 'ios' ? 4 : 0,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: { borderTopWidth: 2, borderTopColor: '#4CAF50' },
  tabText: { color: '#888', fontSize: 14 },
  tabTextActive: { color: '#fff', fontWeight: '600' },

  testScreen: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  testNumber: {
    color: '#fff',
    fontSize: 96,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  testUnit: {
    color: '#888',
    fontSize: 20,
    marginTop: -8,
  },
  testHint: {
    color: '#555',
    fontSize: 14,
    marginTop: 24,
  },
  testButton: {
    marginTop: 40,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  testButtonDisabled: { opacity: 0.5 },
  testButtonText: { color: '#fff', fontSize: 15 },
});
