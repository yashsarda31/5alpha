import { describe, expect, it } from 'vitest';
import { normalizeChart, normalizeFundamentals } from '../data/chart';
import { normalizeDashboard } from '../data/dashboard';
import { finiteNumber, finitePositive } from '../data/finite';
import { normalizeSignals } from '../data/signals';
import { normalizeWatchlist } from '../data/watchlist';

describe('finite gates', () => {
  it('rejects non-finite and non-positive market values', () => {
    expect(finiteNumber(Number.NaN)).toBeNull();
    expect(finitePositive(0)).toBeNull();
    expect(finitePositive('42.5')).toBe(42.5);
  });
});

describe('dashboard normalization', () => {
  it('keeps only finite indices and movers', () => {
    const result = normalizeDashboard({
      market_open: true,
      indices: [
        { name: 'NIFTY 50', last: 24252, change_pct: 0.4 },
        { name: 'BAD', last: null, change_pct: 1 },
      ],
      movers: [
        { ticker: 'ITC.NS', last: 420, change_pct: -0.3, spark: [418, 420] },
        { ticker: 'BAD', last: 'NaN', change_pct: 1 },
      ],
    });
    expect(result.indices.map((row) => row.name)).toEqual(['NIFTY 50']);
    expect(result.movers.map((row) => row.symbol)).toEqual(['ITC.NS']);
  });
});

describe('signal normalization', () => {
  it('rejects invalid levels instead of projecting them', () => {
    const result = normalizeSignals({
      data_status: { state: 'ready', observed_at: '2026-08-30T09:30:00+05:30' },
      signals_market: 'IN',
      regime: { overall: 'RISK-ON', breadth: { adv: 30, dec: 20 } },
      setups: {
        plans: [
          { symbol: 'BAD', side: 'LONG', score: 72, entry: Number.NaN, stop: 90, target: 120 },
        ],
      },
    });
    expect(result.setups).toEqual([]);
    expect(result.status).toBe('provider_limited');
  });

  it('normalizes valid setup fields and evidence text', () => {
    const result = normalizeSignals({
      data_status: { state: 'ready', observed_at: '2026-08-30T09:30:00+05:30' },
      signals_market: 'US',
      regime: { overall: 'RANGE', breadth: { adv: 4, dec: 3 } },
      setups: {
        plans: [{
          symbol: 'NVDA', side: 'short', score: 81, entry: 180, stop: 186, target: 168,
          invalidation: 'Close above stop', rationale: 'Volume and regime agreement', risk_context: 'Example sizing only',
        }],
      },
    });
    expect(result.setups[0]).toMatchObject({ symbol: 'NVDA', side: 'SHORT', score: 81, entry: 180 });
    expect(result.setups[0].methodology).toContain('Volume');
  });
});

describe('chart normalization', () => {
  it('drops invalid bars and keeps chart arrays aligned', () => {
    const result = normalizeChart({
      ticker: 'NVDA',
      dates: ['2026-08-27', '2026-08-28', '2026-08-29'],
      open: [175, 178, 180], high: [181, Number.NaN, 184], low: [173, 176, 178], close: [180, 179, 183],
      volume: [10, 11, 12], sma20: [170, 171, 172], sma50: [160, 161, 162], rsi: [61, 58, 64],
    });
    expect(result.dates).toEqual(['2026-08-27', '2026-08-29']);
    expect(result.close).toEqual([180, 183]);
    expect(result.sma20).toEqual([170, 172]);
  });

  it('keeps finite OHLCV bars when an optional indicator is absent', () => {
    const result = normalizeChart({ ticker: 'NVDA', dates: ['a', 'b'], open: [10, 11], high: [12, 13], low: [9, 10], close: [11, 12], volume: [1, 2], sma20: [10, 11], rsi: [50, 55] });
    expect(result.close).toEqual([11, 12]);
    expect(result.sma50).toEqual([]);
  });

  it('normalizes optional fundamentals without manufacturing values', () => {
    expect(normalizeFundamentals({ market_cap: '120000', pe_ratio: null })).toEqual({
      marketCap: 120000,
      peRatio: null,
      roe: null,
      debtToEquity: null,
    });
  });
});

describe('watchlist normalization', () => {
  it('keeps unavailable quotes explicit', () => {
    const result = normalizeWatchlist(
      [{ symbol: 'ITC', market: 'IN' }],
      [{ symbol: 'ITC', last: null, change_pct: null }],
    );
    expect(result[0]).toMatchObject({ symbol: 'ITC', quoteState: 'unavailable', last: null });
  });
});
