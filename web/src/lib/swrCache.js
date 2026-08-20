import { useState, useEffect, useRef, useCallback } from 'react';

// Stale-while-revalidate data layer: the last good payload for each key is
// kept in memory + localStorage, so pages render instantly from the previous
// snapshot while a fresh fetch runs. Pollers (SignalAlertProvider) and pages
// (MarketSignals, Dashboard) share one store, so a page open right after a
// background poll costs zero network round-trips.
const PREFIX = 'alphanova_swr:';
const memory = new Map(); // key -> { data, at }
const subs = new Map();   // key -> Set<fn>

const read = (key) => {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    memory.set(key, entry);
    return entry;
  } catch {
    return null;
  }
};

export const getCached = (key) => read(key);

export const setCached = (key, data) => {
  const entry = { data, at: Date.now() };
  memory.set(key, entry);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* quota / private mode */ }
  const listeners = subs.get(key);
  if (listeners) listeners.forEach((fn) => { try { fn(entry); } catch { /* listener error is not our problem */ } });
};

export const subscribe = (key, fn) => {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => { subs.get(key)?.delete(fn); };
};

// React hook. Returns cached data immediately (may be null on first ever
// visit), revalidates on mount and every pollMs (0 = no polling). A failed
// revalidate keeps the stale data and surfaces `error` alongside it.
export function useSWR(key, fetcher, pollMs = 0) {
  const [entry, setEntry] = useState(() => getCached(key));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; });

  const revalidate = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetcherRef.current();
      setCached(key, data);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setRefreshing(false);
    }
  }, [key]);

  useEffect(() => {
    setEntry(getCached(key));
    setError(null);
    const unsub = subscribe(key, setEntry);
    revalidate();
    const id = pollMs > 0 ? setInterval(revalidate, pollMs) : null;
    return () => { unsub(); if (id) clearInterval(id); };
  }, [key, pollMs, revalidate]);

  return {
    data: entry ? entry.data : null,
    at: entry ? entry.at : null,
    refreshing,
    error,
    revalidate,
  };
}
