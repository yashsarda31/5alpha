const requiredSeries = ['dates', 'open', 'high', 'low', 'close'];

export function latestObservation(values) {
  const value = Array.isArray(values) ? values.at(-1) : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normaliseChart(value) {
  if (!value || typeof value !== 'object') return null;
  const length = value.close?.length;
  if (!Number.isInteger(length) || length < 2) return null;
  if (!requiredSeries.every((key) => Array.isArray(value[key]) && value[key].length === length)) return null;
  if (!value.dates.every((date) => typeof date === 'string' && Number.isFinite(Date.parse(date)))) return null;
  if (value.dates.some((date, i) => i > 0 && Date.parse(date) <= Date.parse(value.dates[i - 1]))) return null;
  if (!['open', 'high', 'low', 'close'].every((key) => value[key].every(n => Number.isFinite(n) && n > 0))) return null;
  if (value.high.some((high, i) => high < value.low[i] || high < value.open[i] || high < value.close[i])) return null;
  if (value.low.some((low, i) => low > value.open[i] || low > value.close[i])) return null;
  const result = { ...value };
  for (const key of ['rsi', 'sma20', 'sma50', 'sma200']) {
    if (value[key] === undefined) continue;
    result[key] = Array.isArray(value[key]) && value[key].length === length
      ? value[key].map(n => typeof n === 'number' && Number.isFinite(n) ? n : null)
      : Array(length).fill(null);
  }
  return result;
}

const MONTHS = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12, '3Y': 36 };

export function periodStartIndex(dates, period) {
  if (!Array.isArray(dates) || !dates.length || period === 'MAX') return 0;
  const end = new Date(`${dates.at(-1)}T00:00:00Z`);
  if (Number.isNaN(end.getTime())) return 0;
  const cutoff = new Date(end);
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - (MONTHS[period] || 12));
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(end.getUTCDate(), lastDay));
  const index = dates.findIndex((date) => new Date(`${date}T00:00:00Z`) >= cutoff);
  return index < 0 ? 0 : index;
}

export function resolveAnalysisSymbol(raw, selectedMarket) {
  const clean = String(raw || '').trim().toUpperCase();
  const market = /\.(NS|BO)$/i.test(clean) ? 'IN' : selectedMarket === 'US' ? 'US' : 'IN';
  const symbol = market === 'IN' && clean && !clean.includes('.') && !clean.startsWith('^') ? `${clean}.NS` : clean;
  return { symbol, market };
}
