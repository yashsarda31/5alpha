import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageHeader } from '../components/ui';
import useAutoAiInsight from '../lib/useAutoAiInsight';

const PositionSizing = () => {
  const [capital, setCapital] = useState(10000000);
  const [riskPercent, setRiskPercent] = useState(0.75);
  const [entryPrice, setEntryPrice] = useState(3000);
  const [stopLoss, setStopLoss] = useState(2940);
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
      setAiReport('**Add your Gemini API key in Settings to generate the sizing brief.**');
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
      // Inline, not alert() — this can run unattended via auto-insight
      setAiReport(`**Error generating analysis:** ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  // The calculator always has live values, so with a saved Gemini key the
  // risk insight generates itself once on first visit.
  useAutoAiInsight('mount', runAiAnalysis);

  return (
    <div className="fade-in">
      <PageHeader
        code="SIZE"
        title="Portfolio Lab"
        subtitle="Turn a validated setup into a disciplined allocation for your ₹1 crore reference portfolio."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '30px' }}>
        <div className="card">
          <h3 style={{ fontSize: '18px', marginBottom: '20px' }}>Trade Parameters</h3>
          
          <label>Reference Portfolio Capital (₹)</label>
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

          <label>Entry Price (₹)</label>
          <input 
            type="number" 
            value={entryPrice} 
            onChange={(e) => setEntryPrice(Number(e.target.value))} 
            placeholder="e.g. 100"
          />

          <label>Invalidation Price (₹)</label>
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
              <div className="stat-value" style={{ color: 'var(--red-loss)' }}>₹{riskAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Risk Per Share</div>
              <div className="stat-value">₹{riskPerShare.toFixed(2)}</div>
            </div>
            <div className="stat-box" style={{ gridColumn: 'span 2', background: 'rgba(226, 176, 66, 0.05)', border: '1px solid rgba(226, 176, 66, 0.1)' }}>
              <div className="stat-label" style={{ color: 'var(--primary-gold)' }}>Quantity to Buy</div>
              <div className="stat-value" style={{ fontSize: '32px', color: 'var(--primary-gold)' }}>{shares} Shares</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">Total Position</div>
              <div className="stat-value">₹{positionSize.toLocaleString('en-IN')}</div>
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
                {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : "GENERATE GEMINI AI RISK INSIGHT"}
              </button>
            ) : (
              <div className="ai-insight">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                  <h3>Gemini Risk Management</h3>
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
      </div>
    </div>
  );
};

export default PositionSizing;
