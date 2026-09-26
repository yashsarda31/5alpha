import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../lib/apiClient';
import { Link, useLocation } from 'react-router-dom';
import { X, Bell, BellOff, Trophy, EyeOff, Send } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSignalAlerts } from '../alerts/SignalAlertContext';
import { usePrediction } from '../PredictionContext';
import { authState, notificationIntent } from '../lib/authIntent';
import InstallApp from './InstallApp';
import { trapFocus } from '../lib/focusTrap';
import { resetProductAnalytics } from '../lib/productAnalytics.js';

const AlertBell = () => {
  const { browserEnabled, toggleBrowser, permission, subscribing } = useSignalAlerts();
  if (permission === 'unsupported') return null;
  const state = permission === 'denied' ? 'BLOCKED' : browserEnabled ? 'ON' : 'OFF';
  const title = permission === 'denied'
    ? 'Browser notifications are blocked in your browser settings'
    : 'Toggle background browser notifications for new signals and watchlist Chart BUY labels';
  return (
    <button
      className={`alert-bell ${browserEnabled ? 'on' : ''}`}
      onClick={toggleBrowser}
      title={title}
      disabled={permission === 'denied' || subscribing}
    >
      <span className="ab-ico">{browserEnabled ? <Bell size={14} aria-hidden="true" /> : <BellOff size={14} aria-hidden="true" />}</span>
      {subscribing ? 'Enabling alerts…' : 'Signals & watchlist BUY alerts'}
      <span className="ab-state">{state}</span>
    </button>
  );
};

