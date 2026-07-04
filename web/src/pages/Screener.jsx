import React, { useState, useMemo } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageHeader } from '../components/ui';

const COLUMNS = [
  { key: 'ticker', label: 'Ticker', numeric: false },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'marketCap', label: 'Mkt Cap (B)', numeric: true },
  { key: 'peRatio', label: 'P/E (TTM)', numeric: true },
  { key: 'roe', label: 'ROE (%)', numeric: true },
  { key: 'epsGrowth', label: 'EPS Grw (%)', numeric: true },
  { key: 'divYield', label: 'Div Yield (%)', numeric: true },
  { key: 'momentum', label: 'Momentum (%)', numeric: true, optional: true },
  { key: 'alphaScore', label: 'Alpha Score', numeric: true },
];

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};

// Guru presets fill the filter boxes transparently — users can see and tweak
// exactly what each screen applies before running it.
const GURU_SCREENS = {
  buffett: {
    name: 'Buffett', icon: '🏛', accent: 'var(--primary-gold)',
    desc: 'Quality at a fair price: durable profitability (ROE ≥ 15%), sensible valuation (P/E ≤ 25), still growing (EPS ≥ 5%), strong Alpha Score.',
    filters: { maxPe: '25', minDiv: '', minRoe: '15', minEpsGrowth: '5', minMomentum: '', minAlphaScore: '60' },
    sort: 'alphaScore',
  },
  minervini: {
    name: 'Minervini', icon: '🚀', accent: 'var(--primary-accent)',
    desc: 'SEPA-style leaders: strong multi-timeframe momentum (≥ 15%) with accelerating earnings (EPS growth ≥ 20%). Trend first, valuation second.',
    filters: { maxPe: '', minDiv: '', minRoe: '', minEpsGrowth: '20', minMomentum: '15', minAlphaScore: '' },
    sort: 'momentum',
  },
  greenblatt: {
    name: 'Greenblatt', icon: '🧮', accent: 'var(--green-gain)',
    desc: 'Magic Formula proxy: good businesses (ROE ≥ 20% for return on capital) at cheap prices (P/E ≤ 20 for earnings yield ≥ 5%).',
    filters: { maxPe: '20', minDiv: '', minRoe: '20', minEpsGrowth: '', minMomentum: '', minAlphaScore: '' },
    sort: 'roe',
  },
};

// Named universes resolved server-side (backend holds the ticker lists)
const UNIVERSES = {
  'Nifty 100': { key: 'nifty100', count: 100, desc: 'Large-cap NSE (India)' },
  'Nifty 200': { key: 'nifty200', count: 200, desc: 'Large & mid-cap NSE (India)' },
  'S&P 100': { key: 'sp100', count: 100, desc: 'US mega-cap' },
  'Nasdaq 100': { key: 'nasdaq100', count: 100, desc: 'US tech & growth' },
};

