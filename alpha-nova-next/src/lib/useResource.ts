import { useCallback, useEffect, useRef, useState } from 'react';
import { readResearch, requestResearch, researchKey } from './researchRequests';
interface Resource<T> { key: string | null; data: T | null; error: string | null; refreshing: boolean }
export function useResource<T>(url: string | null, interval = 0) {
  let token: string | null = null;
  try { token = localStorage.getItem('alphanova_auth_token'); } catch { /* storage disabled */ }
  const key = url ? researchKey(url, token) : null;
  const [state, setState] = useState<Resource<T>>(() => ({ key, data: url ? readResearch(url, token) as T | null : null, error: null, refreshing: !!url }));
  const [revision, setRevision] = useState(0);
  const forceNext = useRef(false);
  const refresh = useCallback(() => { forceNext.current = true; setRevision(value => value + 1); }, []);
  useEffect(() => {
    let release: (() => void) | null = null;
    let stopped = false;
    let reconnectPending = false;
    const load = async (force = false) => {
      // Polling must not restart a slow request before its deadline.
      // Cleanup releases this reader without cancelling other readers' work.
      if (!url || stopped) return;
      if (release) { if (force) reconnectPending = true; return; }
      const forced = force || forceNext.current;
      forceNext.current = false;
      // A retry does not validate the retained snapshot. Keep the warning (and
      // signal-level guard) until a successful response replaces that evidence.
      setState(previous => ({ key, data: previous.key === key ? previous.data : null, error: previous.key === key ? previous.error : null, refreshing: true }));
      const request = requestResearch(url, token, forced);
      release = request.release;
      try {
        const data = await request.promise as T;
        if (!stopped) setState({ key, data, error: navigator.onLine === false ? 'You are offline. This research may be out of date.' : null, refreshing: false });
      } catch (error) {
        if (!stopped) setState(previous => ({ key, data: previous.key === key ? previous.data : null, error: navigator.onLine === false ? 'You are offline. Research will retry when you reconnect.' : error instanceof Error ? error.message : 'Research unavailable. Please retry.', refreshing: false }));
      } finally {
        request.release(); release = null;
        if (reconnectPending && !stopped) { reconnectPending = false; void load(true); }
      }
    };
    void load();
    const reconnect = () => { void load(true); };
    const offline = () => setState(previous => ({ ...previous, error: 'You are offline. Research will retry when you reconnect.' }));
    const visible = () => { if (interval > 0 && !document.hidden) void load(); };
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    const timer = interval > 0 ? window.setInterval(() => { if (!document.hidden && navigator.onLine !== false) void load(); }, interval) : null;
    return () => { stopped = true; release?.(); if (timer) window.clearInterval(timer); window.removeEventListener('online', reconnect); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
  }, [url, key, token, interval, revision]);
  const current = state.key === key && url !== null;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: !!url && (!current || (!state.data && !state.error)), refreshing: !!url && (!current || state.refreshing), refresh };
}
