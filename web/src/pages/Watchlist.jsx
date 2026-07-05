import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, DataTable, StatusPill, EmptyState } from '../components/ui';
import { useWatchlist } from '../WatchlistContext';
import './Watchlist.css';

const TOKEN_KEY = 'alphanova_auth_token';
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtPrice = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const AddBox = ({ onAdd, error, onClearError }) => {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await onAdd(v);
      setValue('');
    } catch {
      // error surfaced via context
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="wl-addbox" onSubmit={submit}>
      <input
        type="text"
        value={value}
        onChange={(e) => { setValue(e.target.value); if (error) onClearError(); }}
        placeholder="Add a symbol (e.g. RELIANCE)"
        aria-label="Add a symbol to your watchlist"
        style={{ marginBottom: 0, textTransform: 'uppercase' }}
      />
      <button type="submit" disabled={busy || !value.trim()} style={{ width: 'auto', whiteSpace: 'nowrap' }}>
        {busy ? 'Adding…' : '+ Add'}
      </button>
      {error && <div className="wl-add-error">{error}</div>}
    </form>
  );
};

const Watchlist = () => {
  const { items, symbols, loading, error, add, remove, clearError } = useWatchlist();
  const [quotes, setQuotes] = useState({}); // symbol -> {last, change_pct}
  const [marketOpen, setMarketOpen] = useState(null);

  const symbolsKey = symbols.join(',');

  const fetchQuotes = useCallback(async () => {
    if (!symbolsKey) {
      setQuotes({});
      return;
    }
    try {
      const res = await axios.get('/api/watchlist/quotes', { headers: authHeader() });
      const map = {};
      (res.data.quotes || []).forEach((q) => { map[q.symbol] = q; });
      setQuotes(map);
      setMarketOpen(res.data.market_open);
    } catch {
      // Degrade to symbols-only; leave prior quotes as-is.
    }
  }, [symbolsKey]);

  useEffect(() => {
    fetchQuotes();
    const id = setInterval(fetchQuotes, 120000);
    return () => clearInterval(id);
  }, [fetchQuotes]);

  const rows = items.map((it) => ({
    symbol: it.symbol,
    last: quotes[it.symbol]?.last,
    change_pct: quotes[it.symbol]?.change_pct,
  }));

  const columns = [
    {
      key: 'symbol',
      label: 'Symbol',
      render: (r) => (
        <Link to={`/chart?symbol=${r.symbol}.NS`} className="wl-sym-link" title={`Open ${r.symbol} in Chart Analyser`}>
          {r.symbol}
        </Link>
      ),
    },
    { key: 'last', label: 'LTP', align: 'right', render: (r) => fmtPrice(r.last) },
    {
      key: 'change_pct', label: 'Chg%', align: 'right',
      render: (r) => (
        r.change_pct === null || r.change_pct === undefined
          ? '—'
          : <span className={r.change_pct >= 0 ? 'tone-gain' : 'tone-loss'}>
              {r.change_pct >= 0 ? '+' : ''}{Number(r.change_pct).toFixed(2)}%
            </span>
      ),
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <span className="wl-actions">
          <Link to={`/chart?symbol=${r.symbol}.NS`} title="Chart Analyser">📈</Link>
          <Link to={`/fundamentals?symbol=${r.symbol}.NS`} title="Fundamentals">📊</Link>
          <button
            type="button"
            className="wl-remove"
            title={`Remove ${r.symbol}`}
            aria-label={`Remove ${r.symbol} from watchlist`}
            onClick={() => remove(r.symbol)}
          >✕</button>
        </span>
      ),
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        code="WL"
        title="Watchlist"
        subtitle="Your tracked stocks — live prices, one glance"
        right={<StatusPill open={!!marketOpen} liveLabel="MKT OPEN" closedLabel="MKT CLOSED" />}
      />

      <div style={{ marginBottom: 20 }}>
        <AddBox onAdd={add} error={error} onClearError={clearError} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.symbol}
        loading={loading}
        empty={
          <EmptyState icon="⭐" title="Your watchlist is empty">
            Track your stocks: tap the ☆ on any Chart, Screener result, Momentum leader,
            or a mover on your Dashboard — or add one by symbol above.
          </EmptyState>
        }
      />
    </div>
  );
};

export default Watchlist;
