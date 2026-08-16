export const fullLocationPath = (location = {}) => (
  `${location.pathname || '/dashboard'}${location.search || ''}${location.hash || ''}`
);

export const watchlistIntent = (rawSymbol, rawMarket = 'IN') => {
  let symbol = String(rawSymbol || '').trim().toUpperCase();
  if (!symbol) return null;
  const nseSuffix = symbol.endsWith('.NS');
  if (nseSuffix) symbol = symbol.slice(0, -3);
  return {
    kind: 'watchlist-add',
    symbol,
    market: nseSuffix || String(rawMarket).toUpperCase() !== 'US' ? 'IN' : 'US',
  };
};

export const notificationIntent = () => ({ kind: 'enable-notifications' });

export const authState = (from, intent) => ({
  from: {
    pathname: from?.pathname || '/dashboard',
    search: from?.search || '',
    hash: from?.hash || '',
  },
  intent: intent || null,
});

export const continuationFromAuth = (state) => ({
  to: fullLocationPath(state?.from),
  state: state?.intent ? { authIntent: state.intent } : null,
});
