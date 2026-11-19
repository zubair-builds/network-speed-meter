# Network Speed Meter

Real-time network speed and daily data usage tracker for Android.

## Phase 1 — Core Feature (Definition of Done)

**User expectation:**
1. Real-time download speed is always visible in the **status bar**, no matter which app is open.
2. When the user pulls down the **notification shade**, they see:
   - Live download speed
   - Today's total usage so far (Mobile and WiFi)

**Done when:**
- Foreground service keeps speed + overlay + notification updating while the app is in the background or screen is off.
- Notification body shows both speed and today's Mobile / WiFi totals.
- Daily totals continue accumulating even when the app is not in the foreground.
- Status bar overlay shows the current download speed (number above unit).
- Works on a real device in a custom build / APK (not Expo Go).

## Current Status
- Speed in status bar overlay: implemented via foreground service
- Notification updates with speed + today's totals: implemented (service tracks and persists daily usage)
- Daily totals continue in background: implemented in service
- Unit tests for speed formatting and delta math: `__tests__/speed.test.js`

## Verification Before Build

```bash
npm test
git pull
npm install
npx expo prebuild --clean
npx expo run:android
```

Then on device:
1. Grant overlay permission.
2. Open the app → confirm speed in top bar and status bar.
3. Start a download.
4. Switch to another app → speed in status bar and notification should keep updating.
5. Pull down notification shade → confirm speed + today's Mobile/WiFi totals.
6. Return to the app → today's totals should have increased.

If any check fails, do not build the APK.

## Setup & Build

```bash
git clone https://github.com/zubair-builds/network-speed-meter.git
cd network-speed-meter
npm install
rm -rf android ios
eas build -p android --profile preview
```

## Local development

```bash
npx expo prebuild --clean
npx expo run:android
```

## Notes
- Real speed and usage only work in a custom build / APK.
- Package ID: `com.zubair.speedmeter`
