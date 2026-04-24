import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PlotComponent from 'react-plotly.js';
const Plot = PlotComponent.default || PlotComponent;

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
      alert("Error fetching AI analysis: " + err.message);
    }
    setAiLoading(false);
  };

  useEffect(() => {
    runModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <h2>SARIMAX Quantitative Forecaster</h2>
      <p style={{color: "var(--text-secondary)"}}>Institutional time-series modeling for equity trajectory.</p>
      
      <div style={{display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '20px', alignItems: 'flex-start'}}>
        <div>
            <label style={{display: 'block'}}>Ticker Symbol</label>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} style={{width: '150px'}} />
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
                line: {color: 'rgba(0, 0, 0, 0.4)', width: 2},
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
                line: {color: 'var(--primary-gold)', width: 3, dash: 'dot'},
                name: 'Forecast'
              }
            ]}
            layout={{
              title: `${ticker} SARIMAX Projection`,
              plot_bgcolor: "transparent",
              paper_bgcolor: "transparent",
              font: {color: '#1a1a24'},
              height: 450,
              width: 800
            }}
            config={{responsive: true}}
          />
        </div>
      )}

      {forecastData && (
        <div style={{ marginTop: '24px' }}>
          {!aiReport ? (
            <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
              {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "⚡ GENERATE GEMINI AI FORECAST INSIGHT"}
            </button>
          ) : (
            <div className="ai-insight">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                <div style={{ fontWeight: '700', color: 'var(--primary-gold-dark)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Gemini Projection Analysis
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
      )}
    </div>
  );
};

export default Arima;
