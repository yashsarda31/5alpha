import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Screener = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const [tickers, setTickers] = useState("AAPL, MSFT, NVDA, RELIANCE.NS, TCS.NS, HDFCBANK.NS");
  const [maxPe, setMaxPe] = useState("");
  const [minDiv, setMinDiv] = useState("");
  const [preset, setPreset] = useState("Custom");

  const handlePresetChange = (e) => {
    const val = e.target.value;
    setPreset(val);
    if (val === "Nifty 100") {
      setTickers("RELIANCE.NS, TCS.NS, HDFCBANK.NS, ICICIBANK.NS, INFY.NS, SBIN.NS, BHARTIARTL.NS, LT.NS, ITC.NS, HINDUNILVR.NS, AXISBANK.NS, BAJFINANCE.NS, MARUTI.NS, KOTAKBANK.NS, SUNPHARMA.NS, TITAN.NS, ONGC.NS, TATAMOTORS.NS, NTPC.NS, MM.NS");
    } else if (val === "S&P 500") {
      setTickers("AAPL, MSFT, NVDA, AMZN, META, GOOGL, GOOG, BRK-B, TSLA, LLY, AVGO, V, JPM, UNH, MA, JNJ, XOM, PG, HD, COST");
    }
  };

  const fetchScreener = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setAiReport("");
    try {
      const payload = { tickers };
      if (maxPe) payload.max_pe = parseFloat(maxPe);
      if (minDiv) payload.min_div_yield = parseFloat(minDiv);
      const res = await axios.post('/api/screener', payload);
      setData(res.data.data);
    } catch (err) {
      console.error("Screener fetch failed:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchScreener();
    // eslint-disable-next-line
  }, []);

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
      <h2>Quantitative Screener</h2>
      <p style={{color: "var(--text-secondary)"}}>Live trailing institutional metrics across custom ticker universe.</p>
      
      <div className="card" style={{ marginBottom: '20px', padding: '20px' }}>
        <form onSubmit={fetchScreener} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1', display: 'flex', gap: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Screener Universe</label>
              <select 
                value={preset} 
                onChange={handlePresetChange}
                style={{ width: '100%' }}
              >
                <option value="Custom">Custom</option>
                <option value="Nifty 100">Top Nifty 100</option>
                <option value="S&P 500">Top S&P 500</option>
              </select>
            </div>
            <div style={{ flex: 3 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Tickers (Comma-separated)</label>
              <input 
                type="text" 
                value={tickers} 
                onChange={(e) => { setTickers(e.target.value); setPreset("Custom"); }} 
                required 
                style={{ width: '100%', marginBottom: '24px' }}
              />
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
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group">
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Min Div Yield % (Optional)</label>
            <input 
              type="number" 
              step="0.1" 
              value={minDiv} 
              onChange={(e) => setMinDiv(e.target.value)} 
              placeholder="e.g. 1.5" 
              style={{ width: '100%' }}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', height: 'fit-content' }}>
              {loading ? <><span className="spinner"></span> SCANNING...</> : 'RUN SCREEN'}
            </button>
          </div>
        </form>
      </div>
      
      {loading ? <p>Scanning Universe...</p> : (
        data.length > 0 ? (
          <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '20px'}}>
            <thead>
              <tr style={{borderBottom: '1px solid var(--primary-gold)', color: 'var(--primary-gold)'}}>
                <th style={{padding: '10px'}}>Ticker</th>
                <th>Price</th>
                <th>Market Cap (B)</th>
                <th>P/E (TTM)</th>
                <th>Div Yield (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.ticker} style={{borderBottom: '1px solid #333'}}>
                  <td style={{padding: '10px', fontWeight: 'bold'}}>{row.ticker}</td>
                  <td>${row.price.toFixed(2)}</td>
                  <td>${row.marketCap.toFixed(2)}</td>
                  <td>{row.peRatio ? row.peRatio.toFixed(2) : 'N/A'}</td>
                  <td style={{color: row.divYield > 0 ? 'var(--green-gain)' : 'inherit'}}>{row.divYield.toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{marginTop: '20px', color: 'var(--text-secondary)'}}>No tickers matched your criteria. Adjust your filters or add more tickers.</p>
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
                <div style={{ fontWeight: '700', color: 'var(--primary-gold-dark)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Gemini Quant Screener Analysis
                </div>
                <button onClick={runAiAnalysis} disabled={aiLoading} style={{ width: 'auto', padding: '4px 12px', fontSize: '11px' }} className="secondary">
                  {aiLoading ? "RE-ANALYZING..." : "REFRESH"}
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

export default Screener;
