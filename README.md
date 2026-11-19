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
- Notification updates with speed: implemented
- Today's totals in notification: **not yet** (service does not track daily usage)
- Daily totals while app is backgrounded: **not yet** (still tracked only in JS)

## Recommended Next Steps (to finish Phase 1)
1. Move daily Mobile/WiFi accumulation into the Kotlin `SpeedService` (or share state with it).
2. Put today's totals in the notification body: `Mobile: X MB  WiFi: Y MB`.
3. Persist daily totals from the service so they survive process death.
4. Add a simple on-device check before every build (see below).

## Verification Before Build

Before creating any APK, run these checks on a real device:

```bash
git pull
npm install
npx expo prebuild --clean
npx expo run:android
```

Then:
1. Grant overlay permission.
2. Open the app → confirm speed appears in the top bar and status bar.
3. Start a download (or open fast.com / YouTube).
4. Switch to another app → speed in status bar and notification should keep updating.
5. Pull down notification shade → confirm speed is live.
6. Return to the app → today's totals should have increased.

If any of the above fails, do not build the APK.

## Optional: Lightweight Test

A simple unit test for the speed formatting and delta math can live in `__tests__/` (Jest). Native TrafficStats behavior still needs a device check.

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
