import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, DataTable, Skeleton, EmptyState, Badge } from '../components/ui';

const ToggleBtn = ({ active, onClick, children, count }) => (
  <button
    onClick={onClick}
    style={{
      width: 'auto', padding: '7px 16px', borderRadius: 'var(--r-pill)', fontSize: '13px',
      background: active ? 'var(--primary-accent-soft)' : 'transparent',
      color: active ? 'var(--primary-accent)' : 'var(--text-secondary)',
      border: `1px solid ${active ? 'var(--primary-accent-border)' : 'var(--border-subtle)'}`,
    }}
  >
    {children}{typeof count === 'number' ? <span style={{ opacity: 0.7, marginLeft: 6 }}>{count}</span> : null}
  </button>
);

// ₹ in crores / lakhs — the natural scale for deal sizes on NSE.
const fmtValue = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e7) return `₹${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  return `₹${n.toLocaleString('en-IN')}`;
};
const fmtQty = (v) => (Number(v) || 0).toLocaleString('en-IN');

// Buy → green, Sell → red, anything else (Pledge/Revoke/Encumber…) → neutral.
const sideTone = (s) => {
  const t = (s || '').toUpperCase();
  if (t === 'BUY') return 'gain';
  if (t === 'SELL') return 'loss';
  return 'neutral';
};
const insiderTone = (t) => {
  const s = (t || '').toUpperCase();
  if (s.startsWith('BUY')) return 'gain';
  if (s.startsWith('SELL')) return 'loss';
  return 'neutral';
};

const SymbolLink = ({ symbol }) => (
  <Link to={`/chart?symbol=${symbol}.NS`} style={{ fontWeight: 700, color: 'var(--text-primary)' }}
    title={`Open ${symbol} in Chart Analyser`}>
    {symbol}
  </Link>
);

const Deals = () => {
  const [data, setData] = useState({ bulk: [], block: [], insider: [], as_on: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('bulk');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/deals');
      setData(res.data || { bulk: [], block: [], insider: [] });
    } catch (err) {
      console.error('deals fetch failed:', err);
      setError('Could not load deals — the NSE source may be slow or temporarily blocking requests.');
    }
    setLoading(false);
  };

  useEffect(() => {
    const first = setTimeout(fetchData, 0);
    return () => clearTimeout(first);
  }, []);

  const largeCols = [
    { key: 'symbol', label: 'Symbol', render: (r) => <SymbolLink symbol={r.symbol} /> },
    {
      key: 'client', label: 'Client',
      render: (r) => (
        <span title={r.name}>
          {r.client}
          {r.name ? <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>{r.name}</span> : null}
        </span>
      ),
    },
    { key: 'side', label: 'Side', align: 'center', render: (r) => (r.side ? <Badge tone={sideTone(r.side)}>{r.side}</Badge> : '—') },
    { key: 'qty', label: 'Qty', align: 'right', render: (r) => fmtQty(r.qty) },
    { key: 'price', label: 'Avg Price', align: 'right', render: (r) => `₹${(Number(r.price) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: 'value', label: 'Value', align: 'right', render: (r) => <strong>{fmtValue(r.value)}</strong> },
    { key: 'date', label: 'Date', align: 'right', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.date}</span> },
  ];

  const insiderCols = [
    { key: 'symbol', label: 'Symbol', render: (r) => <SymbolLink symbol={r.symbol} /> },
    {
      key: 'person', label: 'Person',
      render: (r) => (
        <span title={r.company}>
          {r.person}
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-secondary)' }}>{r.mode}</span>
        </span>
      ),
    },
    { key: 'category', label: 'Category' },
    { key: 'type', label: 'Type', align: 'center', render: (r) => (r.type ? <Badge tone={insiderTone(r.type)}>{r.type.toUpperCase()}</Badge> : '—') },
    { key: 'qty', label: 'Shares', align: 'right', render: (r) => fmtQty(r.qty) },
    { key: 'value', label: 'Value', align: 'right', render: (r) => <strong>{fmtValue(r.value)}</strong> },
    { key: 'date', label: 'Filed', align: 'right', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.date}</span> },
  ];

  const rows = data[view] || [];
  const columns = view === 'insider' ? insiderCols : largeCols;

  const subtitleFor = {
    bulk: 'Bulk deals (>0.5% of listed shares) printed by NSE for the latest session.',
    block: 'Block deals — large negotiated trades in the dedicated block window.',
    insider: 'Promoter & designated-person filings under SEBI PIT rules. NSE publishes these with a lag, so the newest entries may be a few weeks old.',
  };

  const emptyFor = {
    bulk: 'No bulk deals reported for the latest session.',
    block: 'No block deals reported for the latest session.',
    insider: 'No recent insider filings found in the last 90 days.',
  };

  return (
    <div className="fade-in">
      <PageHeader
        code="DEALS"
        title="Block, Bulk & Insider Deals"
        subtitle={`Big-money footprints in Indian equities${data.as_on ? ` · as on ${data.as_on}` : ''}`}
        right={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ToggleBtn active={view === 'bulk'} onClick={() => setView('bulk')} count={data.bulk?.length}>Bulk</ToggleBtn>
            <ToggleBtn active={view === 'block'} onClick={() => setView('block')} count={data.block?.length}>Block</ToggleBtn>
            <ToggleBtn active={view === 'insider'} onClick={() => setView('insider')} count={data.insider?.length}>Insider</ToggleBtn>
          </div>
        }
      />

      <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 16px' }}>{subtitleFor[view]}</p>

      {loading ? (
        <div className="ui-table-wrap" style={{ padding: 16 }}><Skeleton rows={8} height={34} /></div>
      ) : error ? (
        <EmptyState title="Data unavailable">
          {error}{' '}
          <button onClick={fetchData} style={{ width: 'auto', padding: '6px 16px', marginLeft: 8 }}>Retry</button>
        </EmptyState>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r, i) => `${r.symbol}-${i}`}
          empty={<EmptyState title="Nothing here yet">{emptyFor[view]}</EmptyState>}
        />
      )}
    </div>
  );
};

export default Deals;
