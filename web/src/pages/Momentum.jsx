import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Momentum = () => {
  const [market, setMarket] = useState('us');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(`/api/momentum?market=${market}`);
        setData(response.data.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [market]);

  return (
    <div className="page">
      <div className="header">
        <h1>Momentum Leaders</h1>
        <p>Top {market === 'us' ? 'US' : 'Indian'} stocks ranked by 1M, 6M, and 12M momentum.</p>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button 
          className="btn" 
          style={{ backgroundColor: market === 'us' ? 'var(--primary-gold)' : 'var(--panel-bg)', color: market === 'us' ? '#000' : 'var(--text-primary)' }}
          onClick={() => setMarket('us')}
        >
          US Market
        </button>
        <button 
          className="btn" 
          style={{ backgroundColor: market === 'in' ? 'var(--primary-gold)' : 'var(--panel-bg)', color: market === 'in' ? '#000' : 'var(--text-primary)' }}
          onClick={() => setMarket('in')}
        >
          Indian Market
        </button>
      </div>

      {loading ? (
        <div className="panel" style={{ overflowX: 'auto', padding: '24px' }}>
          <div className="skeleton skeleton-header"></div>
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="skeleton skeleton-row" style={{ height: '40px', marginTop: '16px' }}></div>
          ))}
        </div>
      ) : error ? (
        <div className="error" style={{ color: 'var(--red-loss)', padding: '20px', backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ marginBottom: '8px', fontSize: '16px', color: 'var(--red-loss)' }}>Failed to Load Data</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
          <button onClick={() => setMarket(market)} style={{ width: 'auto', padding: '8px 16px', background: 'rgba(255, 69, 58, 0.15)', border: '1px solid var(--red-loss)', color: 'var(--red-loss)' }}>Retry</button>
        </div>
      ) : (
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Ticker</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>Price</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>1M Return</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>6M Return</th>
                <th style={{ padding: '12px', color: 'var(--text-secondary)' }}>12M Return</th>
                <th style={{ padding: '12px', color: 'var(--primary-gold)' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }} className="table-row">
                  <td style={{ padding: '12px', fontWeight: '600' }}>{item.ticker}</td>
                  <td style={{ padding: '12px' }}>{market === 'in' ? '₹' : '$'}{item.price}</td>
                  <td style={{ padding: '12px', color: item.mom_1m >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{item.mom_1m}%</td>
                  <td style={{ padding: '12px', color: item.mom_6m >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{item.mom_6m}%</td>
                  <td style={{ padding: '12px', color: item.mom_12m >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{item.mom_12m}%</td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--primary-gold)' }}>{item.score}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Momentum;
