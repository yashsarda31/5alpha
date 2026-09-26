import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, DataTable, StatusPill, EmptyState } from '../components/ui';
import TickerSearch from '../components/TickerSearch';
import Sparkline from '../components/Sparkline';
import { useWatchlist } from '../WatchlistContext';
import { useAuth } from '../AuthContext';
import { watchlistChartSymbol } from '../lib/chartTechnicalSignal';
import { useWatchlistChartSignals } from '../lib/useWatchlistChartSignals';
import { authState, watchlistIntent } from '../lib/authIntent';
import { RefreshCw, Bookmark } from 'lucide-react';
import { dashboardNumber, dashboardChange } from '../lib/dashboardDisplay';
import './Watchlist.css';

const TOKEN_KEY = 'alphanova_auth_token';
const WATCHLIST_STARTERS = {
  IN: ['RELIANCE', 'TCS', 'HDFCBANK'],
  US: ['AAPL', 'MSFT', 'NVDA'],
};
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fmtPrice = (n) => (dashboardNumber(n) === null ? '—' : Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const AddBox = ({ onAdd, onRequireAuth, isAuthenticated, error, onClearError, market, onMarketChange }) => {
  const [value, setValue] = useState('');
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
      <button type="button" onClick={() => onMarketChange('IN')} style={toggleStyle(market === 'IN')} aria-pressed={market === 'IN'}>NSE</button>
      <button type="button" onClick={() => onMarketChange('US')} style={toggleStyle(market === 'US')} aria-pressed={market === 'US'}>US</button>
      <button type="submit" disabled={busy || !value.trim()} style={{ width: 'auto', whiteSpace: 'nowrap' }}>
        {busy ? 'Adding…' : '+ Add'}
      </button>
      {error && <div className="wl-add-error" role="alert">{error}</div>}
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
  const quoted = rows.filter((r) => dashboardNumber(r.change_pct) !== null);
  if (!quoted.length) return null;
  const avg = quoted.reduce((a, r) => a + Number(r.change_pct), 0) / quoted.length;
  const up = quoted.filter((r) => r.change_pct > 0).length;
  const down = quoted.filter((r) => r.change_pct < 0).length;
  const best = quoted.reduce((a, r) => (r.change_pct > a.change_pct ? r : a));
  const worst = quoted.reduce((a, r) => (r.change_pct < a.change_pct ? r : a));
  const fmt = (v) => dashboardChange(v).label;
  return (
    <div className="wl-summary">
      <span className="wl-summary-item">
        <span className="wl-summary-label">Average change</span>
        <span className={`tnum ${avg >= 0 ? 'tone-gain' : 'tone-loss'}`}>{fmt(avg)}</span>
      </span>
      <span className="wl-summary-item">
        <span className="wl-summary-label">Advancing / declining</span>
        <span className="tnum"><span className="tone-gain">{up}↑</span> <span className="tone-loss">{down}↓</span></span>
      </span>
      <span className="wl-summary-item">
        <span className="wl-summary-label">Strongest</span>
        <span>{best.symbol} <span className={`tnum ${dashboardChange(best.change_pct).tone}`}>{fmt(best.change_pct)}</span></span>
      </span>
      {worst.symbol !== best.symbol && (
        <span className="wl-summary-item">
          <span className="wl-summary-label">Weakest</span>
          <span>{worst.symbol} <span className={`tnum ${dashboardChange(worst.change_pct).tone}`}>{fmt(worst.change_pct)}</span></span>
        </span>
      )}
    </div>
  );
};

const Watchlist = () => {
  const { currentUser } = useAuth();
  const { items, symbols, loading, error, loadError, add, remove, reload, clearError } = useWatchlist();
  const location = useLocation();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState({}); // symbol -> {last, change_pct, day_low, day_high, spark}
  const [marketOpen, setMarketOpen] = useState(null);
  const [quoteError, setQuoteError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [market, setMarket] = useState('IN');
  const [sortKey, setSortKey] = useState(null); // null = user's saved order
  const [sortDir, setSortDir] = useState('desc');
  const [signalRefreshVersion, setSignalRefreshVersion] = useState(0);
  const chartSignals = useWatchlistChartSignals(items, signalRefreshVersion);

  const requireWatchlistAuth = (symbol, market) => {
    const intent = watchlistIntent(symbol, market);
    navigate('/login?mode=signup', { state: authState(location, intent) });
  };

  const addStarter = (symbol) => {
    if (!currentUser) {
      requireWatchlistAuth(symbol, market);
      return;
    }
    add(symbol, market).catch(() => {});
  };

  const symbolsKey = symbols.join(',');

  const fetchQuotes = useCallback(async () => {
    if (!symbolsKey) {
      setQuotes({});
      return;
    }
    setRefreshing(true);
    try {
      const res = await axios.get('/api/watchlist/quotes', { headers: authHeader() });
      const map = {};
      (res.data.quotes || []).forEach((q) => { map[q.symbol] = q; });
      setQuotes(map);
      setMarketOpen(res.data.market_open);
      setQuoteError(false);
    } catch {
      setQuoteError(true);
    } finally {
      setRefreshing(false);
    }
  }, [symbolsKey]);

  useEffect(() => {
    const first = setTimeout(fetchQuotes, 0);
    const interval = setInterval(fetchQuotes, 120000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [fetchQuotes]);

  const rows = items.map((it) => {
    const q = quotes[it.symbol] || {};
    return {
      symbol: it.symbol,
      market: it.market || 'IN',
      last: dashboardNumber(q.last),
      change_pct: dashboardNumber(q.change_pct),
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

  const chartSym = watchlistChartSymbol;
  const renderChartSignal = (row) => {
    const result = chartSignals[chartSym(row)];
    return <span className="wl-chart-signal">
      <Link to={`/chart?symbol=${encodeURIComponent(chartSym(row))}`} style={{ color: result?.color }}>
        {!result ? 'Loading…' : result.signal === 'N/A' ? 'Unavailable' : result.signal}
      </Link>
      <span>{result?.asOf ? `Candle ${result.asOf}` : 'Chart Analyser'}</span>
    </span>;
  };

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

        </span>
      ),
    },
    { key: 'last', label: 'Price', align: 'right', sortable: true, render: (r) => (r.last === null || r.last === undefined ? '—' : `${r.market === 'US' ? '$' : '₹'}${fmtPrice(r.last)}`) },
    {
      key: 'change_pct', label: 'Change', align: 'right', sortable: true,
      render: (r) => (
        r.change_pct === null || r.change_pct === undefined
          ? '—'
          : <span className={r.change_pct >= 0 ? 'tone-gain' : 'tone-loss'}>
              {r.change_pct >= 0 ? '+' : ''}{Number(r.change_pct).toFixed(2)}%
            </span>
      ),
    },
    { key: 'chart_signal', label: 'Chart signal', mono: false, render: renderChartSignal },
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
            onClick={() => { void remove(r.symbol).catch(() => {}); }}
          >✕</button>
        </span>
      ),
    },
  ];

  const inRows = sortRows(rows.filter((r) => r.market !== 'US'));
  const usRows = sortRows(rows.filter((r) => r.market === 'US'));
  const mixed = inRows.length > 0 && usRows.length > 0;
  const tableProps = { columns, rowKey: (r) => r.symbol, sortKey, sortDir, onSort };
  const mobileCards = (list) => <div className="wl-mobile-cards">{list.map((row) => (
    <article className="wl-stock-card" key={row.symbol} aria-label={`${row.symbol} stock`}>
      <div className="wl-stock-top">{columns[0].render(row)}<span className="wl-card-market">{row.market === 'US' ? 'US' : 'NSE'}</span></div>
      <div className="wl-stock-price"><strong className="tnum">{columns[1].render(row)}</strong><span className={`tnum ${dashboardChange(row.change_pct).tone}`}>{dashboardChange(row.change_pct).label}</span></div>
      <div className="wl-stock-signal"><span>Chart signal</span>{renderChartSignal(row)}</div>
      <div className="wl-stock-context"><span>Day range <DayRange low={row.day_low} high={row.day_high} last={row.last} /></span><span>30d {columns.find((col) => col.key === 'trend').render(row)}</span></div>
      <div className="wl-stock-actions">{columns.find((col) => col.key === 'actions').render(row)}</div>
    </article>
  ))}</div>;
  const stockList = (list, busy, emptyState = null) => <>
    <div className={list.length && !busy ? 'wl-desktop-table' : ''}><DataTable {...tableProps} rows={list} loading={busy} empty={emptyState} /></div>
    {!busy && list.length > 0 && mobileCards(list)}
  </>;
  const empty = (
    <EmptyState title="Your watchlist is empty">
      <Bookmark className="wl-empty-icon" size={30} aria-hidden="true" />
      <p>Track stocks across NSE and US. Add a symbol above or start with an example.</p>
      <p className="wl-starter-label">Example symbols — not recommendations</p>
      <div className="wl-starters">
        {WATCHLIST_STARTERS[market].map((symbol) => (
          <button key={symbol} type="button" onClick={() => addStarter(symbol)}>{symbol}</button>
        ))}
      </div>
      <Link className="wl-movers-link" to="/dashboard">Choose from Today’s movers</Link>
    </EmptyState>
  );

  return (
    <div className="wl-page fade-in">
      <PageHeader
        code="WL"
        title="Watchlist"
        subtitle="A focused home for the stocks you follow."
        right={<div className="wl-header-actions">
          {marketOpen != null && <StatusPill open={!!marketOpen} />}
          {symbols.length > 0 && <button className="wl-refresh" type="button" onClick={() => { void fetchQuotes(); setSignalRefreshVersion((v) => v + 1); }} disabled={refreshing || loading}><RefreshCw size={15} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh quotes'}</button>}
        </div>}
      />

      <section className="wl-add-panel" aria-label="Add stocks">
        <div className="wl-add-heading"><strong>Add to your shortlist</strong><span>Search a company or ticker, then choose its market.</span></div>
        <AddBox
          onAdd={add}
          onRequireAuth={requireWatchlistAuth}
          isAuthenticated={Boolean(currentUser)}
          error={error}
          onClearError={clearError}
          market={market}
          onMarketChange={setMarket}
        />
      </section>

      {symbols.length > 0 && <div className="wl-list-heading">
        <h2>Your stocks <span>{symbols.length}</span></h2>
        <span className="wl-quote-note" role="status">{refreshing ? 'Refreshing quotes…' : 'Provider snapshots · may be delayed'}</span>
      </div>}
      <SummaryBar rows={rows} />
      {rows.length > 0 && <p className="wl-summary-note">Equal-weight average of available quote changes; not portfolio performance. Chart signals use the same RSI / 20-day SMA rules as Analyse, on the displayed candle date; they are research indicators.</p>}
      {quoteError && <div className="wl-quote-error" role="status">Quote refresh unavailable. Any displayed prices are from the previous snapshot. Use Refresh quotes to retry.</div>}
      {rows.length > 0 && <label className="wl-mobile-sort">Sort stocks
        <select value={sortKey ? `${sortKey}:${sortDir}` : 'saved'} onChange={(e) => {
          const [key, direction] = e.target.value.split(':');
          setSortKey(key === 'saved' ? null : key);
          setSortDir(direction || 'desc');
        }}>
          <option value="saved">Saved order</option>
          <option value="symbol:asc">Symbol A–Z</option>
          <option value="change_pct:desc">Change: high to low</option>
          <option value="change_pct:asc">Change: low to high</option>
          <option value="last:desc">Price: high to low</option>
        </select>
      </label>}

      {loadError && (
        <div className="wl-load-error" role="alert">
          <span>{loadError}</span>
          <button type="button" onClick={reload} disabled={loading}>Retry watchlist</button>
        </div>
      )}

      {mixed ? (
        <>
          <div className="wl-group-head">NSE</div>
          {stockList(inRows, loading)}
          <div className="wl-group-head" style={{ marginTop: 20 }}>US</div>
          {stockList(usRows, false)}
        </>
      ) : (
        stockList(inRows.length ? inRows : usRows, loading, loadError ? <p>Your saved stocks are temporarily unavailable.</p> : empty)
      )}
    </div>
  );
};

export default Watchlist;
