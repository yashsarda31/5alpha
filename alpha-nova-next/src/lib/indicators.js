// Pure price math. No DOM, no network. Null = insufficient history.

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length < period || period < 1) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) return out;
    seed += v;
  }
  const k = 2 / (period + 1);
  let prev = seed / period;
  out[period - 1] = round2(prev);
  for (let i = period; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { out[i] = null; continue; }
    prev = v * k + prev * (1 - k);
    out[i] = round2(prev);
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const middle = new Array(values.length).fill(null);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  if (!Array.isArray(values) || period < 1) return { middle, upper, lower };
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    if (!window.every(Number.isFinite)) continue;
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    middle[i] = round2(mean);
    upper[i] = round2(mean + mult * sd);
    lower[i] = round2(mean - mult * sd);
  }
  return { middle, upper, lower };
}

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
