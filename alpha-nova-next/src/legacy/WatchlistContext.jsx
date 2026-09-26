import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiClient } from './lib/apiClient';
import { useAuth } from './AuthContext';

const WatchlistContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useWatchlist = () => useContext(WatchlistContext);

const TOKEN_KEY = 'alphanova_auth_token';
const EMPTY_WATCHLIST_RETRY_DELAYS_MS = [1000, 2000];
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Canonical symbol form matching the backend: UPPERCASE, no ".NS" suffix.
// Symbols reach the star from many places (movers use "RELIANCE.NS", the chart
// header uses "RELIANCE") — normalizing here keeps membership checks correct.
// eslint-disable-next-line react-refresh/only-export-components
export const normalizeSymbol = (raw) => {
  let s = String(raw || '').trim().toUpperCase();
  if (s.endsWith('.NS')) s = s.slice(0, -3);
  return s;
};

export const WatchlistProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [items, setItems] = useState([]); // [{symbol, added_at, sort_order}]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const mutationVersionRef = useRef(0);
  const accountVersionRef = useRef(0);

  const reload = useCallback(async () => {
    const version = ++mutationVersionRef.current;
    setLoadError(null);
    if (!localStorage.getItem(TOKEN_KEY)) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let attempt = 0;
      while (mutationVersionRef.current === version) {
        const res = await apiClient.get('/api/watchlist', { headers: authHeader() });
        if (mutationVersionRef.current !== version) break;
        const nextItems = res.data.symbols || [];
        setItems(nextItems);
        setLoading(false);
        const retryDelay = nextItems.length === 0
          ? EMPTY_WATCHLIST_RETRY_DELAYS_MS[attempt]
          : undefined;
        if (retryDelay === undefined) break;
        await new Promise((resolve) => window.setTimeout(resolve, retryDelay));
        attempt += 1;
      }
    } catch {
      if (mutationVersionRef.current === version) {
        setLoadError('Could not load your watchlist. Please try again.');
      }
    } finally {
      if (mutationVersionRef.current === version) setLoading(false);
    }
  }, []);

  useEffect(() => {
    accountVersionRef.current += 1;
    mutationVersionRef.current += 1;
    setItems([]);
    setError(null);
    setLoadError(null);
    if (currentUser) {
      setLoading(true);
      reload();
    } else {
      setItems([]);
      setLoading(false);
    }
    return () => {
      accountVersionRef.current += 1;
      mutationVersionRef.current += 1;
    };
  }, [currentUser, reload]);

  const symbolSet = useMemo(() => new Set(items.map((i) => i.symbol)), [items]);
  const symbols = useMemo(() => items.map((i) => i.symbol), [items]);

  const has = useCallback((sym) => symbolSet.has(normalizeSymbol(sym)), [symbolSet]);
  const marketOf = useCallback(
    (sym) => items.find((i) => i.symbol === normalizeSymbol(sym))?.market || 'IN',
    [items]
  );

  const add = useCallback(async (rawSym, market = 'IN') => {
    const symbol = normalizeSymbol(rawSym);
    // A trailing .NS always means NSE, whatever the caller passed.
    const mkt = String(rawSym || '').trim().toUpperCase().endsWith('.NS') ? 'IN'
      : (String(market).toUpperCase() === 'US' ? 'US' : 'IN');
    if (!symbol || symbolSet.has(symbol)) return;
    const accountVersion = accountVersionRef.current;
    mutationVersionRef.current += 1;
    setLoading(false);
    setError(null);
    setItems((prev) => [...prev, { symbol, market: mkt, added_at: new Date().toISOString(), sort_order: null }]);
    try {
      await apiClient.post('/api/watchlist', { symbol, market: mkt }, { headers: authHeader() });
    } catch (e) {
      if (accountVersionRef.current !== accountVersion) throw e;
      setItems((prev) => prev.filter((i) => i.symbol !== symbol)); // rollback
      setError(e.response?.data?.detail || 'Could not add to watchlist.');
      throw e;
    }
  }, [symbolSet]);

  const remove = useCallback(async (rawSym) => {
    const symbol = normalizeSymbol(rawSym);
    const index = items.findIndex((item) => item.symbol === symbol);
    if (index < 0) return;
    const removed = items[index];
    const accountVersion = accountVersionRef.current;
    mutationVersionRef.current += 1;
    setLoading(false);
    setItems((prev) => prev.filter((i) => i.symbol !== symbol));
    setError(null);
    try {
      await apiClient.delete(`/api/watchlist/${encodeURIComponent(symbol)}`, { headers: authHeader() });
    } catch (e) {
      if (accountVersionRef.current !== accountVersion) throw e;
      // Restore only this removal; other successful edits must survive.
      setItems((prev) => {
        if (prev.some((item) => item.symbol === symbol)) return prev;
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      });
      setError(e.response?.data?.detail || 'Could not remove from watchlist.');
      throw e;
    }
  }, [items]);

  const value = useMemo(() => ({
    items,
    symbols,
    loading,
    error,
    loadError,
    has,
    marketOf,
    add,
    remove,
    reload,
    clearError: () => setError(null),
  }), [items, symbols, loading, error, loadError, has, marketOf, add, remove, reload]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
};
