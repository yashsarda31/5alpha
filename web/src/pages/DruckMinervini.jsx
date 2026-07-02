import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import PlotComponent from 'react-plotly.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const Plot = PlotComponent.default || PlotComponent;

const DruckMinervini = () => {
  // Form Inputs
  const [ticker, setTicker] = useState('');
  const [macroContext, setMacroContext] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  
  // App States
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  
  // Interactive Calculator States
  const [capital, setCapital] = useState(100000);
  const [riskPercent, setRiskPercent] = useState(1.0);
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  
  // File upload refs
  const fileInputRef = useRef(null);
  const dragRef = useRef(null);

  // Parse suggested numbers from the AI report to pre-populate the calculator
  useEffect(() => {
    if (results && results.report) {
      const reportText = results.report;
      
      // Parse Entry Price
      const entryMatch = reportText.match(/(?:Entry Trigger Price|Entry Price|Entry|Trigger)(?:\s*Level|\s*Price)?\s*:\s*\$?([\d.,]+)/i);
      if (entryMatch) {
        const parsedEntry = parseFloat(entryMatch[1].replace(/,/g, ''));
        if (!isNaN(parsedEntry)) setEntryPrice(parsedEntry);
      } else if (results.chart_data && results.chart_data.close.length > 0) {
        // Fallback to latest close price
        const lastClose = results.chart_data.close[results.chart_data.close.length - 1];
        setEntryPrice(parseFloat(lastClose.toFixed(2)));
      }

      // Parse Stop Loss
      const stopMatch = reportText.match(/(?:Initial Stop-Loss Price|Stop-Loss Price|Stop Loss|Stop-Loss|Initial Stop)(?:\s*Price)?\s*:\s*\$?([\d.,]+)/i);
      if (stopMatch) {
        const parsedStop = parseFloat(stopMatch[1].replace(/,/g, ''));
        if (!isNaN(parsedStop)) setStopLoss(parsedStop);
      }
    }
  }, [results]);

  // Handle image drag & drop
  const handleDragOver = (e) => {
    e.preventDefault();
    if (dragRef.current) {
      dragRef.current.style.borderColor = 'var(--primary-gold)';
      dragRef.current.style.background = 'rgba(212, 175, 55, 0.05)';
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (dragRef.current) {
      dragRef.current.style.borderColor = 'var(--border-color)';
      dragRef.current.style.background = 'rgba(0, 0, 0, 0.2)';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragRef.current) {
      dragRef.current.style.borderColor = 'var(--border-color)';
      dragRef.current.style.background = 'rgba(0, 0, 0, 0.2)';
    }
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Run Analysis
  const handleAnalyze = async (e) => {
    e.preventDefault();
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please enter a Gemini API Key in the sidebar.");
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    const formData = new FormData();
    formData.append('apiKey', apiKey);
    if (ticker) formData.append('ticker', ticker);
    if (macroContext) formData.append('macro_context', macroContext);
    if (imageFile) formData.append('file', imageFile);

    try {
      const response = await axios.post('/api/ai/druck-minervini', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setResults(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "An error occurred during analysis.");
    } finally {
      setLoading(false);
    }
  };

  // Sizing Calculations
  const parsedEntry = parseFloat(entryPrice) || 0;
  const parsedStop = parseFloat(stopLoss) || 0;
  
  const capitalAtRisk = capital * (riskPercent / 100);
  const stopLossPct = parsedEntry > 0 && parsedStop > 0 && parsedEntry > parsedStop 
    ? ((parsedEntry - parsedStop) / parsedEntry) * 100 
    : 0;
  
  const maxShares = parsedEntry > 0 && parsedStop > 0 && parsedEntry > parsedStop
    ? Math.floor(capitalAtRisk / (parsedEntry - parsedStop))
    : 0;

  const positionSize = maxShares * parsedEntry;
  const positionSizePct = capital > 0 ? (positionSize / capital) * 100 : 0;

  // Strategic score parsing helper
  const getStrategicScore = () => {
    if (!results || !results.report) return null;
    const scoreMatch = results.report.match(/(?:Strategic Conviction Score|Conviction Score|Conviction Rating|Score)\s*(?:\(1-10\))?\s*:\s*(\d+)/i);
    return scoreMatch ? parseInt(scoreMatch[1]) : null;
  };

  const convictionScore = getStrategicScore();

  return (
    <div className="page" style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
      <div className="header" style={{ marginBottom: '32px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '32px' }}>🦅</span> 
          <span>Druckenmiller + Minervini Trade Analyzer</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '15px' }}>
          Evaluate technical setups with Mark Minervini's SEPA (Stage 2 Uptrends, VCP, Pivot Breakouts) integrated with Stanley Druckenmiller's macroeconomic liquidity and sizing principles.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start', marginBottom: '32px' }}>
        
        {/* INPUTS PANEL */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', color: 'var(--primary-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛠️</span> Setup Parameters
          </h3>
          <form onSubmit={handleAnalyze}>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="ticker">Stock Ticker (Optional)</label>
              <input
                id="ticker"
                type="text"
                placeholder="e.g. NVDA, MSFT, RELIANCE.NS"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                style={{ marginBottom: '4px' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Fetches Python technical metrics & 150-day chart history.</span>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="macro">Macro Catalyst / Context (Optional)</label>
              <textarea
                id="macro"
                placeholder="e.g. Generative AI demand acceleration, Federal Reserve rate cuts causing liquidity easing, industry CAGR > 25%."
                value={macroContext}
                onChange={(e) => setMacroContext(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '10px',
                  padding: '12px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label>Upload Chart Image (Required for Visual Analysis)</label>
              <div
                ref={dragRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '12px',
                  padding: '30px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: 'rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  style={{ display: 'none' }}
                />
                
                {imagePreview ? (
                  <div style={{ position: 'relative' }}>
                    <img 
                      src={imagePreview} 
                      alt="Uploaded Chart Preview" 
                      style={{ maxWidth: '100%', maxHeight: '180px', borderRadius: '6px', objectFit: 'contain' }} 
                    />
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage();
                      }}
                      style={{
                        position: 'absolute',
                        top: '5px',
                        right: '5px',
                        background: 'rgba(255, 69, 58, 0.85)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        cursor: 'pointer',
                        color: 'white',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontSize: '36px', display: 'block', marginBottom: '8px' }}>📤</span>
                    <span style={{ display: 'block', fontWeight: '500', marginBottom: '4px' }}>Drag & Drop Chart Image</span>
                    <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)' }}>or click to browse from files</span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (!imageFile && !ticker)}
              style={{
                width: '100%',
                background: 'var(--primary-gold)',
                color: '#000',
                fontWeight: 'bold',
                padding: '14px',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'opacity 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ display: 'inline-block', width: '16px', height: '16px', border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  Analyzing E2E Setup...
                </>
              ) : (
                <>
                  <span>⚡</span> Execute Trade Analysis
                </>
              )}
            </button>
          </form>
        </div>

        {/* SUMMARY STATS & GAUGE PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* CONVICTION SCORE DISPLAY */}
          <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: '190px' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>
              Strategic Conviction Alignment
            </h3>
            {convictionScore !== null ? (
              <div>
                <div style={{ fontSize: '64px', fontWeight: '800', color: convictionScore >= 8 ? 'var(--green-gain)' : convictionScore >= 5 ? 'var(--primary-gold)' : 'var(--red-loss)', lineHeight: 1 }}>
                  {convictionScore}<span style={{ fontSize: '20px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>/10</span>
                </div>
                <div style={{
                  marginTop: '12px',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  background: convictionScore >= 8 ? 'rgba(50, 215, 75, 0.15)' : convictionScore >= 5 ? 'rgba(214, 175, 55, 0.15)' : 'rgba(255, 69, 58, 0.15)',
                  color: convictionScore >= 8 ? 'var(--green-gain)' : convictionScore >= 5 ? 'var(--primary-gold)' : 'var(--red-loss)',
                  fontWeight: '600',
                  fontSize: '13px'
                }}>
                  {convictionScore >= 8 ? '🎯 Tier 1 Conviction Setup' : convictionScore >= 5 ? '⚠️ Tier 2 Tactical Setup' : '🚫 Neutral / High Risk'}
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>⚖️</span>
                Run trade analysis to calculate conviction alignment rating.
              </div>
            )}
          </div>

          {/* DYNAMIC POSITION SIZING CALCULATOR */}
          <div className="card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--primary-gold)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚖️</span> Goldman Sizing Engine
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={{ marginBottom: '4px' }}>Account Capital ($)</label>
                <input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
                  style={{ padding: '8px 12px', marginBottom: 0 }}
                />
              </div>
              <div>
                <label style={{ marginBottom: '4px' }}>Account Risk (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(parseFloat(e.target.value) || 0)}
                  style={{ padding: '8px 12px', marginBottom: 0 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{ marginBottom: '4px' }}>Entry Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={entryPrice}
                  placeholder="Suggested by AI..."
                  onChange={(e) => setEntryPrice(parseFloat(e.target.value) || '')}
                  style={{ padding: '8px 12px', marginBottom: 0 }}
                />
              </div>
              <div>
                <label style={{ marginBottom: '4px' }}>Stop Loss ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={stopLoss}
                  placeholder="Suggested by AI..."
                  onChange={(e) => setStopLoss(parseFloat(e.target.value) || '')}
                  style={{ padding: '8px 12px', marginBottom: 0 }}
                />
              </div>
            </div>

            {parsedEntry > 0 && parsedStop > 0 ? (
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Capital at Risk:</span>
                  <span style={{ fontWeight: '600' }}>${capitalAtRisk.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Required Stop Loss %:</span>
                  <span style={{ fontWeight: '600', color: stopLossPct > 8 ? 'var(--red-loss)' : 'var(--green-gain)' }}>
                    {stopLossPct.toFixed(2)}% {stopLossPct > 8 && '(High Risk - Max 8% recommended)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Suggested Purchase:</span>
                  <span style={{ fontWeight: '600', color: 'var(--primary-gold)' }}>{maxShares} Shares</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '8px', fontSize: '14px' }}>
                  <span style={{ fontWeight: '600' }}>Position Value:</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--primary-accent)' }}>
                    ${positionSize.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({positionSizePct.toFixed(1)}% of Capital)
                  </span>
                </div>
                {positionSizePct > 25 && (
                  <div style={{ marginTop: '12px', fontSize: '11px', color: 'var(--primary-gold)', background: 'rgba(212,175,55,0.08)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(212,175,55,0.2)' }}>
                    🔥 <strong>Druckenmiller Size Alert:</strong> Extremely large capital allocation ({positionSizePct.toFixed(0)}%). Highly aggressive! Ensure macroeconomic factors are extremely strong.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', padding: '10px 0' }}>
                Enter Entry and Stop-Loss prices to calculate allocation sizing.
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="error" style={{ color: 'var(--red-loss)', padding: '16px', backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', borderRadius: '10px', marginBottom: '24px' }}>
          <strong>Error Executing Analysis:</strong> {error}
        </div>
      )}

      {/* DETAILED RESULTS DASHBOARD */}
      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* PYTHON TECHNICAL indicator CHECKLIST & CHART */}
          {results.sepa_checks && Object.keys(results.sepa_checks).length > 0 && !results.sepa_checks.error && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px' }}>
              
              {/* MINERVINI CHECKLIST */}
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ marginBottom: '16px', color: 'var(--primary-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>✓</span> Minervini Stage 2 Trend Template Rules
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {Object.entries(results.sepa_checks).map(([key, check]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '13px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        <span style={{ color: check.passed ? 'var(--green-gain)' : 'var(--red-loss)', fontSize: '16px', fontWeight: 'bold' }}>
                          {check.passed ? '✓' : '✗'}
                        </span>
                        <span style={{ fontWeight: '500' }}>{check.desc}</span>
                      </div>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '11px', textAlign: 'right' }}>
                        {check.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CANDLESTICK PLOTLY CHART */}
              {results.chart_data && (
                <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ marginBottom: '12px', color: 'var(--primary-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📈</span> Python Trend Overlay
                  </h3>
                  <div style={{ flex: 1, minHeight: '380px' }}>
                    <Plot
                      data={[
                        {
                          x: results.chart_data.dates,
                          open: results.chart_data.open,
                          high: results.chart_data.high,
                          low: results.chart_data.low,
                          close: results.chart_data.close,
                          type: 'candlestick',
                          name: ticker.toUpperCase(),
                          decreasing: { line: { color: 'var(--red-loss)' } },
                          increasing: { line: { color: 'var(--green-gain)' } },
                        },
                        {
                          x: results.chart_data.dates,
                          y: results.chart_data.sma50,
                          type: 'scatter',
                          mode: 'lines',
                          name: '50 SMA',
                          line: { color: '#FF9500', width: 1.5 }
                        },
                        {
                          x: results.chart_data.dates,
                          y: results.chart_data.sma150,
                          type: 'scatter',
                          mode: 'lines',
                          name: '150 SMA',
                          line: { color: '#FF2D55', width: 1.5 }
                        },
                        {
                          x: results.chart_data.dates,
                          y: results.chart_data.sma200,
                          type: 'scatter',
                          mode: 'lines',
                          name: '200 SMA',
                          line: { color: 'var(--primary-gold)', width: 2 }
                        }
                      ]}
                      layout={{
                        dragmode: 'zoom',
                        showlegend: true,
                        plot_bgcolor: 'rgba(0,0,0,0)',
                        paper_bgcolor: 'rgba(0,0,0,0)',
                        font: { color: 'var(--text-primary)', size: 10 },
                        margin: { t: 20, r: 10, l: 40, b: 20 },
                        xaxis: {
                          gridcolor: 'rgba(255,255,255,0.05)',
                          rangeslider: { visible: false }
                        },
                        yaxis: {
                          gridcolor: 'rgba(255,255,255,0.05)',
                          autorange: true
                        }
                      }}
                      useResizeHandler={true}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* RENDER THE DETAILED AI ANALYSIS */}
          <div className="card" style={{ padding: '32px' }}>
            <h3 style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', color: 'var(--primary-gold)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🦅</span> Macro-Micro Investment Research Report
              </span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(results.report);
                  alert("Report copied to clipboard!");
                }}
                className="secondary" 
                style={{ padding: '6px 12px', fontSize: '12px', width: 'auto' }}
              >
                Copy Report
              </button>
            </h3>
            <div className="markdown-body" style={{ color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '15px' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {results.report}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DruckMinervini;
