import React, { useState } from 'react';
import axios from 'axios';

const PositionSizing = () => {
  const [capital, setCapital] = useState(10000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entryPrice, setEntryPrice] = useState(100);
  const [stopLoss, setStopLoss] = useState(95);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState("");

  const riskAmount = (capital * riskPercent) / 100;
  const riskPerShare = entryPrice - stopLoss;
  const shares = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const positionSize = shares * entryPrice;
  const percentOfCapital = (positionSize / capital) * 100;

  const runAiAnalysis = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please enter a Gemini API Key in the sidebar.");
      return;
    }
    setAiLoading(true);
    setAiReport("");
    try {
      const res = await axios.post('/api/ai/position-sizing', {
        capital: capital,
        risk_percent: riskPercent,
        entry_price: entryPrice,
        stop_loss: stopLoss,
        shares: shares,
        apiKey: apiKey
      });
      setAiReport(res.data.report);
    } catch (err) {
      alert("Error fetching AI analysis: " + err.message);
    }
    setAiLoading(false);
  };

  return (
    <div className="fade-in">
      <h2>Position Sizing Calculator</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '30px' }}>
        Calculate institutional-grade position sizes based on capital risk and stop-loss levels.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Trade Parameters</h3>
          
          <label>Total Account Capital ($)</label>
          <input 
            type="number" 
            value={capital} 
            onChange={(e) => setCapital(Number(e.target.value))} 
            placeholder="e.g. 10000"
          />

          <label>Account Risk (%)</label>
          <input 
            type="number" 
            step="0.1"
            value={riskPercent} 
            onChange={(e) => setRiskPercent(Number(e.target.value))} 
            placeholder="e.g. 1"
          />

          <label>Entry Price ($)</label>
          <input 
            type="number" 
            value={entryPrice} 
            onChange={(e) => setEntryPrice(Number(e.target.value))} 
            placeholder="e.g. 100"
          />

          <label>Stop Loss Price ($)</label>
          <input 
            type="number" 
            value={stopLoss} 
            onChange={(e) => setStopLoss(Number(e.target.value))} 
            placeholder="e.g. 95"
          />
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '20px', textAlign: 'center' }}>Calculated Output</h3>
          
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-label">Risk Amount</div>
              <div className="stat-value" style={{ color: 'var(--red-loss)' }}>${riskAmount.toFixed(2)}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Risk Per Share</div>
              <div className="stat-value">${riskPerShare.toFixed(2)}</div>
            </div>
            <div className="stat-box" style={{ gridColumn: 'span 2', background: 'rgba(226, 176, 66, 0.05)', border: '1px solid rgba(226, 176, 66, 0.1)' }}>
              <div className="stat-label" style={{ color: 'var(--primary-gold)' }}>Quantity to Buy</div>
              <div className="stat-value" style={{ fontSize: '32px', color: 'var(--primary-gold)' }}>{shares} Shares</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Total Position</div>
              <div className="stat-value">${positionSize.toLocaleString()}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">% of Capital</div>
              <div className="stat-value">{percentOfCapital.toFixed(2)}%</div>
            </div>
          </div>

          <div style={{ marginTop: '30px', padding: '15px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <strong>Note:</strong> This calculator assumes zero slippage and doesn't account for commissions. Always verify liquidity before placing large orders.
          </div>
          
          <div style={{ marginTop: '24px' }}>
            {!aiReport ? (
              <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
                {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "⚡ GENERATE GEMINI AI RISK INSIGHT"}
              </button>
            ) : (
              <div className="ai-insight">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                  <div style={{ fontWeight: '700', color: 'var(--primary-gold-dark)', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Gemini Risk Management
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
      </div>
    </div>
  );
};

export default PositionSizing;
