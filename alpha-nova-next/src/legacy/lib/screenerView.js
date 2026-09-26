export const UNIVERSES = { nifty100: 'Nifty 100', nifty200: 'Nifty 200', sp100: 'S&P 100', nasdaq100: 'Nasdaq 100', custom: 'Custom tickers' };
export const BENCHMARKS = { '^NSEI': 'Nifty 50', '^CNX200': 'Nifty 200', '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100', auto: 'Auto by market' };
export const TREND_OPTIONS = { below_200: 'Price below 200 DMA', above_200: 'Price above 200 DMA', crossed_below_200: 'Crossed below 200 DMA', strong_trend: 'Strong trend' };
export const RS_OPTIONS = { new_high: 'RS making new highs', leading_price: 'RS leading price' };
export const NUMBER_FILTERS = [
  { key: 'min_pe', label: 'Minimum P/E', short: 'P/E ≥', min: 0 },
  { key: 'max_pe', label: 'Maximum P/E', short: 'P/E ≤', min: 0 },
  { key: 'min_roe', label: 'Minimum ROE (%)', short: 'ROE ≥' },
  { key: 'min_eps_growth', label: 'Minimum EPS growth (%)', short: 'EPS growth ≥' },
  { key: 'min_div_yield', label: 'Minimum dividend yield (%)', short: 'Yield ≥', min: 0 },
  { key: 'min_momentum', label: 'Minimum momentum (%)', short: 'Momentum ≥' },
  { key: 'min_alpha_score', label: 'Minimum Alpha Score', short: 'Alpha Score ≥', min: 0, max: 100 },
];
export const EMPTY_RULES = { price_trend: '', rs_screen: '', volume_breakout: false, ...Object.fromEntries(NUMBER_FILTERS.map(f => [f.key, ''])) };
export const DEFAULT_SCREEN = { universe: 'nifty100', tickers: '', benchmark: '^NSEI', rs_lookback: 252, ...EMPTY_RULES };
export const screenDefaultsForMarket = (market, current = DEFAULT_SCREEN) => ({
  ...current,
  universe: market === 'US' ? 'sp100' : 'nifty100',
  benchmark: market === 'US' ? '^GSPC' : '^NSEI',
});
export const PRESETS = [
  { id: 'below200', category: 'Technical', name: 'Below 200 DMA', desc: 'Find stocks below their long-term average.', rules: { price_trend: 'below_200' } },
  { id: 'cross200', category: 'Technical', name: 'Fresh 200-DMA breakdown', desc: 'Crossed below the average in the latest session.', rules: { price_trend: 'crossed_below_200' } },
  { id: 'rsHigh', category: 'Technical', name: 'RS making new highs', desc: 'Relative strength breaking above its prior high.', rules: { rs_screen: 'new_high' } },
  { id: 'rsLeading', category: 'Technical', name: 'RS leading price', desc: 'RS at a new high; price still below its annual high.', rules: { rs_screen: 'leading_price' } },
  { id: 'trend', category: 'Technical', name: 'Strong trend', desc: 'Aligned 50 / 150 / 200 DMAs with a rising long-term trend.', rules: { price_trend: 'strong_trend' } },
  { id: 'breakout', category: 'Technical', name: 'Breakout with volume', desc: 'A 20-session breakout with volume above 1.5× average.', rules: { volume_breakout: true } },
  { id: 'buffett', category: 'Fundamental', name: 'Buffett-inspired quality', desc: 'ROE ≥ 15%, P/E ≤ 25, EPS growth ≥ 5%, Alpha Score ≥ 60.', rules: { max_pe: '25', min_roe: '15', min_eps_growth: '5', min_alpha_score: '60' } },
  { id: 'greenblatt', category: 'Fundamental', name: 'Greenblatt-inspired value', desc: 'A simple proxy: ROE ≥ 20% and P/E ≤ 20.', rules: { max_pe: '20', min_roe: '20' } },
  { id: 'dividend', category: 'Fundamental', name: 'Income & quality', desc: 'Dividend yield ≥ 3% and ROE ≥ 15%.', rules: { min_div_yield: '3', min_roe: '15' } },
  { id: 'weakness', category: 'Combined', name: 'High P/E + weak trend', desc: 'Below 200 DMA with P/E ≥ 40. Investigate the weakness.', rules: { price_trend: 'below_200', min_pe: '40' } },
  { id: 'minervini', category: 'Combined', name: 'Minervini-inspired growth', desc: 'Momentum ≥ 15% with EPS growth ≥ 20%; a simplified proxy.', rules: { min_momentum: '15', min_eps_growth: '20' } },
  { id: 'qualityLeader', category: 'Combined', name: 'Quality RS leaders', desc: 'RS making new highs with ROE ≥ 15%.', rules: { rs_screen: 'new_high', min_roe: '15' } },
];
export const applyPreset = (config, preset) => ({ ...config, ...EMPTY_RULES, ...preset.rules });

