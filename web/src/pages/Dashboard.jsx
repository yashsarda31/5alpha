import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, SectionTitle, DataTable, StatusPill, Badge, Skeleton } from '../components/ui';
import { useWatchlist } from '../WatchlistContext';
import WatchlistStar from '../components/WatchlistStar';
import './Dashboard.css';

const TOKEN_KEY = 'alphanova_auth_token';
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Personalized top section: the user's tracked stocks with live prices, or a
// teaching nudge when the list is empty (the key first-run conversion moment).
const MyWatchlist = () => {
  const { symbols, loading } = useWatchlist();
  const [quotes, setQuotes] = useState({});
  const symbolsKey = symbols.join(',');

  const fetchQuotes = useCallback(async () => {
    if (!symbolsKey) { setQuotes({}); return; }
    try {
      const res = await axios.get('/api/watchlist/quotes', { headers: authHeader() });
      const map = {};
      (res.data.quotes || []).forEach((q) => { map[q.symbol] = q; });
      setQuotes(map);
    } catch {
      // degrade to symbols-only
    }
  }, [symbolsKey]);

  useEffect(() => {
    fetchQuotes();
    const id = setInterval(fetchQuotes, 120000);
    return () => clearInterval(id);
  }, [fetchQuotes]);

  return (
    <div>
      <div className="dash-section-head">
        <SectionTitle icon="⭐">My Watchlist</SectionTitle>
        {symbols.length > 0 && <Link to="/watchlist" className="dash-manage-link">Manage ⭐</Link>}
      </div>
      {loading ? (
        <div className="dash-mover-grid">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={62} />)}
        </div>
      ) : symbols.length === 0 ? (
        <div className="dash-wl-empty">
          <strong>Track your stocks.</strong> Tap the ☆ on any Chart, Screener result,
          Momentum leader, or a mover below — your picks show up here with live prices,
          so you can see what moved on <em>your</em> names in one glance.
        </div>
      ) : (
        <div className="dash-mover-grid">
          {symbols.map((sym) => {
            const q = quotes[sym];
            const chg = q?.change_pct;
            const dir = chg === null || chg === undefined ? '' : chg >= 0 ? 'up' : 'down';
            return (
              <Link
                key={sym}
                to={`/chart?symbol=${sym}.NS`}
                title={`Open ${sym} in Chart Analyser`}
                className={`dash-mover ${dir}`}
              >
                <WatchlistStar symbol={sym} size={15} className="dash-mover-star" />
                <span className="dash-mover-sym">{sym}</span>
                <span className={`tnum ${dir === 'down' ? 'tone-loss' : dir === 'up' ? 'tone-gain' : ''}`}>
                  {chg === null || chg === undefined ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

const NAV_MODULES = [
  { to: '/signals', icon: '⚡', title: 'SIG > Market Signals', desc: 'Options intelligence, regime context & scored setups.' },
  { to: '/focus', icon: '🎯', title: 'FCS > Focus List', desc: 'Today\'s stocks flagged by setups, momentum & flow.' },
  { to: '/option-chain', icon: '⛓️', title: 'OCHN > Option Chain', desc: 'Institutional derivative analytics & structural mapping.' },
  { to: '/chart', icon: '📈', title: 'GP > Chart Analyser', desc: 'Technical analysis with Minervini VCP ratings.' },
  { to: '/screener', icon: '🔍', title: 'EQS > Quant Screener', desc: 'Filter market using institutional constraints.' },
  { to: '/dcf', icon: '💵', title: 'DCF > Valuations', desc: 'Intrinsic value via reverse-engineered cash flows.' },
  { to: '/fiidii', icon: '🏦', title: 'FLOW > Inst. Activity', desc: 'Track FII/DII cash market activity and flow.' },
  { to: '/arima', icon: '🔮', title: 'FORE > SARIMAX', desc: 'Time-series modeling for equity trajectory.' },
];

const formatIndexValue = (value) => {
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const MACRO_COLUMNS = [
  { key: 'name', label: 'Index' },
  { key: 'last', label: 'Last', align: 'right', render: (r) => formatIndexValue(r.last) },
  {
    key: 'change_pct', label: 'Chg%', align: 'right',
    render: (r) => (
      <span className={r.change_pct >= 0 ? 'tone-gain' : 'tone-loss'}>
        {r.change_pct >= 0 ? '+' : ''}{Number(r.change_pct).toFixed(2)}%
      </span>
    ),
  },
];

const Dashboard = () => {
  const [apiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchDashboard = async () => {
      try {
        const res = await axios.get('/api/dashboard');
        if (!cancelled) {
          setDashData(res.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.detail || err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDashboard();
    const interval = setInterval(fetchDashboard, 120000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const movers = dashData?.movers || [];
  const indices = dashData?.indices || [];
  const marketOpen = dashData?.market_open;

  return (
    <div className="dash fade-in">
      <PageHeader
        code="DASH"
        title="Dashboard"
        subtitle="Live market snapshot & analytics modules"
        right={
          <>
            <StatusPill open={marketOpen} liveLabel="MKT OPEN" closedLabel="MKT CLOSED" />
            <Badge tone={apiKey ? 'accent' : 'loss'}>{apiKey ? 'AI ACTIVE' : 'AI OFFLINE'}</Badge>
          </>
        }
      />

      {error && (
        <div className="dash-error">Live market feed unavailable: {error}</div>
      )}

      <div style={{ marginBottom: 8 }}>
        <MyWatchlist />
      </div>

      <div className="dash-grid">
        <div>
          <SectionTitle icon="📊">Top Movers</SectionTitle>
          <div className="dash-mover-grid">
            {loading ? (
              [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} height={62} />)
            ) : movers.length > 0 ? (
              movers.map((m) => (
                <Link
                  key={m.ticker}
                  to={`/chart?symbol=${m.ticker}.NS`}
                  title={`Open ${m.ticker} in Chart Analyser`}
                  className={`dash-mover ${m.change_pct >= 0 ? 'up' : 'down'}`}
                >
                  <WatchlistStar symbol={m.ticker} size={15} className="dash-mover-star" />
                  <span className="dash-mover-sym">{m.ticker}</span>
                  <span className={`tnum ${m.change_pct >= 0 ? 'tone-gain' : 'tone-loss'}`}>
                    {m.change_pct >= 0 ? '+' : ''}{m.change_pct.toFixed(2)}%
                  </span>
                </Link>
              ))
            ) : (
              <div className="dash-mover"><span className="dash-mover-sym">No data</span></div>
            )}
          </div>
        </div>

        <div>
          <SectionTitle icon="🌐">Macro</SectionTitle>
          <DataTable
            columns={MACRO_COLUMNS}
            rows={indices}
            rowKey={(r) => r.name}
            loading={loading}
            empty={<div className="ui-empty"><p className="ui-empty-body">No index data available</p></div>}
          />
        </div>
      </div>

      <SectionTitle icon="🧩">Analytics Modules</SectionTitle>
      <div className="dash-nav-grid">
        {NAV_MODULES.map((mod) => (
          <Link key={mod.to} to={mod.to} className="dash-nav-card">
            <span className="dash-nav-icon">{mod.icon}</span>
            <span className="dash-nav-title">{mod.title}</span>
            <span className="dash-nav-desc">{mod.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
