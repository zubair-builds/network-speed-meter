import React, { useEffect, useState, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  FlatList,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper to format bytes to MB/GB
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const formatDate = (date) => {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export default function App() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [connectionType, setConnectionType] = useState('unknown');
  const [downloadSpeed, setDownloadSpeed] = useState('0 KB/s');
  const [uploadSpeed, setUploadSpeed] = useState('0 KB/s');
  const [dailyData, setDailyData] = useState([]);
  const [summary, setSummary] = useState({
    last7: { mobile: 0, wifi: 0 },
    last30: { mobile: 0, wifi: 0 },
    thisMonth: { mobile: 0, wifi: 0 },
  });

  const lastBytesRef = useRef({ total: 0, time: Date.now() });
  const intervalRef = useRef(null);

  // Load stored data
  useEffect(() => {
    loadData();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setConnectionType(state.type);
    });

    // Simulate / approximate speed tracking
    // Note: For real speed, install @hoanggbao00/expo-network-traffic (Android)
    // and replace this simulation with real values.
    intervalRef.current = setInterval(async () => {
      // Fake speed for demo (replace with real library)
      const down = Math.random() * 500 + 50; // KB/s
      const up = Math.random() * 100 + 10;
      setDownloadSpeed(`${down.toFixed(0)} KB/s`);
      setUploadSpeed(`${up.toFixed(0)} KB/s`);

      // Accumulate daily usage (approximate)
      await accumulateUsage();
    }, 2000);

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
        calculateSummary(parsed);
      } else {
        // Seed with sample data similar to the screenshot
        const sample = generateSampleData();
        setDailyData(sample);
        await AsyncStorage.setItem('dailyUsage', JSON.stringify(sample));
        calculateSummary(sample);
      }
    } catch (e) {
      console.log(e);
    }
  };

  const generateSampleData = () => {
    const data = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const mobile = Math.random() * 3 + 0.3;
      const wifi = Math.random() * 3 + 0.2;
      data.push({
        date: formatDate(d),
        dateObj: d.toISOString(),
        mobile: mobile * 1024 * 1024 * 1024, // bytes
        wifi: wifi * 1024 * 1024 * 1024,
      });
    }
    return data;
  };

  const accumulateUsage = async () => {
    // In a real app, get delta from TrafficStats / NetworkStatsManager
    // Here we just add a small random amount based on connection type for demo
    const now = new Date();
    const todayStr = formatDate(now);
    const delta = Math.random() * 50 * 1024; // small bytes

    let data = [...dailyData];
    let todayEntry = data.find(d => d.date === todayStr);

    if (!todayEntry) {
      todayEntry = {
        date: todayStr,
        dateObj: now.toISOString(),
        mobile: 0,
        wifi: 0,
      };
      data.unshift(todayEntry);
    }

    if (connectionType === 'cellular') {
      todayEntry.mobile += delta;
    } else if (connectionType === 'wifi') {
      todayEntry.wifi += delta;
    }

    // Keep only last 60 days
    if (data.length > 60) data = data.slice(0, 60);

    setDailyData(data);
    calculateSummary(data);
    await AsyncStorage.setItem('dailyUsage', JSON.stringify(data));
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

  const renderRow = ({ item }) => (
    <View style={styles.row}>
      <Text style={[styles.cell, styles.dateCell]}>{item.date}</Text>
      <Text style={styles.cell}>{formatBytes(item.mobile)}</Text>
      <Text style={styles.cell}>{formatBytes(item.wifi)}</Text>
      <Text style={styles.cell}>{formatBytes(item.mobile + item.wifi)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />

      {/* Top sticky header with clock + speed */}
      <View style={styles.topBar}>
        <View style={styles.clockSection}>
          <Text style={styles.clockText}>
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
          <Text style={styles.dateSmall}>{formatDate(currentTime)}</Text>
        </View>
        <View style={styles.speedSection}>
          <Text style={styles.speedLabel}>↓ {downloadSpeed}</Text>
          <Text style={styles.speedLabel}>↑ {uploadSpeed}</Text>
          <Text style={styles.netType}>{connectionType.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Internet Speed Meter</Text>
      </View>

      {/* Table Header */}
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
            <View style={styles.summaryRow}>
              <Text style={[styles.cell, styles.dateCell, styles.summaryText]}>Last 7 days</Text>
              <Text style={[styles.cell, styles.summaryText]}>{formatBytes(summary.last7.mobile)}</Text>
              <Text style={[styles.cell, styles.summaryText]}>{formatBytes(summary.last7.wifi)}</Text>
              <Text style={[styles.cell, styles.summaryText]}>
                {formatBytes(summary.last7.mobile + summary.last7.wifi)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.cell, styles.dateCell, styles.summaryText]}>Last 30 days</Text>
              <Text style={[styles.cell, styles.summaryText]}>{formatBytes(summary.last30.mobile)}</Text>
              <Text style={[styles.cell, styles.summaryText]}>{formatBytes(summary.last30.wifi)}</Text>
              <Text style={[styles.cell, styles.summaryText]}>
                {formatBytes(summary.last30.mobile + summary.last30.wifi)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={[styles.cell, styles.dateCell, styles.summaryText]}>This Month</Text>
              <Text style={[styles.cell, styles.summaryText]}>{formatBytes(summary.thisMonth.mobile)}</Text>
              <Text style={[styles.cell, styles.summaryText]}>{formatBytes(summary.thisMonth.wifi)}</Text>
              <Text style={[styles.cell, styles.summaryText]}>
                {formatBytes(summary.thisMonth.mobile + summary.thisMonth.wifi)}
              </Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  topBar: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clockSection: {
    alignItems: 'flex-start',
  },
  clockText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  dateSmall: {
    color: '#aaa',
    fontSize: 12,
  },
  speedSection: {
    alignItems: 'flex-end',
  },
  speedLabel: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  netType: {
    color: '#2196F3',
    fontSize: 12,
    marginTop: 2,
  },
  header: {
    backgroundColor: '#2196F3',
    padding: 12,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1976D2',
    paddingVertical: 10,
  },
  headerCell: {
    flex: 1,
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 13,
  },
  dateCell: {
    flex: 1.4,
    textAlign: 'left',
    paddingLeft: 8,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  cell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
    color: '#333',
  },
  list: {
    flex: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#bbdefb',
  },
  summaryText: {
    fontWeight: 'bold',
    color: '#1565C0',
  },
});
