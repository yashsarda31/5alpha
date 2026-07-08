import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageHeader } from '../components/ui';
import Plot from '../components/Plot';
import useAutoAiInsight from '../lib/useAutoAiInsight';

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};

const Arima = () => {
  const [ticker, setTicker] = useState('RELIANCE.NS');
  const [days, setDays] = useState(10);
  const [loading, setLoading] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const runModel = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/api/arima', {
        ticker: ticker,
        days: parseInt(days)
      });
      setForecastData(res.data);
    } catch (err) {
      alert("Model Fitting Error: " + (err.response?.data?.detail || err.message));
    }
    setLoading(false);
  };

  const runAiAnalysis = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please enter a Gemini API Key in the sidebar.");
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
      // Inline, not alert() — this can run unattended via auto-insight
      setAiReport(`**Error generating analysis:** ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  // With a saved Gemini key the forecast insight generates itself after each
  // model run (keyed on the response object, so re-runs refresh it too).
  useAutoAiInsight(forecastData, runAiAnalysis);

  return (
    <div>
      <PageHeader code="FORE" title="SARIMAX Forecaster" subtitle="Institutional time-series modeling for equity trajectory." />
      
      <div style={{display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '20px', alignItems: 'flex-start'}}>
        <div>
            <label style={{display: 'block'}}>Ticker Symbol</label>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onFocus={(e) => e.target.select()} style={{width: '150px'}} />
        </div>
        <div>
            <label style={{display: 'block'}}>Forecast Horizon (Days)</label>
            <input type="number" value={days} onChange={(e) => setDays(e.target.value)} style={{width: '150px'}} />
        </div>
        <div style={{paddingTop: '21px'}}>
            <button onClick={runModel} disabled={loading} style={{width: 'auto', minWidth: '200px'}}>
                {loading ? <><span className="spinner"></span> Fitting Model...</> : "Run Projection"}
            </button>
        </div>
      </div>

      {forecastData && (
        <div className="card">
          <Plot
            data={[
              {
                x: forecastData.historical.dates,
                y: forecastData.historical.prices,
                type: 'scatter',
                mode: 'lines',
                line: {color: 'rgba(255, 255, 255, 0.55)', width: 2},
                name: 'Historical'
              },
              {
                x: forecastData.forecast.dates,
                y: forecastData.forecast.upper,
                type: 'scatter',
                mode: 'lines',
                line: {width: 0},
                showlegend: false,
                hoverinfo: 'skip'
              },
              {
                x: forecastData.forecast.dates,
                y: forecastData.forecast.lower,
                type: 'scatter',
                mode: 'lines',
                fill: 'tonexty',
                fillcolor: 'rgba(212, 175, 55, 0.15)',
                line: {width: 0},
                name: 'Confidence Interval'
              },
              {
                x: forecastData.forecast.dates,
                y: forecastData.forecast.prices,
                type: 'scatter',
                mode: 'lines',
                line: {color: '#F5DC8C', width: 3, dash: 'dot'},
                name: 'Forecast'
              }
            ]}
            layout={{
              // autosize + width:100% below make Plotly track the container so
              // the chart never renders at its fixed default width and overflow
              // the page on mobile.
              autosize: true,
              title: { text: `${ticker} SARIMAX Projection`, font: { color: '#F5F5F7' } },
              plot_bgcolor: "transparent",
              paper_bgcolor: "transparent",
              font: { color: '#A1A1AA', family: 'Inter' },
              xaxis: {
                gridcolor: 'rgba(255, 255, 255, 0.05)',
                linecolor: 'rgba(255, 255, 255, 0.1)'
              },
              yaxis: {
                gridcolor: 'rgba(255, 255, 255, 0.05)',
                linecolor: 'rgba(255, 255, 255, 0.1)',
                tickprefix: currencyFor(ticker)
              },
              height: 450,
              margin: { l: 50, r: 20, b: 40, t: 60 }
            }}
            config={{responsive: true, displayModeBar: false}}
            style={{ width: '100%' }}
            useResizeHandler
          />
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
