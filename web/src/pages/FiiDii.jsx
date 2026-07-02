import React, { useState, useEffect } from 'react';
import axios from 'axios';

const FiiDii = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('FII'); // 'FII' or 'DII'

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/fiidii');
        if (res.data && res.data.data) {
          setData(res.data.data);
        }
      } catch (err) {
        console.error("FII/DII fetch failed:", err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatAmount = (val) => {
    const sign = val > 0 ? '+' : '';
    return sign + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper to render the red/green bar
  // We'll normalize the width relative to the maximum absolute value in the dataset
  const maxAbsValue = data.length > 0 ? Math.max(...data.map(d => Math.abs(view === 'FII' ? d.fii_net : d.dii_net))) : 10000;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ background: 'linear-gradient(90deg, #FFFFFF, #888888)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '4px' }}>FII / DII Activity</h2>
          <p style={{color: "var(--text-secondary)"}}>CM Provisional Institutional Flow</p>
          <p style={{color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px"}}>* Historical data past 1 day is structurally modeled on Nifty benchmark flows for visualization.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            className={view === 'FII' ? 'primary' : 'secondary'} 
            onClick={() => setView('FII')}
            style={{ padding: '8px 16px' }}
          >
            FII
          </button>
          <button 
            className={view === 'DII' ? 'primary' : 'secondary'} 
            onClick={() => setView('DII')}
            style={{ padding: '8px 16px' }}
          >
            DII
          </button>
        </div>
      </div>
      
      {loading ? <p><span className="spinner"></span> Loading Flow Data...</p> : (
        <div className="card" style={{ padding: '20px' }}>
          <div className="table-container">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: '15px' }}>Date</th>
                  <th style={{ textAlign: 'right', paddingBottom: '15px' }}>Amount (Rs. Cr.)</th>
                  <th style={{ textAlign: 'center', paddingBottom: '15px', width: '200px' }}>Net Buy/(Sell)*</th>
                  <th style={{ textAlign: 'right', paddingBottom: '15px' }}>Nifty Closing</th>
                  <th style={{ textAlign: 'right', paddingBottom: '15px' }}>Chg %</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, index) => {
                  const val = view === 'FII' ? row.fii_net : row.dii_net;
                  const isPositive = val > 0;
                  // Calculate width percentage relative to the max value (scale 0 to 100%)
                  const widthPct = Math.min((Math.abs(val) / (maxAbsValue || 1)) * 100, 100);
                  
                  return (
                    <tr key={index} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '15px 0', fontWeight: '500' }}>{row.date}</td>
                      <td style={{ textAlign: 'right', color: isPositive ? 'var(--green-gain)' : 'var(--red-loss)', fontWeight: 'bold' }}>
                        {formatAmount(val)}
                      </td>
                      <td style={{ padding: '15px 10px' }}>
                        <div style={{ display: 'flex', width: '100%', height: '12px', alignItems: 'center' }}>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '2px' }}>
                            {!isPositive && (
                              <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: 'var(--red-loss)', borderRadius: '2px 0 0 2px' }}></div>
                            )}
                          </div>
                          <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--text-secondary)' }}></div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '2px' }}>
                            {isPositive && (
                              <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: 'var(--green-gain)', borderRadius: '0 2px 2px 0' }}></div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '500' }}>{row.nifty_close.toLocaleString('en-IN')}</td>
                      <td style={{ textAlign: 'right', color: row.chg_pct > 0 ? 'var(--green-gain)' : (row.chg_pct < 0 ? 'var(--red-loss)' : 'inherit') }}>
                        {row.chg_pct > 0 ? '▲' : (row.chg_pct < 0 ? '▼' : '')} {Math.abs(row.chg_pct).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiiDii;
