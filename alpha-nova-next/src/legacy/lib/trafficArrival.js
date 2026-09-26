import { getDeviceId } from './productAnalytics.js';
import { sendAnalyticsRequest } from './analyticsTransport.js';

export const ARRIVAL_KEY = 'alphanova_analytics_arrival_v1';
const SESSION_MS = 30 * 60 * 1000;
const PATHS = new Set([
  '/', '/dashboard', '/signals', '/chart', '/screener', '/momentum', '/sectors',
  '/track-record', '/fiidii', '/option-chain', '/news', '/deals', '/learn', '/arima',
  '/dcf', '/fundamentals', '/flcl', '/druck-minervini', '/position-sizing',
  '/delivery-radar', '/leaderboard', '/login', '/watchlist', '/trading-game',
  '/high-delivery-volume-stocks-today', '/stocks-at-52-week-high-today',
  '/fii-dii-data-today', '/nifty-pcr-today', '/bank-nifty-oi-analysis', '/bulk-block-deals-today',
]);
const label = (value) => /^[A-Za-z0-9_-]{1,64}$/.test(value || '') ? value : '';

export function arrivalFields(location) {
  const path = String(location?.pathname || '/');
  if (path.startsWith('/api/') || path.startsWith('/admin') || path.startsWith('/owner-analytics')) return null;
  const landing = PATHS.has(path) ? path
    : /^\/stocks\/[^/]+\/delivery-percentage$/.test(path) ? '/stocks/:symbol/delivery-percentage' : '/other';
  const params = new URLSearchParams(location?.search || '');
  return { landing, source: label(params.get('utm_source')),
    medium: label(params.get('utm_medium')), campaign: label(params.get('utm_campaign')) };
}

// One tab visit lasts until 30 minutes of inactivity; a changed campaign starts
// another visit. Page changes alone do not inflate the arrival count.
export function createArrivalTracker({ storage, deviceId = getDeviceId,
  uuid = () => globalThis.crypto.randomUUID(), now = () => Date.now(),
  send = (payload) => sendAnalyticsRequest('/api/analytics/arrival', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  }),
} = {}) {
  let memory = null;
  let inFlight = null;
  const save = (value) => {
    memory = value;
    try { storage?.setItem(ARRIVAL_KEY, JSON.stringify(value)); } catch { /* in-memory fallback */ }
  };
  return async function track(location) {
    const fields = arrivalFields(location);
    const device = deviceId();
    if (!fields || !device) return false;
    if (inFlight) {
      await inFlight;
      // Re-evaluate this location after the outstanding visit. A different
      // campaign clicked during a slow save must not disappear.
      return track(location);
    }
    let previous = memory;
    try { previous = JSON.parse(storage?.getItem(ARRIVAL_KEY) || 'null') || previous; } catch { /* ignore */ }
    const time = now();
    const campaign = JSON.stringify([fields.source, fields.medium, fields.campaign]);
    const tagged = !!(fields.source || fields.medium || fields.campaign);
    const sameVisit = previous?.device === device && time >= previous.time
      && time - previous.time < SESSION_MS && (!tagged || campaign === previous.campaign);
    if (sameVisit && previous.accepted) {
      save({ ...previous, time });
      return false;
    }
    const entry = sameVisit ? previous : {
      device, time, campaign, accepted: false,
      payload: { ...fields, device_id: device, event_id: uuid() },
    };
    save(entry);
    inFlight = (async () => {
      try {
        const accepted = await send(entry.payload);
        if (accepted) save({ ...entry, accepted: true });
        return !!accepted;
      } catch { return false; }
    })();
    try { return await inFlight; } finally { inFlight = null; }
  };
}

let storage;
try { storage = globalThis.sessionStorage; } catch { /* browser may restrict storage */ }
const trackArrival = createArrivalTracker({ storage });
// Capture before React Router redirects '/' and drops the original ad query.
const initialLocation = typeof window === 'undefined' ? null
  : { pathname: window.location.pathname, search: window.location.search };
let first = true;
export function trackSiteArrival(location) {
  const target = first && initialLocation ? initialLocation : location;
  first = false;
  return trackArrival(target);
}
