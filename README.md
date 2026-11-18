# Network Speed Meter - React Native (Expo)

A React Native app that tracks approximate WiFi & Mobile data usage and shows a live clock + speed on top, with a daily usage table similar to "Internet Speed Meter Lite".

## Features
- Sticky top bar with **live clock** and current download/upload speed
- Connection type indicator (WiFi / Cellular)
- Daily usage table (Mobile / WiFi / Total)
- Last 7 days, Last 30 days, This Month summaries
- Data persists with AsyncStorage

## Important Notes
1. **Real data usage tracking** (exact daily Mobile vs WiFi) requires Android native code using `TrafficStats` or `NetworkStatsManager` + special permissions. This version uses simulated accumulation for demo purposes.
2. For **real-time speed** on Android, install:
   ```bash
   npx expo install @hoanggbao00/expo-network-traffic
   ```
   Then replace the speed simulation with the `useNetworkTraffic` hook.
3. **Always-on-top overlay** (floating over other apps) is Android-only and requires `SYSTEM_ALERT_WINDOW` permission + a custom native floating window or foreground service. This app shows a persistent in-app header.

## Setup

```bash
cd NetworkSpeedMeter
npm install
npx expo start
```

Then scan the QR code with Expo Go (or run on emulator).

## Next Steps for Production
- Integrate `@hoanggbao00/expo-network-traffic` for real speeds.
- Write a native module (Kotlin) to query `NetworkStatsManager` for accurate daily Mobile/WiFi bytes.
- For floating overlay: use a library like `@increase21/rn-floating-bubble` or implement a custom overlay service.
- Add charts, data limit alerts, etc.

The UI closely matches the style of the provided screenshot.
