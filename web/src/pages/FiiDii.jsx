import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PageHeader, DataTable, Skeleton, EmptyState } from '../components/ui';

const ToggleBtn = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      width: 'auto', padding: '7px 18px', borderRadius: 'var(--r-pill)', fontSize: '13px',
      background: active ? 'var(--primary-accent-soft)' : 'transparent',
      color: active ? 'var(--primary-accent)' : 'var(--text-secondary)',
      border: `1px solid ${active ? 'var(--primary-accent-border)' : 'var(--border-subtle)'}`,
    }}
  >
    {children}
  </button>
);

const FiiDii = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('FII');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/fiidii');
      if (res.data && res.data.data) setData(res.data.data);
    } catch (err) {
      console.error('FII/DII fetch failed:', err);
      setError('Could not load institutional flow data — the NSE source may be slow or temporarily down.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatAmount = (val) => `${val > 0 ? '+' : ''}${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatContracts = (val) => `${val > 0 ? '+' : ''}${Math.round(val).toLocaleString('en-IN')}`;
  const maxAbsValue = data.length > 0 ? Math.max(...data.map((d) => Math.abs(view === 'FII' ? d.fii_net : d.dii_net))) : 10000;

  const netCol = view === 'FII' ? 'fii_net' : 'dii_net';

  const columns = [
    { key: 'date', label: 'Date', render: (r) => <strong>{r.date}</strong> },
    {
      key: netCol, label: 'Amount (₹ Cr.)', align: 'right',
      render: (r) => {
        const val = r[netCol];
        return <span className={val > 0 ? 'tone-gain' : 'tone-loss'} style={{ fontWeight: 700 }}>{formatAmount(val)}</span>;
      },
    },
    {
      key: 'bar', label: 'Net Buy/(Sell)*', align: 'center', mono: false, width: '200px',
      render: (r) => {
        const val = r[netCol];
        const isPositive = val > 0;
        const widthPct = Math.min((Math.abs(val) / (maxAbsValue || 1)) * 100, 100);
        return (
          <div style={{ display: 'flex', width: '100%', height: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1, height: '100%', display: 'flex', justifyContent: 'flex-end', paddingRight: '2px' }}>
              {!isPositive && <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: 'var(--red-loss)', borderRadius: '2px 0 0 2px' }} />}
            </div>
            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--text-secondary)' }} />
            <div style={{ flex: 1, height: '100%', display: 'flex', justifyContent: 'flex-start', paddingLeft: '2px' }}>
              {isPositive && <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: 'var(--green-gain)', borderRadius: '0 2px 2px 0' }} />}
            </div>
          </div>
        );
      },
    },
    { key: 'nifty_close', label: 'Nifty Close', align: 'right', render: (r) => r.nifty_close.toLocaleString('en-IN') },
    {
      key: 'chg_pct', label: 'Chg %', align: 'right',
      render: (r) => (
        <span className={r.chg_pct > 0 ? 'tone-gain' : r.chg_pct < 0 ? 'tone-loss' : ''}>
          {r.chg_pct > 0 ? '▲' : r.chg_pct < 0 ? '▼' : ''} {Math.abs(r.chg_pct).toFixed(1)}%
        </span>
      ),
    },
    {
      key: 'retail_opt', label: 'Retail Opt (Net)', align: 'right',
      render: (r) => {
        const val = r.retail_opt || 0;
        return <span className={val > 0 ? 'tone-gain' : val < 0 ? 'tone-loss' : ''}>{formatContracts(val)}</span>;
      },
    },
    {
      key: 'fii_opt', label: 'FII Opt (Net)', align: 'right',
      render: (r) => {
        const val = r.fii_opt || 0;
        return <span className={val > 0 ? 'tone-gain' : val < 0 ? 'tone-loss' : ''}>{formatContracts(val)}</span>;
      },
    },
    {
      key: 'prop_opt', label: 'Prop Opt (Net)', align: 'right',
      render: (r) => {
        const val = r.prop_opt || 0;
        return <span className={val > 0 ? 'tone-gain' : val < 0 ? 'tone-loss' : ''}>{formatContracts(val)}</span>;
      },
    },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        code="FLOW"
        title="FII / DII Activity"
        subtitle="CM Provisional Institutional Flow · history past 1 day is structurally modeled on Nifty benchmark flows for visualization."
        right={
          <div style={{ display: 'flex', gap: '8px' }}>
            <ToggleBtn active={view === 'FII'} onClick={() => setView('FII')}>FII</ToggleBtn>
            <ToggleBtn active={view === 'DII'} onClick={() => setView('DII')}>DII</ToggleBtn>
          </div>
        }
      />

      {loading ? (
        <div className="ui-table-wrap" style={{ padding: 16 }}><Skeleton rows={6} height={34} /></div>
      ) : error ? (
        <EmptyState title="Data unavailable">
          {error}{' '}
          <button onClick={fetchData} style={{ width: 'auto', padding: '6px 16px', marginLeft: 8 }}>Retry</button>
        </EmptyState>
      ) : (
        <DataTable columns={columns} rows={data} rowKey={(r, i) => `${r.date}-${i}`} />
      )}
    </div>
  );
};

export default FiiDii;
