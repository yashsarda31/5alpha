import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastStack from './ToastStack';
import { setCached } from '../lib/swrCache';
import './alerts.css';

const SEEN_KEY = 'alphanova_seen_signals';
const PREF_KEY = 'alphanova_browser_notifs';
// "Later" only hides the enable banner for the current session — it returns
// on the next visit until the user actually enables (free platform: every
// account should end up push-subscribed).
const NUDGE_KEY = 'alphanova_notif_nudge_dismissed';
const POLL_MS = 120000;      // foreground: near-live, matches server signals TTL
const POLL_HIDDEN_MS = 600000; // background: 10 min — still drives push, ~5x fewer calls
const FETCH_TIMEOUT_MS = 20000;
const TOAST_TTL_MS = 10000;
const MAX_TOASTS = 4;

const SignalAlertContext = createContext({
  browserEnabled: false, toggleBrowser: () => {},
  ensureSubscribed: async () => 'error', permission: 'default',
});
export const useSignalAlerts = () => useContext(SignalAlertContext);

const notifSupported = () => typeof window !== 'undefined' && 'Notification' in window;
const keyOf = (p) => `${p.symbol}|${p.side}|${p.kind}`;

const authHeader = () => {
  const t = localStorage.getItem('alphanova_auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Mobile Chrome/Safari forbid the page-context `new Notification()` constructor
// (it throws) — notifications MUST go through the service worker registration.
// Falls back to the constructor for desktop browsers without an active SW.
const showNative = async (title, opts) => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg && reg.showNotification) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch { /* fall through to constructor */ }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => { window.focus(); n.close(); };
  } catch { /* page-context notifications unsupported (mobile) */ }
};

const urlB64ToU8 = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

// Compare a subscription's stored applicationServerKey (an ArrayBuffer) against
// the current server key. Returns false when it can't be confirmed equal, so
// callers err toward re-subscribing.
const sameAppKey = (existing, want) => {
  if (!existing) return false;
  const a = new Uint8Array(existing);
  if (a.length !== want.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== want[i]) return false;
  return true;
};

// Subscribe this device, reusing an existing subscription only when it was
// created with the CURRENT server VAPID key. A subscription left over from an
// older key makes pushManager.subscribe() throw
// "A subscription with a different applicationServerKey already exists" — the
// #1 reason "could not register device" appears after VAPID keys are rotated.
// So: drop any mismatched/stale subscription first, and if subscribe() still
// throws (older browsers don't expose options.applicationServerKey), force-clear
// and retry exactly once.
const subscribeWithKey = async (reg, appKey) => {
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameAppKey(sub.options && sub.options.applicationServerKey, appKey)) {
    try { await sub.unsubscribe(); } catch { /* noop */ }
    sub = null;
  }
  if (sub) return sub;
  try {
    return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
  } catch {
    const existing = await reg.pushManager.getSubscription();
    if (existing) { try { await existing.unsubscribe(); } catch { /* noop */ } }
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
  }
};

// Resolve an ACTIVE service-worker registration, waiting up to `ms` for one to
// activate. getRegistration() can hand back a registration whose worker isn't
// active yet; pushManager.subscribe needs an active worker, so we prefer
// serviceWorker.ready (raced with a timeout so it never hangs when no SW exists,
// e.g. dev builds).
const swReady = async (ms = 6000) => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing && existing.active) return existing;
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), ms)),
    ]);
  } catch {
    return null;
  }
};

// Real Web Push: subscribe this device so the SERVER can reach it after the
// app is closed. Returns a status so callers (e.g. the Settings test button)
// can explain exactly what went wrong instead of failing silently:
// 'ok' | 'unsupported' | 'denied' | 'no-sw' | 'no-vapid' | 'error'
const subscribePush = async () => {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
    if (notifSupported() && Notification.permission !== 'granted') return 'denied';
    const reg = await swReady();
    if (!reg) return 'no-sw'; // SW registers in prod builds only
    const res = await fetch('/api/push/vapid');
    if (!res.ok) return 'no-vapid';
    const { key } = await res.json();
    let sub;
    try {
      sub = await subscribeWithKey(reg, urlB64ToU8(key));
    } catch (err) {
      // Carry the browser's actual reason out (e.g. AbortError = the push
      // service itself is unreachable/blocked) so the UI can explain instead
      // of a generic "couldn't register".
      return `error:${(err && (err.name || err.message)) || 'subscribe failed'}`;
    }
    const post = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(sub.toJSON()),
    });
    return post.ok ? 'ok' : `error:server ${post.status}`;
  } catch (err) {
    return `error:${(err && (err.name || err.message)) || 'unknown'}`;
  }
};

