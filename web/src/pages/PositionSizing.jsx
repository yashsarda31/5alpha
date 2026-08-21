import React, { useState, useEffect } from 'react';
import axios from 'axios';
import LazyMarkdown from '../components/LazyMarkdown';
import { PageHeader, StatTile, StatGrid } from '../components/ui';
import TickerSearch from '../components/TickerSearch';
import ShareButton from '../components/ShareButton';
import useAutoAiInsight from '../lib/useAutoAiInsight';
import './PositionSizing.css';

const PREFS_KEY = 'alphanova_sizing_prefs';
const SIZED_KEY = 'alphanova_sized_today'; // read by the Discipline Arena's "planned a trade" quest

const loadPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
};

const R_TARGETS = [1, 1.5, 2, 3];

const PositionSizing = () => {
  const [market, setMarket] = useState(() => (loadPrefs().market === 'US' ? 'US' : 'IN'));
  const [capital, setCapital] = useState(() => {
    const p = loadPrefs();
    return Number.isFinite(p.capital) ? p.capital : 100000;
  });
  const [riskPercent, setRiskPercent] = useState(() => {
    const p = loadPrefs();
    return Number.isFinite(p.riskPercent) ? p.riskPercent : 1;
  });
  const [entryPrice, setEntryPrice] = useState(100);
  const [stopLoss, setStopLoss] = useState(95);
  const [symbol, setSymbol] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState('');

  const cur = market === 'US' ? '$' : '₹';
  const locale = market === 'US' ? 'en-US' : 'en-IN';
  const fmt = (v, nd = 2) => (Number.isFinite(v)
    ? v.toLocaleString(locale, { minimumFractionDigits: nd, maximumFractionDigits: nd })
    : '—');

  // Remember the slow-changing inputs; entry/stop are per-trade.
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ capital, riskPercent, market })); } catch { /* private mode */ }
  }, [capital, riskPercent, market]);

  // Using the calculator counts as "planned a trade" for the Discipline Arena.
  const stampSized = () => {
    try { localStorage.setItem(SIZED_KEY, new Date().toISOString().split('T')[0]); } catch { /* private mode */ }
  };

  const riskAmount = (capital * riskPercent) / 100;
  const riskPerShare = entryPrice - stopLoss;
  const shares = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const positionSize = shares * entryPrice;
  const percentOfCapital = capital > 0 ? (positionSize / capital) * 100 : 0;
  const stopPct = entryPrice > 0 && riskPerShare > 0 ? (riskPerShare / entryPrice) * 100 : null;

  const warnings = [];
  if (entryPrice > 0 && stopLoss >= entryPrice) warnings.push('Stop must sit below entry for a long trade — risk per share is zero or negative.');
  if (riskPercent > 2) warnings.push(`Risking ${riskPercent}% of the account per trade is aggressive — professionals usually stay at or under 2%.`);
  if (positionSize > capital && shares > 0) warnings.push('The position is bigger than your capital — this needs margin/leverage.');

  // Selecting a ticker prefills entry with the latest close (editable after).
  const prefillPrice = async (sym) => {
    setPriceNote('Fetching latest price…');
    try {
      const res = await axios.get(`/api/chart/${sym.trim()}`);
      const closes = (res.data.close || []).filter((v) => Number.isFinite(v));
      const last = closes[closes.length - 1];
      if (Number.isFinite(last)) {
        setEntryPrice(last);
        setStopLoss(Math.round(last * 0.95 * 100) / 100);
        setMarket(res.data.ticker && res.data.ticker.endsWith('.NS') ? 'IN' : 'US');
        setPriceNote(`Entry prefilled from ${res.data.ticker} last close.`);
        stampSized();
      } else {
        setPriceNote('No price found — enter it manually.');
      }
    } catch {
      setPriceNote('Could not fetch the price — enter it manually.');
    }
  };

  const runAiAnalysis = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setAiReport('**Add your Gemini API key in Settings to generate the sizing brief.**');
      return;
    }
    setAiLoading(true);
    setAiReport('');
    try {
      const res = await axios.post('/api/ai/position-sizing', {
        capital,
        risk_percent: riskPercent,
        entry_price: entryPrice,
        stop_loss: stopLoss,
        shares,
        apiKey,
      });
      setAiReport(res.data.report);
    } catch (err) {
      // Inline, not alert() — this can run unattended via auto-insight
      setAiReport(`**Error generating analysis:** ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  // The calculator always has live values, so with a saved Gemini key the
  // risk insight generates itself once on first visit.
  useAutoAiInsight('mount', runAiAnalysis);

  const numInput = (setter) => (e) => {
    setter(Number(e.target.value));
    stampSized();
  };

  const toggleStyle = (on) => ({
    width: 'auto', padding: '8px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    borderRadius: '8px', border: `1px solid ${on ? 'var(--primary-gold, #F5DC8C)' : 'var(--glass-border, rgba(255,255,255,0.12))'}`,
    background: on ? 'rgba(245,220,140,0.12)' : 'transparent',
    color: on ? 'var(--primary-gold, #F5DC8C)' : 'var(--text-secondary, #A1A1AA)',
  });

  return (
    <div className="fade-in">
      <PageHeader
        code="SIZE"
        title="Position Sizing"
        subtitle="Turn capital, risk and stop into an exact trade plan — quantity, exposure and R-multiple targets."
        right={
          <ShareButton
            label="Share plan"
            filename="alpha-nova-trade-plan.png"
            shareText="My trade plan — Alpha Nova position sizing"
            capture={() => document.getElementById('sizing-analysis')}
          />
        }
      />

      <div id="sizing-analysis" className="ps-grid">
        <div className="card">
          <div className="ps-form-head">
            <h3>Trade Parameters</h3>
            <div className="ps-toggle" data-noshare="">
              <button type="button" onClick={() => setMarket('IN')} style={toggleStyle(market === 'IN')} aria-pressed={market === 'IN'}>NSE ₹</button>
              <button type="button" onClick={() => setMarket('US')} style={toggleStyle(market === 'US')} aria-pressed={market === 'US'}>US $</button>
            </div>
          </div>

          <label>Symbol (optional — prefills entry price)</label>
          <TickerSearch
            value={symbol}
            onChange={setSymbol}
            onSelect={prefillPrice}
            placeholder={market === 'IN' ? 'e.g. Tata Motors' : 'e.g. Apple'}
          />
          {priceNote && <div className="ps-price-note">{priceNote}</div>}

          <label>Total Account Capital ({cur})</label>
          <input
            type="number"
            value={capital}
            onChange={numInput(setCapital)}
            placeholder="e.g. 100000"
          />

          <label>Account Risk per Trade (%)</label>
          <div className="ps-risk-row">
            <input
              type="number"
              step="0.1"
              value={riskPercent}
              onChange={numInput(setRiskPercent)}
              placeholder="e.g. 1"
            />
            <div className="ps-presets" data-noshare="">
              {[0.5, 1, 2].map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`ps-preset ${riskPercent === p ? 'active' : ''}`}
                  onClick={() => { setRiskPercent(p); stampSized(); }}
                >{p}%</button>
              ))}
            </div>
          </div>

          <label>Entry Price ({cur})</label>
          <input
            type="number"
            value={entryPrice}
            onChange={numInput(setEntryPrice)}
            placeholder="e.g. 100"
          />

          <label>Stop Loss Price ({cur})</label>
          <input
            type="number"
            value={stopLoss}
            onChange={numInput(setStopLoss)}
            placeholder="e.g. 95"
          />

          {warnings.length > 0 && (
            <div className="ps-warnings">
              {warnings.map((w) => <div key={w} className="ps-warning">⚠ {w}</div>)}
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Trade Plan</h3>

          <div className="ps-hero ui-stat-tile">
            <div className="ui-stat-label">Quantity to Buy</div>
            <div className="ui-stat-value tnum tone-gold" style={{ fontSize: 34 }}>{shares.toLocaleString(locale)}</div>
            <div className="ui-stat-sub">
              {shares > 0
                ? `${cur}${fmt(positionSize)} position · ${percentOfCapital.toFixed(1)}% of capital`
                : 'Set a stop below your entry to size the trade'}
            </div>
          </div>

          <StatGrid style={{ marginTop: 12 }}>
            <StatTile label="Risk Amount" value={`${cur}${fmt(riskAmount)}`} tone="loss" sub={`${riskPercent}% of capital`} />
            <StatTile label="Risk / Share" value={riskPerShare > 0 ? `${cur}${fmt(riskPerShare)}` : '—'} sub={stopPct !== null ? `stop ${stopPct.toFixed(1)}% below entry` : undefined} />
            <StatTile label="Total Position" value={`${cur}${fmt(positionSize)}`} />
            <StatTile label="% of Capital" value={`${percentOfCapital.toFixed(2)}%`} tone={percentOfCapital > 100 ? 'loss' : 'neutral'} />
          </StatGrid>

          {shares > 0 && riskPerShare > 0 && (
            <div className="ps-targets">
              <div className="ps-targets-title">R-multiple targets — where the reward justifies the risk</div>
              <table className="ps-targets-table">
                <thead>
                  <tr><th>Target</th><th className="ps-num">Price</th><th className="ps-num">Gain</th><th className="ps-num">Profit</th><th className="ps-num">Reward : Risk</th></tr>
                </thead>
                <tbody>
                  {R_TARGETS.map((r) => {
                    const price = entryPrice + riskPerShare * r;
                    const gainPct = (riskPerShare * r / entryPrice) * 100;
                    return (
                      <tr key={r}>
                        <td className="ps-r">{r}R</td>
                        <td className="ps-num tnum">{cur}{fmt(price)}</td>
                        <td className="ps-num tnum tone-gain">+{gainPct.toFixed(1)}%</td>
                        <td className="ps-num tnum tone-gain">{cur}{fmt(riskAmount * r, 0)}</td>
                        <td className="ps-num tnum">{r} : 1</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="ps-note">
            <strong>Note:</strong> Assumes zero slippage and no commissions; targets are 1R multiples of your stop distance, not price predictions. Always verify liquidity before placing large orders.
          </div>

          <div style={{ marginTop: '24px' }} data-noshare="">
            {!aiReport ? (
              <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
                {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : 'GENERATE GEMINI AI RISK INSIGHT'}
              </button>
            ) : (
              <div className="ai-insight">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                  <h3>Gemini Risk Management</h3>
                  <button onClick={runAiAnalysis} disabled={aiLoading} style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }} className="secondary">
                    {aiLoading ? <><span className="spinner"></span> RE-ANALYZING...</> : 'REFRESH'}
                  </button>
                </div>
                <div className="ai-insight-content">
                  <LazyMarkdown>{aiReport}</LazyMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PositionSizing;
