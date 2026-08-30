import { apiRequest } from '../lib/apiClient';
export type PushStatus = 'ok' | 'unsupported' | 'denied' | 'no-sw' | 'no-vapid' | `error:${string}`;
const decodeKey = (value: string) => { const padded = value + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)); };

export async function ensureSubscribed(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!('Notification' in window) || Notification.permission !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return 'no-sw';
  const vapid = await apiRequest<{ key?: string }>('/api/push/vapid').catch(() => null);
  if (!vapid?.key) return 'no-vapid';
  try {
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const current = subscription.options.applicationServerKey;
      const expected = decodeKey(vapid.key);
      const sameKey = current && current.byteLength === expected.byteLength && new Uint8Array(current).every((byte, index) => byte === expected[index]);
      if (!sameKey) { await subscription.unsubscribe(); subscription = null; }
    }
    subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(vapid.key) });
    await apiRequest('/api/push/subscribe', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
    localStorage.setItem('alphanova_browser_notifs', 'enabled');
    return 'ok';
  } catch (error) { return `error:${error instanceof Error ? error.name || error.message : 'unknown'}`; }
}

export async function disableSubscription(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await apiRequest('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => null);
    await subscription.unsubscribe();
  }
  localStorage.removeItem('alphanova_browser_notifs');
}
