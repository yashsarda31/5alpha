export const PUBLIC_ORIGIN = 'https://abovealphasolutions.com';

const ROUTE_KEYS = {
  '/dashboard': ['market'],
  '/signals': ['market'],
  '/chart': ['market', 'symbol'],
  '/delivery-radar': ['symbol'],
  '/high-delivery-volume-stocks-today': [],
  '/option-chain': ['expiryDate', 'symbol'],
  '/screener': [
    'benchmark', 'max_pe', 'min_alpha_score', 'min_div_yield', 'min_eps_growth',
    'min_momentum', 'min_pe', 'min_roe', 'price_trend', 'rs_lookback',
    'rs_screen', 'tickers', 'universe', 'volume_breakout',
  ],
  '/arima': ['symbol'],
  '/dcf': ['symbol'],
  '/fundamentals': ['symbol'],
  '/flcl': ['symbol'],
};

function allowedKeys(pathname) {
  if (/^\/stocks\/[^/]+\/delivery-percentage$/.test(pathname)) return [];
  return ROUTE_KEYS[pathname] || ['market', 'symbol'];
}

export function shareParamsForRoute(pathname, values = {}) {
  const result = {};
  for (const key of [...allowedKeys(pathname)].sort()) {
    const value = values instanceof URLSearchParams ? values.get(key) : values[key];
    if (value === undefined || value === null || value === '') continue;
    const text = String(value);
    if (text.length > (key === 'tickers' ? 400 : 80)) continue;
    result[key] = text;
  }
  return result;
}

export function canonicalShareUrl(source, overrides = {}) {
  let parsed;
  if (typeof source === 'string') parsed = new URL(source, PUBLIC_ORIGIN);
  else {
    const pathname = source?.pathname || '/dashboard';
    parsed = new URL(`${pathname}${source?.search || ''}`, PUBLIC_ORIGIN);
  }
  const pathname = parsed.pathname.replace(/\/{2,}/g, '/');
  const merged = Object.fromEntries(parsed.searchParams.entries());
  Object.assign(merged, overrides);
  const params = new URLSearchParams(shareParamsForRoute(pathname, merged));
  const query = params.toString();
  return `${PUBLIC_ORIGIN}${pathname}${query ? `?${query}` : ''}`;
}

export async function createPublicShare(location, title = 'Alpha Nova research', request = fetch) {
  const parsed = new URL(`${location?.pathname || '/dashboard'}${location?.search || ''}`, PUBLIC_ORIGIN);
  const params = new URLSearchParams(shareParamsForRoute(parsed.pathname, parsed.searchParams));
  const response = await request('/api/public-shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: parsed.pathname,
      query: params.toString(),
      title: String(title || 'Alpha Nova research').trim().slice(0, 100),
    }),
  });
  if (!response.ok) throw new Error('Could not create a public link');
  const payload = await response.json();
  if (typeof payload.url !== 'string' || !payload.url.startsWith(`${PUBLIC_ORIGIN}/s/`)) throw new Error('Invalid public link response');
  return payload.url;
}
