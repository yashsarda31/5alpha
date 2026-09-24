import test from 'node:test';
import assert from 'node:assert/strict';
import { chartTechnicalSignal, loadWatchlistChartSignals, watchlistChartSymbol } from './chartTechnicalSignal.js';
const chart = (close = 100, rsi = 50, sma = 100) => ({ ticker: 'AAPL', close: [close], rsi: [rsi], sma20: [sma], dates: ['2026-09-11'] });

test('Chart and Watchlist share the existing RSI/SMA thresholds and SELL precedence', () => {
  for (const [close, rsi, expected] of [[100, 71, 'SELL'], [94, 50, 'SELL'], [100, 29, 'BUY'], [106, 50, 'BUY'], [103, 50, 'BULLISH'], [100, 50, 'HOLD'], [95, 30, 'HOLD'], [105, 70, 'BULLISH'], [106, 71, 'SELL']]) {
    const result = chartTechnicalSignal(chart(close, rsi));
    assert.equal(result.signal, expected);
    assert.equal(result.asOf, '2026-09-11');
  }
});

test('incomplete or malformed chart observations never become BUY, SELL or HOLD', () => {
  for (const data of [null, {}, chart(null), chart(0), chart(100, null), chart(100, 101), chart(100, 50, 0), { ...chart(), dates: [] }, { ...chart(), rsi: [40, 50] }, { ...chart(), dates: [null] }]) {
    assert.equal(chartTechnicalSignal(data).signal, 'N/A');
  }
  assert.equal(watchlistChartSymbol({ symbol: 'TCS', market: 'IN' }), 'TCS.NS');
  assert.equal(watchlistChartSymbol({ symbol: 'TCS.NS', market: 'IN' }), 'TCS.NS');
});

test('chart requests are bounded and isolate failures and symbol mismatches', async () => {
  let active = 0, peak = 0;
  const results = {};
  await loadWatchlistChartSignals(['AAPL', 'MSFT', 'NVDA', 'META'].map((symbol) => ({ symbol, market: 'US' })), async (ticker) => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    if (ticker === 'MSFT') throw new Error('unavailable');
    return { ...chart(), ticker: ticker === 'META' ? 'WRONG' : ticker };
  }, (ticker, result) => { results[ticker] = result.signal; }, new AbortController().signal);
  assert.equal(peak, 2);
  assert.deepEqual(results, { AAPL: 'HOLD', MSFT: 'N/A', NVDA: 'HOLD', META: 'N/A' });
});

test('aborted chart batches cannot publish late signals', async () => {
  const controller = new AbortController();
  let published = 0;
  await loadWatchlistChartSignals([{ symbol: 'AAPL', market: 'US' }], async () => {
    controller.abort(); return chart();
  }, () => { published++; }, controller.signal);
  assert.equal(published, 0);
});
