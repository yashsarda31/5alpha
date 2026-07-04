import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PageHeader, DataTable } from '../components/ui';

const ToggleBtn = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      width: 'auto', padding: '7px 16px', borderRadius: 'var(--r-pill)', fontSize: '13px',
      background: active ? 'var(--primary-accent-soft)' : 'transparent',
      color: active ? 'var(--primary-accent)' : 'var(--text-secondary)',
      border: `1px solid ${active ? 'var(--primary-accent-border)' : 'var(--border-subtle)'}`,
    }}
  >
    {children}
  </button>
);

const pct = (v) => (
  <span className={v >= 0 ? 'tone-gain' : 'tone-loss'}>{v >= 0 ? '+' : ''}{Number(v).toFixed(2)}%</span>
);

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

  const cur = market === 'in' ? '₹' : '$';
  const columns = [
    { key: 'ticker', label: 'Ticker', render: (r) => <strong>{r.ticker}</strong> },
    { key: 'price', label: 'Price', align: 'right', render: (r) => `${cur}${r.price}` },
    { key: 'mom_1m', label: '1M', align: 'right', render: (r) => pct(r.mom_1m) },
    { key: 'mom_6m', label: '6M', align: 'right', render: (r) => pct(r.mom_6m) },
    { key: 'mom_12m', label: '12M', align: 'right', render: (r) => pct(r.mom_12m) },
    { key: 'score', label: 'Score', align: 'right', render: (r) => <span className="tone-gold">{r.score >= 0 ? '+' : ''}{Number(r.score).toFixed(2)}%</span> },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        code="MOM"
        title="Momentum Leaders"
        subtitle={`Top ${market === 'us' ? 'US' : 'Indian'} stocks ranked by 1M, 6M and 12M momentum.`}
        right={
          <div style={{ display: 'flex', gap: '8px' }}>
            <ToggleBtn active={market === 'us'} onClick={() => setMarket('us')}>US Market</ToggleBtn>
            <ToggleBtn active={market === 'in'} onClick={() => setMarket('in')}>Indian Market</ToggleBtn>
          </div>
        }
      />

      {error ? (
        <div className="error" style={{ color: 'var(--red-loss)', padding: '20px', backgroundColor: 'rgba(255, 69, 58, 0.1)', border: '1px solid rgba(255, 69, 58, 0.2)', borderRadius: 'var(--r-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ marginBottom: '8px', fontSize: '16px', color: 'var(--red-loss)' }}>Failed to Load Data</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{error}</p>
          </div>
          <button onClick={() => setMarket(market)} style={{ width: 'auto', padding: '8px 16px', background: 'rgba(255, 69, 58, 0.15)', border: '1px solid var(--red-loss)', color: 'var(--red-loss)' }}>Retry</button>
        </div>
      ) : (
        <DataTable columns={columns} rows={data} loading={loading} rowKey={(r) => r.ticker} />
      )}
    </div>
  );
};

export default Momentum;
