import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, StatTile, StatGrid, DataTable, Badge, EmptyState, Skeleton } from '../components/ui';
import { useSWR } from '../lib/swrCache';

// Follow the live session by default (US book 20:00–02:00 IST, IN otherwise) —
// same clock the signals engine uses server-side.
const sessionMarket = () => {
  const h = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
  const hour = parseInt(h, 10);
  return (hour >= 20 || hour < 2) ? 'US' : 'IN';
};

const curOf = (market) => (market === 'US' ? '$' : '₹');
const money = (v, market) => {
  if (v === null || v === undefined) return '—';
  return `${curOf(market)}${Number(v).toLocaleString(market === 'US' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
const toneOf = (v) => (v === null || v === undefined ? 'neutral' : v > 0 ? 'gain' : v < 0 ? 'loss' : 'neutral');
const sideTone = (s) => (s === 'LONG' ? 'gain' : 'loss');

const SymbolLink = ({ symbol, market }) => (
  <Link to={`/chart?symbol=${symbol}${market === 'US' ? '' : '.NS'}`} style={{ fontWeight: 700, color: 'var(--text-primary)' }} title={`Open ${symbol} in Chart Analyser`}>
    {symbol}
  </Link>
);

// Cumulative model-return curve from closed trades — a fluid inline SVG so it
// scales cleanly on mobile (no Plotly on this page).
const EquityCurve = ({ points }) => {
  if (!points || points.length < 2) return null;
  const W = 640, H = 120, pad = 6;
  const ys = points.map((p) => p.cum_pct);
  const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
  const span = hi - lo || 1;
  const x = (i) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.cum_pct).toFixed(1)}`).join(' ');
  const last = ys[ys.length - 1];
  const col = last >= 0 ? 'var(--green-gain)' : 'var(--red-loss)';
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 'auto', maxWidth: '100%', display: 'block' }}>
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 4" />
      <path d={`${line} L${x(points.length - 1)},${zeroY} L${x(0)},${zeroY} Z`} fill={col} opacity="0.12" />
      <path d={line} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

const MARKET_LABEL = { IN: 'NSE', US: 'US' };

