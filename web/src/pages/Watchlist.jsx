import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, DataTable, StatusPill, EmptyState } from '../components/ui';
import TickerSearch from '../components/TickerSearch';
import Sparkline from '../components/Sparkline';
import { useWatchlist } from '../WatchlistContext';
import { useAuth } from '../AuthContext';
import { getCached, subscribe } from '../lib/swrCache';
import { authState, watchlistIntent } from '../lib/authIntent';
import './Watchlist.css';

const TOKEN_KEY = 'alphanova_auth_token';
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtPrice = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// Symbols with a scored setup in the app-wide signals snapshot (already polled
// by SignalAlertProvider — no request of our own). market keeps IN plans off
// US rows that happen to share a ticker string.
const useLiveSetupSymbols = () => {
  const [entry, setEntry] = useState(() => getCached('signals'));
  useEffect(() => subscribe('signals', setEntry), []);
  const data = entry ? entry.data : null;
  return useMemo(() => {
    const plans = (data && data.setups && data.setups.plans) || [];
    const mkt = (data && data.signals_market) || 'IN';
    const set = new Set(plans.filter((p) => p && p.symbol).map((p) => p.symbol.toUpperCase()));
    return { symbols: set, market: mkt };
  }, [data]);
};

const AddBox = ({ onAdd, onRequireAuth, isAuthenticated, error, onClearError }) => {
  const [value, setValue] = useState('');
  const [market, setMarket] = useState('IN');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    if (!isAuthenticated) {
      onRequireAuth(v, market);
      return;
    }
    setBusy(true);
    try {
      await onAdd(v, market);
      setValue('');
    } catch {
      // error surfaced via context
    } finally {
      setBusy(false);
    }
  };

  const toggleStyle = (on) => ({
    width: 'auto', padding: '8px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    borderRadius: '8px', border: `1px solid ${on ? 'var(--primary-gold, #F5DC8C)' : 'var(--glass-border, rgba(255,255,255,0.12))'}`,
    background: on ? 'rgba(245,220,140,0.12)' : 'transparent',
    color: on ? 'var(--primary-gold, #F5DC8C)' : 'var(--text-secondary, #A1A1AA)',
  });

  return (
    <form className="wl-addbox" onSubmit={submit}>
      <TickerSearch
        value={value}
        onChange={(v) => { setValue(v); if (error) onClearError(); }}
        placeholder={market === 'IN' ? 'Symbol or company name (e.g. Tata Motors)' : 'Symbol or company name (e.g. Apple)'}
        inputStyle={{ marginBottom: 0, textTransform: 'uppercase' }}
        inputProps={{ 'aria-label': 'Add a symbol to your watchlist' }}
      />
      <button type="button" onClick={() => setMarket('IN')} style={toggleStyle(market === 'IN')} aria-pressed={market === 'IN'}>NSE</button>
      <button type="button" onClick={() => setMarket('US')} style={toggleStyle(market === 'US')} aria-pressed={market === 'US'}>US</button>
      <button type="submit" disabled={busy || !value.trim()} style={{ width: 'auto', whiteSpace: 'nowrap' }}>
        {busy ? 'Adding…' : '+ Add'}
      </button>
      {error && <div className="wl-add-error">{error}</div>}
    </form>
  );
};

// Where today's last sits between day low and high — a quick "bought the dip
// or closing at highs" read. Renders a dash when the quote has no range yet.
const DayRange = ({ low, high, last }) => {
  if (low === null || low === undefined || high === null || high === undefined
      || last === null || last === undefined || !(high > low)) return <span>—</span>;
  const pos = Math.max(0, Math.min(1, (last - low) / (high - low)));
  return (
    <span className="wl-range" title={`Day ${fmtPrice(low)} – ${fmtPrice(high)}`}>
      <span className="wl-range-track">
        <span className="wl-range-dot" style={{ left: `${pos * 100}%` }} />
      </span>
    </span>
  );
};

// Summary strip: how the whole list is doing, at a glance.
const SummaryBar = ({ rows }) => {
  const quoted = rows.filter((r) => r.change_pct !== null && r.change_pct !== undefined);
  if (!quoted.length) return null;
  const avg = quoted.reduce((a, r) => a + r.change_pct, 0) / quoted.length;
  const up = quoted.filter((r) => r.change_pct > 0).length;
  const down = quoted.filter((r) => r.change_pct < 0).length;
  const best = quoted.reduce((a, r) => (r.change_pct > a.change_pct ? r : a));
  const worst = quoted.reduce((a, r) => (r.change_pct < a.change_pct ? r : a));
  const fmt = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  return (
    <div className="wl-summary">
      <span className="wl-summary-item">
        <span className="wl-summary-label">Avg move</span>
        <span className={`tnum ${avg >= 0 ? 'tone-gain' : 'tone-loss'}`}>{fmt(avg)}</span>
      </span>
      <span className="wl-summary-item">
        <span className="wl-summary-label">Breadth</span>
        <span className="tnum"><span className="tone-gain">{up}↑</span> <span className="tone-loss">{down}↓</span></span>
      </span>
      <span className="wl-summary-item">
        <span className="wl-summary-label">Best</span>
        <span>{best.symbol} <span className="tone-gain tnum">{fmt(best.change_pct)}</span></span>
      </span>
      {worst.symbol !== best.symbol && (
        <span className="wl-summary-item">
          <span className="wl-summary-label">Worst</span>
          <span>{worst.symbol} <span className="tone-loss tnum">{fmt(worst.change_pct)}</span></span>
        </span>
      )}
    </div>
  );
};

