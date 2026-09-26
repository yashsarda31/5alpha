import test from 'node:test';
import assert from 'node:assert/strict';

import { latestObservation, normaliseChart, periodStartIndex, resolveAnalysisSymbol } from './analyseData.js';

const sample = {
  ticker: 'RELIANCE.NS',
  dates: ['2023-12-01', '2024-06-01', '2025-01-01'],
  open: [100, 110, 120],
  high: [105, 115, 125],
  low: [95, 105, 115],
  close: [102, 112, 122],
  volume: [10, 20, 30],
  rsi: [45, 55, 65],
  sma20: [99, 109, 119],
};

test('normaliseChart accepts aligned finite OHLC history', () => {
  const result = normaliseChart(sample);
  assert.equal(result?.ticker, 'RELIANCE.NS');
  assert.equal(result?.close.at(-1), 122);
});

test('normaliseChart rejects misaligned or invalid price history', () => {
  assert.equal(normaliseChart({ ...sample, high: [105] }), null);
  assert.equal(normaliseChart({ ...sample, close: [102, Number.NaN, 122] }), null);
});

test('periodStartIndex selects the first observation inside the requested window', () => {
  assert.equal(periodStartIndex(sample.dates, '6M'), 2);
  assert.equal(periodStartIndex(sample.dates, '1Y'), 1);
  assert.equal(periodStartIndex(sample.dates, 'MAX'), 0);
});

test('resolveAnalysisSymbol keeps bare symbols in the selected market', () => {
  assert.deepEqual(resolveAnalysisSymbol('reliance', 'IN'), { symbol: 'RELIANCE.NS', market: 'IN' });
  assert.deepEqual(resolveAnalysisSymbol('aapl', 'US'), { symbol: 'AAPL', market: 'US' });
  assert.deepEqual(resolveAnalysisSymbol('INFY.NS', 'US'), { symbol: 'INFY.NS', market: 'IN' });
});

test('latestObservation does not substitute an older indicator value', () => {
  assert.equal(latestObservation([41, 52, null]), null);
  assert.equal(latestObservation([41, 52, 63]), 63);
  assert.equal(latestObservation([]), null);
});

test('chart rejects duplicate and reversed sessions', () => {
  assert.equal(normaliseChart({ ...sample, dates: [...sample.dates].reverse() }), null);
  assert.equal(normaliseChart({ ...sample, dates: [sample.dates[0], sample.dates[0], sample.dates[2]] }), null);
});

test('misaligned indicators are withheld without discarding valid prices', () => {
  const result = normaliseChart({ ...sample, sma50: [99, 109], rsi: [45, 'bad', 65] });
  assert.deepEqual(result?.close, sample.close);
  assert.deepEqual(result?.sma50, [null, null, null]);
  assert.deepEqual(result?.rsi, [45, null, 65]);
});

test('month-end chart periods clamp to the last day of the target month', () => {
  assert.equal(periodStartIndex(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-03', '2026-03-31'], '1M'), 1);
  assert.equal(periodStartIndex(['2023-02-28', '2023-03-01', '2024-02-29'], '1Y'), 0);
});
