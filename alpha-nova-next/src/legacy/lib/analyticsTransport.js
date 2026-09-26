// Retry the exact body: the server's event receipt prevents duplicate arrivals.
export async function sendAnalyticsRequest(url, options, {
  fetchImpl = globalThis.fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 10000,
} = {}) {
  if (typeof fetchImpl !== 'function' || typeof AbortController !== 'function') return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal, keepalive: true });
      if (response.ok) return true;
      if (response.status < 500 && response.status !== 429) return false;
    } catch {
      // A timeout may follow a successful save. Retry with the same event ID.
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 2) await wait(250 * (attempt + 1));
  }
  return false;
}
