import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './Dcf.css';

// Steppers accumulate float noise (6.88 - 0.1 -> 6.7799...94) without rounding
const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};

const GaugeChart = ({ marginOfSafety, fairValue, currency = '$' }) => {
  // Clamp Margin of Safety between -1 and 1 (-100% to 100%)
  const clampedMoS = Math.max(-1, Math.min(1, marginOfSafety));
  
  // Angle: MoS = 1 -> 0 deg (Left, Undervalued)
  // MoS = 0 -> 90 deg (Top, Fair Value)
  // MoS = -1 -> 180 deg (Right, Overvalued)
  const angle = ((1 - clampedMoS) / 2) * 180;

  // Convert angle to radians for x, y coordinates
  const angleRad = (angle * Math.PI) / 180;
  const radius = 100;
  const cx = 120;
  const cy = 120;
  
  const needleX = cx - radius * Math.cos(angleRad);
  const needleY = cy - radius * Math.sin(angleRad);

  return (
    <div className="gauge-container" style={{ textAlign: 'center', marginTop: '20px' }}>
      <div style={{ position: 'relative', width: '240px', height: '140px', margin: '0 auto' }}>
        <svg width="240" height="140" viewBox="0 0 240 140">
          {/* Green Zone (Undervalued) */}
          <path d="M 20 120 A 100 100 0 0 1 70 33 L 95 76 A 50 50 0 0 0 70 120 Z" fill="#38A169" />
          {/* Light Green / Yellow Zone */}
          <path d="M 70 33 A 100 100 0 0 1 120 20 L 120 70 A 50 50 0 0 0 95 76 Z" fill="#68D391" />
          <path d="M 120 20 A 100 100 0 0 1 170 33 L 145 76 A 50 50 0 0 0 120 70 Z" fill="#F6E05E" />
          {/* Red Zone (Overvalued) */}
          <path d="M 170 33 A 100 100 0 0 1 220 120 L 170 120 A 50 50 0 0 0 145 76 Z" fill="#E53E3E" />
          
          {/* Needle */}
          <circle cx={cx} cy={cy} r="12" fill="#2D3748" />
          <polygon points={`${cx-5},${cy} ${cx+5},${cy} ${needleX},${needleY}`} fill="#2D3748" />
          
          {/* Label indicating Fair Value at Top */}
          <text x="120" y="10" fontSize="14" fontWeight="bold" textAnchor="middle" fill="var(--text-primary)">
            Fair Value
          </text>
          <text x="120" y="25" fontSize="14" fontWeight="bold" textAnchor="middle" fill="var(--text-primary)">
            {currency}{fairValue.toFixed(2)}
          </text>
        </svg>
        
        {/* Dynamic labels */}
        <div style={{ position: 'absolute', bottom: '0', left: '10px', fontSize: '12px', fontWeight: 'bold' }}>Undervalued</div>
        <div style={{ position: 'absolute', bottom: '0', right: '10px', fontSize: '12px', fontWeight: 'bold' }}>Overvalued</div>
      </div>
      <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '10px' }}>
        Margin of Safety: <span style={{ color: marginOfSafety > 0 ? '#38A169' : '#E53E3E' }}>
          {(marginOfSafety * 100).toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

const Dcf = () => {
  const [ticker, setTicker] = useState('AAPL');
  const [searchInput, setSearchInput] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState(null);
  
  // Form State
  const [basedOn, setBasedOn] = useState('EPS w/o NRI');
  const [baseValue, setBaseValue] = useState(0);
  const [discountRate, setDiscountRate] = useState(11);
  const [tangibleBook, setTangibleBook] = useState(0);
  const [addTangibleBook, setAddTangibleBook] = useState(false);
  
  const [growthYears, setGrowthYears] = useState(10);
  const [growthRate, setGrowthRate] = useState(15.2);
  const [terminalYears, setTerminalYears] = useState(10);
  const [terminalRate, setTerminalRate] = useState(4);
  
  // AI State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState(null);

  const currency = currencyFor(ticker);

  const fetchDcfData = async (t) => {
    setLoading(true);
    setAiReport(null);
    try {
      const res = await axios.get(`/api/dcf/data/${t}`);
      const data = res.data;
      setStockData(data);
      setTicker(data.ticker);
      setSearchInput(data.ticker);
      
      // Auto-populate inputs based on what's available
      if (data.eps) {
        setBasedOn('EPS w/o NRI');
        setBaseValue(parseFloat(data.eps.toFixed(3)));
      } else if (data.fcf) {
        setBasedOn('FCF');
        setBaseValue(parseFloat(data.fcf.toFixed(3)));
      }
      
      setTangibleBook(parseFloat((data.tangibleBookValue || 0).toFixed(2)));
      
      if (data.historicalGrowthRate !== undefined && data.historicalGrowthRate !== null) {
        setGrowthRate(data.historicalGrowthRate);
      }
      
    } catch (err) {
      alert("Error fetching data: " + (err.response?.data?.detail || err.message));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDcfData('AAPL');
  }, []);

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      fetchDcfData(searchInput.toUpperCase());
    }
  };

  const handleBasedOnChange = (type) => {
    setBasedOn(type);
    if (!stockData) return;
    if (type === 'EPS w/o NRI') setBaseValue(parseFloat((stockData.eps || 0).toFixed(3)));
    if (type === 'FCF') setBaseValue(parseFloat((stockData.fcf || 0).toFixed(3)));
    if (type === 'Adjusted Dividend') setBaseValue(parseFloat((stockData.dividend || 0).toFixed(3)));
  };

  // DCF Math using useMemo for instant updates
  const { growthValue, terminalValue, fairValue, marginOfSafety } = useMemo(() => {
    let currentVal = baseValue;
    let gv = 0;
    
    // Growth Stage
    const r = discountRate / 100;
    const g = growthRate / 100;
    
    // Calculate year by year for precision
    for (let i = 1; i <= growthYears; i++) {
      currentVal *= (1 + g);
      gv += currentVal / Math.pow(1 + r, i);
    }
    
    // Terminal Stage
    let tv = 0;
    const tg = terminalRate / 100;
    
    for (let i = 1; i <= terminalYears; i++) {
      currentVal *= (1 + tg);
      tv += currentVal / Math.pow(1 + r, growthYears + i);
    }
    
    let fv = gv + tv;
    if (addTangibleBook) {
      fv += tangibleBook;
    }
    
    const stockPrice = stockData?.currentPrice || 0;
    const mos = fv > 0 ? (fv - stockPrice) / fv : 0;
    
    return {
      growthValue: gv,
      terminalValue: tv,
      fairValue: fv,
      marginOfSafety: mos
    };
  }, [baseValue, discountRate, growthYears, growthRate, terminalYears, terminalRate, addTangibleBook, tangibleBook, stockData]);

  const renderStars = (num) => {
    return Array(5).fill(0).map((_, i) => (
      <span key={i} style={{ color: i < num ? '#ECC94B' : '#E2E8F0', fontSize: '18px' }}>★</span>
    ));
  };
  
  const runAiAnalysis = async () => {
    if (!stockData) return;
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      alert("Please configure your Gemini API Key in the Settings tab first.");
      return;
    }

    setAiLoading(true);
    try {
      const payload = {
        baseValue, discountRate, tangibleBook, addTangibleBook,
        growthYears, growthRate, terminalYears, terminalRate,
        fairValue, marginOfSafety,
        stockPrice: stockData.currentPrice,
        marketCap: stockData.marketCap
      };
      
      const response = await axios.post('/api/ai/dcf', {
        ticker: ticker,
        apiKey: apiKey,
        dcf_data: payload
      });
      setAiReport(response.data.report);
    } catch (err) {
      setAiReport(`**Error generating analysis:** ${err.message}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="dcf-calculator fade-in">
      {/* Top Header */}
      <div className="dcf-header card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '28px' }}>{ticker}</h2>
              {stockData && (
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Market Cap {currency} {(stockData.marketCap / 1e9).toFixed(2)} Bil | PE {stockData.pe?.toFixed(2) || 'N/A'} | PB {stockData.pb?.toFixed(2) || 'N/A'} | Alpha Nova Score: <strong>{
                    Math.min(99, Math.max(10, Math.round(
                      50 +
                      ((stockData.predictability - 3) * 10) +
                      clamp(marginOfSafety * 40, -25, 25) +
                      (stockData.pe > 0 && stockData.pe < 25 ? 15 : 0)
                    )))
                  }</strong> / 100
                </div>
              )}
            </div>
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="🔍 Switch Ticker (e.g. MSFT)" 
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearch}
                className="search-input"
              />
              <button className="primary-btn" onClick={() => fetchDcfData(searchInput.toUpperCase())}>Load Ticker</button>
            </div>
        </div>
        {stockData && !loading && (
          <button 
            onClick={runAiAnalysis} 
            disabled={aiLoading}
            style={{ 
              width: 'auto', 
              background: 'linear-gradient(90deg, rgba(62, 230, 255, 0.2), rgba(62, 230, 255, 0.1))',
              border: '1px solid rgba(62, 230, 255, 0.4)',
              color: 'var(--primary-accent)',
              padding: '10px 20px',
              borderRadius: '20px',
              fontWeight: 'bold',
              height: 'fit-content'
            }}
          >
            {aiLoading ? <><span className="spinner" style={{borderColor: 'rgba(62, 230, 255, 0.2)', borderTopColor: 'var(--primary-accent)', marginRight: '8px'}}></span> Analyzing...</> : '✨ Gemini AI Valuation'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: '20px', flexWrap: 'wrap' }}>
        {/* Left Panel: Inputs */}
        <div className="dcf-left-panel card" style={{ flex: 2, minWidth: '400px' }}>
          <div className="input-row">
            <label>Stock Price</label>
            <div className="input-group">
              <span>{currency}</span>
              <input type="text" readOnly value={stockData?.currentPrice?.toFixed(2) || '0.00'} style={{ textAlign: 'right', background: 'rgba(0,0,0,0.05)' }} />
            </div>
          </div>

          <div className="input-row">
            <label>Based on</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1 }}>
              <div className="segmented-control">
                {['EPS w/o NRI', 'FCF', 'Adjusted Dividend'].map(type => (
                  <button 
                    key={type}
                    className={basedOn === type ? 'active' : ''}
                    onClick={() => handleBasedOnChange(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <div className="input-group" style={{ width: '100px' }}>
                <span>{currency}</span>
                <input 
                  type="number" 
                  value={baseValue} 
                  onChange={(e) => setBaseValue(parseFloat(e.target.value) || 0)} 
                  style={{ textAlign: 'right' }} 
                />
              </div>
            </div>
          </div>

          <div className="input-row">
            <label>Discount Rate %</label>
            <div className="number-stepper">
              <button onClick={() => setDiscountRate(prev => clamp(round1(prev - 1), 1, 50))}>-</button>
              <input type="number" value={discountRate} onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)} />
              <button onClick={() => setDiscountRate(prev => clamp(round1(prev + 1), 1, 50))}>+</button>
            </div>
          </div>

          <div className="input-row">
            <label>
              Tangible Book Value 
              <input 
                type="checkbox" 
                checked={addTangibleBook} 
                onChange={(e) => setAddTangibleBook(e.target.checked)} 
                style={{ marginLeft: '10px', width: 'auto' }}
              /> 
              <span style={{ fontSize: '12px', fontWeight: 'normal' }}>Add to Fair Value</span>
            </label>
            <div className="input-group" style={{ width: '120px' }}>
              <span>{currency}</span>
              <input 
                type="number" 
                value={tangibleBook} 
                onChange={(e) => setTangibleBook(parseFloat(e.target.value) || 0)} 
                style={{ textAlign: 'right' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
            <div className="stage-box">
              <h4>Growth Stage</h4>
              <div className="stage-input">
                <label>Years</label>
                <div className="number-stepper">
                  <button onClick={() => setGrowthYears(prev => clamp(prev - 1, 1, 30))}>-</button>
                  <input type="number" value={growthYears} onChange={(e) => setGrowthYears(parseInt(e.target.value) || 0)} />
                  <button onClick={() => setGrowthYears(prev => clamp(prev + 1, 1, 30))}>+</button>
                </div>
              </div>
              <div className="stage-input">
                <label>Growth Rate</label>
                <div className="number-stepper">
                  <button onClick={() => setGrowthRate(prev => clamp(round1(prev - 0.1), -50, 100))}>-</button>
                  <input type="number" value={growthRate} onChange={(e) => setGrowthRate(parseFloat(e.target.value) || 0)} />
                  <button onClick={() => setGrowthRate(prev => clamp(round1(prev + 0.1), -50, 100))}>+</button>
                </div>
              </div>
              <div className="stage-result">
                <span>Growth Value</span>
                <strong>{currency}{growthValue.toFixed(2)}</strong>
              </div>
            </div>

            <div className="stage-box">
              <h4>Terminal Stage</h4>
              <div className="stage-input">
                <label>Years</label>
                <div className="number-stepper">
                  <button onClick={() => setTerminalYears(prev => clamp(prev - 1, 1, 30))}>-</button>
                  <input type="number" value={terminalYears} onChange={(e) => setTerminalYears(parseInt(e.target.value) || 0)} />
                  <button onClick={() => setTerminalYears(prev => clamp(prev + 1, 1, 30))}>+</button>
                </div>
              </div>
              <div className="stage-input">
                <label>Growth Rate</label>
                <div className="number-stepper">
                  <button onClick={() => setTerminalRate(prev => clamp(round1(prev - 0.1), -10, 20))}>-</button>
                  <input type="number" value={terminalRate} onChange={(e) => setTerminalRate(parseFloat(e.target.value) || 0)} />
                  <button onClick={() => setTerminalRate(prev => clamp(round1(prev + 0.1), -10, 20))}>+</button>
                </div>
              </div>
              <div className="stage-result">
                <span>Terminal Value</span>
                <strong>{currency}{terminalValue.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Output & Gauge */}
        <div className="dcf-right-panel" style={{ flex: 1, minWidth: '300px' }}>
          <div className="card output-summary" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '15px', borderBottom: '1px solid var(--border-light)' }}>
              Business Predictability {renderStars(stockData?.predictability || 3)}
            </div>
            <div className="summary-row" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <span>Stock Price</span>
              <strong>{currency}{stockData?.currentPrice?.toFixed(2) || '0.00'}</strong>
            </div>
            <div className="summary-row" style={{ backgroundColor: 'var(--primary-accent-soft)' }}>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Fair Value</span>
              <strong className="tnum" style={{ fontSize: '18px', color: 'var(--primary-gold)' }}>{currency}{fairValue.toFixed(2)}</strong>
            </div>
            <div className="summary-row" style={{ backgroundColor: 'var(--primary-accent-soft)' }}>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Margin of Safety</span>
              <strong className="tnum" style={{ fontSize: '18px', color: marginOfSafety > 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
                {marginOfSafety < 0 && '👎'} {(marginOfSafety * 100).toFixed(2)}%
              </strong>
            </div>
          </div>
          
          <GaugeChart
            marginOfSafety={marginOfSafety}
            fairValue={fairValue}
            currency={currency}
          />
          
        </div>
      </div>
      
      {aiReport && (
        <div className="ai-insight fade-in" style={{ marginTop: '20px', background: 'linear-gradient(135deg, rgba(62, 230, 255, 0.05) 0%, rgba(0, 0, 0, 0) 100%)', border: '1px solid rgba(62, 230, 255, 0.2)' }}>
          <h3 style={{ color: 'var(--primary-accent)' }}>✨ AI Valuation Report</h3>
          <div className="ai-insight-content">
            <ReactMarkdown>{aiReport}</ReactMarkdown>
          </div>
        </div>
      )}
      
      {loading && <div style={{ marginTop: '20px', textAlign: 'center', color: 'var(--primary-gold)' }}>Loading fundamental data...</div>}
    </div>
  );
};

export default Dcf;
