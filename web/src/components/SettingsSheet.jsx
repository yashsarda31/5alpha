import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
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
      <span className="ab-ico">{browserEnabled ? '🔔' : '🔕'}</span>
      Signal alerts
      <span className="ab-state">{state}</span>
    </button>
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
      <span className="ab-ico">{hidden ? '🙈' : '🏆'}</span>
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
