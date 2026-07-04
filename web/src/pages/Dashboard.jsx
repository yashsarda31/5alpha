import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, SectionTitle, DataTable, StatusPill, Badge, Skeleton } from '../components/ui';
import './Dashboard.css';

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

      <div className="dash-grid">
        <div>
          <SectionTitle icon="📊">Top Movers</SectionTitle>
          <div className="dash-mover-grid">
            {loading ? (
              [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} height={62} />)
            ) : movers.length > 0 ? (
              movers.map((m) => (
                <div key={m.ticker} className={`dash-mover ${m.change_pct >= 0 ? 'up' : 'down'}`}>
                  <span className="dash-mover-sym">{m.ticker}</span>
                  <span className={`tnum ${m.change_pct >= 0 ? 'tone-gain' : 'tone-loss'}`}>
                    {m.change_pct >= 0 ? '+' : ''}{m.change_pct.toFixed(2)}%
                  </span>
                </div>
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
