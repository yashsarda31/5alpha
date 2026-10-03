import { useCallback, useEffect, useRef, useState } from 'react';
interface Resource<T> { key: string | null; data: T | null; error: string | null; refreshing: boolean }
export function useResource<T>(url: string | null, interval = 0) {
  const [state, setState] = useState<Resource<T>>({ key: url, data: null, error: null, refreshing: !!url });
  const [revision, setRevision] = useState(0);
  const latest = useRef(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let controller: AbortController | null = null;
    let stopped = false;
    const load = async () => {
      // Polling must not restart a slow request before its deadline.
      // Explicit refreshes and URL changes still cancel through effect cleanup.
      if (!url || stopped || controller) return;
      controller = new AbortController();
      const requestId = ++latest.current;
      const active = controller;
      // Render's free instances can need 50+ seconds to wake after inactivity.
      const timer = window.setTimeout(() => active.abort(), 90000);
      // A retry does not validate the retained snapshot. Keep the warning (and
      // signal-level guard) until a successful response replaces that evidence.
      setState(previous => ({ key: url, data: previous.key === url ? previous.data : null, error: previous.key === url ? previous.error : null, refreshing: true }));
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        let token: string | null = null;
        try { token = localStorage.getItem('alphanova_auth_token'); } catch { /* storage disabled */ }
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(url, { signal: active.signal, headers, cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to load your saved research.' : `Could not load this research (${response.status}). Please retry.`);
        const data = await response.json() as T;
        if (!stopped && requestId === latest.current) setState({ key: url, data, error: null, refreshing: false });
      } catch (error) {
        if (!stopped && requestId === latest.current) setState(previous => ({ key: url, data: previous.key === url ? previous.data : null, error: active.signal.aborted ? 'The request took too long. Please retry.' : error instanceof Error ? error.message : 'Research unavailable. Please retry.', refreshing: false }));
      } finally { window.clearTimeout(timer); controller = null; }
    };
    void load();
    const timer = interval > 0 ? window.setInterval(() => { if (!document.hidden) void load(); }, interval) : null;
    return () => { stopped = true; controller?.abort(); if (timer) window.clearInterval(timer); };
  }, [url, interval, revision]);
  const current = state.key === url && url !== null;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !!url && (!current || (!state.data && !state.error)), refreshing: !!url && (!current || state.refreshing), refresh };
}
