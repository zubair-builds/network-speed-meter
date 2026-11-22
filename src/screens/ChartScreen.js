import React from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { formatSpeed, formatAxis } from '../utils/format';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRAPH_HEIGHT = 220;
const GRAPH_WIDTH = SCREEN_WIDTH - 32;

const INTERVALS = [
  { label: '1s', ms: 1000 },
  { label: '30s', ms: 30000 },
  { label: '1m', ms: 60000 },
];

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
        <Polyline points={points} fill="none" stroke="#4CAF50" strokeWidth="2" />
        <SvgText x="4" y="14" fill="#888" fontSize="10">{formatAxis(max)}</SvgText>
        <SvgText x={GRAPH_WIDTH - 24} y={GRAPH_HEIGHT - 14} fill="#666" fontSize="10">60s</SvgText>
      </Svg>
    </View>
  );
}

export default function ChartScreen({
  downloadSpeed,
  uploadSpeed,
  speedHistory,
  dayMaxMobile,
  dayAvgMobile,
  dayMaxWifi,
  dayAvgWifi,
  sampleInterval,
  onChangeInterval,
  onLoadSample,
  onClearSample,
}) {
  return (
    <>
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
            onPress={() => onChangeInterval(opt.ms)}
          >
            <Text style={[styles.intervalBtnText, sampleInterval === opt.ms && styles.intervalBtnTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {__DEV__ && (
        <View style={styles.sampleRow}>
          <Pressable style={styles.sampleBtn} onPress={onLoadSample}>
            <Text style={styles.sampleBtnText}>Load sample data</Text>
          </Pressable>
          <Pressable style={styles.sampleBtn} onPress={onClearSample}>
            <Text style={styles.sampleBtnText}>Clear</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  speedLabel: { color: '#4CAF50', fontSize: 16, fontWeight: '600' },
  graphWrap: { backgroundColor: '#1a1a1a', paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center' },
  graphEmpty: { height: GRAPH_HEIGHT, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a' },
  graphEmptyText: { color: '#666', fontSize: 13 },
  dayStats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#1a1a1a', paddingVertical: 12 },
  dayStatCol: { alignItems: 'center' },
  dayStatLabel: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  dayStatText: { color: '#aaa', fontSize: 13 },
  intervalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a', paddingBottom: 8, gap: 8 },
  intervalLabel: { color: '#666', fontSize: 12, marginRight: 4 },
  intervalBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: '#333' },
  intervalBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  intervalBtnText: { color: '#888', fontSize: 12 },
  intervalBtnTextActive: { color: '#fff', fontWeight: '600' },
  sampleRow: { flexDirection: 'row', justifyContent: 'center', backgroundColor: '#1a1a1a', paddingBottom: 16, gap: 12 },
  sampleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 4, backgroundColor: '#333' },
  sampleBtnText: { color: '#ccc', fontSize: 12 },
});
