import React, { useState } from 'react';
import { useWatchlist } from '../WatchlistContext';
import './WatchlistStar.css';

// Reusable star toggle bound to WatchlistContext. Drop it wherever a symbol
// appears. Optimistic: the fill flips instantly; the context rolls back and
// surfaces an error if the write fails.
const WatchlistStar = ({ symbol, market = 'IN', size = 18, className = '', stopPropagation = true }) => {
  const { has, add, remove } = useWatchlist();
  const [busy, setBusy] = useState(false);
  const on = has(symbol);

  const onClick = async (e) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (busy || !symbol) return;
    setBusy(true);
    try {
      if (on) await remove(symbol);
      else await add(symbol, market);
    } catch {
      // context handles rollback + error state
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`wl-star ${on ? 'on' : ''} ${className}`.trim()}
      onClick={onClick}
      title={on ? 'Remove from watchlist' : 'Add to watchlist'}
      aria-pressed={on}
      aria-label={on ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      style={{ fontSize: `${size}px` }}
    >
      {on ? '★' : '☆'}
    </button>
  );
};

export default WatchlistStar;
