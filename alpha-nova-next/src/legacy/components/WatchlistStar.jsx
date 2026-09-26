import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useWatchlist } from '../WatchlistContext';
import { authState, watchlistIntent } from '../lib/authIntent';
import { markFirstRunStep, trackProductEvent } from '../lib/productAnalytics.js';
import './WatchlistStar.css';

// Reusable star toggle bound to WatchlistContext. Drop it wherever a symbol
// appears. Optimistic: the fill flips instantly; the context rolls back and
// surfaces an error if the write fails.
const WatchlistStar = ({ symbol, market = 'IN', size = 18, className = '', stopPropagation = true }) => {
  const { has, add, remove } = useWatchlist();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const on = has(symbol);

  const onClick = async (e) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const eventMarket = String(market).toUpperCase() === 'US' ? 'US' : 'IN';
    const route = ['/chart', '/watchlist', '/signals'].includes(location.pathname) ? location.pathname : '/';
    if (!on) void trackProductEvent('watchlist_intent_started', { route, market: eventMarket });
    if (!currentUser) {
      const intent = watchlistIntent(symbol, market);
      navigate('/login?mode=signup', { state: authState(location, intent) });
      return;
    }
    if (busy || !symbol) return;
    setFailure('');
    setBusy(true);
    try {
      if (on) await remove(symbol);
      else {
        await add(symbol, market);
        markFirstRunStep('durable');
        void trackProductEvent('watchlist_saved', { route, market: eventMarket });
      }
    } catch (error) {
      setFailure(error?.response?.data?.detail || `Could not save ${symbol}. Please retry.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="wl-star-control">
    <button
      type="button"
      className={`wl-star ${on ? 'on' : ''} ${className}`.trim()}
      onClick={onClick}
      title={on ? 'Remove from watchlist' : currentUser ? 'Add to watchlist' : 'Sign in to save this stock; your selection will be kept'}
      aria-pressed={on}
      aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      style={{ fontSize: `${size}px` }}
    >
      {busy ? '…' : on ? '★' : '☆'}
    </button>
    {failure && <span className="wl-star-error" role="alert">{failure}</span>}
    </span>
  );
};

export default WatchlistStar;
