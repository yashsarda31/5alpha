import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient } from './lib/apiClient';
import { useAuth } from './AuthContext';

const WatchlistContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useWatchlist = () => useContext(WatchlistContext);

const TOKEN_KEY = 'alphanova_auth_token';
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

  const reload = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get('/api/watchlist', { headers: authHeader() });
      setItems(res.data.symbols || []);
    } catch {
      // Non-fatal: keep whatever we had; stars simply won't reflect membership.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      setLoading(true);
      reload();
    } else {
      setItems([]);
      setLoading(false);
    }
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
    setError(null);
    setItems((prev) => [...prev, { symbol, market: mkt, added_at: new Date().toISOString(), sort_order: null }]);
    try {
      await apiClient.post('/api/watchlist', { symbol, market: mkt }, { headers: authHeader() });
    } catch (e) {
      setItems((prev) => prev.filter((i) => i.symbol !== symbol)); // rollback
      setError(e.response?.data?.detail || 'Could not add to watchlist.');
      throw e;
    }
  }, [symbolSet]);

  const remove = useCallback(async (rawSym) => {
    const symbol = normalizeSymbol(rawSym);
    let snapshot;
    setItems((prev) => {
      snapshot = prev;
      return prev.filter((i) => i.symbol !== symbol);
    });
    setError(null);
    try {
      await apiClient.delete(`/api/watchlist/${encodeURIComponent(symbol)}`, { headers: authHeader() });
    } catch (e) {
      if (snapshot) setItems(snapshot); // rollback
      setError(e.response?.data?.detail || 'Could not remove from watchlist.');
      throw e;
    }
  }, []);

  const value = useMemo(() => ({
    items,
    symbols,
    loading,
    error,
    has,
    marketOf,
    add,
    remove,
    reload,
    clearError: () => setError(null),
  }), [items, symbols, loading, error, has, marketOf, add, remove, reload]);

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
};
