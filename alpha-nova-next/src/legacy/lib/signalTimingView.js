const WATCH_LIFECYCLES = new Set(['forming', 'extended', 'invalidated']);

export const safeArray = (value) => (Array.isArray(value) ? value : []);

export function setupStateLabel(plan = {}) {
  if (plan.lifecycle === 'open' || plan.levels_locked) return 'Open position';
  if (plan.lifecycle === 'triggered') return 'Triggered';
  if (WATCH_LIFECYCLES.has(plan.lifecycle)) return plan.lifecycle.charAt(0).toUpperCase() + plan.lifecycle.slice(1);
  return 'Qualifying';
}

export function isWatchPlan(plan) {
  return Boolean(plan && plan.actionable === false && WATCH_LIFECYCLES.has(plan.lifecycle));
}

export function indiaWatchlist(setups, market) {
  if (market !== 'IN') return [];
  return safeArray(setups?.watchlist).filter(isWatchPlan);
}

export function watchCounts(plans) {
  return safeArray(plans).reduce((counts, plan) => {
    if (WATCH_LIFECYCLES.has(plan?.lifecycle)) counts[plan.lifecycle] += 1;
    return counts;
  }, { forming: 0, extended: 0, invalidated: 0 });
}

export function timestampValue(value) {
  if (!value) return { dateTime: undefined, text: 'Unavailable' };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { dateTime: undefined, text: 'Unavailable' };
  return { dateTime: value, text: parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) };
}

export function durationValue(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return 'Unavailable';
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return 'Unavailable';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  return `${Math.round(value / 3600)}h`;
}

export function chaseValue(chaseR) {
  if (chaseR === null || chaseR === undefined || chaseR === '') return 'Unavailable';
  const value = Number(chaseR);
  return Number.isFinite(value) && value >= 0 ? `${value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}R` : 'Unavailable';
}

export const timingReasonLabel = (reason) => reason
  ? String(reason).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
  : 'Reason unavailable';
