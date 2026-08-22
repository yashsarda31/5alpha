import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, StatusPill } from '../components/ui';
import ShareButton from '../components/ShareButton';
import SignalsPortfolio from '../components/SignalsPortfolio';
import { getCached, useSWR } from '../lib/swrCache';
import './MarketSignals.css';

const BUCKET_META = {
  long_buildup: { title: 'Long Buildup', hint: 'OI ↑ price ↑', color: 'var(--green-gain)' },
  short_buildup: { title: 'Short Buildup', hint: 'OI ↑ price ↓', color: 'var(--red-loss)' },
  short_covering: { title: 'Short Covering', hint: 'OI ↓ price ↑', color: 'var(--primary-accent)' },
  long_unwinding: { title: 'Long Unwinding', hint: 'OI ↓ price ↓', color: 'var(--primary-gold)' },
};

// US session variant: no free OI-change feed exists for US equities, so the
// engine classifies by volume spurts instead — same four boxes, honest labels.
const US_BUCKET_META = {
  long_buildup: { title: 'Power Buying', hint: 'vol ↑ price ↑', color: 'var(--green-gain)' },
  short_buildup: { title: 'Power Selling', hint: 'vol ↑ price ↓', color: 'var(--red-loss)' },
  short_covering: { title: 'Quiet Drift Up', hint: 'vol ↓ price ↑', color: 'var(--primary-accent)' },
  long_unwinding: { title: 'Quiet Drift Down', hint: 'vol ↓ price ↓', color: 'var(--primary-gold)' },
};

const fmt = (v, dec = 2) => (v === null || v === undefined || isNaN(v) ? 'N/A' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: dec }));

// Horizontal strip: 95%/68% forecast bands with markers for the ensemble
// point, current realized vol and VIX — all on one annualized-vol axis.
const RVBand = ({ rv }) => {
  if (!rv?.band95 || !rv?.band68) return null;
  const pts = [rv.band95[0], rv.band95[1], rv.current?.rv10, rv.current?.vix, rv.ensemble?.point].filter((v) => v != null);
  const lo = Math.min(...pts) * 0.88;
  const hi = Math.max(...pts) * 1.08;
  const x = (v) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div className="rv-band-wrap">
      <div className="rv-band-scale">
        <div className="rv-band rv-band-95" style={{ left: `${x(rv.band95[0])}%`, width: `${x(rv.band95[1]) - x(rv.band95[0])}%` }} />
        <div className="rv-band rv-band-68" style={{ left: `${x(rv.band68[0])}%`, width: `${x(rv.band68[1]) - x(rv.band68[0])}%` }} />
        <div className="rv-marker rv-marker-fcst" style={{ left: `${x(rv.ensemble.point)}%` }} title={`Forecast ${rv.ensemble.point}%`} />
        {rv.current?.rv10 != null && <div className="rv-marker rv-marker-now" style={{ left: `${x(rv.current.rv10)}%` }} title={`Current 10d RV ${rv.current.rv10}%`} />}
        {rv.current?.vix != null && <div className="rv-marker rv-marker-vix" style={{ left: `${x(rv.current.vix)}%` }} title={`India VIX ${rv.current.vix}%`} />}
      </div>
      <div className="rv-band-legend">
        <span><i className="rv-dot rv-dot-fcst" /> forecast {fmt(rv.ensemble.point, 1)}%</span>
        {rv.current?.rv10 != null && <span><i className="rv-dot rv-dot-now" /> RV now {fmt(rv.current.rv10, 1)}%</span>}
        {rv.current?.vix != null && <span><i className="rv-dot rv-dot-vix" /> VIX {fmt(rv.current.vix, 1)}%</span>}
        <span className="rv-band-note">shaded: 68% / 95% forecast bands</span>
      </div>
    </div>
  );
};

