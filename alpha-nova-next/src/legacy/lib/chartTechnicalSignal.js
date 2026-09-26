import { dashboardNumber } from './dashboardDisplay.js';

const neutral = { color: 'var(--text-secondary)', bg: 'var(--bg-panel)', border: 'var(--border-subtle)' };

// The Chart Analyser's existing RSI / SMA20 rule, shared with Watchlist.
// Missing or misaligned observations must not produce a directional label.
export function chartTechnicalSignal(data) {
  const unavailable = { signal: 'N/A', asOf: null, ...neutral };
  const length = data?.close?.length;
  if (!length || !['close', 'rsi', 'sma20', 'dates'].every((key) => Array.isArray(data[key]) && data[key].length === length)) return unavailable;
  const last = dashboardNumber(data.close[length - 1]);
  const rsi = dashboardNumber(data.rsi[length - 1]);
  const sma = dashboardNumber(data.sma20[length - 1]);
  const date = data.dates[length - 1];
  if (last === null || last <= 0 || rsi === null || rsi < 0 || rsi > 100 || sma === null || sma <= 0 || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return unavailable;
  const asOf = date;
  if (rsi > 70 || last < sma * 0.95) return { signal: 'SELL', asOf, color: 'var(--red-loss)', bg: 'rgba(255,59,48,0.1)', border: 'rgba(255,59,48,0.3)' };
  if (rsi < 30 || last > sma * 1.05) return { signal: 'BUY', asOf, color: 'var(--green-gain)', bg: 'rgba(52,199,89,0.1)', border: 'rgba(52,199,89,0.3)' };
  if (last > sma) return { signal: 'BULLISH', asOf, color: 'var(--primary-gold)', bg: 'rgba(212,175,55,0.1)', border: 'rgba(212,175,55,0.3)' };
  return { signal: 'HOLD', asOf, ...neutral };
}

export const watchlistChartSymbol = (item) => `${item.symbol}${item.market === 'US' || /\.(NS|BO)$/i.test(item.symbol) ? '' : '.NS'}`;

// Two independent workers; an unavailable symbol cannot block the rest.
export async function loadWatchlistChartSignals(items, fetchChart, onResult, signal) {
  let next = 0;
  const worker = async () => {
    while (!signal.aborted && next < items.length) {
      const item = items[next++];
      const ticker = watchlistChartSymbol(item);
      let result;
      try {
        const data = await fetchChart(ticker, signal);
        result = data?.ticker?.toUpperCase() === ticker.toUpperCase() ? chartTechnicalSignal(data) : chartTechnicalSignal(null);
      } catch {
        result = chartTechnicalSignal(null);
      }
      if (!signal.aborted) onResult(ticker, result);
    }
  };
  await Promise.all([worker(), worker()]);
}
