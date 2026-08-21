import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import LazyMarkdown from '../components/LazyMarkdown';
import useAutoAiInsight from '../lib/useAutoAiInsight';
import TickerSearch from '../components/TickerSearch';
import ShareButton from '../components/ShareButton';
import {
  calculateDcf,
  formatDcfMoney,
  formatDcfPercent,
  formatDcfRatio,
  formatMarketCap,
  sanitizeDcfNumber,
  selectDcfBasis,
  stepDcfNumber,
} from '../lib/dcfMath';
import { createLatestRequestGuard } from '../lib/latestRequest';
import './Dcf.css';

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};

const GaugeChart = ({ marginOfSafety, fairValue, currency = '$' }) => {
  // Clamp Margin of Safety between -1 and 1 (-100% to 100%)
  const hasMargin = Number.isFinite(marginOfSafety);
  const clampedMoS = hasMargin ? Math.max(-1, Math.min(1, marginOfSafety)) : 0;
  
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
          <circle cx={cx} cy={cy} r="12" fill="#F5F5F7" />
          <polygon points={`${cx-5},${cy} ${cx+5},${cy} ${needleX},${needleY}`} fill="#F5F5F7" />
          
          {/* Label indicating Fair Value at Top */}
          <text x="120" y="10" fontSize="14" fontWeight="bold" textAnchor="middle" fill="var(--text-primary)">
            Fair Value
          </text>
          <text x="120" y="25" fontSize="14" fontWeight="bold" textAnchor="middle" fill="var(--text-primary)">
            {formatDcfMoney(fairValue, currency)}
          </text>
        </svg>
        
        {/* Dynamic labels */}
        <div style={{ position: 'absolute', bottom: '0', left: '10px', fontSize: '12px', fontWeight: 'bold' }}>Undervalued</div>
        <div style={{ position: 'absolute', bottom: '0', right: '10px', fontSize: '12px', fontWeight: 'bold' }}>Overvalued</div>
      </div>
      <div style={{ fontSize: '16px', fontWeight: 'bold', marginTop: '10px' }}>
        Margin of Safety: <span style={{ color: marginOfSafety > 0 ? '#38A169' : '#E53E3E' }}>
          {formatDcfPercent(marginOfSafety)}
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
  const [fetchError, setFetchError] = useState(null);
  const requestGuardRef = useRef(createLatestRequestGuard());

  const currency = currencyFor(ticker);

  const fetchDcfData = async (t) => {
    const requestId = requestGuardRef.current.begin();
    setLoading(true);
    setAiReport(null);
    setFetchError(null);
    try {
      const res = await axios.get(`/api/dcf/data/${t}`);
      if (!requestGuardRef.current.isCurrent(requestId)) return;
      const data = res.data;
      setStockData(data);
      setTicker(data.ticker);
      setSearchInput(data.ticker);
      
      const basis = selectDcfBasis(data);
      setBasedOn(basis.basedOn);
      setBaseValue(basis.baseValue);
      
      setTangibleBook(sanitizeDcfNumber(data.tangibleBookValue, {
        min: -1_000_000, max: 1_000_000, precision: 2, fallback: 0,
      }));
      
      if (data.historicalGrowthRate !== undefined && data.historicalGrowthRate !== null) {
        setGrowthRate(sanitizeDcfNumber(data.historicalGrowthRate, {
          min: -50, max: 100, precision: 2, fallback: 15.2,
        }));
      }
      
    } catch (err) {
      if (!requestGuardRef.current.isCurrent(requestId)) return;
      // Inline error — alert() freezes the preview renderer and interrupts flows
      setFetchError(err.response?.data?.detail || err.message);
    }
    if (requestGuardRef.current.isCurrent(requestId)) setLoading(false);
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
    const source = type === 'EPS w/o NRI' ? stockData.eps
      : type === 'FCF' ? stockData.fcf
        : stockData.dividend;
    setBaseValue(sanitizeDcfNumber(source, {
      min: 0, max: 1_000_000, precision: 3, fallback: 0,
    }));
  };

  // DCF Math using useMemo for instant updates
  const { growthValue, terminalValue, fairValue, marginOfSafety } = useMemo(() => calculateDcf({
    baseValue,
    discountRate,
    growthYears,
    growthRate,
    terminalYears,
    terminalRate,
    addTangibleBook,
    tangibleBook,
    stockPrice: stockData?.currentPrice,
  }), [baseValue, discountRate, growthYears, growthRate, terminalYears, terminalRate, addTangibleBook, tangibleBook, stockData]);

  const renderStars = (num) => {
    return Array(5).fill(0).map((_, i) => (
      <span key={i} style={{ color: i < num ? '#ECC94B' : '#E2E8F0', fontSize: '18px' }}>★</span>
    ));
  };
  
  const runAiAnalysis = async () => {
    if (!stockData) return;
    if (fairValue === null) {
      setAiReport('**A positive EPS, FCF, or adjusted dividend is required before generating a valuation brief.**');
      return;
    }
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setAiReport('**Add your Gemini API key in Settings to generate the valuation brief.**');
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

  // With a saved Gemini key, the valuation insight generates itself once per
  // loaded ticker — no click needed on first run.
  useAutoAiInsight(stockData, runAiAnalysis);

  return (
    <div id="dcf-analysis" className="dcf-calculator fade-in">
      {/* Top Header */}
      <div className="dcf-header card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '28px' }}>{ticker}</h2>
              {stockData && (
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Market Cap {formatMarketCap(stockData.marketCap, currency)} | PE {formatDcfRatio(stockData.pe)} | PB {formatDcfRatio(stockData.pb)} | Alpha Nova Score: <strong>{stockData.alphaScore ?? 'N/A'}</strong> / 100
                </div>
              )}
            </div>
            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <TickerSearch
                value={searchInput}
                onChange={setSearchInput}
                onSelect={(sym) => fetchDcfData(sym)}
                placeholder="Ticker or company name…"
                inputProps={{ className: 'search-input', onKeyDown: handleSearch }}
              />
              <button className="primary-btn" onClick={() => fetchDcfData(searchInput.toUpperCase())}>Load Ticker</button>
              {stockData && (
                <ShareButton
                  label="Share"
                  filename={`alpha-nova-dcf-${ticker.replace(/\W+/g, '-')}.png`}
                  shareText={`${ticker} DCF valuation — Alpha Nova`}
                  capture={() => document.getElementById('dcf-analysis')}
                />
              )}
            </div>
            {fetchError && (
              <div style={{ color: 'var(--red-loss)', padding: '12px 14px', background: 'rgba(255,69,58,0.1)', borderRadius: 10, marginTop: 12, fontSize: 13 }}>
                <strong>Could not load {'"'}{searchInput}{'"'}:</strong> {fetchError}
              </div>
            )}
        </div>
        {stockData && !loading && (
          <button
            data-noshare=""
            onClick={runAiAnalysis}
            disabled={aiLoading || fairValue === null}
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
            {aiLoading ? <><span className="spinner" style={{borderColor: 'rgba(62, 230, 255, 0.2)', borderTopColor: 'var(--primary-accent)', marginRight: '8px'}}></span> Analyzing...</> : 'Gemini AI Valuation'}
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
              <input type="text" readOnly value={stockData?.currentPrice == null ? '0.00' : formatDcfRatio(stockData.currentPrice)} style={{ textAlign: 'right', background: 'rgba(0,0,0,0.05)' }} />
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
                  min="0"
                  max="1000000"
                  step="0.001"
                  value={baseValue} 
                  onChange={(e) => setBaseValue(prev => sanitizeDcfNumber(e.target.value, {
                    min: 0, max: 1_000_000, precision: 3, fallback: prev,
                  }))}
                  style={{ textAlign: 'right' }} 
                />
              </div>
            </div>
          </div>

          <div className="input-row">
            <label>Discount Rate %</label>
            <div className="number-stepper">
              <button onClick={() => setDiscountRate(prev => stepDcfNumber(prev, -1, 1, 50))}>-</button>
              <input type="number" min="1" max="50" step="0.01" value={discountRate} onChange={(e) => setDiscountRate(prev => sanitizeDcfNumber(e.target.value, { min: 1, max: 50, fallback: prev }))} />
              <button onClick={() => setDiscountRate(prev => stepDcfNumber(prev, 1, 1, 50))}>+</button>
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
                min="-1000000"
                max="1000000"
                step="0.01"
                value={tangibleBook} 
                onChange={(e) => setTangibleBook(prev => sanitizeDcfNumber(e.target.value, {
                  min: -1_000_000, max: 1_000_000, precision: 2, fallback: prev,
                }))}
                style={{ textAlign: 'right' }} 
              />
            </div>
          </div>

          {/* wrap: side-by-side stage boxes overflow the viewport on phones */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '20px' }}>
            <div className="stage-box" style={{ minWidth: '240px' }}>
              <h4>Growth Stage</h4>
              <div className="stage-input">
                <label>Years</label>
                <div className="number-stepper">
                  <button onClick={() => setGrowthYears(prev => stepDcfNumber(prev, -1, 1, 30, 0))}>-</button>
                  <input type="number" min="1" max="30" step="1" value={growthYears} onChange={(e) => setGrowthYears(prev => sanitizeDcfNumber(e.target.value, { min: 1, max: 30, integer: true, fallback: prev }))} />
                  <button onClick={() => setGrowthYears(prev => stepDcfNumber(prev, 1, 1, 30, 0))}>+</button>
                </div>
              </div>
              <div className="stage-input">
                <label>Growth Rate</label>
                <div className="number-stepper">
                  <button onClick={() => setGrowthRate(prev => stepDcfNumber(prev, -0.1, -50, 100))}>-</button>
                  <input type="number" min="-50" max="100" step="0.01" value={growthRate} onChange={(e) => setGrowthRate(prev => sanitizeDcfNumber(e.target.value, { min: -50, max: 100, fallback: prev }))} />
                  <button onClick={() => setGrowthRate(prev => stepDcfNumber(prev, 0.1, -50, 100))}>+</button>
                </div>
              </div>
              <div className="stage-result">
                <span>Growth Value</span>
                <strong>{formatDcfMoney(growthValue, currency)}</strong>
              </div>
            </div>

            <div className="stage-box" style={{ minWidth: '240px' }}>
              <h4>Terminal Stage</h4>
              <div className="stage-input">
                <label>Years</label>
                <div className="number-stepper">
                  <button onClick={() => setTerminalYears(prev => stepDcfNumber(prev, -1, 1, 30, 0))}>-</button>
                  <input type="number" min="1" max="30" step="1" value={terminalYears} onChange={(e) => setTerminalYears(prev => sanitizeDcfNumber(e.target.value, { min: 1, max: 30, integer: true, fallback: prev }))} />
                  <button onClick={() => setTerminalYears(prev => stepDcfNumber(prev, 1, 1, 30, 0))}>+</button>
                </div>
              </div>
              <div className="stage-input">
                <label>Growth Rate</label>
                <div className="number-stepper">
                  <button onClick={() => setTerminalRate(prev => stepDcfNumber(prev, -0.1, -10, 20))}>-</button>
                  <input type="number" min="-10" max="20" step="0.01" value={terminalRate} onChange={(e) => setTerminalRate(prev => sanitizeDcfNumber(e.target.value, { min: -10, max: 20, fallback: prev }))} />
                  <button onClick={() => setTerminalRate(prev => stepDcfNumber(prev, 0.1, -10, 20))}>+</button>
                </div>
              </div>
              <div className="stage-result">
                <span>Terminal Value</span>
                <strong>{formatDcfMoney(terminalValue, currency)}</strong>
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
              <strong>{formatDcfMoney(stockData?.currentPrice, currency)}</strong>
            </div>
            <div className="summary-row" style={{ backgroundColor: 'var(--primary-accent-soft)' }}>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Fair Value</span>
              <strong className="tnum" style={{ fontSize: '18px', color: 'var(--primary-gold)' }}>{formatDcfMoney(fairValue, currency)}</strong>
            </div>
            <div className="summary-row" style={{ backgroundColor: 'var(--primary-accent-soft)' }}>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Margin of Safety</span>
              <strong className="tnum" style={{ fontSize: '18px', color: marginOfSafety === null ? 'var(--text-secondary)' : marginOfSafety > 0 ? 'var(--green-gain)' : 'var(--red-loss)' }}>
                {formatDcfPercent(marginOfSafety)}
              </strong>
            </div>
          </div>
          {stockData && fairValue === null && (
            <div className="dcf-validation" role="status">
              No positive EPS, free cash flow per share, or adjusted dividend is available. Enter a positive normalized base value to run the model.
            </div>
          )}
          
          <GaugeChart
            marginOfSafety={marginOfSafety}
            fairValue={fairValue}
            currency={currency}
          />
          
        </div>
      </div>
      
      {aiReport && (
        <div className="ai-insight fade-in" style={{ marginTop: '20px', background: 'linear-gradient(135deg, rgba(62, 230, 255, 0.05) 0%, rgba(0, 0, 0, 0) 100%)', border: '1px solid rgba(62, 230, 255, 0.2)' }}>
          <h3 style={{ color: 'var(--primary-accent)' }}>AI Valuation Report</h3>
          <div className="ai-insight-content">
            <LazyMarkdown>{aiReport}</LazyMarkdown>
          </div>
        </div>
      )}
      
      {loading && <div style={{ marginTop: '20px', textAlign: 'center', color: 'var(--primary-gold)' }}>Loading fundamental data...</div>}
    </div>
  );
};

export default Dcf;
