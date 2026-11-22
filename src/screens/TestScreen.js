import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

export default function TestScreen() {
  const [speed, setSpeed] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(false);

  const runTest = async () => {
    if (running) return;
    abortRef.current = false;
    setRunning(true);
    setDone(false);
    setError('');
    setSpeed(0);
    try {
      const sizes = [500000, 1000000, 2000000, 5000000];
      let totalBytes = 0;
      const start = Date.now();
      for (const size of sizes) {
        if (abortRef.current) break;
        const url = `https://speed.cloudflare.com/__down?bytes=${size}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Network error');
        const buf = await res.arrayBuffer();
        totalBytes += buf.byteLength;
        const elapsed = (Date.now() - start) / 1000;
        if (elapsed > 0) setSpeed((totalBytes * 8) / elapsed); // bits/sec for Mbps
      }
      setDone(true);
    } catch (e) {
      setError('Test failed. Check your connection.');
      setSpeed(0);
    } finally {
      setRunning(false);
    }
  };

  const mbps = speed > 0 ? (speed / 1_000_000).toFixed(1) : '—';

  return (
    <View style={styles.screen}>
      <Text style={styles.number}>{mbps}</Text>
      <Text style={styles.unit}>Mbps</Text>
      <Text style={styles.hint}>
        {error ? error : running ? 'Testing…' : done ? 'Complete' : 'Download speed'}
      </Text>
      <Pressable
        style={[styles.button, running && styles.buttonDisabled]}
        onPress={runTest}
        disabled={running}
      >
        <Text style={styles.buttonText}>
          {running ? 'Testing' : done || error ? 'Test again' : 'Start'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  number: { color: '#fff', fontSize: 96, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  unit: { color: '#888', fontSize: 20, marginTop: -8 },
  hint: { color: '#555', fontSize: 14, marginTop: 24 },
  button: { marginTop: 40, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 24, borderWidth: 1, borderColor: '#333' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15 },
});
