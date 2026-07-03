import React, { useState, useEffect } from 'react';
import axios from 'axios';

const TAG_COLORS = {
  'LONG setup': 'var(--green-gain)',
  'SHORT setup': 'var(--red-loss)',
  'Momentum leader': 'var(--primary-accent)',
  'Long buildup': 'var(--green-gain)',
  'Short buildup': 'var(--red-loss)',
  'Short covering': 'var(--primary-accent)',
  'Big mover': 'var(--primary-gold)',
};

const fmt = (v, dec = 0) => (v === null || v === undefined ? 'N/A' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: dec }));

const FocusList = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFocus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/focus');
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to build the focus list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchFocus(); }, []);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="fade-in" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
        <div>
          <h2 style={{ marginBottom: '4px' }}>🎯 Today's Focus List</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>
            {today} · stocks flagged by setups, momentum, options flow & price action
          </p>
        </div>
        <button onClick={fetchFocus} disabled={loading} className="secondary" style={{ width: 'auto', padding: '8px 18px' }}>
          {loading ? <span className="spinner"></span> : '↻ Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '24px' }}>
          <div className="skeleton skeleton-header"></div>
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-row" style={{ height: '52px', marginTop: '14px' }}></div>)}
        </div>
      ) : error ? (
        <div style={{ color: 'var(--red-loss)', padding: '24px', background: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.3)', borderRadius: '12px' }}>
          <p style={{ margin: '0 0 12px 0' }}>{error}</p>
          <button onClick={fetchFocus} style={{ width: 'auto', padding: '8px 20px' }}>Retry</button>
        </div>
      ) : data && (
        <>
          {/* Day context strip */}
          <div className="card" style={{ padding: '14px 20px', marginBottom: '18px', display: 'flex', flexWrap: 'wrap', gap: '10px 28px', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ fontWeight: 800, color: data.context.regime === 'RISK-ON' ? 'var(--green-gain)' : data.context.regime === 'RISK-OFF' ? 'var(--red-loss)' : 'var(--primary-gold)' }}>
              {data.context.regime}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              NIFTY <strong style={{ color: 'var(--primary-gold)' }}>{fmt(data.context.nifty_spot, 2)}</strong>
              {' '}· S <span style={{ color: 'var(--green-gain)' }}>{fmt(data.context.nifty_support)}</span>
              {' '}/ R <span style={{ color: 'var(--red-loss)' }}>{fmt(data.context.nifty_resistance)}</span>
              {' '}· max pain {fmt(data.context.nifty_max_pain)}
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>VIX {data.context.vix} ({data.context.vol_label})</span>
            <span style={{ color: 'var(--text-secondary)' }}>options bias: <strong>{(data.context.index_bias || '').toUpperCase()}</strong></span>
            <span className={`signals-live-pill ${data.market_open ? 'open' : 'closed'}`} style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, border: '1px solid currentColor', color: data.market_open ? 'var(--green-gain)' : 'var(--red-loss)' }}>
              {data.market_open ? 'LIVE' : `CLOSED · ${data.market_note}`}
            </span>
          </div>

          {data.stocks.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
              <div style={{ fontSize: '30px', marginBottom: '10px' }}>🕸</div>
              <h3 style={{ marginBottom: '6px' }}>Nothing flagged right now</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
                Signals build through the session — check back after the first half hour of trading.
              </p>
            </div>
          ) : (
            data.stocks.map((s, idx) => (
              <div key={s.symbol} className="card" style={{ padding: '16px 20px', marginBottom: '12px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: '46px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>#{idx + 1}</div>
                  <div style={{
                    fontSize: '15px', fontWeight: 800, marginTop: '2px', padding: '2px 8px', borderRadius: '8px',
                    color: s.side === 'SHORT' ? 'var(--red-loss)' : 'var(--green-gain)',
                    background: s.side === 'SHORT' ? 'rgba(255,69,58,0.1)' : 'rgba(50,215,75,0.1)'
                  }}>
                    {s.side || '—'}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800 }}>{s.symbol}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>focus weight {s.weight}</span>
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {s.reasons.map((r, i) => (
                      <div key={i} style={{ fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '11px', fontWeight: 700, padding: '1px 9px', borderRadius: '10px',
                          border: '1px solid currentColor', color: TAG_COLORS[r.tag] || 'var(--primary-accent)', whiteSpace: 'nowrap'
                        }}>
                          {r.tag}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{r.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
            Focus weight aggregates signal strength across the setups engine, momentum ranking, options-flow buildups and heavyweight price action.
            Analytics only — not investment advice. As of {data.as_of?.replace('T', ' ')} IST.
          </p>
        </>
      )}
    </div>
  );
};

export default FocusList;
