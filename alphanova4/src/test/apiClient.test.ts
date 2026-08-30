import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../lib/apiClient';
import { failedResource, loadingResource, readyResource } from '../lib/resourceState';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('apiRequest', () => {
  it('sends JSON and the existing bearer token', async () => {
    localStorage.setItem('alphanova_auth_token', 'token-1');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbol: 'ITC' }) })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sentHeaders = new Headers(init.headers);
    expect(path).toBe('/api/watchlist');
    expect(init.method).toBe('POST');
    expect(sentHeaders.get('Authorization')).toBe('Bearer token-1');
    expect(sentHeaders.get('Content-Type')).toBe('application/json');
  });

  it('handles empty responses and exposes typed errors', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'denied' }), { status: 403 })));
    await expect(apiRequest('/api/auth/logout', { method: 'POST' })).resolves.toBeNull();
    await expect(apiRequest('/api/watchlist')).rejects.toMatchObject({ status: 403, message: 'denied' });
  });
});

describe('resource state', () => {
  it('keeps prior valid data stale on a refresh failure', () => {
    const ready = readyResource({ value: 42 });
    expect(failedResource(ready, new Error('offline'))).toEqual({ status: 'stale', data: { value: 42 }, error: null });
    expect(failedResource(loadingResource(), new Error('offline'))).toEqual({ status: 'error', data: null, error: 'offline' });
  });
});
