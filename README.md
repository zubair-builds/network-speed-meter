# Network Speed Meter - React Native (Expo)

Real-time network speed + daily Mobile/WiFi data usage tracker (Android).

## Features
- Live clock + real download/upload speed (`@hoanggbao00/expo-network-traffic`)
- Connection type (WiFi / Cellular)
- Daily usage table with real byte deltas from Android `TrafficStats`
- Last 7 / 30 days + This Month summaries
- Local Expo module: `modules/expo-network-usage`

## Important
Real speed and usage tracking **only work in a custom build / APK** (not Expo Go).

## Setup & Build APK

```bash
git clone https://github.com/zubair-builds/network-speed-meter.git
cd network-speed-meter
npm install

# Clean any old native folders (important for EAS)
rm -rf android ios

# Build preview APK with EAS
eas build -p android --profile preview
```

When the build finishes, Expo gives you a download link for the APK.

## Local development (custom build)

```bash
npx expo prebuild --clean
npx expo run:android
```

## Notes
- `expo-asset` is included so Metro bundling works.
- `.gitignore` excludes `android/` and `ios/` so EAS does a clean prebuild.
- Sample data is no longer seeded — the table starts empty and fills with real usage.
