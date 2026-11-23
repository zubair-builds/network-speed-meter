import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';

const FETCH_TIMEOUT = 15000;

async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export default function TestScreen() {
  const [phase, setPhase] = useState('idle');
  const [downMbps, setDownMbps] = useState(0);
  const [upMbps, setUpMbps] = useState(0);
  const [ping, setPing] = useState(0);
  const [error, setError] = useState('');
  const abortRef = useRef(false);

  useEffect(() => {
    return () => { abortRef.current = true; };
  }, []);

  const measurePing = async () => {
    const url = 'https://speed.cloudflare.com/__down?bytes=100';
    const times = [];
    for (let i = 0; i < 3; i++) {
      if (abortRef.current) break;
      const start = Date.now();
      try {
        const res = await fetchWithTimeout(url, {}, 5000);
        await res.arrayBuffer();
        times.push(Date.now() - start);
      } catch (e) {}
    }
    return times.length ? Math.min(...times) : 0;
  };

  const runDownload = async () => {
    const sizes = [500000, 1000000, 2000000, 4000000];
    let totalBytes = 0;
    const start = Date.now();
    for (const size of sizes) {
      if (abortRef.current) break;
      const res = await fetchWithTimeout(`https://speed.cloudflare.com/__down?bytes=${size}`);
      if (!res.ok) throw new Error('down');
      const buf = await res.arrayBuffer();
      totalBytes += buf.byteLength;
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed > 0) setDownMbps((totalBytes * 8) / elapsed / 1_000_000);
    }
  };

  const runUpload = async () => {
    const size = 500000;
    const body = 'x'.repeat(size);
    let totalBytes = 0;
    const start = Date.now();
    for (let i = 0; i < 4; i++) {
      if (abortRef.current) break;
      const res = await fetchWithTimeout('https://speed.cloudflare.com/__up', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      if (!res.ok) throw new Error('up');
      totalBytes += size;
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed > 0) setUpMbps((totalBytes * 8) / elapsed / 1_000_000);
    }
  };

  const runTest = async () => {
    if (phase === 'ping' || phase === 'down' || phase === 'up') return;
    abortRef.current = false;
    setError('');
    setDownMbps(0);
    setUpMbps(0);
    setPing(0);
    try {
      setPhase('ping');
      const p = await measurePing();
      if (abortRef.current) return;
      setPing(p);
      setPhase('down');
      await runDownload();
      if (abortRef.current) return;
      setPhase('up');
      await runUpload();
      if (abortRef.current) return;
      setPhase('done');
    } catch (e) {
      if (!abortRef.current) {
        setError(e.name === 'AbortError' ? 'Test timed out.' : 'Test failed. Check your connection.');
        setPhase('idle');
      }
    }
  };

  const running = phase === 'ping' || phase === 'down' || phase === 'up';
  const main = phase === 'up' ? upMbps : downMbps;
  const mainLabel = phase === 'up' ? 'Upload' : 'Download';

  return (
    <View style={styles.screen}>
      <Text style={styles.phase}>
        {phase === 'idle' ? 'Speed test' : phase === 'done' ? 'Complete' : phase}
      </Text>
      <Text style={styles.number}>{main > 0 ? main.toFixed(1) : '—'}</Text>
      <Text style={styles.unit}>Mbps</Text>
      <Text style={styles.hint}>
        {error || (running ? `${mainLabel}…` : 'Download · Upload · Ping')}
      </Text>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{ping > 0 ? `${ping}` : '—'}</Text>
          <Text style={styles.statLabel}>Ping ms</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{downMbps > 0 ? downMbps.toFixed(1) : '—'}</Text>
          <Text style={styles.statLabel}>Down</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{upMbps > 0 ? upMbps.toFixed(1) : '—'}</Text>
          <Text style={styles.statLabel}>Up</Text>
        </View>
      </View>

      <Pressable
        style={[styles.button, running && styles.buttonDisabled]}
        onPress={runTest}
        disabled={running}
      >
        <Text style={styles.buttonText}>
          {running ? 'Testing' : phase === 'done' || error ? 'Test again' : 'Start'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  phase: { color: '#666', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  number: { color: '#fff', fontSize: 88, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  unit: { color: '#888', fontSize: 18, marginTop: -6 },
  hint: { color: '#555', fontSize: 13, marginTop: 16 },
  stats: { flexDirection: 'row', marginTop: 32, gap: 24 },
  stat: { alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
  statLabel: { color: '#666', fontSize: 11, marginTop: 2 },
  button: { marginTop: 36, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 24, borderWidth: 1, borderColor: '#333' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15 },
});
