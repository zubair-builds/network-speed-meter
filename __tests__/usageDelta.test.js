const { computeDelta, MAX_DELTA_BYTES, MAX_GAP_MS } = require('../modules/expo-network-usage/usageDelta');

function base(overrides = {}) {
  return {
    now: 1_000_000,
    rx: 1000,
    tx: 500,
    mRx: 0,
    mTx: 0,
    lastRx: 1000,
    lastTx: 500,
    lastMobileRx: 0,
    lastMobileTx: 0,
    lastTime: 999_000,
    hasBaseline: true,
    mobileSupported: true,
    ...overrides,
  };
}

describe('computeDelta — mobile',
  () => {
    test('counts only mobile bytes when all traffic is mobile', () => {
      const result = computeDelta(base({
        rx: 5000,
        tx: 1000,
        lastRx: 1000,
        lastTx: 0,
        mRx: 4000,
        mTx: 1000,
        lastMobileRx: 0,
        lastMobileTx: 0,
      }));
      expect(result.counted).toBe(true);
      expect(result.deltaMobile).toBe(5000);
      expect(result.deltaWifi).toBe(0);
      expect(result.deltaTotal).toBe(5000);
    });

    test('caps mobile so it never exceeds total', () => {
      const result = computeDelta(base({
        rx: 3000,
        tx: 0,
        lastRx: 0,
        lastTx: 0,
        mRx: 5000,
        mTx: 0,
        lastMobileRx: 0,
        lastMobileTx: 0,
      }));
      expect(result.deltaMobile).toBe(3000);
      expect(result.deltaWifi).toBe(0);
    });

    test('ignores mobile spike larger than MAX_DELTA_BYTES', () => {
      const result = computeDelta(base({
        rx: MAX_DELTA_BYTES + 1000,
        tx: 0,
        lastRx: 0,
        lastTx: 0,
        mRx: MAX_DELTA_BYTES + 1000,
        mTx: 0,
        lastMobileRx: 0,
        lastMobileTx: 0,
      }));
      expect(result.counted).toBe(false);
      expect(result.reason).toBe('spike');
      expect(result.deltaMobile).toBe(0);
    });
  }
);

describe('computeDelta — wifi',
  () => {
    test('counts only wifi when mobile delta is zero', () => {
      const result = computeDelta(base({
        rx: 8000,
        tx: 2000,
        lastRx: 0,
        lastTx: 0,
        mRx: 0,
        mTx: 0,
        lastMobileRx: 0,
        lastMobileTx: 0,
      }));
      expect(result.counted).toBe(true);
      expect(result.deltaMobile).toBe(0);
      expect(result.deltaWifi).toBe(10000);
    });

    test('splits mixed mobile and wifi correctly', () => {
      const result = computeDelta(base({
        rx: 10000,
        tx: 0,
        lastRx: 0,
        lastTx: 0,
        mRx: 3000,
        mTx: 0,
        lastMobileRx: 0,
        lastMobileTx: 0,
      }));
      expect(result.deltaMobile).toBe(3000);
      expect(result.deltaWifi).toBe(7000);
      expect(result.deltaTotal).toBe(10000);
    });

    test('when mobile is not supported, all traffic goes to wifi', () => {
      const result = computeDelta(base({
        mobileSupported: false,
        rx: 6000,
        tx: 1000,
        lastRx: 0,
        lastTx: 0,
      }));
      expect(result.deltaMobile).toBe(0);
      expect(result.deltaWifi).toBe(7000);
    });
  }
);

describe('computeDelta — baseline and gaps',
  () => {
    test('does not count when there is no baseline', () => {
      const result = computeDelta(base({
        hasBaseline: false,
        lastTime: 0,
        rx: 999999,
      }));
      expect(result.counted).toBe(false);
      expect(result.reason).toBe('no-baseline');
      expect(result.deltaMobile).toBe(0);
      expect(result.deltaWifi).toBe(0);
    });

    test('does not count when gap exceeds MAX_GAP_MS', () => {
      const result = computeDelta(base({
        now: 1_000_000,
        lastTime: 1_000_000 - MAX_GAP_MS - 1000,
        rx: 50000,
        lastRx: 0,
      }));
      expect(result.counted).toBe(false);
      expect(result.reason).toBe('gap');
    });

    test('counts normally when gap is under the limit', () => {
      const result = computeDelta(base({
        now: 1_000_000,
        lastTime: 1_000_000 - 30_000,
        rx: 2000,
        lastRx: 1000,
        tx: 0,
        lastTx: 0,
        mRx: 0,
        mTx: 0,
      }));
      expect(result.counted).toBe(true);
      expect(result.deltaWifi).toBe(1000);
    });
  }
);
