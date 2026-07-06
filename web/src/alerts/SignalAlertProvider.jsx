import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ToastStack from './ToastStack';
import './alerts.css';

const SEEN_KEY = 'alphanova_seen_signals';
const PREF_KEY = 'alphanova_browser_notifs';
const POLL_MS = 120000;      // matches server signals cache TTL
const FETCH_TIMEOUT_MS = 20000;
const TOAST_TTL_MS = 10000;
const MAX_TOASTS = 4;

const SignalAlertContext = createContext({ browserEnabled: false, toggleBrowser: () => {}, permission: 'default' });
export const useSignalAlerts = () => useContext(SignalAlertContext);

const notifSupported = () => typeof window !== 'undefined' && 'Notification' in window;
const keyOf = (p) => `${p.symbol}|${p.side}|${p.kind}`;

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
  const [browserEnabled, setBrowserEnabled] = useState(
    () => notifSupported() && Notification.permission === 'granted' && localStorage.getItem(PREF_KEY) === 'on'
  );

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
      try {
        const n = new Notification(`⚡ ${plan.side} ${plan.symbol} · ${plan.score}/100`, {
          body: `entry ${cur}${plan.entry} · stop ${cur}${plan.stop} · target ${cur}${plan.target}`,
          tag: keyOf(plan),
        });
        n.onclick = () => { window.focus(); navigate('/signals'); n.close(); };
      } catch { /* notification construction can throw on some platforms */ }
    }
  }, [dismiss, navigate]);

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
      if (res.ok) detect(await res.json());
    } catch {
      // network error / abort / cold-start timeout — retry next cycle
    } finally {
      clearTimeout(timer);
      inFlightRef.current = false;
    }
  }, [detect]);

  // Poll the signals engine on mount + every 2 min, regardless of tab visibility
  useEffect(() => {
    runPoll();
    const id = setInterval(runPoll, POLL_MS);
    return () => clearInterval(id);
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
  }, []);

  return (
    <SignalAlertContext.Provider value={{ browserEnabled, toggleBrowser, permission }}>
      {children}
      <ToastStack toasts={toasts} onOpen={openToast} onDismiss={dismiss} />
    </SignalAlertContext.Provider>
  );
};

export default SignalAlertProvider;
