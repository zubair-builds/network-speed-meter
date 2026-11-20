/**
 * Pure logic for attributing byte deltas to mobile vs WiFi.
 * Mirrors the rules used in SpeedService.kt.
 *
 * Rules:
 * - Only count if we have a valid baseline and the gap is under MAX_GAP_MS.
 * - Discard the sample if total or mobile delta exceeds MAX_DELTA_BYTES.
 * - Mobile delta is capped so it never exceeds the total delta.
 * - WiFi = total - mobile (when mobile is supported).
 */

const MAX_DELTA_BYTES = 20 * 1024 * 1024;
const MAX_GAP_MS = 5 * 60 * 1000;

function computeDelta({
  now,
  rx,
  tx,
  mRx,
  mTx,
  lastRx,
  lastTx,
  lastMobileRx,
  lastMobileTx,
  lastTime,
  hasBaseline,
  mobileSupported,
}) {
  const gap = lastTime > 0 ? now - lastTime : Number.MAX_SAFE_INTEGER;
  const baselineOk = hasBaseline && gap > 0 && gap < MAX_GAP_MS;

  if (!baselineOk) {
    return {
      counted: false,
      deltaMobile: 0,
      deltaWifi: 0,
      deltaTotal: 0,
      reason: gap >= MAX_GAP_MS ? 'gap' : 'no-baseline',
    };
  }

  let deltaRx = Math.max(0, rx - lastRx);
  let deltaTx = Math.max(0, tx - lastTx);
  let deltaMobile = mobileSupported
    ? Math.max(0, (mRx - lastMobileRx) + (mTx - lastMobileTx))
    : 0;
  let deltaTotal = Math.max(0, deltaRx + deltaTx);

  if (deltaTotal > MAX_DELTA_BYTES || deltaMobile > MAX_DELTA_BYTES) {
    return {
      counted: false,
      deltaMobile: 0,
      deltaWifi: 0,
      deltaTotal: 0,
      reason: 'spike',
    };
  }

  if (deltaMobile > deltaTotal) {
    deltaMobile = deltaTotal;
  }

  const deltaWifi = mobileSupported
    ? Math.max(0, deltaTotal - deltaMobile)
    : deltaTotal;

  return {
    counted: true,
    deltaMobile,
    deltaWifi,
    deltaTotal,
    reason: 'ok',
  };
}

module.exports = {
  computeDelta,
  MAX_DELTA_BYTES,
  MAX_GAP_MS,
};