const MarketSignals = () => {
  const [searchParams] = useSearchParams();
  // ?market=US / ?market=IN peeks at the other session; default follows the
  // server clock (US engine 8pm–2am IST, NSE otherwise).
  const marketOverride = (searchParams.get('market') || '').toUpperCase();
  const marketQS = ['IN', 'US'].includes(marketOverride) ? `?market=${marketOverride}` : '';
  const [autoRefresh, setAutoRefresh] = useState(true);
  // Stale-while-revalidate: the last payload renders instantly and a fresh
  // fetch runs only while this page is active.
  const swrKey = marketQS ? `signals:${marketOverride}` : 'signals';
  const [marketOpen, setMarketOpen] = useState(() => getCached(swrKey)?.data?.market_open !== false);
  const fetchSignals = () => axios.get(`/api/signals${marketQS}`).then((response) => {
    setMarketOpen(response.data?.market_open !== false);
    return response.data;
  });
  const { data, refreshing, error: swrError, revalidate } = useSWR(
    swrKey,
    fetchSignals,
    autoRefresh && marketOpen ? 60000 : 0,
  );
  // Nifty 10d realized-vol forecast — server refits at most hourly, so a slow
  // client poll is plenty; card hides itself if the model endpoint is down.
  const { data: rvFc } = useSWR(
    'rv-forecast',
    () => axios.get('/api/rv-forecast').then((r) => r.data),
    900000,
  );
  const loading = !data && !swrError;
  const error = !data && swrError
    ? (swrError.response?.data?.detail || 'Failed to load market signals.')
    : null;

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
          <button onClick={revalidate} style={{ width: 'auto', padding: '8px 20px' }}>Retry</button>
        </div>
      </div>
    );
  }

  const { regime, options, setups } = data;
  const isUS = data.signals_market === 'US';
  const cur = data.currency || '₹';
  const idxPrimary = data.index_names?.primary || 'NIFTY';
  const idxSecondary = data.index_names?.secondary || 'BANKNIFTY';
  const bucketMeta = isUS ? US_BUCKET_META : BUCKET_META;
  const adv = regime.breadth?.adv || 0;
  const dec = regime.breadth?.dec || 0;
  const advPct = adv + dec > 0 ? (adv / (adv + dec)) * 100 : 50;
  const overallColor = regime.overall === 'RISK-ON' ? 'var(--green-gain)'
    : regime.overall === 'RISK-OFF' ? 'var(--red-loss)' : 'var(--primary-gold)';

  return (
    <div className="signals-container fade-in">
      <PageHeader
        code="SIG"
        title={isUS ? 'Market Signals · US' : 'Market Signals'}
        subtitle={`${isUS ? '🇺🇸 US session (8pm–2am IST) · ' : ''}Live options intelligence, regime context & scored setups · as of ${data.as_of?.replace('T', ' ')} IST${refreshing ? ' · refreshing…' : ''}`}
        right={
          <>
            <StatusPill open={data.market_open} note={data.market_open ? undefined : `${data.market_note} (last session)`} />
            {data.market_open ? (
              <div className="refresh-toggle-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span>Auto 60s</span>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                  <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh(!autoRefresh)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: autoRefresh ? 'var(--primary-accent)' : 'rgba(255,255,255,0.1)', borderRadius: '22px', transition: '0.3s' }} />
                </label>
              </div>
            ) : (
              <button type="button" className="secondary" onClick={revalidate} disabled={refreshing} style={{ width: 'auto', padding: '8px 14px' }}>
                {refreshing ? 'Refreshing…' : 'Refresh snapshot'}
              </button>
            )}
          </>
        }
      />

      {/* ---- Regime context ---- */}
      <div className="signals-section-title">Regime Context</div>
      <div className="regime-grid">
        <div className="regime-card regime-hero">
          <div className="label">Market Regime</div>
          <div className="value" style={{ color: overallColor }}>{regime.overall}</div>
          <div className="detail">
            Direction: <strong>{regime.dir.toUpperCase()}</strong> · position sizing ×{regime.vol_scale}
          </div>
        </div>
        <div className="regime-card">
          <div className="label">{idxPrimary} Trend</div>
          <div className={`value trend-${regime.nifty.label}`}>{regime.nifty.label}</div>
          <div className="detail">{regime.nifty.detail}</div>
        </div>
        <div className="regime-card">
          <div className="label">{idxSecondary} Trend</div>
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

      {/* ---- Volatility forecast (Nifty-only model) ---- */}
      {!isUS && rvFc && (
        <>
          <div className="signals-section-title">Volatility Forecast
            <span style={{ color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
              · SARIMAX + GARCH-t ensemble · next {rvFc.horizon_days} sessions · as of {rvFc.as_of}
            </span>
          </div>
          <div className="rv-card">
            <div className="rv-hero">
              <div className="label">Forecast {rvFc.horizon_days}d Realized Vol</div>
              <div className="value" style={{ color: 'var(--primary-accent)' }}>{fmt(rvFc.ensemble?.point, 1)}%</div>
              <div className="detail">±{fmt(rvFc.expected_move_pct, 1)}% expected NIFTY move over {rvFc.horizon_days} sessions (1σ, annualized vol de-scaled)</div>
            </div>
            <div className="rv-stats">
              <div className="oc-stat"><div className="k">Current 10d RV</div><div className="v">{fmt(rvFc.current?.rv10, 1)}%</div></div>
              <div className="oc-stat"><div className="k">India VIX</div><div className="v">{fmt(rvFc.current?.vix, 1)}%</div></div>
              <div className="oc-stat" title="India VIX minus forecast realized vol. Positive = options priced rich vs the model (premium-selling edge); negative = options cheap.">
                <div className="k">Vol Risk Premium</div>
                <div className="v" style={{ color: rvFc.vrp == null ? 'var(--text-primary)' : rvFc.vrp >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
                  {rvFc.vrp == null ? 'N/A' : `${rvFc.vrp >= 0 ? '+' : ''}${fmt(rvFc.vrp, 1)} pts`}
                </div>
              </div>
              <div className="oc-stat" title={rvFc.legs?.sarimax?.spec}><div className="k">SARIMAX + VIX leg</div><div className="v">{fmt(rvFc.legs?.sarimax?.point, 1)}%</div></div>
              <div className="oc-stat" title={rvFc.legs?.garch ? `${rvFc.legs.garch.spec} · fat-tail df ν=${rvFc.legs.garch.nu}` : undefined}><div className="k">GJR-GARCH-t leg</div><div className="v">{fmt(rvFc.legs?.garch?.point, 1)}%</div></div>
            </div>
            <RVBand rv={rvFc} />
            <div className="rv-footnote">
              Parkinson (range) realized vol, annualized. Ensemble = {(rvFc.ensemble?.w_sarimax * 100).toFixed(0)}% SARIMAX(3,0,2)×(0,0,1,5) on log RV with log-VIX exog + {(rvFc.ensemble?.w_garch * 100).toFixed(0)}% GJR-GARCH(1,1)-t,
              weights from a {rvFc.backtest?.n_origins}-origin out-of-sample backtest ({rvFc.backtest?.sample}). Not investment advice.
            </div>
          </div>
        </>
      )}

      {/* ---- Options intelligence ---- */}
      <div className="signals-section-title">Options Intelligence</div>
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
                <div className="oc-stat"><div className="k">ATM Straddle</div><div className="v">{cur}{fmt(oc.straddle, isUS ? 2 : 0)}</div></div>
                <div className="oc-stat" title={`NSE raw leg IVs — CE ${fmt(oc.atm_iv_ce, 1)} / PE ${fmt(oc.atm_iv_pe, 1)}. Headline IV is solved from the straddle price (skew-free).`}><div className="k">ATM IV</div><div className="v">{fmt(oc.atm_iv ?? (oc.atm_iv_ce + oc.atm_iv_pe) / 2, 1)}% <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>({fmt(oc.atm_iv_ce, 1)}/{fmt(oc.atm_iv_pe, 1)})</span></div></div>
                {/* US: yfinance has no OI-change; ce/pe_doi carry day VOLUME there */}
                <div className="oc-stat"><div className="k">{isUS ? 'Call Vol' : 'ΔOI Calls'}</div><div className="v" style={{ color: isUS ? 'var(--text-primary)' : oc.ce_doi >= 0 ? 'var(--red-loss)' : 'var(--green-gain)' }}>{fmt(oc.ce_doi, 0)}</div></div>
                <div className="oc-stat"><div className="k">{isUS ? 'Put Vol' : 'ΔOI Puts'}</div><div className="v" style={{ color: isUS ? 'var(--text-primary)' : oc.pe_doi >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>{fmt(oc.pe_doi, 0)}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="buildup-grid">
        {Object.entries(bucketMeta).map(([key, meta]) => {
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
                        <td style={{ textAlign: 'right', color: 'var(--primary-accent)' }}>{isUS ? 'Vol' : 'OI'} {c.oiChangePct >= 0 ? '+' : ''}{fmt(c.oiChangePct, 0)}%</td>
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
          <div className="signals-section-title">Index Option Structures</div>
          {options.ideas.map((idea, i) => (
            <div className="idea-row" key={i}>
              <span className={`idea-chip bias-${idea.bias}`}>{idea.symbol} · {idea.bias}</span>
              <span>{idea.text}</span>
            </div>
          ))}
        </>
      )}

      {/* ---- Actionable setups ---- */}
      <div id="setups-analysis">
      <div className="signals-section-title" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <span>Actionable Setups
          <span style={{ color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
            {' '}· index bias: <strong className={setups.index_bias === 'bull' ? 'side-LONG' : setups.index_bias === 'bear' ? 'side-SHORT' : ''}>{setups.index_bias.toUpperCase()}</strong> · {setups.radar_size} names on radar
          </span>
        </span>
        {setups.plans.length > 0 && (
          <ShareButton
            compact
            filename="alpha-nova-setups.png"
            shareText="Today's scored trade setups — Alpha Nova"
            capture={() => document.getElementById('setups-analysis')}
            style={{ marginLeft: 'auto' }}
          />
        )}
      </div>
      {setups.plans.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
          <h3 style={{ marginBottom: '6px' }}>No high-conviction setups right now</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: 0 }}>
            {isUS
              ? 'Nothing on the US momentum radar clears the 45/100 conviction threshold. Check back as the session develops.'
              : 'Nothing on the futures radar clears the 45/100 conviction threshold. Check back after fresh OI data.'}
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
                <th style={{ textAlign: 'right' }}>Target{isUS ? ' (1.5R)' : ''}</th>
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
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{cur}{fmt(p.entry)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red-loss)' }}>{cur}{fmt(p.stop)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--green-gain)' }}>
                    {cur}{fmt(p.target)}
                    {!isUS && <span style={{ marginLeft: '5px', fontSize: '10px', color: 'var(--text-secondary)' }}>{p.levels_locked ? 'locked' : '2R'}</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{fmt(p.qty, 0)}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="signals-footnote">
        Conviction = {isUS ? 'volume intensity' : 'OI intensity'} + price momentum + liquidity + options-flow agreement + index bias + intraday & regime alignment (0–100, threshold 45).
        {!isUS && ' New India setups use a tighter stop with a 2:1 gross target; existing open plans retain their locked original levels. This revised execution policy is not backtest-validated.'}
        *Qty sized so a stop-out loses {setups.risk_pct}% of {cur}{fmt(setups.capital, 0)} capital, scaled by the volatility regime (×{regime.vol_scale}) — not rounded to lot size.
        Signals are analytics, not investment advice.
      </p>
      </div>

      <SignalsPortfolio market={isUS ? 'US' : 'IN'} />
    </div>
  );
};

export default MarketSignals;
