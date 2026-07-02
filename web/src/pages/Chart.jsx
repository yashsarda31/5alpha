import React, { useState } from 'react';
import axios from 'axios';
import PlotComponent from 'react-plotly.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const Plot = PlotComponent.default || PlotComponent;

const Chart = () => {
  const [ticker, setTicker] = useState('NVDA');
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [fundamentals, setFundamentals] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const fetchChart = async () => {
    setLoading(true);
    setChartData(null);
    setFundamentals(null);
    try {
      const [resChart, resFund] = await Promise.all([
        axios.get(`/api/chart/${ticker}`),
        axios.get(`/api/fundamentals/${ticker}`).catch(() => ({ data: null }))
      ]);
      setChartData(resChart.data);
      if (resFund.data && !resFund.data.error) {
        setFundamentals(resFund.data);
      }
    } catch (err) {
      alert("Error fetching chart: " + err.message);
    }
    setLoading(false);
  };

  // Removed auto-fetch on mount so it doesn't load by default

  const runAiAnalysis = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please enter a Gemini API Key in the sidebar.");
      return;
    }
    
    const lastIdx = chartData.close.length - 1;
    const data_summary = `Ticker: ${ticker}
    Latest Close: $${chartData.close[lastIdx].toFixed(2)}
    Latest High: $${chartData.high[lastIdx].toFixed(2)}
    Latest Low: $${chartData.low[lastIdx].toFixed(2)}
    Current 20 SMA: $${chartData.sma20[lastIdx].toFixed(2)}
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
      alert("Error fetching AI analysis: " + err.message);
    }
    setAiLoading(false);
  };

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

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', gap: '20px' }}>
        <div>
          <h2 style={{ marginBottom: '8px' }}>Institutional Chart Analyser</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Advanced technical analysis and AI-driven market insights.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ width: '160px' }}>
            <input 
              value={ticker} 
              onChange={(e) => setTicker(e.target.value.toUpperCase())} 
              onFocus={(e) => e.target.select()}
              placeholder="SEARCH TICKER..."
              style={{ marginBottom: 0 }}
            />
          </div>
          <button onClick={fetchChart} disabled={loading} style={{ width: 'auto' }}>
            {loading ? <><span className="spinner"></span> LOAD...</> : "SEARCH"}
          </button>
        </div>
      </div>

      {chartData ? (
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div className="stats-grid" style={{ padding: '24px', borderBottom: '1px solid var(--glass-border)' }}>
            <div className="stat-box">
              <div className="stat-label">{ticker} PRICE</div>
              <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                ${lastPrice.toFixed(2)}
                <span style={{ fontSize: '14px', color: change >= 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-label">DAY HIGH</div>
              <div className="stat-value">${chartData.high[chartData.high.length-1].toFixed(2)}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">DAY LOW</div>
              <div className="stat-value">${chartData.low[chartData.low.length-1].toFixed(2)}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">VOLUME</div>
              <div className="stat-value">{(chartData.volume[chartData.volume.length-1] / 1e6).toFixed(2)}M</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">VCP RATING</div>
              <div className="stat-value" style={{ color: 'var(--primary-gold)' }}>
                {'★'.repeat(chartData.vcp_rating || 0)}{'☆'.repeat(5 - (chartData.vcp_rating || 0))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 65%', backgroundColor: '#000', padding: '10px' }}>
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
                    tickfont: { color: 'var(--text-secondary)' }
                  },
                  yaxis: { 
                    domain: [0.25, 1],
                    gridcolor: 'rgba(255, 255, 255, 0.1)',
                    linecolor: 'rgba(255, 255, 255, 0.1)',
                    side: 'right',
                    tickprefix: '$',
                    tickfont: { color: 'var(--text-secondary)' }
                  },
                  yaxis2: {
                    domain: [0, 0.15],
                    gridcolor: 'rgba(255, 255, 255, 0.1)',
                    linecolor: 'rgba(255, 255, 255, 0.1)',
                    side: 'right',
                    tickfont: { color: 'var(--text-secondary)' },
                    range: [0, 100],
                    tickvals: [30, 70]
                  },
                  margin: { l: 20, r: 60, b: 40, t: 20 },
                  height: 650,
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
            
            <div style={{ flex: '1 1 30%', padding: '24px', backgroundColor: 'var(--card-bg)', borderLeft: '1px solid var(--glass-border)' }}>
              <h3 style={{ marginBottom: '24px', fontSize: '15px', color: 'var(--text-secondary)', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--primary-gold)' }}>⚡</span> STOCK PRO DASH
              </h3>
              
              <div style={{ padding: '16px', backgroundColor: techSignal.bg, border: `1px solid ${techSignal.border}`, borderRadius: '8px', marginBottom: '30px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', letterSpacing: '1px' }}>TECHNICAL SIGNAL</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: techSignal.color, letterSpacing: '2px' }}>{techSignal.signal}</div>
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
                  {renderDashRow("EPS Growth", fundamentals.earningsGrowth !== "N/A" && fundamentals.earningsGrowth !== null ? fundamentals.earningsGrowth + "%" : "N/A", "N/A", fundamentals.earningsGrowth > 0)}
                  {renderDashRow("ROE", fundamentals.returnOnEquity !== "N/A" && fundamentals.returnOnEquity !== null ? fundamentals.returnOnEquity + "%" : "N/A", "N/A", fundamentals.returnOnEquity > 15)}
                  {renderDashRow("Debt / Equity", fundamentals.debtToEquity !== "N/A" && fundamentals.debtToEquity !== null ? fundamentals.debtToEquity + "%" : "N/A", "N/A", fundamentals.debtToEquity !== "N/A" && fundamentals.debtToEquity < 100)}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)' }}>
                  <div style={{ opacity: 0.5, fontSize: '24px', marginBottom: '10px' }}>📊</div>
                  <div>Fundamental data unavailable</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ padding: '24px', borderTop: '1px solid var(--glass-border)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
            {!aiReport ? (
              <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
                {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "⚡ GENERATE GEMINI AI TECHNICAL INSIGHT"}
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiReport}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px', opacity: 0.3 }}>📈</div>
          <h3 style={{ color: 'var(--text-secondary)' }}>No Ticker Loaded</h3>
          <p style={{ color: '#555', maxWidth: '300px' }}>Enter a symbol above to fetch real-time market data and AI analysis.</p>
        </div>
      )}
    </div>
  );
};

export default Chart;

