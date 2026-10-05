// Memory only, bounded, restricted to public research; no account routes or errors.
// Provider timestamps remain the source of freshness truth.
const TTL = 15_000;
const LIMIT = 40;
type Snapshot = { data: unknown; expires: number };
type Pending = { promise: Promise<unknown>; controller: AbortController; users: number; abortTimer?: ReturnType<typeof setTimeout> };
const snapshots = new Map<string, Snapshot>();
const pending = new Map<string, Pending>();
export const researchKey = (url: string, token: string | null) => JSON.stringify([url, token]);
const cacheable = (url: string) => /^\/api\/(?:dashboard|signals)(?:\?|$)|^\/api\/(?:chart|fundamentals)\/[^/?]+(?:\?|$)/.test(url);

export function readResearch(url: string, token: string | null): unknown | null {
  const key = researchKey(url, token);
  const hit = snapshots.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) { snapshots.delete(key); return null; }
  return hit.data;
}

export function requestResearch(url: string, token: string | null, force = false) {
  const key = researchKey(url, token);
  const hit = !force && readResearch(url, token);
  if (hit) return { promise: Promise.resolve(hit), release() {} };
  let entry = pending.get(key);
  if (!entry) {
    if (force) snapshots.delete(key);
    const controller = new AbortController();
    entry = { controller, users: 0, promise: Promise.resolve(null) };
    const current = entry;
    const timer = setTimeout(() => controller.abort(), 90_000);
    entry.promise = (async () => {
      try {
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch(url, { signal: controller.signal, headers, cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 401 ? 'Sign in again to load your saved research.' : `Could not load this research (${response.status}). Please retry.`);
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The research service returned an unexpected response. Please retry.');
        const data: unknown = await response.json();
        if (cacheable(url) && data !== null && !controller.signal.aborted && pending.get(key) === current) {
          if (snapshots.size >= LIMIT) snapshots.delete(snapshots.keys().next().value!);
          snapshots.set(key, { data, expires: Date.now() + TTL });
        }
        return data;
      } catch (error) {
        if (pending.get(key) === current) snapshots.delete(key);
        if (controller.signal.aborted) throw new Error('The request took too long. Please retry.');
        throw error;
      } finally {
        clearTimeout(timer);
        clearTimeout(current.abortTimer);
        if (pending.get(key) === current) pending.delete(key);
      }
    })();
    pending.set(key, entry);
  }
  const current = entry;
  clearTimeout(current.abortTimer);
  current.users++;
  let released = false;
  return {
    promise: current.promise,
    release() {
      if (released) return;
      released = true;
      current.users--;
      // Immediate route transitions and React remounts may reuse the work.
      // A remaining subscriber must never lose its request.
      if (!current.users && pending.get(key) === current) current.abortTimer = setTimeout(() => {
        if (!current.users) {
          if (pending.get(key) === current) pending.delete(key);
          current.controller.abort();
        }
      }, 0);
    },
  };
}
