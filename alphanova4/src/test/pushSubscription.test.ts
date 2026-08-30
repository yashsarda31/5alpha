import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureSubscribed } from '../alerts/pushSubscription';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

describe('push subscription', () => {
  it('posts the subscription with the authenticated request contract', async () => {
    localStorage.setItem('alphanova_auth_token', 'test-token');
    const subscribe = vi.fn(() => Promise.resolve({ toJSON: () => ({ endpoint: 'https://push.test/1' }) }));
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(null), subscribe } }) } });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'granted' });
    const fetchMock = vi.fn((path: string, init?: RequestInit) => { void init; return Promise.resolve(response(path === '/api/push/vapid' ? { key: 'AQIDBA' } : { ok: true })); });
    vi.stubGlobal('fetch', fetchMock);
    expect(await ensureSubscribed()).toBe('ok');
    const [, init] = fetchMock.mock.calls.find(([path]) => path === '/api/push/subscribe')!;
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token');
  });
});

const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