const Screener = () => {
  const [data, setData] = useState([]);
  const [hasRun, setHasRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const [tickers, setTickers] = useState("AAPL, MSFT, NVDA, RELIANCE.NS, TCS.NS, HDFCBANK.NS");
  const [maxPe, setMaxPe] = useState("");
  const [minDiv, setMinDiv] = useState("");
  const [minRoe, setMinRoe] = useState("");
  const [minEpsGrowth, setMinEpsGrowth] = useState("");
  const [minMomentum, setMinMomentum] = useState("");
  const [minAlphaScore, setMinAlphaScore] = useState("");
  const [preset, setPreset] = useState("Custom");
  const [scanMeta, setScanMeta] = useState(null);
  const [activeGuru, setActiveGuru] = useState(null);

  const [sortKey, setSortKey] = useState('marketCap');
  const [sortDir, setSortDir] = useState('desc');

  const applyGuru = (key) => {
    const g = GURU_SCREENS[key];
    if (activeGuru === key) {
      // Toggle off — clear the filters it set
      setActiveGuru(null);
      setMaxPe(''); setMinDiv(''); setMinRoe(''); setMinEpsGrowth(''); setMinMomentum(''); setMinAlphaScore('');
      return;
    }
    setActiveGuru(key);
    setMaxPe(g.filters.maxPe);
    setMinDiv(g.filters.minDiv);
    setMinRoe(g.filters.minRoe);
    setMinEpsGrowth(g.filters.minEpsGrowth);
    setMinMomentum(g.filters.minMomentum);
    setMinAlphaScore(g.filters.minAlphaScore);
    setSortKey(g.sort);
    setSortDir('desc');
    if (preset === 'Custom') setPreset('Nifty 100');
  };

  const isUniverse = preset !== 'Custom';
  const universeMeta = UNIVERSES[preset];
  const requestedCount = isUniverse
    ? (universeMeta?.count || 0)
    : tickers.split(',').filter(t => t.trim()).length;

  const handlePresetChange = (e) => {
    // Universe ticker lists live on the backend; switching a preset only
    // changes which universe key we send (custom tickers stay intact).
    setPreset(e.target.value);
  };

  const fetchScreener = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setAiReport("");
    try {
      const payload = {};
      if (isUniverse && universeMeta) {
        payload.universe = universeMeta.key;
      } else {
        payload.tickers = tickers;
      }
      if (maxPe) payload.max_pe = parseFloat(maxPe);
      if (minDiv) payload.min_div_yield = parseFloat(minDiv);
      if (minRoe) payload.min_roe = parseFloat(minRoe);
      if (minEpsGrowth) payload.min_eps_growth = parseFloat(minEpsGrowth);
      if (minMomentum) payload.min_momentum = parseFloat(minMomentum);
      if (minAlphaScore) payload.min_alpha_score = parseFloat(minAlphaScore);
      const res = await axios.post('/api/screener', payload);
      setData(res.data.data);
      setScanMeta({
        requested: res.data.requested ?? requestedCount,
        scanned: res.data.scanned ?? res.data.data.length,
        truncated: res.data.truncated ?? false,
      });
      setHasRun(true);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Failed to fetch screener data");
    }
    setLoading(false);
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'ticker' ? 'asc' : 'desc');
    }
  };

  const sortedData = useMemo(() => {
    const rows = [...data];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Push null/undefined metrics to the bottom regardless of direction
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const sortIndicator = (key) => {
    if (sortKey !== key) return <span style={{ opacity: 0.3 }}> ↕</span>;
    return <span style={{ color: 'var(--primary-gold)' }}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>;
  };

  // Momentum is only computed when its filter is used — hide the column otherwise
  const hasMomentum = data.some(r => r.momentum !== null && r.momentum !== undefined);
  const visibleColumns = COLUMNS.filter(c => !c.optional || hasMomentum);

  const runAiAnalysis = async () => {
    if (data.length === 0) return;
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please enter a Gemini API Key in the sidebar.");
      return;
    }
    setAiLoading(true);
    setAiReport("");
    try {
      const res = await axios.post('/api/ai/screener', {
        screener_data: data,
        apiKey: apiKey
      });
      setAiReport(res.data.report);
    } catch (err) {
      alert("Error fetching AI analysis: " + err.message);
    }
    setAiLoading(false);
  };

  return (
    <div>
      <PageHeader code="EQS" title="Quantitative Screener" subtitle="Live trailing institutional metrics across a custom ticker universe." />

      <div style={{ display: 'flex', gap: '10px', margin: '16px 0 12px 0', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Guru screens:</span>
        {Object.entries(GURU_SCREENS).map(([key, g]) => (
          <button
            key={key}
            type="button"
            onClick={() => applyGuru(key)}
            className="secondary"
            style={{
              width: 'auto', padding: '8px 16px', borderRadius: '18px', fontSize: '13px',
              border: `1px solid ${activeGuru === key ? g.accent : 'var(--border-color)'}`,
              color: activeGuru === key ? g.accent : 'var(--text-primary)',
              boxShadow: activeGuru === key ? `0 0 12px ${g.accent}33` : 'none'
            }}
          >
            {g.icon} {g.name}
          </button>
        ))}
      </div>

      {activeGuru && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: '14px', fontSize: '13px', color: 'var(--text-secondary)', borderLeft: `3px solid ${GURU_SCREENS[activeGuru].accent}` }}>
          <strong style={{ color: GURU_SCREENS[activeGuru].accent }}>{GURU_SCREENS[activeGuru].icon} {GURU_SCREENS[activeGuru].name} screen:</strong>{' '}
          {GURU_SCREENS[activeGuru].desc} The filter boxes below now hold these criteria — tweak them freely, then RUN SCREEN.
        </div>
      )}

      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        <form onSubmit={fetchScreener} className="screener-form">
          <div className="form-group screener-universe-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Screener Universe</label>
              <select
                value={preset}
                onChange={handlePresetChange}
                style={{ width: '100%', marginBottom: 0 }}
              >
                <option value="Custom">Custom tickers</option>
                {Object.entries(UNIVERSES).map(([name, meta]) => (
                  <option key={name} value={name}>{name} ({meta.count} stocks)</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 3, minWidth: 0 }}>
              {isUniverse ? (
                <>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Universe</label>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '11px 16px', borderRadius: '10px',
                      background: 'var(--primary-accent-soft)',
                      border: '1px solid var(--primary-accent-border)',
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>📊</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--primary-accent)' }}>
                        {preset} — scanning {universeMeta?.count} stocks
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {universeMeta?.desc}. Live metrics fetched on demand.
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Tickers (Comma-separated)</label>
                  <input
                    type="text"
                    value={tickers}
                    onChange={(e) => { setTickers(e.target.value); setPreset("Custom"); }}
                    onFocus={(e) => e.target.select()}
                    required
                    style={{ width: '100%', marginBottom: 0 }}
                  />
                </>
              )}
            </div>
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Max P/E Ratio (Optional)</label>
            <input
              type="number"
              step="0.1"
              value={maxPe}
              onChange={(e) => setMaxPe(e.target.value)}
              placeholder="e.g. 50"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Min Div Yield %</label>
            <input
              type="number"
              step="0.1"
              value={minDiv}
              onChange={(e) => setMinDiv(e.target.value)}
              placeholder="e.g. 1.5"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Min ROE %</label>
            <input
              type="number"
              step="0.1"
              value={minRoe}
              onChange={(e) => setMinRoe(e.target.value)}
              placeholder="e.g. 15"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Min EPS Grw. %</label>
            <input
              type="number"
              step="0.1"
              value={minEpsGrowth}
              onChange={(e) => setMinEpsGrowth(e.target.value)}
              placeholder="e.g. 10"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }} title="Composite of 1M, 6M and 12M returns — same as the Momentum Leaders tab. Adds price history per stock, so large scans take a bit longer.">
              Min Momentum % 🚀
            </label>
            <input
              type="number"
              step="0.1"
              value={minMomentum}
              onChange={(e) => setMinMomentum(e.target.value)}
              placeholder="e.g. 15"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }} title="Alpha Nova Score 0-100 (est.) — same formula as the DCF tab: valuation margin of safety, business predictability and P/E bonus.">
              Min Alpha Score ✨
            </label>
            <input
              type="number"
              step="1"
              min="0"
              max="99"
              value={minAlphaScore}
              onChange={(e) => setMinAlphaScore(e.target.value)}
              placeholder="e.g. 60"
              style={{ width: '100%', marginBottom: 0 }}
            />
          </div>
          <div className="form-group screener-submit" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', height: 'fit-content' }}>
              {loading ? <><span className="spinner"></span> SCANNING...</> : 'RUN SCREEN'}
            </button>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="table-container" style={{ padding: '24px' }}>
          <div className="skeleton skeleton-header"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton skeleton-row" style={{ height: '40px', marginTop: '16px' }}></div>
          ))}
        </div>
      ) : error ? (
        <div className="error" style={{ color: 'var(--red-loss)', padding: '20px', backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ marginBottom: '8px', fontSize: '16px', color: 'var(--red-loss)' }}>Screening Failed</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
          <button onClick={fetchScreener} style={{ width: 'auto', padding: '8px 16px', background: 'rgba(255, 69, 58, 0.15)', border: '1px solid var(--red-loss)', color: 'var(--red-loss)' }}>Retry</button>
        </div>
      ) : (
        data.length > 0 ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{data.length}</strong> of {scanMeta?.scanned ?? requestedCount} stocks passed the screen
                {scanMeta?.truncated && (
                  <span style={{ color: 'var(--primary-gold)', marginLeft: '8px' }}>
                    (scanned {scanMeta.scanned}/{scanMeta.requested} within time budget)
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Tap a column header to sort</span>
            </div>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    {visibleColumns.map(col => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        style={{ textAlign: col.numeric ? 'right' : 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                        title={`Sort by ${col.label}`}
                      >
                        {col.label}{sortIndicator(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((row) => (
                    <tr key={row.ticker}>
                      <td style={{fontWeight: '600'}}>{row.ticker}</td>
                      <td style={{textAlign: 'right'}}>{currencyFor(row.ticker)}{row.price.toFixed(2)}</td>
                      <td style={{textAlign: 'right'}}>{currencyFor(row.ticker)}{row.marketCap.toFixed(2)}</td>
                      <td style={{textAlign: 'right'}}>{row.peRatio ? row.peRatio.toFixed(2) : 'N/A'}</td>
                      <td style={{textAlign: 'right'}}>{row.roe ? row.roe.toFixed(2) + '%' : 'N/A'}</td>
                      <td style={{textAlign: 'right', color: row.epsGrowth > 0 ? 'var(--green-gain)' : (row.epsGrowth < 0 ? 'var(--red-loss)' : 'inherit')}}>{row.epsGrowth ? row.epsGrowth.toFixed(2) + '%' : 'N/A'}</td>
                      <td style={{textAlign: 'right', color: row.divYield > 0 ? 'var(--green-gain)' : 'inherit'}}>{row.divYield.toFixed(2)}%</td>
                      {hasMomentum && (
                        <td style={{textAlign: 'right', color: row.momentum > 0 ? 'var(--green-gain)' : (row.momentum < 0 ? 'var(--red-loss)' : 'inherit')}}>
                          {row.momentum !== null && row.momentum !== undefined ? `${row.momentum > 0 ? '+' : ''}${row.momentum.toFixed(2)}%` : 'N/A'}
                        </td>
                      )}
                      <td style={{textAlign: 'right', fontWeight: 700, color: row.alphaScore >= 60 ? 'var(--primary-gold)' : row.alphaScore ? 'var(--text-secondary)' : 'inherit'}}>
                        {row.alphaScore ?? 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : hasRun ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <h3 style={{ marginBottom: '8px' }}>No stocks passed your filters</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
              All {scanMeta?.scanned ?? requestedCount} stocks were screened out. Try relaxing the P/E, dividend, ROE, or EPS growth limits.
            </p>
          </div>
        ) : (
          <p style={{marginTop: '20px', color: 'var(--text-secondary)'}}>Click RUN SCREEN to analyze the market, or adjust your filters.</p>
        )
      )}

      {data.length > 0 && !loading && (
        <div style={{ marginTop: '40px' }}>
          {!aiReport ? (
            <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
              {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "⚡ GENERATE GEMINI AI SCREENER INSIGHT"}
            </button>
          ) : (
            <div className="ai-insight">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                <h3>Gemini Quant Screener Analysis</h3>
                <button onClick={runAiAnalysis} disabled={aiLoading} style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }} className="secondary">
                  {aiLoading ? <><span className="spinner"></span> RE-ANALYZING...</> : "REFRESH"}
                </button>
              </div>
              <div className="ai-insight-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiReport}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Screener;
