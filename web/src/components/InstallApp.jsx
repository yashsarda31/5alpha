import React, { useState, useEffect } from 'react';

// "Install App" affordance for the PWA. Three states:
// - Chrome/Edge (Android + desktop): captures beforeinstallprompt and triggers
//   the native install dialog.
// - iOS Safari: no install API exists, so show Add-to-Home-Screen instructions.
// - Already installed (standalone display mode): renders nothing.
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isAndroid = () => /android/i.test(navigator.userAgent);

const InstallApp = ({ compact = false }) => {
  // main.jsx stashes the (once-only, pre-mount) beforeinstallprompt event on
  // window — read it instead of racing to catch the event ourselves.
  const [deferredPrompt, setDeferredPrompt] = useState(() => window.__anInstallPrompt || null);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onReady = () => setDeferredPrompt(window.__anInstallPrompt || null);
    const onInstalled = () => { setInstalled(true); setDeferredPrompt(null); window.__anInstallPrompt = null; };
    window.addEventListener('an-install-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('an-install-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  // Mobile users always get a path: native prompt when Chrome offers it,
  // menu instructions otherwise (Chrome withholds the prompt for ~90 days
  // after a dismissal). Desktop without a prompt stays clean.
  if (!deferredPrompt && !isIOS() && !isAndroid()) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      setDeferredPrompt(null);
      window.__anInstallPrompt = null;
    } else {
      setShowHelp((v) => !v);
    }
  };

  return (
    <div style={{ marginBottom: compact ? 0 : '16px' }}>
      <button
        onClick={handleClick}
        className="secondary"
        style={{
          width: '100%', padding: '10px', fontSize: '13px', fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          border: '1px solid rgba(245, 220, 140, 0.35)', borderRadius: '10px',
          background: 'rgba(245, 220, 140, 0.08)', color: 'var(--primary-gold, #F5DC8C)',
          cursor: 'pointer'
        }}
      >
        <span>📲</span> Install App
      </button>
      {showHelp && (
        <div style={{
          marginTop: '10px', padding: '12px', borderRadius: '10px', fontSize: '12px',
          lineHeight: 1.6, background: 'rgba(255,255,255,0.06)',
          color: 'var(--text-secondary, #A1A1AA)'
        }}>
          {isIOS() ? (
            <>
              On iPhone/iPad: tap the <strong style={{ color: 'var(--text-primary, #F5F5F7)' }}>Share</strong> button
              <span style={{ margin: '0 4px' }}>(the square with an arrow)</span>
              in Safari, then choose <strong style={{ color: 'var(--text-primary, #F5F5F7)' }}>Add to Home Screen</strong>.
            </>
          ) : (
            <>
              In Chrome: tap the <strong style={{ color: 'var(--text-primary, #F5F5F7)' }}>⋮ menu</strong> (top right),
              then choose <strong style={{ color: 'var(--text-primary, #F5F5F7)' }}>Add to Home screen</strong> →{' '}
              <strong style={{ color: 'var(--text-primary, #F5F5F7)' }}>Install</strong>.
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default InstallApp;
