import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageHeader, StatTile, StatGrid } from '../components/ui';
import Plot from '../components/Plot';
import useAutoAiInsight from '../lib/useAutoAiInsight';

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};
const pctTxt = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);

// Concrete hex only — react-plotly silently ignores CSS vars (renders black).
const C = {
  text: '#F5F5F7', dim: '#A1A1AA', gold: '#F5DC8C', green: '#32D74B', red: '#FF453A',
  grid: 'rgba(255,255,255,0.06)', hist: 'rgba(255,255,255,0.6)',
};

const Arima = () => {
  const [ticker, setTicker] = useState('RELIANCE.NS');
  const [days, setDays] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const runModel = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/arima', {
        ticker: ticker,
        days: parseInt(days) || 10
      });
      setForecastData(res.data);
    } catch (err) {
      // Inline error — alert() freezes the preview renderer and interrupts flows
      setError(err.response?.data?.detail || err.message);
      setForecastData(null);
    }
    setLoading(false);
  };

  const runAiAnalysis = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setAiReport('**Add your Gemini API key in Settings to generate the forecast brief.**');
      return;
    }
    setAiLoading(true);
    setAiReport("");
    try {
      const res = await axios.post('/api/ai/arima', {
        ticker: ticker,
        forecast_data: forecastData,
        apiKey: apiKey
      });
      setAiReport(res.data.report);
    } catch (err) {
      setAiReport(`**Error generating analysis:** ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  // With a saved Gemini key the forecast insight generates itself after each
  // model run (keyed on the response object, so re-runs refresh it too).
  useAutoAiInsight(forecastData, runAiAnalysis);

  const cur = currencyFor(forecastData?.ticker || ticker);
  const sum = forecastData?.summary;   // absent on stale cached responses
  const model = forecastData?.model;
  const up = sum ? sum.exp_change_pct >= 0 : true;
  const accentCol = up ? C.green : C.red;

  // ---- chart pieces (only when data is loaded) ----
  let traces = [], layout = {};
  if (forecastData) {
    const h = forecastData.historical;
    const f = forecastData.forecast;
    const lastDate = h.dates[h.dates.length - 1];
    const lastPrice = h.prices[h.prices.length - 1];
    // Bridge the forecast to the last real price so there is no visual gap.
    const fDates = [lastDate, ...f.dates];
    const fPrices = [lastPrice, ...f.prices];
    const fLower = [lastPrice, ...f.lower];
    const fUpper = [lastPrice, ...f.upper];
    const endDate = f.dates[f.dates.length - 1];
    const endPrice = f.prices[f.prices.length - 1];

    traces = [
      { // history — quiet backdrop
        x: h.dates, y: h.prices, type: 'scatter', mode: 'lines',
        line: { color: C.hist, width: 1.6 }, name: 'History',
        hovertemplate: `%{x}<br>${cur}%{y:,.2f}<extra>History</extra>`,
      },
      { // CI band (upper first, lower fills to it)
        x: fDates, y: fUpper, type: 'scatter', mode: 'lines',
        line: { width: 0 }, hoverinfo: 'skip', showlegend: false,
      },
      {
        x: fDates, y: fLower, type: 'scatter', mode: 'lines', fill: 'tonexty',
        fillcolor: 'rgba(245,220,140,0.16)', line: { width: 0 },
        name: 'Likely range (68%)',
        hovertemplate: `%{x}<br>${cur}%{y:,.2f}<extra>Range low</extra>`,
      },
      { // the forecast itself — loud, connected, ends in a marker
        x: fDates, y: fPrices, type: 'scatter', mode: 'lines+markers',
        line: { color: C.gold, width: 3, dash: 'dash' },
        marker: { size: 4, color: C.gold },
        name: 'Forecast',
        hovertemplate: `%{x}<br>${cur}%{y:,.2f}<extra>Forecast</extra>`,
      },
      { // end-point emphasis
        x: [endDate], y: [endPrice], type: 'scatter', mode: 'markers',
        marker: { size: 11, color: accentCol, line: { color: '#000', width: 1.5 }, symbol: 'diamond' },
        showlegend: false, hoverinfo: 'skip',
      },
    ];

    // Initial view: last ~60 sessions + the forecast, so the projection owns a
    // third of the frame instead of being a sliver at the edge of 18 months.
    const viewStart = h.dates[Math.max(0, h.dates.length - 60)];
    layout = {
      autosize: true,
      height: 400,
      margin: { l: 8, r: 8, t: 10, b: 10 },
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: { color: C.dim, family: 'Inter', size: 11 },
      xaxis: {
        range: [viewStart, endDate],
        gridcolor: C.grid, linecolor: C.grid, automargin: true, nticks: 6,
      },
      yaxis: {
        side: 'right', tickprefix: cur, gridcolor: C.grid, linecolor: C.grid,
        automargin: true, nticks: 6,
      },
      // Legend BELOW the chart, horizontal (was stealing width on phones)
      showlegend: true,
      legend: { orientation: 'h', x: 0, y: -0.12, font: { size: 11, color: C.dim } },
      hoverlabel: { bgcolor: '#1c1c1e', bordercolor: C.grid, font: { color: C.text } },
      shapes: [
        { // faint tint over the forecast zone: "everything right of here is projected"
          type: 'rect', xref: 'x', yref: 'paper', x0: lastDate, x1: endDate, y0: 0, y1: 1,
          fillcolor: 'rgba(245,220,140,0.05)', line: { width: 0 }, layer: 'below',
        },
        { // "today" divider
          type: 'line', xref: 'x', yref: 'paper', x0: lastDate, x1: lastDate, y0: 0, y1: 1,
          line: { color: 'rgba(255,255,255,0.28)', width: 1, dash: 'dot' },
        },
      ],
      annotations: [
        { // the prediction, spelled out at its end point
          x: endDate, y: endPrice, xanchor: 'right', yanchor: up ? 'bottom' : 'top',
          yshift: up ? 10 : -10,
          text: `<b>${cur}${Number(endPrice).toLocaleString()}</b>${sum ? `  ${pctTxt(sum.exp_change_pct)}` : ''}`,
          font: { color: accentCol, size: 13 }, showarrow: false,
          bgcolor: 'rgba(0,0,0,0.55)', borderpad: 4,
        },
        {
          x: lastDate, y: 1, xref: 'x', yref: 'paper', xanchor: 'left', yanchor: 'top',
          text: ' TODAY', font: { color: C.dim, size: 9 }, showarrow: false,
        },
      ],
    };
  }

  return (
    <div>
      <PageHeader code="FORE" title="SARIMAX Forecaster" subtitle="Statistical price projection with out-of-sample validation." />

      <form onSubmit={runModel} className="panel" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px', alignItems: 'end', padding: 16, marginBottom: 20,
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 12 }}>Ticker Symbol</label>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onFocus={(e) => e.target.select()} style={{ width: '100%', marginBottom: 0 }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12 }}>Horizon (Days)</label>
          <input type="number" min="1" max="60" value={days} onChange={(e) => setDays(e.target.value)}
            style={{ width: '100%', marginBottom: 0 }} />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', minHeight: 44 }}>
          {loading ? <><span className="spinner"></span> Fitting…</> : "Run Projection"}
        </button>
      </form>

      {error && (
        <div style={{ color: 'var(--red-loss)', padding: '14px 16px', background: 'rgba(255,69,58,0.1)', borderRadius: 10, marginBottom: 20 }}>
          <strong>Model error:</strong> {error}
        </div>
      )}

      {forecastData && sum && (
        <StatGrid style={{ marginBottom: 16 }}>
          <StatTile label="Last Price" value={`${cur}${sum.last_price.toLocaleString()}`} />
          <StatTile label={`Forecast · ${sum.horizon_days}d`} tone={up ? 'gain' : 'loss'}
            value={`${cur}${sum.end_price.toLocaleString()}`} sub={pctTxt(sum.exp_change_pct)} />
          <StatTile label="Likely Range (68%)" value={`${pctTxt(sum.low_pct)} … ${pctTxt(sum.high_pct)}`} />
          {model && (
            <StatTile label="Direction Hit Rate" tone={model.direction_acc >= 55 ? 'gain' : 'neutral'}
              value={model.direction_acc === null ? '—' : `${model.direction_acc}%`}
              sub="1-day-ahead, last 60 sessions" />
          )}
          {model && (
            <StatTile label="Backtest Error"
              value={model.holdout_mape === null ? '—' : `±${model.holdout_mape}%`}
              sub={`MAPE on ${model.holdout_days}d unseen data · ARIMA(${(model.order || []).join(',')})`} />
          )}
        </StatGrid>
      )}

      {forecastData && (
        <div className="card" style={{ padding: '12px 8px 4px' }}>
          <Plot
            data={traces}
            layout={layout}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%' }}
            useResizeHandler
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5, margin: '4px 8px 8px' }}>
            Dashed gold = model projection · shaded band = 68% likely range, widening with horizon.
            The model is chosen by accuracy on data it never saw, but short-horizon price forecasts are
            inherently uncertain — treat the band, not the line, as the forecast.
          </p>
        </div>
      )}

      {forecastData && (
        <div style={{ marginTop: '24px' }}>
          {!aiReport ? (
            <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
              {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "GENERATE GEMINI AI FORECAST INSIGHT"}
            </button>
          ) : (
            <div className="ai-insight">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                <h3>Gemini Projection Analysis</h3>
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

export default Arima;
