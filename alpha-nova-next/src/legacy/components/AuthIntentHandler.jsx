import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useWatchlist } from '../WatchlistContext';
import { useSignalAlerts } from '../alerts/SignalAlertContext';

const subscriptionMessage = (status) => {
  if (status === 'denied') return 'Notifications are blocked. Allow them in your browser settings and try again.';
  if (status === 'unsupported') return 'This browser does not support push notifications.';
  if (status === 'no-sw') return 'Notifications require the installed production app or an active service worker.';
  if (status === 'no-vapid') return 'Notification setup is temporarily unavailable.';
  return 'Could not enable notifications on this device. Please try again.';
};

const AuthIntentHandler = () => {
  const { currentUser } = useAuth();
  const { add } = useWatchlist();
  const { ensureSubscribed } = useSignalAlerts();
  const location = useLocation();
  const navigate = useNavigate();
  const handled = useRef(null);
  const [notificationError, setNotificationError] = useState('');
  const [watchlistError, setWatchlistError] = useState('');
  const intent = location.state?.authIntent;
  const notificationPending = Boolean(
    currentUser && intent?.kind === 'enable-notifications',
  );

  const clear = useCallback(() => {
    setNotificationError('');
    setWatchlistError('');
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [location.hash, location.pathname, location.search, navigate]);

  const saveWatchlist = useCallback(async () => {
    if (intent?.kind !== 'watchlist-add') return;
    setWatchlistError('');
    try {
      await add(intent.symbol, intent.market);
      clear();
    } catch {
      setWatchlistError(`Could not save ${intent.symbol}.`);
    }
  }, [add, clear, intent]);

  useEffect(() => {
    if (!currentUser || intent?.kind !== 'watchlist-add') return;
    const key = JSON.stringify(intent);
    if (handled.current === key) return;
    handled.current = key;
    let cancelled = false;
    Promise.resolve()
      .then(() => add(intent.symbol, intent.market))
      .then(() => { if (!cancelled) clear(); })
      .catch(() => { if (!cancelled) setWatchlistError(`Could not save ${intent.symbol}.`); });
    return () => { cancelled = true; };
  }, [add, clear, currentUser, intent]);

  const retryWatchlist = () => {
    saveWatchlist();
  };

  const enableNotifications = async () => {
    setNotificationError('');
    const status = await ensureSubscribed();
    if (status === 'ok') {
      clear();
      return;
    }
    setNotificationError(subscriptionMessage(status));
  };

  if (!notificationPending && !watchlistError) return null;

  return (
    <div
      className="auth-intent-prompt"
      role="dialog"
      aria-label={watchlistError ? 'Watchlist save failed' : 'Enable notifications'}
    >
      <strong>
        {watchlistError || notificationError || 'Enable signal alerts on this device?'}
      </strong>
      <div className="auth-intent-actions">
        <button type="button" className="secondary" onClick={clear}>Not now</button>
        {watchlistError ? (
          <button type="button" onClick={retryWatchlist}>Retry save</button>
        ) : (
          <button type="button" onClick={enableNotifications}>Enable alerts</button>
        )}
      </div>
    </div>
  );
};

export default AuthIntentHandler;