const unsubscribePush = async () => {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  } catch { /* noop */ }
};

const loadSeen = () => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY)); } catch { return null; }
};
const saveSeen = (obj) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(obj)); } catch { /* quota / private mode */ }
};

const SignalAlertProvider = ({ children }) => {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const [permission, setPermission] = useState(notifSupported() ? Notification.permission : 'unsupported');
  // Default-ON: alerts are enabled unless the user explicitly turned them off.
  // (Was opt-in via the Settings bell — almost nobody found it, so no device
  // ever subscribed and pushes had no audience.)
  const [browserEnabled, setBrowserEnabled] = useState(
    () => notifSupported() && Notification.permission === 'granted' && localStorage.getItem(PREF_KEY) !== 'off'
  );
  // One-tap enable banner for users who haven't granted permission yet
  // (permission prompts must come from a user gesture, so we can't just ask)
  const [showNudge, setShowNudge] = useState(() => {
    if (!notifSupported() || Notification.permission !== 'default') return false;
    if (localStorage.getItem(PREF_KEY) === 'off') return false;
    try { return !sessionStorage.getItem(NUDGE_KEY); } catch { return true; }
  });

  const browserEnabledRef = useRef(browserEnabled);
  useEffect(() => { browserEnabledRef.current = browserEnabled; }, [browserEnabled]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const openToast = useCallback((t) => {
    dismiss(t.id);
    navigate('/signals');
  }, [dismiss, navigate]);

  const notify = useCallback((plan) => {
    // US-session plans carry currency: '$'; India plans default to ₹
    const cur = plan.currency || '₹';
    // in-app toast
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast = {
      id, side: plan.side, symbol: plan.symbol, score: plan.score,
      entry: plan.entry, stop: plan.stop, target: plan.target, currency: cur,
    };
    setToasts((prev) => [...prev, toast].slice(-MAX_TOASTS));
    setTimeout(() => dismiss(id), TOAST_TTL_MS);

    // native notification only when backgrounded + opted in + permitted
    if (notifSupported() && browserEnabledRef.current &&
        Notification.permission === 'granted' && document.hidden) {
      showNative(`${plan.side} ${plan.symbol} · ${plan.score}/100`, {
        body: `entry ${cur}${plan.entry} · stop ${cur}${plan.stop} · target ${cur}${plan.target}`,
        tag: keyOf(plan),
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: '/signals' },
      });
    }
  }, [dismiss]);

  const detect = useCallback((data) => {
    const plans = (data && data.setups && data.setups.plans) || [];
    const dateKey = ((data && data.as_of) || '').slice(0, 10) || 'unknown';
    const mkt = (data && data.signals_market) || 'IN';
    const current = plans
      .filter((p) => p && p.symbol && p.side)
      .map((p) => ({ p, k: keyOf(p) }));

    const seen = loadSeen();
    // First ever, a new trading day, or the 8pm IN→US session flip → seed
    // silently (no toast blast of an entire fresh plan list)
    if (!seen || seen.date !== dateKey || (seen.mkt || 'IN') !== mkt) {
      saveSeen({ date: dateKey, mkt, keys: current.map((c) => c.k) });
      return;
    }
    const seenSet = new Set(seen.keys);
    const fresh = current.filter((c) => !seenSet.has(c.k));
    if (fresh.length) {
      fresh.forEach((c) => notify(c.p));
      saveSeen({ date: dateKey, mkt, keys: Array.from(new Set([...seen.keys, ...current.map((c) => c.k)])) });
    }
  }, [notify]);

  const inFlightRef = useRef(false);
  const runPoll = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch('/api/signals', { signal: ac.signal });
      if (res.ok) {
        const data = await res.json();
        // share the payload with the Signals page — opening it right after a
        // background poll renders instantly with zero network round-trips
        setCached('signals', data);
        detect(data);
      }
    } catch {
      // network error / abort / cold-start timeout — retry next cycle
    } finally {
      clearTimeout(timer);
      inFlightRef.current = false;
    }
  }, [detect]);

  // Poll cadence follows tab visibility: full-speed while the user is looking
  // (live toasts), slow in the background — a backgrounded/abandoned tab is the
  // main source of wasted serverless invocations. Returning to the tab triggers
  // an immediate catch-up poll so the user never sees stale data.
  useEffect(() => {
    let id;
    const schedule = () => {
      clearInterval(id);
      id = setInterval(runPoll, document.hidden ? POLL_HIDDEN_MS : POLL_MS);
    };
    const onVisibility = () => {
      if (!document.hidden) runPoll();
      schedule();
    };
    runPoll();
    schedule();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [runPoll]);

  // Dev/demo hooks: fire a synthetic signal, or force one real poll cycle
  useEffect(() => {
    window.__fireTestSignal = (o = {}) => notify({
      symbol: 'TESTCO', side: 'LONG', kind: 'long_buildup',
      score: 72, entry: 1000, stop: 975, target: 1050, ...o,
    });
    window.__pollNow = () => runPoll();
    return () => {
      try { delete window.__fireTestSignal; delete window.__pollNow; } catch { /* noop */ }
    };
  }, [notify, runPoll]);

  const toggleBrowser = useCallback(async () => {
    if (!notifSupported()) return;
    if (browserEnabledRef.current) {
      setBrowserEnabled(false);
      try { localStorage.setItem(PREF_KEY, 'off'); } catch { /* noop */ }
      unsubscribePush(); // stop server pushes to this device
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
    }
    setPermission(perm);
    const on = perm === 'granted';
    setBrowserEnabled(on);
    try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off'); } catch { /* noop */ }
    if (on) subscribePush(); // register this device for server pushes
  }, []);

  // Get this device fully push-subscribed, prompting for permission if needed.
  // Powers the Settings "Test notification" button so ONE tap does the whole
  // flow (prompt → subscribe → the caller then sends the test), instead of the
  // button failing with "no devices" when the user never enabled alerts.
  // Returns the subscribePush status ('ok' | 'unsupported' | 'denied' | ...).
  const ensureSubscribed = useCallback(async () => {
    if (!notifSupported() || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return 'unsupported';
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      try { perm = await Notification.requestPermission(); } catch { perm = Notification.permission; }
      setPermission(perm);
    }
    if (perm !== 'granted') return 'denied';
    setBrowserEnabled(true);
    try { localStorage.setItem(PREF_KEY, 'on'); } catch { /* noop */ }
    return subscribePush();
  }, []);

  // Every device with granted permission (and no explicit opt-out) subscribes
  // on load: covers users who granted before default-ON shipped, devices whose
  // subscription was cleared, and fresh logins. pushManager.subscribe returns
  // the existing subscription when one is already active, so this is cheap.
  useEffect(() => {
    if (notifSupported() && Notification.permission === 'granted' &&
        localStorage.getItem(PREF_KEY) !== 'off') {
      try { localStorage.setItem(PREF_KEY, 'on'); } catch { /* noop */ }
      setBrowserEnabled(true);
      subscribePush();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nudge banner actions: Enable runs the same flow as the Settings bell
  // (permission prompt from a click gesture → subscribe); Later snoozes 7 days.
  const snoozeNudge = useCallback(() => {
    setShowNudge(false);
    try { sessionStorage.setItem(NUDGE_KEY, '1'); } catch { /* noop */ }
  }, []);
  const enableFromNudge = useCallback(async () => {
    setShowNudge(false);
    try { sessionStorage.setItem(NUDGE_KEY, '1'); } catch { /* noop */ }
    await toggleBrowser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SignalAlertContext.Provider value={{ browserEnabled, toggleBrowser, ensureSubscribed, permission }}>
      {children}
      {showNudge && (
        <div className="notif-nudge" role="dialog" aria-label="Enable notifications">
          <div className="notif-nudge-text">
            <strong>Get trade alerts</strong>
            <span>Scored setups reach this device even when the app is closed.</span>
          </div>
          <div className="notif-nudge-actions">
            <button className="notif-nudge-later" onClick={snoozeNudge}>Later</button>
            <button className="notif-nudge-enable" onClick={enableFromNudge}>Enable</button>
          </div>
        </div>
      )}
      <ToastStack toasts={toasts} onOpen={openToast} onDismiss={dismiss} />
    </SignalAlertContext.Provider>
  );
};

export default SignalAlertProvider;
