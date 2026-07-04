import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { PageHeader, DataTable, Skeleton } from '../components/ui';

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
  const [view, setView] = useState('FII');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await axios.get('/api/fiidii');
        if (res.data && res.data.data) setData(res.data.data);
      } catch (err) {
        console.error('FII/DII fetch failed:', err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatAmount = (val) => `${val > 0 ? '+' : ''}${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: '2px' }}>
              {!isPositive && <div style={{ width: `${widthPct}%`, height: '100%', backgroundColor: 'var(--red-loss)', borderRadius: '2px 0 0 2px' }} />}
            </div>
            <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--text-secondary)' }} />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: '2px' }}>
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
      ) : (
        <DataTable columns={columns} rows={data} rowKey={(r, i) => `${r.date}-${i}`} />
      )}
    </div>
  );
};

export default FiiDii;
