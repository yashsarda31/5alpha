import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY = 'alphanova_market_mode';
const DEFAULT_MARKET = 'IN';
const ALLOWED = new Set(['IN', 'US']);

const readStored = () => {
  if (typeof window === 'undefined') return DEFAULT_MARKET;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return ALLOWED.has(stored) ? stored : DEFAULT_MARKET;
  } catch {
    return DEFAULT_MARKET;
  }
};

const writeStored = (value) => {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* private mode */ }
};

const MarketContext = createContext({ market: DEFAULT_MARKET, setMarket: () => {}, toggle: () => {} });

// eslint-disable-next-line react-refresh/only-export-components
export const useMarket = () => useContext(MarketContext);

// Effective market for a data fetch: an explicit URL override (?market=US peeks
// at the other session) wins, otherwise the user's toggle choice applies.
// eslint-disable-next-line react-refresh/only-export-components
export const useMarketParam = (override) => {
  const { market } = useMarket();
  const clean = (override || '').trim().toUpperCase();
  return ALLOWED.has(clean) ? clean : market;
};

// Query-string suffix ('' | '?market=IN' | '?market=US') for API calls.
// eslint-disable-next-line react-refresh/only-export-components
export const marketQS = (market) => (ALLOWED.has(market) ? `?market=${market}` : '');

export const MarketProvider = ({ children }) => {
  const [storedMarket, setMarketState] = useState(readStored);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMarket = (searchParams.get('market') || '').trim().toUpperCase();
  const explicitMarket = ALLOWED.has(requestedMarket) ? requestedMarket : null;
  const market = explicitMarket || storedMarket;

  // Resolve shared links before children fetch, and retain that market when
  // moving to another research page without a query-string override.
  useEffect(() => {
    if (explicitMarket) {
      setMarketState(explicitMarket);
      writeStored(explicitMarket);
    }
  }, [explicitMarket]);

  // Cross-tab sync: a toggle in one tab updates the others without a refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      const next = ALLOWED.has(event.newValue) ? event.newValue : DEFAULT_MARKET;
      setMarketState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMarket = useCallback((next) => {
    const normalised = ALLOWED.has(next) ? next : DEFAULT_MARKET;
    setMarketState(normalised);
    writeStored(normalised);
    if (searchParams.has('market')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('market', normalised);
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const toggle = useCallback(() => {
    setMarket(market === 'US' ? 'IN' : 'US');
  }, [market, setMarket]);

  const value = useMemo(() => ({ market, setMarket, toggle }), [market, setMarket, toggle]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
};

export default MarketContext;
