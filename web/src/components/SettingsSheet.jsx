import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Bell, BellOff, Trophy, EyeOff, Send } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useSignalAlerts } from '../alerts/SignalAlertProvider';
import { usePrediction } from '../PredictionContext';
import InstallApp from './InstallApp';

const AlertBell = () => {
  const { browserEnabled, toggleBrowser, permission } = useSignalAlerts();
  if (permission === 'unsupported') return null;
  const state = permission === 'denied' ? 'BLOCKED' : browserEnabled ? 'ON' : 'OFF';
  const title = permission === 'denied'
    ? 'Browser notifications are blocked in your browser settings'
    : 'Toggle background browser notifications for new signals';
  return (
    <button
      className={`alert-bell ${browserEnabled ? 'on' : ''}`}
      onClick={toggleBrowser}
      title={title}
      disabled={permission === 'denied'}
    >
      <span className="ab-ico">{browserEnabled ? <Bell size={14} aria-hidden="true" /> : <BellOff size={14} aria-hidden="true" />}</span>
      Signal alerts
      <span className="ab-state">{state}</span>
    </button>
  );
};

// One-tap proof that pushes reach this user's devices (uses /api/push/test).
const PushTest = () => {
  const { permission } = useSignalAlerts();
  const [status, setStatus] = useState(null);
  if (permission === 'unsupported') return null;

  const send = async () => {
    setStatus('Sending…');
    try {
      const token = localStorage.getItem('alphanova_auth_token');
      const res = await axios.post('/api/push/test', null, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const d = res.data;
      setStatus(d.subs === 0
        ? 'No devices subscribed — turn Signal alerts ON first.'
        : `Sent to ${d.sent} of ${d.subs} device(s). Check your notification tray.`);
    } catch (err) {
      setStatus(`Failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  return (
    <>
      <button className="alert-bell" onClick={send} title="Send a test push notification to all your subscribed devices">
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
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleKeyChange = (e) => {
    setApiKey(e.target.value);
    localStorage.setItem('gemini_api_key', e.target.value);
  };

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <h3>Settings</h3>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">
            <X size={16} />
          </button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Account</div>
          <div className="settings-account">
            <div>
              <div className="settings-account-label">Signed in as</div>
              <div className="settings-account-email">{currentUser?.email}</div>
            </div>
            <button onClick={logout} className="secondary" style={{ width: 'auto', padding: '8px 16px', fontSize: '12px' }}>
              Sign Out
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">Notifications &amp; visibility</div>
          <AlertBell />
          <PushTest />
          <LeaderboardOptOut />
        </div>

        <div className="settings-section">
          <div className="settings-section-title">App</div>
          <InstallApp />
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
