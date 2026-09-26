export const WATCH_LIFECYCLES = new Set(['forming', 'extended', 'invalidated']);
const ACTIONABLE_STATUSES = new Set(['fresh', 'last_session']);

export function isActionableSnapshot(dataStatus, refreshError = null) {
  return Boolean(!refreshError && dataStatus && dataStatus.required_inputs_complete === true && ACTIONABLE_STATUSES.has(dataStatus.status));
}

export function finiteNumber(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function signalLifecycle(plan, lane = 'published') {
  if (lane === 'early') return WATCH_LIFECYCLES.has(plan?.lifecycle) ? plan.lifecycle : null;
  if (plan?.lifecycle === 'open' || plan?.levels_locked) return 'open';
  if (plan?.lifecycle === 'triggered') return 'triggered';
  return 'published';
}

export function earlySignals(setups, market) {
  if (market !== 'IN' || !Array.isArray(setups?.watchlist)) return [];
  return setups.watchlist.filter((plan) => plan?.actionable === false && WATCH_LIFECYCLES.has(plan?.lifecycle));
}

export function filterSignals(items, { direction = 'ALL', lifecycle = 'ALL', query = '', lane = 'published' } = {}) {
  if (!Array.isArray(items)) return [];
  const needle = String(query).trim().toUpperCase();
  return items.filter((item) => item && typeof item.symbol === 'string'
    && (direction === 'ALL' || String(item.side || '').toUpperCase() === direction)
    && (lifecycle === 'ALL' || signalLifecycle(item, lane) === lifecycle)
    && item.symbol.toUpperCase().includes(needle));
}
