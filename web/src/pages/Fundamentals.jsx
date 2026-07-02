import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const Fundamentals = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState(null);

  const fetchFundamentals = async (e) => {
    if (e) e.preventDefault();
    if (!ticker) return;
    
    setLoading(true);
    setError(null);
    setAiReport(null);
    try {
      const response = await axios.get(`/api/fundamentals/${ticker.toUpperCase()}`);
      setData(response.data);
    } catch (err) {
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const runAiAnalysis = async () => {
    if (!data) return;
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please configure your Gemini API Key in the Settings tab first.");
      return;
    }

    setAiLoading(true);
    try {
      const response = await axios.post('/api/ai/fundamentals', {
        ticker: data.ticker,
        apiKey: apiKey,
        fundamentals_data: JSON.stringify(data, null, 2)
      });
      setAiReport(response.data.report);
    } catch (err) {
      setAiReport(`**Error generating analysis:** ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="page fade-in">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ background: 'linear-gradient(90deg, #FFFFFF, #888888)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Company Fundamentals</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Deep-dive into valuation, profitability, and balance sheet metrics.</p>
        </div>
        {data && !loading && (
          <button 
            onClick={runAiAnalysis} 
            disabled={aiLoading}
            style={{ 
              width: 'auto', 
              background: 'linear-gradient(90deg, rgba(62, 230, 255, 0.2), rgba(62, 230, 255, 0.1))',
              border: '1px solid rgba(62, 230, 255, 0.4)',
              color: 'var(--primary-accent)',
              padding: '10px 20px',
              borderRadius: '20px'
            }}
          >
            {aiLoading ? <><span className="spinner" style={{borderColor: 'rgba(62, 230, 255, 0.2)', borderTopColor: 'var(--primary-accent)', marginRight: '8px'}}></span> Analyzing...</> : '✨ Gemini AI Analysis'}
          </button>
        )}
      </div>

      <div className="panel" style={{ marginBottom: '20px' }}>
        <form onSubmit={fetchFundamentals} style={{ display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            value={ticker} 
            onChange={(e) => setTicker(e.target.value)} 
            placeholder="Enter Ticker (e.g. AAPL, RELIANCE.NS)"
            style={{ flex: 1, marginBottom: 0 }}
          />
          <button type="submit" className="btn" disabled={loading} style={{ width: 'auto', padding: '12px 24px' }}>
            {loading ? 'Fetching...' : 'Fetch Fundamentals'}
          </button>
        </form>
      </div>

      {loading && (
        <div className="fundamentals-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="panel">
              <div className="skeleton skeleton-header" style={{ width: '50%' }}></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="skeleton skeleton-row"></div>
                <div className="skeleton skeleton-row"></div>
                <div className="skeleton skeleton-row"></div>
                <div className="skeleton skeleton-row"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="error" style={{ color: 'var(--red-loss)', padding: '20px', backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <h3 style={{ marginBottom: '8px', fontSize: '16px', color: 'var(--red-loss)' }}>Analysis Failed</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
          <button onClick={fetchFundamentals} style={{ width: 'auto', padding: '8px 16px', background: 'rgba(255, 69, 58, 0.15)', border: '1px solid var(--red-loss)', color: 'var(--red-loss)' }}>Retry</button>
        </div>
      )}

      {aiReport && (
        <div className="ai-insight fade-in" style={{ marginBottom: '20px', background: 'linear-gradient(135deg, rgba(62, 230, 255, 0.05) 0%, rgba(0, 0, 0, 0) 100%)', border: '1px solid rgba(62, 230, 255, 0.2)' }}>
          <h3 style={{ color: 'var(--primary-accent)' }}>✨ Fundamental AI Report</h3>
          <div className="ai-insight-content">
            <ReactMarkdown>{aiReport}</ReactMarkdown>
          </div>
        </div>
      )}

      {data && !loading && (
        <div className="fundamentals-grid fade-in">
          <div className="panel">
            <h3 style={{ color: 'var(--primary-gold)', marginBottom: '5px' }}>{data.name} ({data.ticker})</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>{data.sector} • {data.industry}</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Market Cap</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  {data.marketCap ? `$${(data.marketCap / 1e9).toFixed(2)}B` : 'N/A'}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Total Cash</div>
                <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>
                  {data.totalCash ? `$${(data.totalCash / 1e9).toFixed(2)}B` : 'N/A'}
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Valuation Metrics</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Trailing P/E</div>
                <div style={{ fontWeight: 'bold' }}>{data.trailingPE !== 'N/A' ? Number(data.trailingPE).toFixed(2) : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Forward P/E</div>
                <div style={{ fontWeight: 'bold' }}>{data.forwardPE !== 'N/A' ? Number(data.forwardPE).toFixed(2) : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>PEG Ratio</div>
                <div style={{ fontWeight: 'bold' }}>{data.pegRatio !== 'N/A' ? Number(data.pegRatio).toFixed(2) : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Price to Book</div>
                <div style={{ fontWeight: 'bold' }}>{data.priceToBook !== 'N/A' ? Number(data.priceToBook).toFixed(2) : 'N/A'}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Profitability</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Profit Margin</div>
                <div style={{ fontWeight: 'bold' }}>{data.profitMargin !== 'N/A' ? `${Number(data.profitMargin).toFixed(2)}%` : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Operating Margin</div>
                <div style={{ fontWeight: 'bold' }}>{data.operatingMargin !== 'N/A' ? `${Number(data.operatingMargin).toFixed(2)}%` : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Return on Equity</div>
                <div style={{ fontWeight: 'bold' }}>{data.returnOnEquity !== 'N/A' ? `${Number(data.returnOnEquity).toFixed(2)}%` : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Return on Assets</div>
                <div style={{ fontWeight: 'bold' }}>{data.returnOnAssets !== 'N/A' ? `${Number(data.returnOnAssets).toFixed(2)}%` : 'N/A'}</div>
              </div>
            </div>
          </div>

          <div className="panel">
            <h3 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>Financial Health & Growth</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Debt to Equity</div>
                <div style={{ fontWeight: 'bold' }}>{data.debtToEquity !== 'N/A' ? `${Number(data.debtToEquity).toFixed(2)}%` : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Current Ratio</div>
                <div style={{ fontWeight: 'bold' }}>{data.currentRatio !== 'N/A' ? Number(data.currentRatio).toFixed(2) : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Revenue Growth</div>
                <div style={{ fontWeight: 'bold' }}>{data.revenueGrowth !== 'N/A' ? `${Number(data.revenueGrowth).toFixed(2)}%` : 'N/A'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.85em' }}>Earnings Growth</div>
                <div style={{ fontWeight: 'bold' }}>{data.earningsGrowth !== 'N/A' ? `${Number(data.earningsGrowth).toFixed(2)}%` : 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .fundamentals-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 768px) {
          .fundamentals-grid {
            grid-template-columns: 1fr;
          }
        }
      `}} />
    </div>
  );
};

export default Fundamentals;
