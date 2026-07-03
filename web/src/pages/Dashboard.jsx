import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Dashboard.css';

const NAV_MODULES = [
  { to: '/signals', icon: '⚡', title: 'SIG > Market Signals', desc: 'Options intelligence, regime context & scored setups.' },
  { to: '/option-chain', icon: '⛓️', title: 'OCHN > Option Chain', desc: 'Institutional derivative analytics & structural mapping.' },
  { to: '/chart', icon: '📈', title: 'GP > Chart Analyser', desc: 'Technical analysis with Minervini VCP ratings.' },
  { to: '/screener', icon: '🔍', title: 'EQS > Quant Screener', desc: 'Filter market using institutional constraints.' },
  { to: '/dcf', icon: '💵', title: 'DCF > Valuations', desc: 'Intrinsic value via reverse-engineered cash flows.' },
  { to: '/fiidii', icon: '🏦', title: 'FLOW > Inst. Activity', desc: 'Track FII/DII cash market activity and flow.' },
  { to: '/arima', icon: '🔮', title: 'FORE > SARIMAX', desc: 'Time-series modeling for equity trajectory.' },
];

const formatIndexValue = (name, value) => {
  if (value === null || value === undefined) return 'N/A';
  const decimals = name === 'INDIA VIX' || name === 'USD/INR' ? 2 : 2;
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

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

  // Grid spans to keep the heatmap visually varied
  const cellStyle = (idx) => {
    if (idx === 0) return { gridRow: 'span 2' };
    if (idx === 3) return { gridColumn: 'span 2' };
    return {};
  };

  return (
    <div className="bbg-dashboard fade-in">
      <div className="bbg-header">
        <div className="bbg-title">ALPHA NOVA TERMINAL // CMD: DASH</div>
        <div className="bbg-status">
          <div className="bbg-status-item">
            <span className={`bbg-status-dot ${marketOpen ? 'green' : 'red'}`}></span>
            <span className={marketOpen ? 'text-white' : 'text-down'}>{marketOpen ? 'MKT OPEN' : 'MKT CLOSED'}</span>
          </div>
          <div className="bbg-status-item">
            <span className={`bbg-status-dot ${apiKey ? 'green' : 'red'}`}></span>
            <span className={apiKey ? 'text-blue' : 'text-down'}>{apiKey ? 'AI ACTIVE' : 'AI OFFLINE'}</span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: 'var(--red-loss)', padding: '12px 16px', background: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          Live market feed unavailable: {error}
        </div>
      )}

      <div className="bbg-grid">
        {/* Heatmap */}
        <div className="bbg-panel" style={{ gridColumn: 'span 8' }}>
          <div className="bbg-panel-title">EQRV // TOP MOVERS</div>
          <div className="bbg-heatmap">
            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <div key={i} className="bbg-heat-cell" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <span className="skeleton" style={{ width: '60px', height: '14px' }}></span>
                </div>
              ))
            ) : movers.length > 0 ? (
              movers.map((m, idx) => (
                <div
                  key={m.ticker}
                  className={`bbg-heat-cell ${m.change_pct >= 0 ? 'bg-up' : 'bg-down'}`}
                  style={cellStyle(idx)}
                >
                  <span>{m.ticker}</span>
                  <span>{m.change_pct >= 0 ? '+' : ''}{m.change_pct.toFixed(2)}%</span>
                </div>
              ))
            ) : (
              <div className="bbg-heat-cell" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <span>NO DATA</span>
              </div>
            )}
          </div>
        </div>

        {/* Macros */}
        <div className="bbg-panel" style={{ gridColumn: 'span 4' }}>
          <div className="bbg-panel-title">INDX // MACRO</div>
          <table className="bbg-table">
            <tbody>
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i}>
                    <td colSpan="3"><div className="skeleton skeleton-row" style={{ height: '18px' }}></div></td>
                  </tr>
                ))
              ) : indices.length > 0 ? (
                indices.map((row) => (
                  <tr key={row.name}>
                    <td className="text-white">{row.name}</td>
                    <td className="text-white">{formatIndexValue(row.name, row.last)}</td>
                    <td className={row.change_pct >= 0 ? 'text-up' : 'text-down'}>
                      {row.change_pct >= 0 ? '+' : ''}{Number(row.change_pct).toFixed(2)}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td className="text-white" colSpan="3">No index data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bbg-panel-title" style={{ marginTop: '20px' }}>FUNCS // ANALYTICS MODULES</div>
      <div className="bbg-nav-grid">
        {NAV_MODULES.map((mod) => (
          <Link key={mod.to} to={mod.to} className="bbg-nav-card">
            <span className="bbg-nav-icon">{mod.icon}</span>
            <span className="bbg-nav-title">{mod.title}</span>
            <span className="bbg-nav-desc">{mod.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
