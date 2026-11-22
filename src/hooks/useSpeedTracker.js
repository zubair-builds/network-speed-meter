import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetworkUsage from '../../modules/expo-network-usage';

const toISODate = (date) => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export function useSpeedTracker(sampleInterval) {
  const [downloadSpeed, setDownloadSpeed] = useState('0 KB/s');
  const [uploadSpeed, setUploadSpeed] = useState('0 KB/s');
  const [speedHistory, setSpeedHistory] = useState([]);
  const [dayMaxMobile, setDayMaxMobile] = useState(0);
  const [dayAvgMobile, setDayAvgMobile] = useState(0);
  const [dayMaxWifi, setDayMaxWifi] = useState(0);
  const [dayAvgWifi, setDayAvgWifi] = useState(0);

  const lastBytesRef = useRef({ totalRx: 0, totalTx: 0, time: Date.now() });
  const historyRef = useRef([]);
  const mobileSamplesRef = useRef([]);
  const wifiSamplesRef = useRef([]);
  const lastSampleTime = useRef(0);
  const lastMobileRef = useRef(null);
  const sampleIntervalRef = useRef(sampleInterval);
  const pendingFlush = useRef(false);
  const currentDay = useRef(toISODate(new Date()));

  useEffect(() => {
    sampleIntervalRef.current = sampleInterval;
  }, [sampleInterval]);

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

  const loadDaySamples = async () => {
    try {
      const today = toISODate(new Date());
      currentDay.current = today;
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

  const flushSamples = async () => {
    if (!pendingFlush.current) return;
    pendingFlush.current = false;
    const today = currentDay.current;
    try {
      await Promise.all([
        AsyncStorage.setItem(`speedSamples_mobile_${today}`, JSON.stringify(mobileSamplesRef.current)),
        AsyncStorage.setItem(`speedSamples_wifi_${today}`, JSON.stringify(wifiSamplesRef.current)),
      ]);
    } catch (e) {}
  };

  const saveDaySample = (bps, kind) => {
    const today = toISODate(new Date());
    if (today !== currentDay.current) {
      // midnight rollover
      flushSamples();
      currentDay.current = today;
      mobileSamplesRef.current = [];
      wifiSamplesRef.current = [];
    }
    const ref = kind === 'mobile' ? mobileSamplesRef : wifiSamplesRef;
    ref.current.push(bps);
    if (ref.current.length > 8640) {
      ref.current = ref.current.slice(-8640);
    }
    updateDayStats();
    pendingFlush.current = true;
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
        const { formatSpeed } = require('../utils/format');
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
      if (__DEV__) console.log('Speed error:', e.message || e);
    }
  };

  useEffect(() => {
    loadDaySamples();
    const tick = setInterval(updateSpeed, 1000);
    const flush = setInterval(flushSamples, 30000);
    return () => {
      clearInterval(tick);
      clearInterval(flush);
      flushSamples();
    };
  }, []);

  return {
    downloadSpeed,
    uploadSpeed,
    speedHistory,
    dayMaxMobile,
    dayAvgMobile,
    dayMaxWifi,
    dayAvgWifi,
  };
}