// One-tap "make push work + prove it" button. If this device isn't subscribed
// yet (the common case — the user never enabled alerts), it first requests
// permission and registers the device, THEN sends the test. Previously it just
// queried the server and dead-ended on "no devices subscribed".
const PushTest = () => {
  const { permission, ensureSubscribed } = useSignalAlerts();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  if (permission === 'unsupported') return null;

  const send = async () => {
    setBusy(true);
    setStatus('Enabling notifications on this device…');

    // 1. Make sure this device is permitted + subscribed before sending.
    const sub = await ensureSubscribed();
    if (sub === 'denied') {
      setStatus('Notifications are blocked for this site. Allow them in your browser settings (the lock icon in the address bar), then try again.');
      setBusy(false);
      return;
    }
    if (sub === 'unsupported') {
      setStatus('This browser can’t receive push. On iPhone, install the app to your Home Screen first (Share → Add to Home Screen), then open it and retry.');
      setBusy(false);
      return;
    }
    if (sub === 'no-sw') {
      setStatus('Still setting up — reload the page once, then tap again.');
      setBusy(false);
      return;
    }
    if (sub !== 'ok') {
      const reason = typeof sub === 'string' && sub.startsWith('error:') ? sub.slice(6) : '';
      // AbortError from pushManager.subscribe = the browser can't reach its
      // push service — classic in Brave (Google push messaging off) or with
      // blocked Google services; not something a retry fixes.
      setStatus(/abort|push service/i.test(reason)
        ? 'Your browser blocked its push service. In Brave: Settings → Privacy → enable "Use Google services for push messaging", then retry.'
        : `Couldn’t register this device for push${reason ? ` (${reason})` : ''}. Please retry in a moment.`);
      setBusy(false);
      return;
    }

    // 2. Now the server has our subscription — send the test.
    setStatus('Sending…');
    try {
      const token = localStorage.getItem('alphanova_auth_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      let d = (await apiClient.post('/api/push/test', null, { headers })).data;
      if (d.subs === 0) {
        // The subscribe write may land a beat before another instance can see
        // it — give the store a moment and retry once before bothering the user.
        await new Promise((r) => setTimeout(r, 1500));
        d = (await apiClient.post('/api/push/test', null, { headers })).data;
      }
      setStatus(d.subs === 0
        ? 'Device registered but the server can’t see it yet — wait a few seconds and tap again.'
        : `Sent to ${d.sent} of ${d.subs} device(s). Check your notification tray.`);
    } catch (err) {
      setStatus(`Failed: ${err.response?.data?.detail || err.message}`);
    }
    setBusy(false);
  };

  return (
    <>
      <button className="alert-bell" onClick={send} disabled={busy} title="Enable and send a test push notification to this device">
        <span className="ab-ico"><Send size={14} aria-hidden="true" /></span>
        Test notification
      </button>
      {status && <p className="settings-hint" style={{ marginTop: 4 }}>{status}</p>}
    </>
  );
};

const LeaderboardOptOut = () => {
  const { stats, setHidden } = usePrediction();
  if (!stats) return null;
  const hidden = !!stats.hidden;
  return (
    <button
      className={`alert-bell ${hidden ? '' : 'on'}`}
      onClick={() => setHidden(!hidden)}
      title="Show or hide your name on the Nifty Leaderboard"
    >
      <span className="ab-ico">{hidden ? <EyeOff size={14} aria-hidden="true" /> : <Trophy size={14} aria-hidden="true" />}</span>
      Leaderboard
      <span className="ab-state">{hidden ? 'HIDDEN' : 'VISIBLE'}</span>
    </button>
  );
};

// Everything account/preference shaped lives here, behind the sidebar gear —
// the nav column stays pure navigation.
const SettingsSheet = ({ open, onClose }) => {
  const { currentUser, logout } = useAuth();
  const location = useLocation();
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem('gemini_api_key') || ''; } catch { return ''; } });
  const [analyticsResetStatus, setAnalyticsResetStatus] = useState('');
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      else trapFocus(event, dialogRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleKeyChange = (e) => {
    setApiKey(e.target.value);
    try { localStorage.setItem('gemini_api_key', e.target.value); } catch { setAnalyticsResetStatus('Browser storage is unavailable; this key will not persist.'); }
  };

  const resetAnalytics = async () => {
    setAnalyticsResetStatus('Resetting…');
    const ok = await resetProductAnalytics();
    setAnalyticsResetStatus(ok ? 'Anonymous analytics reset.' : 'Could not reset analytics. Try again.');
  };

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h3>Settings</h3>
          <button ref={closeRef} className="settings-close" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Account</div>
          {currentUser ? (
            <div className="settings-account">
              <div>
                <div className="settings-account-label">Signed in as</div>
                <div className="settings-account-email">{currentUser?.email}</div>
              </div>
              <button onClick={logout} className="secondary" style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }}>
                Sign Out
              </button>
            </div>
          ) : (
            <div className="settings-account">
              <div>
                <div className="settings-account-label">Save your setup</div>
                <div className="settings-account-email">Keep your watchlist across devices and enable signal alerts.</div>
              </div>
                  <Link
                    to="/login?mode=signup"
                    state={authState(location, notificationIntent())}
                    className="settings-auth-cta"
                    onClick={onClose}
                  >
                    Save watchlist &amp; enable alerts
                  </Link>
            </div>
          )}
        </div>

        {/* Alerts, push tests and leaderboard visibility act on the signed-in account. */}
        {currentUser && (
          <div className="settings-section">
            <div className="settings-section-title">Notifications &amp; visibility</div>
            <AlertBell />
            <PushTest />
            <LeaderboardOptOut />
          </div>
        )}

        <div className="settings-section">
          <div className="settings-section-title">App</div>
          <InstallApp />
          <button type="button" className="secondary" onClick={resetAnalytics} style={{ marginTop: 10 }}>
            Reset anonymous product analytics
          </button>
          <p className="settings-hint" aria-live="polite">{analyticsResetStatus}</p>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">AI</div>
          <label htmlFor="gemini-key">Gemini API Key</label>
          <input
            id="gemini-key"
            type="password"
            value={apiKey}
            onChange={handleKeyChange}
            placeholder="Enter AI Key..."
            style={{ marginBottom: 0 }}
          />
          <p className="settings-hint">Stored only in this browser. Powers the AI insight panels.</p>
        </div>
      </div>
    </div>
  );
};

export default SettingsSheet;