const TrackRecord = () => {
  const [market, setMarket] = useState(sessionMarket);
  const { data, refreshing, error: swrError, revalidate } = useSWR(
    `signal_portfolio_${market}`,
    () => axios.get(`/api/signals/portfolio?market=${market}`).then((r) => r.data),
    60000,
  );
  const loading = !data && !swrError;
  const error = !data && swrError ? (swrError.response?.data?.detail || 'Failed to load track record.') : null;

  const marketToggle = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {['IN', 'US'].map((m) => (
        <button
          key={m}
          onClick={() => setMarket(m)}
          aria-pressed={market === m}
          className="secondary"
          style={{
            width: 'auto', padding: '8px 14px', fontSize: 12, fontWeight: 600,
            borderRadius: 8,
            border: `1px solid ${market === m ? 'var(--primary-gold, #F5DC8C)' : 'var(--border-color, rgba(255,255,255,0.12))'}`,
            background: market === m ? 'rgba(245,220,140,0.12)' : 'transparent',
            color: market === m ? 'var(--primary-gold, #F5DC8C)' : 'var(--text-secondary, #A1A1AA)',
          }}
        >
          {MARKET_LABEL[m]}
        </button>
      ))}
      <button className="secondary" style={{ width: 'auto', padding: '8px 16px', fontSize: 12 }} onClick={revalidate} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
    </div>
  );

  const header = (
    <PageHeader
      code="TRACK"
      title="Signal Track Record"
      subtitle={`A live paper-traded model book — every scored ${market === 'US' ? 'US-session' : 'NSE'} signal, marked to market`}
      right={marketToggle}
    />
  );

  if (loading) {
    return <div className="fade-in">{header}<div className="ui-table-wrap" style={{ padding: 16 }}><Skeleton rows={6} height={34} /></div></div>;
  }
  if (error) {
    return (
      <div className="fade-in">{header}
        <EmptyState title="Track record unavailable">{error}{' '}
          <button onClick={revalidate} style={{ width: 'auto', padding: '6px 16px', marginLeft: 8 }}>Retry</button>
        </EmptyState>
      </div>
    );
  }

  const { stats: st, open, closed, unresolved = [], equity_curve: curve, as_of } = data;
  const hasClosed = st.closed > 0;
  const forwardClosed = st.forward?.closed || 0;
  const sampleLabel = forwardClosed < 100 ? `Small forward sample · ${forwardClosed}/100` : 'Forward sample established';
  const costLabel = st.costs_status === 'net_verified' ? 'Net of verified costs' : 'Gross of verified costs';

  const openCols = [
    { key: 'symbol', label: 'Symbol', render: (r) => <SymbolLink symbol={r.symbol} market={r.market} /> },
    { key: 'side', label: 'Side', align: 'center', render: (r) => <Badge tone={sideTone(r.side)}>{r.side}</Badge> },
    { key: 'entry', label: 'Entry', align: 'right', render: (r) => money(r.entry, r.market) },
    { key: 'current', label: 'Current', align: 'right', render: (r) => money(r.current, r.market) },
    { key: 'unreal_pct', label: 'Unreal. P&L', align: 'right', render: (r) => <span className={`tone-${toneOf(r.unreal_pct)}`} style={{ fontWeight: 700 }}>{pct(r.unreal_pct)}</span> },
    { key: 'target', label: 'Target', align: 'right', render: (r) => money(r.target, r.market) },
    { key: 'stop', label: 'Stop', align: 'right', render: (r) => money(r.stop, r.market) },
    { key: 'days_held', label: 'Held', align: 'right', render: (r) => `${r.days_held}d` },
    { key: 'weight_pct', label: 'Weight', align: 'right', render: (r) => `${r.weight_pct}%` },
  ];

  const closedCols = [
    { key: 'symbol', label: 'Symbol', render: (r) => <SymbolLink symbol={r.symbol} market={r.market} /> },
    { key: 'side', label: 'Side', align: 'center', render: (r) => <Badge tone={sideTone(r.side)}>{r.side}</Badge> },
    { key: 'entry', label: 'Entry', align: 'right', render: (r) => money(r.entry, r.market) },
    { key: 'exit', label: 'Exit', align: 'right', render: (r) => money(r.exit, r.market) },
    { key: 'ret_pct', label: 'Return', align: 'right', render: (r) => <span className={`tone-${toneOf(r.ret_pct)}`} style={{ fontWeight: 700 }}>{pct(r.ret_pct)}</span> },
    {
      key: 'result', label: 'Result', align: 'center',
      render: (r) => <Badge tone={r.result === 'win' ? 'gain' : r.result === 'loss' ? 'loss' : 'neutral'}>{r.result === 'closed' ? 'TIME' : r.result.toUpperCase()}</Badge>,
    },
    { key: 'exit_date', label: 'Closed', align: 'right', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.exit_date}</span> },
  ];

  const unresolvedCols = [
    { key: 'symbol', label: 'Symbol', render: (r) => <SymbolLink symbol={r.symbol} market={r.market} /> },
    { key: 'side', label: 'Side', align: 'center', render: (r) => <Badge tone={sideTone(r.side)}>{r.side}</Badge> },
    { key: 'entry_date', label: 'Entry date', align: 'right' },
    {
      key: 'resolution_reason', label: 'Reason',
      render: (r) => String(r.resolution_reason || 'Evidence unavailable').replaceAll('_', ' '),
    },
  ];

  return (
    <div className="fade-in">
      {header}

      <div className="track-record-evidence" role="status" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <Badge tone="neutral">{sampleLabel}</Badge>
        <Badge tone="neutral">{costLabel}</Badge>
        {unresolved.length > 0 && <Badge tone="neutral">Needs resolution · {unresolved.length}</Badge>}
      </div>

      <StatGrid style={{ marginBottom: 20 }}>
        <StatTile label="Win Rate" tone={st.win_rate === null ? 'neutral' : st.win_rate >= 50 ? 'gain' : 'loss'}
          value={st.win_rate === null ? '—' : `${st.win_rate}%`} sub={hasClosed ? `${st.wins}W · ${st.losses}L` : 'no closed trades yet'} />
        <StatTile label="Model Return" tone={toneOf(st.total_pct)} value={pct(st.total_pct)} sub={`${pct(st.realized_pct)} realized`} />
        <StatTile label="Open Positions" tone="neutral" value={`${st.open}/${st.slots}`} sub={`${st.slots - st.open} slots free`} />
        <StatTile label="Avg Win" tone="gain" value={pct(st.avg_win)} sub={hasClosed ? `avg trade ${pct(st.avg_trade)}` : '—'} />
        <StatTile label="Avg Loss" tone="loss" value={pct(st.avg_loss)} sub={st.worst !== null ? `worst ${pct(st.worst)}` : '—'} />
        <StatTile label="Closed Trades" tone="neutral" value={st.closed} sub={st.best !== null ? `best ${pct(st.best)}` : '—'} />
      </StatGrid>

      {curve && curve.length > 1 && (
        <div className="panel" style={{ marginBottom: 20, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>
            Cumulative model return
          </div>
          <EquityCurve points={curve} />
        </div>
      )}

      <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        Current model portfolio
      </div>
      {open.length ? (
        <DataTable columns={openCols} rows={open} rowKey={(r) => `${r.market}-${r.symbol}`} />
      ) : (
        <EmptyState title="No open positions">
          The model book is currently all cash. New signals are entered automatically during market hours.
        </EmptyState>
      )}

      <div style={{ margin: '26px 0 8px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        Closed trades
      </div>
      {closed.length ? (
        <DataTable columns={closedCols} rows={closed} rowKey={(r, i) => `${r.market}-${r.symbol}-${i}`} />
      ) : (
        <EmptyState title="No closed trades yet">Positions close here once they touch their target or stop.</EmptyState>
      )}

      {unresolved.length > 0 && (
        <section aria-labelledby="unresolved-positions-title">
          <div id="unresolved-positions-title" style={{ margin: '26px 0 8px', fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Needs resolution
          </div>
          <DataTable columns={unresolvedCols} rows={unresolved} rowKey={(r, i) => `${r.market}-${r.symbol}-unresolved-${i}`} />
        </section>
      )}

      <p className="track-record-methodology">
        How it works: every scored signal is paper-traded at its published entry price as a {open[0]?.weight_pct || 10}%-of-book
        position, first-come-first-served up to {st.slots} concurrent positions. A position closes when the day's range touches
        its <b>target</b> (win) or <b>stop</b> (loss), or after a 30-day time stop. Returns are per-position; the model return
        weights each at {open[0]?.weight_pct || 10}%. Ambiguous entry-day outcomes remain unresolved and are excluded from performance.
        {' '}{costLabel}. Illustrative track record, not investment advice · {as_of}
      </p>
    </div>
  );
};

export default TrackRecord;
