import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { PageHeader, StatusPill } from '../components/ui';
import './MarketSignals.css';

const BUCKET_META = {
  long_buildup: { title: 'Long Buildup', hint: 'OI ↑ price ↑', color: 'var(--green-gain)' },
  short_buildup: { title: 'Short Buildup', hint: 'OI ↑ price ↓', color: 'var(--red-loss)' },
  short_covering: { title: 'Short Covering', hint: 'OI ↓ price ↑', color: 'var(--primary-accent)' },
  long_unwinding: { title: 'Long Unwinding', hint: 'OI ↓ price ↓', color: 'var(--primary-gold)' },
};

const fmt = (v, dec = 2) => (v === null || v === undefined || isNaN(v) ? 'N/A' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: dec }));

const MarketSignals = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef(null);

  const fetchSignals = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await axios.get('/api/signals');
      setData(res.data);
      setError(null);
    } catch (err) {
      if (showLoading) setError(err.response?.data?.detail || 'Failed to load market signals.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals(true);
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchSignals(false), 60000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="signals-container fade-in">
        <PageHeader code="SIG" title="Market Signals" subtitle="Live options intelligence, regime context & scored setups" />
        <div className="card" style={{ padding: '24px' }}>
          <div className="skeleton skeleton-header"></div>
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton skeleton-row" style={{ height: '36px', marginTop: '14px' }}></div>)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="signals-container fade-in">
        <PageHeader code="SIG" title="Market Signals" subtitle="Live options intelligence, regime context & scored setups" />
        <div style={{ color: 'var(--red-loss)', padding: '24px', background: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.3)', borderRadius: '12px' }}>
          <h3 style={{ margin: '0 0 8px 0' }}>Signal Feed Unavailable</h3>
          <p style={{ margin: '0 0 16px 0' }}>{error}</p>
          <button onClick={() => fetchSignals(true)} style={{ width: 'auto', padding: '8px 20px' }}>Retry</button>
        </div>
      </div>
    );
  }

  const { regime, options, setups } = data;
  const adv = regime.breadth?.adv || 0;
  const dec = regime.breadth?.dec || 0;
  const advPct = adv + dec > 0 ? (adv / (adv + dec)) * 100 : 50;
  const overallColor = regime.overall === 'RISK-ON' ? 'var(--green-gain)'
    : regime.overall === 'RISK-OFF' ? 'var(--red-loss)' : 'var(--primary-gold)';

  return (
    <div className="signals-container fade-in">
      <PageHeader
        code="SIG"
        title="Market Signals"
        subtitle={`Live options intelligence, regime context & scored setups · as of ${data.as_of?.replace('T', ' ')} IST`}
        right={
          <>
            <StatusPill open={data.market_open} note={data.market_open ? undefined : `${data.market_note} (last session)`} />
            <div className="refresh-toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span>Auto 60s</span>
              <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh(!autoRefresh)} style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: autoRefresh ? 'var(--primary-accent)' : 'rgba(255,255,255,0.1)', borderRadius: '22px', transition: '0.3s' }}></span>
              </label>
            </div>
          </>
        }
      />

      {/* ---- Regime context ---- */}
      <div className="signals-section-title">🌡 Regime Context</div>
      <div className="regime-grid">
        <div className="regime-card regime-hero">
          <div className="label">Market Regime</div>
          <div className="value" style={{ color: overallColor }}>{regime.overall}</div>
          <div className="detail">
            Direction: <strong>{regime.dir.toUpperCase()}</strong> · position sizing ×{regime.vol_scale}
          </div>
        </div>
        <div className="regime-card">
          <div className="label">NIFTY Trend</div>
          <div className={`value trend-${regime.nifty.label}`}>{regime.nifty.label}</div>
          <div className="detail">{regime.nifty.detail}</div>
        </div>
        <div className="regime-card">
          <div className="label">BANKNIFTY Trend</div>
          <div className={`value trend-${regime.banknifty.label}`}>{regime.banknifty.label}</div>
          <div className="detail">{regime.banknifty.detail}</div>
        </div>
        <div className="regime-card">
          <div className="label">Volatility · VIX {fmt(regime.vix)}</div>
          <div className="value" style={{ color: 'var(--primary-accent)' }}>{regime.vol.label}</div>
          <div className="detail">{regime.vol.play}</div>
        </div>
        <div className="regime-card">
          <div className="label">Breadth · {fmt(adv, 0)} adv / {fmt(dec, 0)} dec</div>
          <div className="value" style={{ color: advPct >= 50 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
            {advPct.toFixed(0)}% ADV
          </div>
          <div className="breadth-bar">
            <div className="adv" style={{ width: `${advPct}%` }}></div>
            <div className="dec" style={{ width: `${100 - advPct}%` }}></div>
          </div>
        </div>
        <div className="regime-card">
          <div className="label">Near-Expiry IV</div>
          <div className="value" style={{ color: regime.iv.label === 'CHEAP' ? 'var(--green-gain)' : regime.iv.label === 'RICH' ? 'var(--red-loss)' : 'var(--primary-gold)' }}>
            {regime.iv.label}
          </div>
          <div className="detail">{regime.iv.detail}</div>
        </div>
      </div>

      {/* ---- Options intelligence ---- */}
      <div className="signals-section-title">⛓ Options Intelligence</div>
      <div className="oc-summary-grid">
        {options.indices.map(oc => {
          const mpDrift = oc.spot ? ((oc.max_pain - oc.spot) / oc.spot) * 100 : 0;
          const bias = oc.pcr_band > 1.15 ? 'BULLISH' : oc.pcr_band < 0.85 ? 'BEARISH' : 'NEUTRAL';
          return (
            <div className="oc-summary-card" key={oc.symbol}>
              <h3>
                <span>{oc.symbol} <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>exp {oc.expiry}</span></span>
                <span className="spot">{fmt(oc.spot)}</span>
              </h3>
              <div className="oc-stats">
                <div className="oc-stat"><div className="k">PCR (±5%)</div><div className={`v bias-${bias}`}>{fmt(oc.pcr_band, 3)}</div></div>
                <div className="oc-stat"><div className="k">PCR full</div><div className="v">{fmt(oc.pcr, 3)}</div></div>
                <div className="oc-stat"><div className="k">Max Pain</div><div className="v" style={{ color: 'var(--primary-gold)' }}>{fmt(oc.max_pain, 0)} <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({mpDrift >= 0 ? '+' : ''}{mpDrift.toFixed(1)}%)</span></div></div>
                <div className="oc-stat"><div className="k">Support</div><div className="v" style={{ color: 'var(--green-gain)' }}>{fmt(oc.support, 0)}</div></div>
                <div className="oc-stat"><div className="k">Resistance</div><div className="v" style={{ color: 'var(--red-loss)' }}>{fmt(oc.resistance, 0)}</div></div>
                <div className="oc-stat"><div className="k">ATM Straddle</div><div className="v">₹{fmt(oc.straddle, 0)}</div></div>
                <div className="oc-stat"><div className="k">ATM IV CE/PE</div><div className="v">{fmt(oc.atm_iv_ce, 1)} / {fmt(oc.atm_iv_pe, 1)}</div></div>
                <div className="oc-stat"><div className="k">ΔOI Calls</div><div className="v" style={{ color: oc.ce_doi >= 0 ? 'var(--red-loss)' : 'var(--green-gain)' }}>{fmt(oc.ce_doi, 0)}</div></div>
                <div className="oc-stat"><div className="k">ΔOI Puts</div><div className="v" style={{ color: oc.pe_doi >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>{fmt(oc.pe_doi, 0)}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="buildup-grid">
        {Object.entries(BUCKET_META).map(([key, meta]) => {
          const rows = options.buildups?.[key] || [];
          return (
            <div className="buildup-card" key={key}>
              <h4 style={{ color: meta.color }}>{meta.title} <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>· {meta.hint}</span></h4>
              {rows.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No contracts flagged.</div>
              ) : (
                <table>
                  <tbody>
                    {rows.slice(0, 6).map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{c.symbol}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{c.contract}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(c.ltp)}</td>
                        <td style={{ textAlign: 'right', color: c.pChange >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>{c.pChange >= 0 ? '+' : ''}{fmt(c.pChange, 1)}%</td>
                        <td style={{ textAlign: 'right', color: 'var(--primary-accent)' }}>OI {c.oiChangePct >= 0 ? '+' : ''}{fmt(c.oiChangePct, 0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {options.ideas?.length > 0 && (
        <>
          <div className="signals-section-title">💡 Index Option Structures</div>
          {options.ideas.map((idea, i) => (
            <div className="idea-row" key={i}>
              <span className={`idea-chip bias-${idea.bias}`}>{idea.symbol} · {idea.bias}</span>
              <span>{idea.text}</span>
            </div>
          ))}
        </>
      )}

      {/* ---- Actionable setups ---- */}
      <div className="signals-section-title">🎯 Actionable Setups
        <span style={{ color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
          · index bias: <strong className={setups.index_bias === 'bull' ? 'side-LONG' : setups.index_bias === 'bear' ? 'side-SHORT' : ''}>{setups.index_bias.toUpperCase()}</strong> · {setups.radar_size} names on radar
        </span>
      </div>
      {setups.plans.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>🕸</div>
          <h3 style={{ marginBottom: '6px' }}>No high-conviction setups right now</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
            Nothing on the futures radar clears the 45/100 conviction threshold. Check back after fresh OI data.
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Side</th>
                <th>Conviction</th>
                <th style={{ textAlign: 'right' }}>Entry</th>
                <th style={{ textAlign: 'right' }}>Stop</th>
                <th style={{ textAlign: 'right' }}>Target (1.5R)</th>
                <th style={{ textAlign: 'right' }}>Qty*</th>
                <th>Signal Drivers</th>
              </tr>
            </thead>
            <tbody>
              {setups.plans.map(p => (
                <tr key={p.symbol + p.side}>
                  <td style={{ fontWeight: 700 }}>{p.symbol}</td>
                  <td className={`side-${p.side}`} style={{ fontWeight: 800 }}>{p.side}</td>
                  <td>
                    <div className="score-cell">
                      <span style={{ fontWeight: 700, minWidth: '24px' }}>{p.score}</span>
                      <div className="score-bar"><div style={{ width: `${p.score}%` }}></div></div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>₹{fmt(p.entry)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red-loss)' }}>₹{fmt(p.stop)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--green-gain)' }}>₹{fmt(p.target)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(p.qty, 0)}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="signals-footnote">
        Conviction = OI intensity + price momentum + liquidity + options-flow agreement + index bias + intraday & regime alignment (0–100, threshold 45).
        *Qty sized so a stop-out loses {setups.risk_pct}% of ₹{fmt(setups.capital, 0)} capital, scaled by the volatility regime (×{regime.vol_scale}) — not rounded to lot size.
        Signals are analytics, not investment advice.
      </p>
    </div>
  );
};

export default MarketSignals;
