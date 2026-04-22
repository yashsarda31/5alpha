import React, { useState } from 'react';
import axios from 'axios';

const Dcf = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [wacc, setWacc] = useState(8.5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const runDcf = async () => {
    setLoading(true);
    try {
      const res = await axios.post('/api/dcf', {
        ticker: ticker,
        wacc: parseFloat(wacc),
        perpetual_growth: 2.5
      });
      setResult(res.data);
    } catch (err) {
      alert("Error calculating DCF: " + err.message);
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
      const res = await axios.post('/api/ai/dcf', {
        ticker: ticker,
        dcf_data: result,
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
      <h2>Automated DCF Valuation</h2>
      <p style={{color: "var(--text-secondary)"}}>Inputs are automatically parsed from real-time SEC EDGAR filings / NSE statements via proxy.</p>
      
      <div className="card" style={{display: "flex", flexWrap: "wrap", gap: "20px"}}>
        <div style={{flex: 1, minWidth: "250px"}}>
          <label>Ticker Symbol</label>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
          
          <label>Implied WACC (%)</label>
          <input type="number" step="0.1" value={wacc} onChange={(e) => setWacc(e.target.value)} />
          
          <button onClick={runDcf} disabled={loading}>
            {loading ? <><span className="spinner"></span> Parsing Data...</> : "Calculate Intrinsic Value"}
          </button>
        </div>
        
        <div style={{flex: 1, minWidth: "250px", backgroundColor: "rgba(0,0,0,0.02)", padding: "20px", borderRadius: "8px", border: "1px solid var(--glass-border)"}}>
          <h3>Output Model</h3>
          {result ? (
            <div>
              <div style={{fontSize: "24px", color: "var(--primary-gold)"}}>
                Intrinsic Value: ${result.intrinsicValue}
              </div>
              <div style={{color: result.upside > 0 ? "var(--green-gain)" : "var(--red-loss)"}}>
                Upside: {result.upside}%
              </div>
              <p>Current Price: ${result.currentPrice}</p>
              <hr />
              <p><strong>Auto-Populated Base Metrics:</strong></p>
              <ul style={{fontSize: "12px", color: "var(--text-secondary)"}}>
                <li>Net Debt: ${(result.autoPopulated.netDebt / 1e9).toFixed(2)} B</li>
                <li>Shares Out: {(result.autoPopulated.sharesOut / 1e6).toFixed(2)} M</li>
                <li>Base FCF: ${(result.autoPopulated.baseFcf / 1e6).toFixed(2)} M</li>
              </ul>
              
              <div style={{marginTop: "20px", borderTop: "1px solid var(--border-light)", paddingTop: "15px"}}>
                <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
                  {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "⚡ GENERATE GEMINI AI INSIGHT"}
                </button>
                {aiReport && (
                  <div className="ai-insight">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                      <div style={{ fontWeight: 'bold', color: 'var(--primary-gold-dark)', fontSize: '13px', textTransform: 'uppercase' }}>Gemini Analysis:</div>
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
            <p style={{color: "var(--text-secondary)"}}>Run model to generate output.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dcf;
