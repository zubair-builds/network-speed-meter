/**
 * Unit tests for speed formatting and usage delta logic.
 * These protect the core Phase 1 behavior.
 */

const formatSpeed = (bytesPerSec) => {
  if (!bytesPerSec || bytesPerSec < 0) return '0 B/s';
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
};

const computeDeltas = (prev, curr) => {
  const deltaRx = Math.max(0, curr.rx - prev.rx);
  const deltaTx = Math.max(0, curr.tx - prev.tx);
  const deltaMobile = Math.max(0, (curr.mRx + curr.mTx) - (prev.mRx + prev.mTx));
  const deltaTotal = deltaRx + deltaTx;
  const deltaWifi = Math.max(0, deltaTotal - deltaMobile);
  return { deltaRx, deltaTx, deltaMobile, deltaWifi, deltaTotal };
};

describe('formatSpeed', () => {
  test('zero or negative returns 0 B/s', () => {
    expect(formatSpeed(0)).toBe('0 B/s');
    expect(formatSpeed(-100)).toBe('0 B/s');
    expect(formatSpeed(null)).toBe('0 B/s');
  });

  test('bytes under 1 KB', () => {
    expect(formatSpeed(512)).toBe('512 B/s');
    expect(formatSpeed(1)).toBe('1 B/s');
  });

  test('KB range', () => {
    expect(formatSpeed(1536)).toBe('1.5 KB/s');
    expect(formatSpeed(1024 * 10)).toBe('10.0 KB/s');
  });

  test('MB range', () => {
    expect(formatSpeed(1024 * 1024 * 2.5)).toBe('2.50 MB/s');
  });
});

describe('computeDeltas', () => {
  test('normal positive deltas', () => {
    const prev = { rx: 1000, tx: 200, mRx: 400, mTx: 100 };
    const curr = { rx: 2000, tx: 500, mRx: 900, mTx: 200 };
    const d = computeDeltas(prev, curr);
    expect(d.deltaRx).toBe(1000);
    expect(d.deltaTx).toBe(300);
    expect(d.deltaMobile).toBe(600);
    expect(d.deltaWifi).toBe(700);
    expect(d.deltaTotal).toBe(1300);
  });

  test('negative counters are clamped to zero', () => {
    const prev = { rx: 5000, tx: 1000, mRx: 2000, mTx: 500 };
    const curr = { rx: 1000, tx: 200, mRx: 500, mTx: 100 };
    const d = computeDeltas(prev, curr);
    expect(d.deltaRx).toBe(0);
    expect(d.deltaTx).toBe(0);
    expect(d.deltaMobile).toBe(0);
    expect(d.deltaWifi).toBe(0);
  });

  test('wifi is remainder after mobile', () => {
    const prev = { rx: 0, tx: 0, mRx: 0, mTx: 0 };
    const curr = { rx: 1000, tx: 0, mRx: 300, mTx: 0 };
    const d = computeDeltas(prev, curr);
    expect(d.deltaMobile).toBe(300);
    expect(d.deltaWifi).toBe(700);
  });
});
