export const ANALYTICS_DEVICE_KEY = 'alphanova_analytics_device_id';
export const FIRST_RUN_KEY = 'alphanova_first_run_v1';
const LAST_VISIT_KEY = 'alphanova_analytics_last_visit_day';

const EVENTS = new Set([
  'today_viewed',
  'analyse_loaded',
  'position_sizing_completed',
  'watchlist_intent_started',
  'watchlist_saved',
  'alerts_enabled',
  'return_visit',
]);
const ROUTES = new Set(['/', '/dashboard', '/chart', '/position-sizing', '/watchlist', '/signals']);
const MARKETS = new Set(['IN', 'US', '']);

const routeOnly = (value) => String(value || '/').split(/[?#]/, 1)[0] || '/';

export function buildEventPayload(event, fields = {}, deviceId, now = new Date()) {
  const route = routeOnly(fields.route);
  const market = String(fields.market || '').toUpperCase();
  if (!EVENTS.has(event) || !ROUTES.has(route) || !MARKETS.has(market) || !deviceId) return null;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;
  return {
    event,
    device_id: deviceId,
    occurred_at: now.toISOString(),
    route,
    market,
  };
}

const getDeviceId = (create = true) => {
  try {
    const existing = localStorage.getItem(ANALYTICS_DEVICE_KEY);
    if (existing) return existing;
    if (!create) return null;
    if (!globalThis.crypto?.randomUUID) return null;
    const created = globalThis.crypto.randomUUID();
    localStorage.setItem(ANALYTICS_DEVICE_KEY, created);
    return created;
  } catch {
    return null;
  }
};

const send = async (url, options) => {
  if (typeof fetch !== 'function' || typeof AbortController !== 'function') return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, keepalive: true });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

export async function trackProductEvent(name, fields = {}) {
  const deviceId = getDeviceId();
  const payload = buildEventPayload(name, fields, deviceId);
  if (!payload) return false;
  return send('/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function markFirstRunStep(step) {
  try {
    const current = JSON.parse(localStorage.getItem(FIRST_RUN_KEY) || '{}');
    const next = { ...current, [step]: true };
    localStorage.setItem(FIRST_RUN_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('alphanova:first-run', { detail: next }));
    return next;
  } catch {
    return { [step]: true };
  }
}

export function trackReturnVisit(fields = {}) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const previous = localStorage.getItem(LAST_VISIT_KEY);
    localStorage.setItem(LAST_VISIT_KEY, today);
    if (previous && previous !== today) return trackProductEvent('return_visit', fields);
  } catch {
    // Analytics must never block the product when storage is unavailable.
  }
  return Promise.resolve(false);
}

export async function resetProductAnalytics() {
  const deviceId = getDeviceId(false);
  if (!deviceId) {
    try {
      localStorage.removeItem(FIRST_RUN_KEY);
      localStorage.removeItem(LAST_VISIT_KEY);
      return true;
    } catch {
      return false;
    }
  }
  const ok = await send('/api/analytics/device', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  if (!ok) return false;
  try {
    localStorage.removeItem(ANALYTICS_DEVICE_KEY);
    localStorage.removeItem(FIRST_RUN_KEY);
    localStorage.removeItem(LAST_VISIT_KEY);
  } catch {
    return false;
  }
  return true;
}
