import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Plot from '../components/Plot';
import TickerSearch from '../components/TickerSearch';
import ShareButton from '../components/ShareButton';
import LazyMarkdown from '../components/LazyMarkdown';

import WatchlistStar from '../components/WatchlistStar';
import useAutoAiInsight from '../lib/useAutoAiInsight';
import { createLatestRequestGuard } from '../lib/latestRequest';
import { markFirstRunStep, trackProductEvent } from '../lib/productAnalytics.js';
import './Chart.css';

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};

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

const Chart = () => {
  const [searchParams] = useSearchParams();
  const [ticker, setTicker] = useState(searchParams.get('symbol') || 'NVDA');
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");
  const [fetchError, setFetchError] = useState("");
  const requestGuardRef = useRef(createLatestRequestGuard());

  const fetchChart = async (sym = ticker) => {
    if (!sym || !sym.trim()) return;
    const requestId = requestGuardRef.current.begin();
    setLoading(true);
    setChartData(null);
    setFundamentals(null);
    setAiReport("");
    setFetchError("");
    try {
      const resChart = await axios.get(`/api/chart/${sym.trim()}`);
      if (!requestGuardRef.current.isCurrent(requestId)) return;
      setChartData(resChart.data);
      // The backend resolves bare NSE symbols (RELIANCE → RELIANCE.NS);
      // adopt the resolved name so the ₹/$ currency and star are right.
      const resolved = resChart.data.ticker || sym.trim();
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
    const sym = searchParams.get('symbol') || 'NVDA';
    setTicker(sym);
    fetchChart(sym);
    // fetchChart intentionally stays behind the latest-request guard; adding it
    // to dependencies would recreate the function and refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const runAiAnalysis = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setAiReport('**Add your Gemini API key in Settings to generate the market insight.**');
      return;
    }
    
    const lastIdx = chartData.close.length - 1;
    const cur = currencyFor(ticker);
    const data_summary = `Ticker: ${ticker}
    Latest Close: ${cur}${chartData.close[lastIdx].toFixed(2)}
    Latest High: ${cur}${chartData.high[lastIdx].toFixed(2)}
    Latest Low: ${cur}${chartData.low[lastIdx].toFixed(2)}
    Current 20 SMA: ${cur}${chartData.sma20[lastIdx].toFixed(2)}
    Distance from 20 SMA: ${((chartData.close[lastIdx] / chartData.sma20[lastIdx] - 1) * 100).toFixed(2)}%
    Latest 14-period RSI: ${chartData.rsi[lastIdx].toFixed(2)}
    Minervini VCP Rating (0-5 stars): ${chartData.vcp_rating}
    `;

    setAiLoading(true);
    setAiReport("");
    try {
      const res = await axios.post('/api/ai/chart', {
        ticker: ticker,
        data_summary: data_summary,
        apiKey: apiKey
      });
      setAiReport(res.data.report);
    } catch (err) {
      // Inline, not alert() — this can run unattended via auto-insight
      setAiReport(`**Error generating analysis:** ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  // With a saved Gemini key, the technical insight generates itself as soon
  // as a chart loads — no click needed on first run.
  useAutoAiInsight(chartData ? (chartData.ticker || ticker) : null, runAiAnalysis);

  const lastPrice = chartData ? chartData.close[chartData.close.length - 1] : 0;
  const prevPrice = chartData ? chartData.close[chartData.close.length - 2] : 0;
  const change = lastPrice - prevPrice;
  const changePercent = (change / prevPrice) * 100;

  const getTechnicalSignal = () => {
    if (!chartData) return { signal: 'N/A', color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' };
    const rsi = chartData.rsi[chartData.rsi.length - 1];
    const sma20 = chartData.sma20[chartData.sma20.length - 1];
    if (rsi > 70 || lastPrice < sma20 * 0.95) return { signal: 'SELL', color: 'var(--red-loss)', bg: 'rgba(255,59,48,0.1)', border: 'rgba(255,59,48,0.3)' };
    if (rsi < 30 || lastPrice > sma20 * 1.05) return { signal: 'BUY', color: 'var(--green-gain)', bg: 'rgba(52,199,89,0.1)', border: 'rgba(52,199,89,0.3)' };
    if (lastPrice > sma20) return { signal: 'BULLISH', color: 'var(--primary-gold)', bg: 'rgba(212,175,55,0.1)', border: 'rgba(212,175,55,0.3)' };
    return { signal: 'HOLD', color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' };
  };

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
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
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
  const cur = currencyFor(ticker);
  const isNarrow = useIsNarrow(700);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', gap: '20px' }}>
        <div>
          <div className="ui-ph-titlerow">
            <span className="ui-code-chip">GP</span>
            <span className="ui-ph-title">Chart Analyser</span>
          </div>
          <p className="ui-ph-subtitle" style={{ margin: '4px 0 0' }}>Advanced technical analysis and AI-driven market insights.</p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ width: '220px' }}>
            <TickerSearch
              value={ticker}
              onChange={setTicker}
              onSelect={(sym) => fetchChart(sym)}
              placeholder="Ticker or company name…"
              inputProps={{ onKeyDown: (e) => { if (e.key === 'Enter' && !loading) fetchChart(); } }}
            />
          </div>
          <button onClick={() => fetchChart()} disabled={loading} style={{ width: 'auto' }}>
            {loading ? <><span className="spinner"></span> LOAD...</> : "SEARCH"}
          </button>
          {chartData && (
            <ShareButton
              label="Share"
              filename={`alpha-nova-${ticker.replace(/\W+/g, '-')}.png`}
              shareText={`${ticker} technical analysis — Alpha Nova`}
              capture={() => document.getElementById('chart-analysis')}
            />
          )}
        </div>
      </div>

      {fetchError && (
        <div className="card" style={{ padding: '14px 18px', marginBottom: '20px', border: '1px solid rgba(255,69,58,0.4)', color: 'var(--red-loss)', fontSize: '14px' }}>
          ⚠ {fetchError}
        </div>
      )}

      {chartData ? (
        <div id="chart-analysis" className="card chart-analysis-card">
          <div className="chart-main-row">
            <div className="chart-plot-pane">
              <Plot
                data={[
                  {
                    x: chartData.dates,
                    close: chartData.close,
                    decreasing: { line: { color: '#ff3b30', width: 1.5 } },
                    high: chartData.high,
                    increasing: { line: { color: '#34c759', width: 1.5 } },
                    low: chartData.low,
                    open: chartData.open,
                    type: 'candlestick',
                    name: ticker,
                    whiskerwidth: 0.5,
                    yaxis: 'y'
                  },
                  {
                    x: chartData.dates,
                    y: chartData.sma20,
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: '#007aff', width: 2, shape: 'spline' },
                    name: 'SMA 20',
                    yaxis: 'y'
                  },
                  {
                    x: chartData.dates,
                    y: chartData.volume,
                    type: 'bar',
                    name: 'Volume',
                    marker: {
                      color: chartData.close.map((c, i) =>
                        c >= chartData.open[i] ? 'rgba(52, 199, 89, 0.45)' : 'rgba(255, 59, 48, 0.45)'),
                    },
                    yaxis: 'y3'
                  },
                  {
                    x: chartData.dates,
                    y: chartData.rsi,
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: '#af52de', width: 1.5 },
                    name: 'RSI 14',
                    yaxis: 'y2'
                  }
                ]}
                layout={{
                  autosize: true,
                  plot_bgcolor: "transparent",
                  paper_bgcolor: "transparent",
                  font: { color: '#6e6e80', family: 'Inter', size: 11 },
                  xaxis: { 
                    rangeslider: { visible: false },
                    gridcolor: 'rgba(255, 255, 255, 0.1)',
                    linecolor: 'rgba(255, 255, 255, 0.1)',
                    tickfont: { color: '#A1A1AA' }
                  },
                  yaxis: {
                    domain: [0.4, 1],
                    gridcolor: 'rgba(255, 255, 255, 0.1)',
                    linecolor: 'rgba(255, 255, 255, 0.1)',
                    side: 'right',
                    tickprefix: cur,
                    tickfont: { color: '#A1A1AA' }
                  },
                  yaxis3: {
                    domain: [0.21, 0.36],
                    gridcolor: 'rgba(255, 255, 255, 0.06)',
                    linecolor: 'rgba(255, 255, 255, 0.1)',
                    side: 'right',
                    nticks: 3,
                    tickfont: { color: '#A1A1AA', size: 10 },
                    title: { text: 'VOL', font: { size: 10, color: '#6e6e80' } }
                  },
                  yaxis2: {
                    domain: [0, 0.15],
                    gridcolor: 'rgba(255, 255, 255, 0.1)',
                    linecolor: 'rgba(255, 255, 255, 0.1)',
                    side: 'right',
                    tickfont: { color: '#A1A1AA' },
                    range: [0, 100],
                    tickvals: [30, 70]
                  },
                  bargap: 0.35,
                  margin: { l: 20, r: 60, b: 40, t: 20 },
                  height: isNarrow ? 430 : 650,
                  showlegend: true,
                  legend: { x: 0, y: 1.1, orientation: 'h', font: { size: 12, color: '#9494a1' } },
                  shapes: [
                    {
                      type: 'line',
                      yref: 'y2',
                      x0: 0,
                      x1: 1,
                      xref: 'paper',
                      y0: 70,
                      y1: 70,
                      line: { color: 'rgba(255, 59, 48, 0.5)', width: 1, dash: 'dash' }
                    },
                    {
                      type: 'line',
                      yref: 'y2',
                      x0: 0,
                      x1: 1,
                      xref: 'paper',
                      y0: 30,
                      y1: 30,
                      line: { color: 'rgba(52, 199, 89, 0.5)', width: 1, dash: 'dash' }
                    }
                  ]
                }}
                config={{ responsive: true, displayModeBar: false }}
                style={{ width: '100%' }}
              />
            </div>
            
            <div className="chart-stock-pro">
              <h3 style={{ marginBottom: '24px', fontSize: '15px', color: 'var(--text-secondary)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                STOCK PRO DASH
              </h3>
              
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 'bold', letterSpacing: '0.5px' }}>
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
              <div className="stat-label">{ticker} PRICE</div>
              <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {cur}{lastPrice.toFixed(2)}
                <span style={{ fontSize: '14px', color: change >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
                </span>
                <WatchlistStar symbol={ticker} market={ticker.toUpperCase().endsWith('.NS') ? 'IN' : 'US'} size={22} />
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">DAY HIGH</div>
              <div className="stat-value">{cur}{chartData.high[chartData.high.length - 1].toFixed(2)}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">DAY LOW</div>
              <div className="stat-value">{cur}{chartData.low[chartData.low.length - 1].toFixed(2)}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">VOLUME</div>
              <div className="stat-value">{(chartData.volume[chartData.volume.length - 1] / 1e6).toFixed(2)}M</div>
            </div>
          </div>

          <div className="chart-ai-section">
            {!aiReport ? (
              <button data-noshare="" onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
                {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "GENERATE GEMINI AI TECHNICAL INSIGHT"}
              </button>
            ) : (
              <div className="ai-insight">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                  <h3>Gemini Technical Analysis</h3>
                  <button onClick={runAiAnalysis} disabled={aiLoading} style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }} className="secondary">
                    {aiLoading ? <><span className="spinner"></span> RE-ANALYZING...</> : "REFRESH"}
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
          <h3 style={{ color: 'var(--text-secondary)' }}>No Ticker Loaded</h3>
          <p style={{ color: '#555', maxWidth: '300px' }}>Enter a symbol above to fetch real-time market data and AI analysis.</p>
        </div>
      )}
    </div>
  );
};

export default Chart;

