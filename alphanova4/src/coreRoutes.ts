export const CORE_ROUTES = [
  { path: '/dashboard', label: 'Today' },
  { path: '/signals', label: 'Signals' },
  { path: '/chart', label: 'Analyse' },
  { path: '/watchlist', label: 'Watchlist' },
] as const;

export type CoreRoutePath = typeof CORE_ROUTES[number]['path'];