const Watchlist = () => {
  const { currentUser } = useAuth();
  const { items, symbols, loading, error, add, remove, clearError } = useWatchlist();
  const location = useLocation();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState({}); // symbol -> {last, change_pct, day_low, day_high, spark}
  const [marketOpen, setMarketOpen] = useState(null);
  const [sortKey, setSortKey] = useState(null); // null = user's saved order
  const [sortDir, setSortDir] = useState('desc');
  const liveSetups = useLiveSetupSymbols();

  const requireWatchlistAuth = (symbol, market) => {
    const intent = watchlistIntent(symbol, market);
    navigate('/login?mode=signup', { state: authState(location, intent) });
  };

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

  const rows = items.map((it) => {
    const q = quotes[it.symbol] || {};
    return {
      symbol: it.symbol,
      market: it.market || 'IN',
      last: q.last,
      change_pct: q.change_pct,
      day_low: q.day_low,
      day_high: q.day_high,
      spark: q.spark,
    };
  });

  const onSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  };

  // Nulls sink to the bottom in BOTH directions (Screener convention).
  const sortRows = (list) => {
    if (!sortKey) return list;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      const aNull = av === null || av === undefined || (typeof av === 'number' && Number.isNaN(av));
      const bNull = bv === null || bv === undefined || (typeof bv === 'number' && Number.isNaN(bv));
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  };

  const chartSym = (r) => `${r.symbol}${r.market === 'US' ? '' : '.NS'}`;
  const hasSetup = (r) => liveSetups.symbols.has(r.symbol) && liveSetups.market === r.market;

  const columns = [
    {
      key: 'symbol',
      label: 'Symbol',
      sortable: true,
      render: (r) => (
        <span className="wl-sym-cell">
          <Link to={`/chart?symbol=${chartSym(r)}`} className="wl-sym-link" title={`Open ${r.symbol} in Chart Analyser`}>
            {r.symbol}
          </Link>
          {r.market === 'US' && <span className="wl-market-chip">US</span>}
          {hasSetup(r) && (
            <Link to="/signals" className="wl-setup-badge" title={`${r.symbol} has a scored setup on Market Signals right now`}>
              SETUP LIVE
            </Link>
          )}
        </span>
      ),
    },
    { key: 'last', label: 'LTP', align: 'right', sortable: true, render: (r) => (r.last === null || r.last === undefined ? '—' : `${r.market === 'US' ? '$' : '₹'}${fmtPrice(r.last)}`) },
    {
      key: 'change_pct', label: 'Chg%', align: 'right', sortable: true,
      render: (r) => (
        r.change_pct === null || r.change_pct === undefined
          ? '—'
          : <span className={r.change_pct >= 0 ? 'tone-gain' : 'tone-loss'}>
              {r.change_pct >= 0 ? '+' : ''}{Number(r.change_pct).toFixed(2)}%
            </span>
      ),
    },
    {
      key: 'range', label: 'Day range', align: 'center', mono: false,
      render: (r) => <DayRange low={r.day_low} high={r.day_high} last={r.last} />,
    },
    {
      key: 'trend', label: '30d', align: 'center', mono: false,
      render: (r) => (
        r.spark && r.spark.length > 1
          ? <span className="wl-spark-cell"><Sparkline values={r.spark} fixed width={92} height={26} /></span>
          : '—'
      ),
    },
    {
      key: 'actions', label: '', align: 'right', mono: false,
      render: (r) => (
        <span className="wl-actions">
          <Link to={`/chart?symbol=${chartSym(r)}`} title="Chart Analyser">Chart</Link>
          <Link to={`/fundamentals?symbol=${chartSym(r)}`} title="Fundamentals">Fund.</Link>
          <Link to={`/news?symbol=${chartSym(r)}`} title="News & sentiment">News</Link>
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

  const inRows = sortRows(rows.filter((r) => r.market !== 'US'));
  const usRows = sortRows(rows.filter((r) => r.market === 'US'));
  const mixed = inRows.length > 0 && usRows.length > 0;
  const tableProps = { columns, rowKey: (r) => r.symbol, sortKey, sortDir, onSort };
  const empty = (
    <EmptyState title="Your watchlist is empty">
      Track stocks across NSE and US. Add a symbol above or tap ☆ anywhere in Alpha Nova.
    </EmptyState>
  );

  return (
    <div className="fade-in">
      <PageHeader
        code="WL"
        title="Watchlist"
        subtitle="Your tracked stocks — live prices, one glance"
        right={<StatusPill open={!!marketOpen} liveLabel="MKT OPEN" closedLabel="MKT CLOSED" />}
      />

      <div style={{ marginBottom: 20 }}>
        <AddBox
          onAdd={add}
          onRequireAuth={requireWatchlistAuth}
          isAuthenticated={Boolean(currentUser)}
          error={error}
          onClearError={clearError}
        />
      </div>

      <SummaryBar rows={rows} />

      {mixed ? (
        <>
          <div className="wl-group-head">NSE</div>
          <DataTable {...tableProps} rows={inRows} loading={loading} />
          <div className="wl-group-head" style={{ marginTop: 20 }}>US</div>
          <DataTable {...tableProps} rows={usRows} loading={false} />
        </>
      ) : (
        <DataTable
          {...tableProps}
          rows={inRows.length ? inRows : usRows}
          loading={loading}
          empty={empty}
        />
      )}
    </div>
  );
};

export default Watchlist;
