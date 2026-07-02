import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './OptionChain.css';

const OptionChain = () => {
  // Constants
  const PRESETS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
  
  // State
  const [activeSymbol, setActiveSymbol] = useState('NIFTY');
  const [searchInput, setSearchInput] = useState('');
  
  const [expiries, setExpiries] = useState([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  
  const [chainData, setChainData] = useState(null);
  const [spotData, setSpotData] = useState(null);
  const [vixData, setVixData] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refreshIntervalRef = useRef(null);

  // Formatting helpers
  const formatNum = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return Math.round(val).toLocaleString('en-IN');
  };

  const formatDec = (val, dec = 2) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    return Number(val).toFixed(dec);
  };

  const getColorClass = (val) => {
    if (val > 0) return 'text-green';
    if (val < 0) return 'text-red';
    return 'text-neutral';
  };

  // API Calls
  useEffect(() => {
    const fetchExpiries = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get(`/api/option-chain/expiries/${activeSymbol}`);
        if (res.data && res.data.expiries && res.data.expiries.length > 0) {
          setExpiries(res.data.expiries);
          setSelectedExpiry(res.data.expiries[0]);
        } else {
          setExpiries([]);
          setSelectedExpiry('');
          setError('No expiries found.');
        }
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to fetch expiries from data source.');
        setExpiries([]);
      } finally {
        setLoading(false);
      }
    };
    fetchExpiries();
  }, [activeSymbol]);

  const fetchChainData = async (showLoading = true) => {
    if (!selectedExpiry) return;
    if (showLoading) setLoading(true);
    
    try {
      const res = await axios.get(`/api/option-chain/data/${activeSymbol}`, {
        params: { expiryDate: selectedExpiry }
      });
      setChainData(res.data.optionChain || null);
      setSpotData(res.data.spotData || null);
      setVixData(res.data.vixData || null);
      setError(null);
    } catch (err) {
      if (showLoading) setError(err.response?.data?.detail || 'Failed to fetch option chain matrix.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchChainData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpiry, activeSymbol]);

  useEffect(() => {
    if (autoRefresh && selectedExpiry) {
      refreshIntervalRef.current = setInterval(() => {
        fetchChainData(false);
      }, 30000);
    } else {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    }
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, selectedExpiry, activeSymbol]);

  // Handlers
  const handlePreset = (sym) => {
    setActiveSymbol(sym);
    setSearchInput('');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setActiveSymbol(searchInput.trim().toUpperCase());
    }
  };

  // Metrics Calculation
  let calculatedPcr = 0;
  let atmStrike = 0;
  const spotPrice = spotData?.last_trade_price || 0;

  if (chainData?.opDatas && chainData.opDatas.length > 0 && spotPrice > 0) {
    let totalCallsOi = 0;
    let totalPutsOi = 0;
    
    const closestRow = chainData.opDatas.reduce((prev, curr) => {
      return Math.abs(curr.strike_price - spotPrice) < Math.abs(prev.strike_price - spotPrice) ? curr : prev;
    });
    atmStrike = closestRow.strike_price;

    chainData.opDatas.forEach(row => {
      totalCallsOi += row.calls_oi || 0;
      totalPutsOi += row.puts_oi || 0;
    });
    
    calculatedPcr = totalCallsOi > 0 ? (totalPutsOi / totalCallsOi) : 0;
  }

  return (
    <div className="option-chain-container fade-in">
      {/* Header */}
      <div className="oc-header-bar">
        <div>
          <h2>Institutional Option Chain</h2>
          <p style={{ color: '#86868b', margin: 0, fontSize: '14px' }}>
            Real-time derivative analytics and structural mapping.
          </p>
        </div>
        
        <div className="oc-selector-group">
          {PRESETS.map(preset => (
            <button
              key={preset}
              className={`preset-button ${activeSymbol === preset ? 'active' : ''}`}
              onClick={() => handlePreset(preset)}
            >
              {preset}
            </button>
          ))}
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
            <input
              className="custom-ticker-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Custom Ticker..."
            />
            <button type="submit" className="preset-button active" style={{ padding: '8px 12px' }}>GO</button>
          </form>
        </div>
      </div>

      {/* Controls & Spot Display */}
      <div className="controls-row">
        <div className="spot-price-display">
          <span className="spot-label">Spot Price:</span>
          <span className="spot-value">{activeSymbol} {formatDec(spotPrice)}</span>
          {spotData?.change_value !== undefined && (
             <span className={`spot-change ${spotData.change_value >= 0 ? 'positive' : 'negative'}`}>
               {spotData.change_value >= 0 ? '+' : ''}{formatDec(spotData.change_value)} ({formatDec(spotData.change_per)}%)
             </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          {expiries.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#a5a5aa', fontSize: '14px', fontWeight: 500 }}>Expiry:</span>
              <select
                className="expiry-select"
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(e.target.value)}
              >
                {expiries.map(exp => {
                  let displayStr = exp;
                  try {
                     displayStr = new Date(exp.split("T")[0]).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  } catch {
                    // keep raw expiry string
                  }
                  return <option key={exp} value={exp}>{displayStr}</option>;
                })}
              </select>
            </div>
          )}

          <div className="refresh-toggle-container">
            <span>Auto Refresh</span>
            <label className="switch">
              <input type="checkbox" checked={autoRefresh} onChange={() => setAutoRefresh(!autoRefresh)} />
              <span className="slider"></span>
            </label>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      {chainData && !loading && !error && (
        <div className="oc-metrics-grid fade-in">
          <div className="oc-metric-box">
            <span className="oc-metric-label">Put/Call Ratio</span>
            <span className={`oc-metric-value ${calculatedPcr >= 1 ? 'text-green' : 'text-red'}`}>
              {formatDec(calculatedPcr, 3)}
            </span>
          </div>
          <div className="oc-metric-box">
            <span className="oc-metric-label">Max Pain</span>
            <span className="oc-metric-value" style={{ color: 'var(--primary-gold)' }}>
              {formatNum(spotData?.max_pain)}
            </span>
          </div>
          <div className="oc-metric-box">
            <span className="oc-metric-label">India VIX</span>
            <span className={`oc-metric-value ${vixData?.change_value >= 0 ? 'text-red' : 'text-green'}`}>
              {formatDec(vixData?.last_trade_price)}
              <span style={{ fontSize: '13px', marginLeft: '6px', fontWeight: 500 }}>
                ({vixData?.change_value >= 0 ? '+' : ''}{formatDec(vixData?.change_value)})
              </span>
            </span>
          </div>
          <div className="oc-metric-box">
            <span className="oc-metric-label">ATM Strike</span>
            <span className="oc-metric-value" style={{ color: '#e5e5e5' }}>
              {formatNum(atmStrike)}
            </span>
          </div>
        </div>
      )}

      {/* Main Table */}
      {loading ? (
        <div className="loading-container fade-in">
          <div className="spinner"></div>
          <p>Analyzing derivative data streams...</p>
        </div>
      ) : error ? (
        <div style={{ background: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.3)', padding: '24px', borderRadius: '12px', color: '#ff453a', textAlign: 'center' }}>
          <h3 style={{ margin: '0 0 8px 0' }}>Data Sync Failed</h3>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      ) : chainData?.opDatas ? (
        <div className="oc-table-wrapper fade-in">
          <table className="oc-table">
            <thead>
              <tr>
                <th colSpan="6" style={{ textAlign: 'center', borderRight: '1px solid rgba(255,255,255,0.1)' }}>CALLS (Resistance)</th>
                <th style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>STRIKE</th>
                <th colSpan="6" style={{ textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>PUTS (Support)</th>
              </tr>
              <tr>
                <th>OI</th>
                <th>Chg OI</th>
                <th>Volume</th>
                <th>IV</th>
                <th>LTP</th>
                <th style={{ borderRight: '1px solid rgba(255,255,255,0.1)' }}>Net Chg</th>
                <th style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)' }}>PRICE</th>
                <th style={{ borderLeft: '1px solid rgba(255,255,255,0.1)' }}>Net Chg</th>
                <th>LTP</th>
                <th>IV</th>
                <th>Volume</th>
                <th>Chg OI</th>
                <th>OI</th>
              </tr>
            </thead>
            <tbody>
              {chainData.opDatas.map((row, idx) => {
                const isAtm = row.strike_price === atmStrike;
                return (
                  <tr key={idx} className={isAtm ? 'atm-row' : ''}>
                    {/* Calls */}
                    <td className="calls-section">{formatNum(row.calls_oi)}</td>
                    <td className={`calls-section ${getColorClass(row.calls_change_oi)}`}>{formatNum(row.calls_change_oi)}</td>
                    <td className="calls-section">{formatNum(row.calls_volume)}</td>
                    <td className="calls-section">{formatDec(row.calls_iv)}</td>
                    <td className="calls-section" style={{ fontWeight: 600, color: '#e5e5e5' }}>{formatDec(row.calls_ltp)}</td>
                    <td className={`calls-section ${getColorClass(row.calls_net_change)}`} style={{ borderRight: '1px solid rgba(255,255,255,0.05)', fontWeight: 500 }}>
                      {row.calls_net_change > 0 ? '+' : ''}{formatDec(row.calls_net_change)}
                    </td>

                    {/* Strike */}
                    <td className="strike-cell">{row.strike_price}</td>

                    {/* Puts */}
                    <td className={`puts-section ${getColorClass(row.puts_net_change)}`} style={{ borderLeft: '1px solid rgba(255,255,255,0.05)', fontWeight: 500 }}>
                      {row.puts_net_change > 0 ? '+' : ''}{formatDec(row.puts_net_change)}
                    </td>
                    <td className="puts-section" style={{ fontWeight: 600, color: '#e5e5e5' }}>{formatDec(row.puts_ltp)}</td>
                    <td className="puts-section">{formatDec(row.puts_iv)}</td>
                    <td className="puts-section">{formatNum(row.puts_volume)}</td>
                    <td className={`puts-section ${getColorClass(row.puts_change_oi)}`}>{formatNum(row.puts_change_oi)}</td>
                    <td className="puts-section">{formatNum(row.puts_oi)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
};

export default OptionChain;
