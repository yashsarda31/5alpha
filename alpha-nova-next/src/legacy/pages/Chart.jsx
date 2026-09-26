import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import TradingViewChart from '../components/TradingViewChart';
import TickerSearch from '../components/TickerSearch';
import ShareButton from '../components/ShareButton';
import LazyMarkdown from '../components/LazyMarkdown';
import { useMarket } from '../MarketContext';

import WatchlistStar from '../components/WatchlistStar';
import useAutoAiInsight from '../lib/useAutoAiInsight';
import { createLatestRequestGuard } from '../lib/latestRequest';
import { markFirstRunStep, trackProductEvent } from '../lib/productAnalytics.js';
import { chartTechnicalSignal } from '../lib/chartTechnicalSignal';
import { ema, bollinger } from '../../lib/indicators.js';
import './Chart.css';

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};

const defaultTickerForMarket = (market) => market === 'US' ? 'NVDA' : 'RELIANCE.NS';

const useIsNarrow = (px = 700) => {
  const [narrow, setNarrow] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(`(max-width: ${px}px)`).matches
      : false
  ));

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const onChange = (event) => setNarrow(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [px]);

  return narrow;
};

const Chart = ({ embedded = false, intradayData }) => {
  const { market } = useMarket();
  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(searchParams.get('symbol') || defaultTickerForMarket(market));
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState('daily');
  const [chartData, setChartData] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [showEma20, setShowEma20] = useState(true);
  const [showEma50, setShowEma50] = useState(false);
  const [showBb, setShowBb] = useState(true);
  const [showRsi, setShowRsi] = useState(true);
  const requestGuardRef = useRef(createLatestRequestGuard());
  const aiRequestGuardRef = useRef(createLatestRequestGuard());
  const loadedTicker = chartData?.ticker || '';

  const fetchChart = async (sym = ticker) => {
    if (!sym || !sym.trim()) return;
    const requestId = requestGuardRef.current.begin();
    aiRequestGuardRef.current.begin();
    setAiLoading(false);
    setLoading(true);
    setChartData(null);
    setFundamentals(null);
    setAiReport("");
    setFetchError("");
    try {
      const resChart = await axios.get(`/api/chart/${sym.trim()}`);
      if (!requestGuardRef.current.isCurrent(requestId)) return;
      // The backend resolves bare NSE symbols (RELIANCE → RELIANCE.NS);
      // adopt the resolved name so the ₹/$ currency and star are right.
      const resolved = resChart.data.ticker || sym.trim();
      setChartData({ ...resChart.data, ticker: resolved });
      if (resolved !== ticker) setTicker(resolved);
      const market = resolved.endsWith('.NS') || resolved.endsWith('.BO') ? 'IN' : 'US';
      markFirstRunStep('analyse');
      void trackProductEvent('analyse_loaded', { route: '/chart', market });
      const resFund = await axios.get(`/api/fundamentals/${resolved}`).catch(() => ({ data: null }));
      if (!requestGuardRef.current.isCurrent(requestId)) return;
      if (resFund.data && !resFund.data.error) {
        setFundamentals(resFund.data);
      }
    } catch (err) {
      if (!requestGuardRef.current.isCurrent(requestId)) return;
      setFetchError(err.response?.status === 404
        ? `"${sym.trim()}" not found — try the full Yahoo symbol (e.g. RELIANCE.NS, AAPL).`
        : `Could not load chart: ${err.message}`);
    }
    if (requestGuardRef.current.isCurrent(requestId)) setLoading(false);
  };

  useEffect(() => {
    const sym = searchParams.get('symbol') || defaultTickerForMarket(market);
    setTicker(sym);
    fetchChart(sym);
    // fetchChart intentionally stays behind the latest-request guard; adding it
    // to dependencies would recreate the function and refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, market]);

  const runAiAnalysis = async () => {
    if (!chartData) return;
    const requestId = aiRequestGuardRef.current.begin();
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setAiReport('**Add your Gemini API key in Settings to generate the market insight.**');
      return;
    }

    const lastIdx = chartData.close.length - 1;
    const cur = currencyFor(loadedTicker);
    const asLabel = (value) => Number.isFinite(value) ? value.toFixed(2) : 'N/A';
    const close = chartData.close[lastIdx];
    const sma20 = chartData.sma20?.[lastIdx];
    const data_summary = `Ticker: ${loadedTicker}
    Latest Close: ${cur}${asLabel(close)}
    Latest High: ${cur}${asLabel(chartData.high?.[lastIdx])}
    Latest Low: ${cur}${asLabel(chartData.low?.[lastIdx])}
    Current 20 SMA: ${cur}${asLabel(sma20)}
    Distance from 20 SMA: ${Number.isFinite(close) && Number.isFinite(sma20) && sma20 !== 0 ? `${asLabel((close / sma20 - 1) * 100)}%` : 'N/A'}
    Latest 14-period RSI: ${asLabel(chartData.rsi?.[lastIdx])}
    Minervini VCP Rating (0-5 stars): ${chartData.vcp_rating}
    `;

    setAiLoading(true);
    setAiReport("");
    try {
      const res = await axios.post('/api/ai/chart', {
        ticker: loadedTicker,
        data_summary: data_summary,
        apiKey: apiKey
      });
      if (!aiRequestGuardRef.current.isCurrent(requestId)) return;
      setAiReport(res.data.report);
    } catch (err) {
      if (!aiRequestGuardRef.current.isCurrent(requestId)) return;
      // Inline, not alert() — this can run unattended via auto-insight
      setAiReport(`**Error generating analysis:** ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  // With a saved Gemini key, the technical insight generates itself as soon
  // as a chart loads — no click needed on first run.
  useAutoAiInsight(loadedTicker || null, runAiAnalysis);

  const lastPrice = chartData && Number.isFinite(chartData.close?.at(-1)) ? chartData.close.at(-1) : null;
  const prevPrice = chartData && Number.isFinite(chartData.close?.at(-2)) ? chartData.close.at(-2) : null;
  const change = lastPrice !== null && prevPrice !== null ? lastPrice - prevPrice : null;
  const changePercent = change !== null && prevPrice !== 0 ? (change / prevPrice) * 100 : null;

  const getTechnicalSignal = () => chartTechnicalSignal(chartData);

  const ema20 = chartData ? ema(chartData.close, 20) : null;
  const ema50 = chartData ? ema(chartData.close, 50) : null;
  const bb = chartData ? bollinger(chartData.close, 20, 2) : null;

  // Values arrive as raw numbers; format here so float noise never renders
  const fmtPct = (val) => (
    val === "N/A" || val === null || val === undefined || isNaN(val)
      ? "N/A" : `${Number(val).toFixed(2)}%`
  );

  const renderDashRow = (label, current, forward, conditionGood) => {
    const formatVal = (val) => {
      if (val === "N/A" || val === null || val === undefined) return "N/A";
      if (typeof val === 'number') return val.toFixed(2);
      return val;
    };
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bg-panel)', fontSize: '13px' }}>
        <div style={{ flex: 1.5, color: 'var(--text-secondary)' }}>{label}</div>
        <div style={{ flex: 1, textAlign: 'center' }}>{formatVal(current)}</div>
        <div style={{ flex: 1, textAlign: 'center', color: 'var(--text-secondary)' }}>{formatVal(forward)}</div>
        <div style={{ width: '24px', textAlign: 'right', fontWeight: 'bold' }}>
          {conditionGood ? (
            <span style={{ color: 'var(--green-gain)' }}>✓</span>
          ) : (
            <span style={{ color: 'var(--red-loss)' }}>✗</span>
          )}
        </div>
      </div>
    );
  };

  const techSignal = getTechnicalSignal();
  const cur = currencyFor(loadedTicker);
  return (
    <div className="fade-in chart-page">
      {!embedded && <div className="chart-toolbar">
        <p className="chart-page-label">Analyse</p>
        <div className="chart-search-controls">
          <div className="chart-search-input">
            <TickerSearch
              value={ticker}
              onChange={setTicker}
              onSelect={(sym) => fetchChart(sym)}
              placeholder="Ticker or company name…"
              inputProps={{ 'aria-label': 'Search ticker or company', onKeyDown: (e) => { if (e.key === 'Enter' && !loading) fetchChart(); } }}
            />
          </div>
          <button onClick={() => fetchChart()} disabled={loading} style={{ width: 'auto' }}>
            {loading ? <><span className="spinner"></span> Loading…</> : "Search"}
          </button>
          {chartData && (
            <ShareButton
              label="Share"
              filename={`alpha-nova-${loadedTicker.replace(/\W+/g, '-')}.png`}
              shareText={`${loadedTicker} technical analysis — Alpha Nova`}
              capture={() => document.getElementById('chart-analysis')}
            />
          )}
        </div>
      </div>}

      {fetchError && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: '20px', border: '1px solid rgba(255,69,58,0.4)', color: 'var(--red-loss)', fontSize: '14px' }}>
          ⚠ {fetchError}
        </div>
      )}

      {chartData ? (
        <div id="chart-analysis" className="card chart-analysis-card">
          {!embedded && (
          <header className="chart-instrument-header">
            <div>
              <div className="chart-instrument-title">
                <h1>{fundamentals?.shortName || fundamentals?.longName || loadedTicker}</h1>
                <WatchlistStar symbol={loadedTicker} market={/\.(NS|BO)$/i.test(loadedTicker) ? 'IN' : 'US'} size={22} />
              </div>
              <div className="chart-quote">
                <strong>{lastPrice === null ? 'N/A' : `${cur}${lastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong>
                <span style={{ color: change === null ? 'var(--text-secondary)' : change >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
                  {change === null || changePercent === null ? 'Change unavailable' : `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`}
                </span>
              </div>
              <p className="chart-quote-date">{loadedTicker} · Latest chart close · {chartData.dates[chartData.dates.length - 1]}</p>
            </div>
          </header>
          )}
          <div className="chart-timeframe" role="group" aria-label="Chart timeframe">
            <button type="button" aria-pressed={timeframe === 'daily'} onClick={() => setTimeframe('daily')}>Daily</button>
            <button type="button" aria-pressed={timeframe === '30m'} disabled={!intradayData} onClick={() => setTimeframe('30m')}>Intraday</button>
            <span>TradingView chart · Alpha Nova price data</span>
          </div>
          <div className="chart-timeframe" role="group" aria-label="Indicator overlays">
            <button type="button" aria-pressed={showEma20} onClick={() => setShowEma20((v) => !v)}>EMA20</button>
            <button type="button" aria-pressed={showEma50} onClick={() => setShowEma50((v) => !v)}>EMA50</button>
            <button type="button" aria-pressed={showBb} onClick={() => setShowBb((v) => !v)}>BB 20</button>
            <button type="button" aria-pressed={showRsi} onClick={() => setShowRsi((v) => !v)}>RSI</button>
            <span>EMA · Bollinger 20,2 · RSI 14 — computed locally</span>
          </div>
          <div className="chart-main-row">
            <div className="chart-plot-pane">
              <TradingViewChart data={timeframe === '30m' && intradayData ? intradayData : chartData} intraday={timeframe === '30m' && !!intradayData} overlays={{ ema20, ema50, bbUpper: bb?.upper, bbLower: bb?.lower, showEma20, showEma50, showBb, showRsi }} />
            </div>

            <div className="chart-stock-pro">
              <h2 className="chart-evidence-title">Technical evidence</h2>

              <div style={{ padding: '16px', backgroundColor: techSignal.bg, border: `1px solid ${techSignal.border}`, borderRadius: '8px', marginBottom: '30px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '1px' }}>TECHNICAL SIGNAL</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: techSignal.color, letterSpacing: '2px' }}>{techSignal.signal}</div>
              </div>

              <div className="chart-score-grid">
                <div className="stat-box">
                  <div className="stat-label">VCP RATING</div>
                  <div className="stat-value chart-score-value">
                    {'★'.repeat(chartData.vcp_rating || 0)}{'☆'.repeat(5 - (chartData.vcp_rating || 0))}
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-label">ALPHA SCORE</div>
                  <div className="stat-value chart-score-value">
                    {fundamentals?.alphaScore ?? 'N/A'}
                  </div>
                </div>
              </div>

              {fundamentals ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                    <div style={{ flex: 1.5 }}>METRIC</div>
                    <div style={{ flex: 1, textAlign: 'center' }}>CURRENT</div>
                    <div style={{ flex: 1, textAlign: 'center' }}>FWD / AVG</div>
                    <div style={{ width: '24px', textAlign: 'right' }}>STAT</div>
                  </div>

                  {renderDashRow("P/E Ratio", fundamentals.trailingPE, fundamentals.forwardPE, fundamentals.forwardPE !== "N/A" && fundamentals.forwardPE < fundamentals.trailingPE)}
                  {renderDashRow("EPS (TTM)", fundamentals.trailingEps, fundamentals.forwardEps, fundamentals.forwardEps !== "N/A" && fundamentals.forwardEps > fundamentals.trailingEps)}
                  {renderDashRow("EPS Growth", fmtPct(fundamentals.earningsGrowth), "N/A", fundamentals.earningsGrowth > 0)}
                  {renderDashRow("ROE", fmtPct(fundamentals.returnOnEquity), "N/A", fundamentals.returnOnEquity > 15)}
                  {renderDashRow("Debt / Equity", fmtPct(fundamentals.debtToEquity), "N/A", fundamentals.debtToEquity !== "N/A" && fundamentals.debtToEquity < 100)}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <div>Fundamental data unavailable</div>
                </div>
              )}
            </div>
          </div>

          <div className="stats-grid chart-summary-grid">
            <div className="stat-box">
              <div className="stat-label">DAY HIGH</div>
              <div className="stat-value">{Number.isFinite(chartData.high?.at(-1)) ? `${cur}${chartData.high.at(-1).toFixed(2)}` : 'N/A'}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">DAY LOW</div>
              <div className="stat-value">{Number.isFinite(chartData.low?.at(-1)) ? `${cur}${chartData.low.at(-1).toFixed(2)}` : 'N/A'}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">VOLUME</div>
              <div className="stat-value">{Number.isFinite(chartData.volume?.at(-1)) ? `${(chartData.volume.at(-1) / 1e6).toFixed(2)}M` : 'N/A'}</div>
            </div>
          </div>

          <div className="chart-ai-section">
            {!aiReport ? (
              <button data-noshare="" onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
                {aiLoading ? <><span className="spinner"></span> Explaining chart…</> : "Explain this chart"}
              </button>
            ) : (
              <div className="ai-insight">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                  <h3>Chart explanation</h3>
                  <button onClick={runAiAnalysis} disabled={aiLoading} style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }} className="secondary">
                    {aiLoading ? <><span className="spinner"></span> Updating…</> : "Refresh"}
                  </button>
                </div>
                <div className="ai-insight-content">
                  <LazyMarkdown>{aiReport}</LazyMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', textAlign: 'center' }}>
          <h3 style={{ color: 'var(--text-secondary)' }}>{loading ? 'Loading chart…' : 'Choose an instrument'}</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '300px' }}>Search for a symbol above to explore its available price history and technical evidence.</p>
        </div>
      )}
    </div>
  );
};

export default Chart;

