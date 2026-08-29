import React from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Badge, DataTable, EmptyState } from './ui';
import { useSWR } from '../lib/swrCache';

const currencyOf = (market) => (market === 'US' ? '$' : '₹');
const chartSymbol = (symbol, market) => (
  market === 'US' || String(symbol).endsWith('.NS') ? symbol : `${symbol}.NS`
);

const money = (value, market) => {
  if (value === null || value === undefined) return '—';
  return `${currencyOf(market)}${Number(value).toLocaleString(
    market === 'US' ? 'en-US' : 'en-IN',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )}`;
};

const pct = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
};

const toneOf = (value) => (
  value === null || value === undefined ? 'neutral' : value > 0 ? 'gain' : value < 0 ? 'loss' : 'neutral'
);

const SignalsPortfolio = ({ market }) => {
  const { data, error, revalidate } = useSWR(
    `signal_portfolio_${market}`,
    () => axios.get(`/api/signals/portfolio?market=${market}`).then((response) => response.data),
    60000,
  );

  const symbolColumn = {
    key: 'symbol',
    label: 'Symbol',
    render: (row) => (
      <Link
        to={`/chart?symbol=${encodeURIComponent(chartSymbol(row.symbol, row.market))}`}
        style={{ fontWeight: 700, color: 'var(--text-primary)' }}
      >
        {row.symbol}
      </Link>
    ),
  };
  const sideColumn = {
    key: 'side',
    label: 'Side',
    align: 'center',
    render: (row) => <Badge tone={row.side === 'LONG' ? 'gain' : 'loss'}>{row.side}</Badge>,
  };
  const pnlColumn = {
    key: 'unreal_pct',
    label: 'Unreal. P&L',
    align: 'right',
    render: (row) => <span className={`tone-${toneOf(row.unreal_pct)}`}>{pct(row.unreal_pct)}</span>,
  };
  const heldColumn = {
    key: 'days_held',
    label: 'Held',
    align: 'right',
    render: (row) => `${row.days_held}d`,
  };
  const fullColumns = [
    symbolColumn,
    sideColumn,
    { key: 'entry', label: 'Entry', align: 'right', render: (row) => money(row.entry, row.market) },
    { key: 'current', label: 'Current', align: 'right', render: (row) => money(row.current, row.market) },
    pnlColumn,
    { key: 'stop', label: 'Stop', align: 'right', render: (row) => money(row.stop, row.market) },
    { key: 'target', label: 'Target', align: 'right', render: (row) => money(row.target, row.market) },
    heldColumn,
    { key: 'weight_pct', label: 'Weight', align: 'right', render: (row) => `${row.weight_pct}%` },
  ];
  const forwardClosed = data?.stats?.forward?.closed || 0;
  const sampleLabel = forwardClosed < 100 ? `Small forward sample · ${forwardClosed}/100` : 'Forward sample established';
  const openRows = data?.open || [];
  return (
    <section className="signals-portfolio" aria-labelledby="signals-portfolio-title">
      <div className="signals-section-title" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span id="signals-portfolio-title">
          Current model portfolio
          {data?.as_of && (
            <span style={{ color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
              {' '}· {data.as_of}
            </span>
          )}
        </span>
        <Link to="/track-record" style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>
          View full track record
        </Link>
      </div>

      {error && !data ? (
        <EmptyState title="Portfolio unavailable">
          <button type="button" onClick={revalidate} className="secondary" style={{ width: 'auto' }}>Retry</button>
        </EmptyState>
      ) : (
        <>
          {data && <p className="signals-portfolio__sample">{sampleLabel} · Gross of verified costs</p>}
          <div className="signals-portfolio__table">
            <DataTable
              columns={fullColumns}
              rows={openRows}
              rowKey={(row) => `${row.market}-${row.symbol}`}
              loading={!data}
              empty={<EmptyState title="No open positions">The model book is all cash.</EmptyState>}
            />
          </div>
          {data && openRows.length > 0 && (
            <div className="signals-portfolio__cards" aria-label="Current model positions">
              {openRows.map((row) => (
                <article key={`${row.market}-${row.symbol}`}>
                  <header>{symbolColumn.render(row)} {sideColumn.render(row)}</header>
                  <dl>
                    <div><dt>Entry</dt><dd>{money(row.entry, row.market)}</dd></div>
                    <div><dt>Current</dt><dd>{money(row.current, row.market)}</dd></div>
                    <div><dt>Unreal. P&amp;L</dt><dd>{pnlColumn.render(row)}</dd></div>
                    <div><dt>Stop</dt><dd>{money(row.stop, row.market)}</dd></div>
                    <div><dt>Target</dt><dd>{money(row.target, row.market)}</dd></div>
                    <div><dt>Held</dt><dd>{heldColumn.render(row)}</dd></div>
                    <div><dt>Weight</dt><dd>{row.weight_pct}%</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default SignalsPortfolio;
