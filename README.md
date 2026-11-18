# Network Speed Meter - React Native (Expo)

Real-time network speed + daily Mobile/WiFi data usage tracker.

## Features
- Live clock + real download/upload speed (Android)
- Connection type (WiFi / Cellular)
- Daily usage table with Mobile / WiFi / Total
- Last 7 / 30 days + This Month summaries
- Local Expo module using Android TrafficStats for accurate byte deltas

## Setup

```bash
npm install
npx expo prebuild          # generates native projects (required for the modules)
eas build -p android --profile preview
```

Or for local development:

```bash
npx expo run:android
```

**Note:** Real speed and usage tracking only work on Android in a custom development build or APK (not Expo Go).

The local module `modules/expo-network-usage` uses `TrafficStats` to get total and mobile bytes since boot, then computes deltas for daily tracking.
