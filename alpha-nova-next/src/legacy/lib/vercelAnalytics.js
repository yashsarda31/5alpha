const PRODUCTION_HOSTS = new Set(['abovealphasolutions.com', 'www.abovealphasolutions.com', 'alphanova48.in', 'www.alphanova48.in']);

// Only public, fixed routes are eligible. New and dynamic routes must be reviewed
// before opting in, so URLs containing account IDs or credentials fail closed.
const PUBLIC_PATHS = new Set([
  '/', '/dashboard', '/leaderboard', '/dcf', '/fundamentals', '/momentum',
  '/stocks-at-52-week-high-today', '/chart', '/flcl', '/druck-minervini',
  '/screener', '/delivery-radar', '/high-delivery-volume-stocks-today',
  '/fiidii', '/fii-dii-data-today', '/arima', '/position-sizing', '/news',
  '/option-chain', '/nifty-pcr-today', '/bank-nifty-oi-analysis', '/signals',
  '/track-record', '/sectors', '/deals', '/bulk-block-deals-today', '/learn',
]);
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign'];
const CAMPAIGN_LABEL = /^[a-zA-Z0-9_-]{1,64}$/;

export function shouldEnableVercelAnalytics({ production = false, hostname = '' } = {}) {
  return production === true && PRODUCTION_HOSTS.has(hostname);
}

export function beforeSendVercelAnalytics(event) {
  // There are no Vercel custom events in this integration. Account/product
  // events remain in the separate first-party tracker.
  if (event?.type !== 'pageview' || typeof event.url !== 'string') return null;
  try {
    const url = new URL(event.url);
    if (url.protocol !== 'https:' || !PRODUCTION_HOSTS.has(url.hostname) || url.port || url.username || url.password) return null;
    if (!PUBLIC_PATHS.has(url.pathname)) return null;
    const clean = new URL(url.pathname, url.origin);
    for (const key of CAMPAIGN_KEYS) {
      const values = url.searchParams.getAll(key);
      if (values.length === 1 && CAMPAIGN_LABEL.test(values[0])) clean.searchParams.set(key, values[0]);
    }
    // Do not forward full searches, hashes, click IDs, symbols or event extras.
    return { type: 'pageview', url: clean.href };
  } catch {
    return null;
  }
}

export function createVercelBeforeSend(initialUrl) {
  const landing = beforeSendVercelAnalytics({ type: 'pageview', url: initialUrl });
  let firstPageview = true;
  return (event) => {
    const clean = beforeSendVercelAnalytics(event);
    if (event?.type !== 'pageview') return clean;
    const isFirst = firstPageview;
    firstPageview = false;
    // The SDK downloads asynchronously. React Router may already have replaced
    // '/' with '/dashboard', discarding campaign tags before the SDK starts.
    // Preserve only that known redirect, and emit no extra page view.
    if (isFirst && clean && landing && new URL(landing.url).pathname === '/' && new URL(clean.url).pathname === '/dashboard') return landing;
    return clean;
  };
}