export function configToSearchParams(config) {
  const values = {
    benchmark: config.benchmark,
    rs_lookback: String(config.rs_lookback),
    universe: config.universe,
  };
  if (config.universe === 'custom' && config.tickers) values.tickers = config.tickers;
  for (const key of ['price_trend', 'rs_screen']) if (config[key]) values[key] = config[key];
  if (config.volume_breakout) values.volume_breakout = 'true';
  for (const field of NUMBER_FILTERS) if (config[field.key] !== '' && config[field.key] != null) values[field.key] = String(config[field.key]);
  return new URLSearchParams(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
}

export function configFromSearchParams(params, fallback = DEFAULT_SCREEN) {
  const config = { ...fallback };
  const universe = params.get('universe');
  const benchmark = params.get('benchmark');
  const trend = params.get('price_trend');
  const rsScreen = params.get('rs_screen');
  const lookback = Number(params.get('rs_lookback'));
  if (universe && Object.hasOwn(UNIVERSES, universe)) config.universe = universe;
  if (benchmark && Object.hasOwn(BENCHMARKS, benchmark)) config.benchmark = benchmark;
  if (trend && Object.hasOwn(TREND_OPTIONS, trend)) config.price_trend = trend;
  if (rsScreen && Object.hasOwn(RS_OPTIONS, rsScreen)) config.rs_screen = rsScreen;
  if ([63, 126, 252].includes(lookback)) config.rs_lookback = lookback;
  if (config.universe === 'custom' && params.get('tickers')?.length <= 400) config.tickers = params.get('tickers');
  config.volume_breakout = params.get('volume_breakout') === 'true';
  for (const field of NUMBER_FILTERS) {
    const value = params.get(field.key);
    if (value !== null && value !== '' && Number.isFinite(Number(value))) config[field.key] = value;
  }
  try { buildPayload(config); return config; } catch { return { ...fallback }; }
}

export function buildPayload(config) {
  if (!Object.hasOwn(UNIVERSES, config.universe)) throw new Error('Choose a valid universe.');
  if (!Object.hasOwn(BENCHMARKS, config.benchmark)) throw new Error('Choose a valid benchmark.');
  const payload = { benchmark: config.benchmark, rs_lookback: Number(config.rs_lookback) };
  if (![63, 126, 252].includes(payload.rs_lookback)) throw new Error('Choose a valid RS lookback.');
  if (config.universe === 'custom') {
    const tickers = [...new Set(config.tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))];
    if (!tickers.length || tickers.length > 250) throw new Error('Enter between 1 and 250 comma-separated tickers.');
    if (tickers.some(t => !/^[A-Z0-9^][A-Z0-9.^&=-]{0,29}$/.test(t))) throw new Error('Check your ticker symbols. Use TCS.NS for NSE stocks.');
    payload.tickers = tickers.join(',');
  } else payload.universe = config.universe;
  for (const [key, options] of [['price_trend', TREND_OPTIONS], ['rs_screen', RS_OPTIONS]]) {
    if (config[key]) {
      if (!Object.hasOwn(options, config[key])) throw new Error('Choose a valid technical rule.');
      payload[key] = config[key];
    }
  }
  if (config.volume_breakout) payload.volume_breakout = true;
  for (const f of NUMBER_FILTERS) {
    if (config[f.key] !== '' && config[f.key] != null) {
      const n = Number(config[f.key]);
      if (!Number.isFinite(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max)) throw new Error(`Check ${f.label.toLowerCase()}.`);
      payload[f.key] = n;
    }
  }
  if (payload.min_pe != null && payload.max_pe != null && payload.min_pe > payload.max_pe) throw new Error('Minimum P/E must not exceed maximum P/E.');
  return payload;
}
export function filterChips(config) {
  const chips = [];
  if (config.price_trend) chips.push({ key: 'price_trend', label: TREND_OPTIONS[config.price_trend] });
  if (config.rs_screen) chips.push({ key: 'rs_screen', label: `${RS_OPTIONS[config.rs_screen]} · ${Number(config.rs_lookback) / 21}M` });
  if (config.volume_breakout) chips.push({ key: 'volume_breakout', label: '20D breakout · volume > 1.5×' });
  for (const f of NUMBER_FILTERS) if (config[f.key] !== '' && config[f.key] != null) chips.push({ key: f.key, label: `${f.short} ${config[f.key]}` });
  return chips;
}
export function sortRows(rows, key, direction) {
  const missing = v => v == null || (typeof v === 'number' && !Number.isFinite(v));
  return [...rows].sort((a, b) => {
    if (missing(a[key])) return missing(b[key]) ? 0 : 1;
    if (missing(b[key])) return -1;
    const diff = typeof a[key] === 'string' ? a[key].localeCompare(b[key]) : Number(a[key]) - Number(b[key]);
    return direction === 'asc' ? diff : -diff;
  });
}
export function sanitizeSaved(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim() || !item.config) return [];
    const config = Object.fromEntries(Object.keys(DEFAULT_SCREEN).map(key => [key, item.config[key] ?? DEFAULT_SCREEN[key]]));
    try { buildPayload(config); } catch { return []; }
    return [{ id: item.id.slice(0, 80), name: item.name.slice(0, 60), config }];
  });
}
export function csvForRows(rows) {
  const fields = ['ticker', 'price', 'priceDate', 'sma200', 'dist200', 'rsNewHigh', 'benchmark', 'volumeRatio', 'peRatio', 'roe', 'epsGrowth', 'divYield', 'momentum', 'alphaScore', 'reasons'];
  const cell = raw => {
    let s = Array.isArray(raw) ? raw.join('; ') : String(raw ?? '');
    if (typeof raw === 'string' && /^[\s]*[=+@-]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [fields, ...rows.map(row => fields.map(f => row[f]))].map(row => row.map(cell).join(',')).join('\r\n');
}
