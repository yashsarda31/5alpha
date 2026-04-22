import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PlotComponent from 'react-plotly.js';
const Plot = PlotComponent.default || PlotComponent;

const Chart = () => {
  const [ticker, setTicker] = useState('NVDA');
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const fetchChart = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/chart/${ticker}`);
      setChartData(res.data);
    } catch (err) {
      alert("Error fetching chart: " + err.message);
    }
    setLoading(false);
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          </div>

          <div style={{ backgroundColor: '#000', padding: '10px' }}>
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
                  whiskerwidth: 0.5
                },
                {
                  x: chartData.dates,
                  y: chartData.sma20,
                  type: 'scatter',
                  mode: 'lines',
                  line: { color: '#007aff', width: 2, shape: 'spline' },
                  name: 'SMA 20'
                }
              ]}
              layout={{
                autosize: true,
                plot_bgcolor: "transparent",
                paper_bgcolor: "transparent",
                font: { color: '#6e6e80', family: 'Inter', size: 11 },
                xaxis: { 
                  rangeslider: { visible: false },
                  gridcolor: '#e0e0e0',
                  linecolor: '#e0e0e0',
                  tickfont: { color: '#1a1a24' }
                },
                yaxis: { 
                  gridcolor: '#e0e0e0',
                  linecolor: '#e0e0e0',
                  side: 'right',
                  tickprefix: '$',
                  tickfont: { color: '#666' }
                },
                margin: { l: 20, r: 60, b: 40, t: 20 },
                height: 500,
                showlegend: true,
                legend: { x: 0, y: 1.1, orientation: 'h', font: { size: 12, color: '#9494a1' } }
              }}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ padding: '24px', borderTop: '1px solid var(--glass-border)', backgroundColor: 'rgba(0,0,0,0.02)' }}>
            {!aiReport ? (
              <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
                {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "⚡ GENERATE GEMINI AI TECHNICAL INSIGHT"}
              </button>
            ) : (
              <div className="ai-insight">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                  <div style={{ fontWeight: '700', color: 'var(--primary-gold-dark)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Gemini Technical Analysis
                  </div>
                  <button onClick={runAiAnalysis} disabled={aiLoading} style={{ width: 'auto', padding: '4px 12px', fontSize: '11px' }} className="secondary">
                    {aiLoading ? <><span className="spinner"></span> RE-ANALYZING...</> : "REFRESH"}
                  </button>
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                  {aiReport}
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

