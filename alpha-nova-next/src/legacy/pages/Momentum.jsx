import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, DataTable } from '../components/ui';
import WatchlistStar from '../components/WatchlistStar';
import { MOMENTUM_VIEWS, momentumRows, sessionLabel } from '../lib/momentumView';
import { useMarketParam } from '../MarketContext';
import './Momentum.css';

// Concrete hex (theme values) — keeps SVG rendering deterministic
const C = { gain: '#32D74B', loss: '#FF453A', gold: '#F5DC8C', dim: '#A1A1AA' };


const pct = (v) => v == null ? '—' : (
  <span className={v >= 0 ? 'tone-gain' : 'tone-loss'}>{v >= 0 ? '+' : ''}{Number(v).toFixed(2)}%</span>
);

// Inline SVG candlestick chart with a volume strip — real OHLC candles without
// pulling Plotly's 1.2MB bundle into this page. `level` draws a dashed line at
// the breakout price; `bars` trims to the most recent N sessions so small
// table cells stay readable.
const CandleChart = ({ candles, level, width = 280, height = 96, bars }) => {
  if (!candles || !candles.c || candles.c.length < 2) return null;
  const n0 = candles.c.length;
  const n = bars ? Math.min(bars, n0) : n0;
  const sl = (arr) => (arr || []).slice(n0 - n);
  const o = sl(candles.o), h = sl(candles.h), l = sl(candles.l), c = sl(candles.c), v = sl(candles.v);
  const volH = Math.max(10, Math.round(height * 0.24));
  const priceH = height - volH - 3;
  const lo = Math.min(...l, level ?? Infinity);
  const hi = Math.max(...h, level ?? -Infinity);
  const range = hi - lo || 1;
  const slot = width / n;
  const bw = Math.max(1, Math.min(slot * 0.65, 9));
  const px = (i) => i * slot + slot / 2;
  const py = (val) => 2 + (1 - (val - lo) / range) * (priceH - 4);
  const vMax = Math.max(...v, 1);
  return (
    // Fluid: scales down with the card via viewBox (fixed width leaked out of
    // narrow grid columns on mobile/tablet), never grows past its natural size
    <svg viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', maxWidth: width, height: 'auto' }} aria-hidden="true">
      {c.map((cl, i) => {
        const up = cl >= o[i];
        const col = up ? C.gain : C.loss;
        const top = py(Math.max(o[i], cl));
        const bot = py(Math.min(o[i], cl));
        const vh = Math.max((v[i] / vMax) * volH, 0.5);
        return (
          <g key={i}>
            <line x1={px(i)} x2={px(i)} y1={py(h[i])} y2={py(l[i])} stroke={col} strokeWidth="1" />
            <rect x={px(i) - bw / 2} y={top} width={bw} height={Math.max(bot - top, 1)} fill={col} />
            <rect x={px(i) - bw / 2} y={height - vh} width={bw} height={vh} fill={col} opacity="0.45" />
          </g>
        );
      })}
      {level != null && (
        <line x1="0" x2={width} y1={py(level)} y2={py(level)} stroke={C.gold} strokeWidth="1" strokeDasharray="4 3" />
      )}
    </svg>
  );
};

// Inline SVG price chart: area sparkline over the last ~60 sessions, with an
// optional dashed line at the breakout level. Fallback while a cached
// /api/momentum response predates the OHLCV `candles` field.
const Spark = ({ values, level, width = 260, height = 72, stroke, id }) => {
  if (!values || values.length < 2) return null;
  const lo = Math.min(...values, level ?? Infinity);
  const hi = Math.max(...values, level ?? -Infinity);
  const range = hi - lo || 1;
  const px = (i) => (i / (values.length - 1)) * (width - 2) + 1;
  const py = (v) => height - 3 - ((v - lo) / range) * (height - 6);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const area = `${line} L${px(values.length - 1).toFixed(1)},${height - 1} L1,${height - 1} Z`;
  const color = stroke || (values[values.length - 1] >= values[0] ? C.gain : C.loss);
  const gid = `sg-${id}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', maxWidth: width, height: 'auto' }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      {level != null && (
        <>
          <line x1="1" x2={width - 1} y1={py(level)} y2={py(level)} stroke={C.gold} strokeWidth="1" strokeDasharray="4 3" />
          <circle cx={px(values.length - 1)} cy={py(values[values.length - 1])} r="2.6" fill={color} />
        </>
      )}
    </svg>
  );
};

const BADGE_STYLE = {
  '52W LOW': { color: '#fff', background: '#B42318' },
  '3M LOW': { color: '#fff', background: '#B42318' },
  '20D LOW': { color: C.loss, background: 'rgba(255,69,58,0.12)' },
  '52W HIGH': { color: '#000', background: C.gold },
  '3M HIGH': { color: '#000', background: C.gain },
  '20D HIGH': { color: 'var(--text-primary)', background: 'rgba(255,255,255,0.14)' },
};

const BreakoutCard = ({ b, market, cur }) => {
  const chartSym = encodeURIComponent(b.ticker);
  const down = b.type.endsWith('LOW');
  const name = b.ticker.replace('.NS', '');
  return (
    <div className="card" style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <WatchlistStar symbol={b.ticker} market={market === 'in' ? 'IN' : 'US'} size={15} />
        <Link to={`/chart?symbol=${chartSym}`} style={{ fontWeight: 700, color: 'var(--text-primary)' }} title="Open in Chart Analyser">
          {name}
        </Link>
        <span style={{ marginLeft: 'auto' }}>{pct(b.chg_today)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: '4px', ...BADGE_STYLE[b.type] }}>
          {b.type}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {cur}{Number(b.level).toLocaleString('en-IN')} · {b.margin}% {down ? 'below' : 'above'}
        </span>
      </div>
      {b.candles
        ? <CandleChart candles={b.candles} level={b.level} width={280} height={110} />
        : <Spark values={b.spark} level={b.level} id={`bo-${name}`} width={280} height={74} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span>LTP <strong style={{ color: 'var(--text-primary)' }}>{cur}{Number(b.price).toLocaleString('en-IN')}</strong></span>
        <span title="Today's volume vs 20-day average">
          Vol <strong style={{ color: b.vol_ratio >= 1.5 ? (down ? C.loss : C.gain) : 'var(--text-primary)' }}>{b.vol_ratio == null ? '—' : `×${b.vol_ratio}`}</strong>
        </span>
        <span title="RSI(14) — above 70 is hot">RSI <strong style={{ color: b.rsi >= 70 ? C.gold : 'var(--text-primary)' }}>{b.rsi}</strong></span>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>RS / 100: <strong>{b.rs_percentile ?? '—'}</strong></span>
    </div>
  );
};

const Momentum = ({
  initialView = 'leaders',
  eventType = null,
  marketOverride = null,
  title = 'Momentum Leaders',
  subtitle = 'Find strength. Track breaks. Spot weakness.',
}) => {
  // One market selector app-wide: the footer toggle. The old per-page
  // India/US buttons are retired to avoid two competing controls.
  const selectedMarket = useMarketParam('').toLowerCase();
  const market = marketOverride || selectedMarket;
  const [view, setView] = useState(initialView);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({});
  const [refresh, setRefresh] = useState(0);
  const resetSnapshot = () => { setLoading(true); setSnapshot(null); setError(null); };
  const reload = () => { resetSnapshot(); setRefresh(n => n + 1); };

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    axios.get(`/api/momentum?market=${market}`, { signal: controller.signal })
      .then(({ data }) => { if (active) setSnapshot(data); })
      .catch(err => { if (active) setError(err.response?.data?.detail || 'Could not load momentum data. Please retry.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [market, refresh]);

  const cur = market === 'in' ? '₹' : '$';
  const config = MOMENTUM_VIEWS[view];
  const rows = momentumRows(snapshot, view, query, sort.key, sort.dir, eventType);
  const isEvent = view === 'breakouts' || view === 'breakdowns';
  const chooseView = (next) => { setView(next); setSort({}); };
  const onSort = (key) => setSort({ key, dir: (sort.key || config.sort) === key && (sort.dir || config.dir) === 'desc' ? 'asc' : 'desc' });
  const number = (v, suffix = '') => v == null ? '—' : `${Number(v).toFixed(1)}${suffix}`;
  const rs = (r) => <span className={r.rs_percentile == null ? '' : r.rs_percentile <= 20 ? 'tone-loss' : r.rs_percentile >= 80 ? 'tone-gain' : ''}>{number(r.rs_percentile)}</span>;
  const columns = [
    { key: 'ticker', label: 'Stock', render: r => <span className="momentum-stock"><WatchlistStar symbol={r.ticker} market={market.toUpperCase()} size={15} /><Link to={`/chart?symbol=${encodeURIComponent(r.ticker)}`}>{r.ticker.replace('.NS', '')}</Link></span> },
    { key: 'rs_percentile', label: 'RS / 100', align: 'right', sortable: true, render: rs },
    { key: 'chg_today', label: 'Session %', align: 'right', sortable: true, render: r => pct(r.chg_today) },
    { key: 'price', label: 'Price', align: 'right', sortable: true, render: r => `${cur}${Number(r.price).toLocaleString('en-IN')}` },
    { key: 'vol_ratio', label: 'Volume ×', align: 'right', sortable: true, render: r => number(r.vol_ratio, '×') },
    { key: 'dist_50dma', label: 'vs 50DMA', align: 'right', sortable: true, render: r => pct(r.dist_50dma) },
    { key: 'mom_1m', label: '1M', align: 'right', sortable: true, render: r => pct(r.mom_1m) },
    { key: 'mom_6m', label: '6M', align: 'right', sortable: true, render: r => pct(r.mom_6m) },
    { key: 'mom_12m', label: '12M', align: 'right', sortable: true, render: r => pct(r.mom_12m) },
    { key: 'spark', label: 'Trend · 6W', render: r => <div style={{ width: 130 }}><CandleChart candles={r.candles} bars={30} width={130} height={46} /></div> },
  ];
  const description = eventType ? 'Session close above the prior 252-session high with a positive price move. Coverage and source date are shown above.' : {
    leaders: 'Strongest relative momentum first. RS compares stocks within this scanned universe.',
    breakouts: 'Session price above a prior 20-session, 3-month or 52-week high, with a positive session move.',
    breakdowns: 'Session price below a prior 20-session, 3-month or 52-week low, with a negative session move.',
    low_rs: 'Bottom 20% by relative momentum. Low RS measures relative weakness; it is different from RSI.',
  }[view];

  return (
    <div className="fade-in momentum-page">
      <PageHeader code={eventType ? '52W' : 'MOM'} title={title} subtitle={subtitle}
        right={<span className="momentum-market-pill">{market === 'in' ? 'India' : 'US'}</span>} />
      <div className="momentum-meta" role="status">
        <span>{loading ? 'Loading market snapshot…' : sessionLabel(snapshot, market)}</span>
        <button type="button" disabled={loading} onClick={reload}>Reload snapshot</button>
      </div>
      {snapshot && <p className="momentum-coverage">{snapshot.scanned ?? '—'} / {snapshot.universe} stocks scanned · {snapshot.ranked_count ?? '—'} with full-year RS · selected large caps
        {snapshot.excluded_count > 0 && <span> · {snapshot.excluded_count} unavailable or older histories excluded</span>}
      </p>}
      {!eventType && <div className="momentum-views" role="group" aria-label="Momentum views">
        {Object.entries(MOMENTUM_VIEWS).map(([key, item]) => <button type="button" key={key} aria-pressed={view === key} className={view === key ? 'selected' : ''} onClick={() => chooseView(key)}>
          <span>{item.label}</span><strong>{loading || !snapshot ? '—' : momentumRows(snapshot, key).length}</strong>
        </button>)}
      </div>}
      <div className="momentum-section-head"><div><h2>{config.label}{isEvent ? ' · session moves' : ''}</h2><p>{description}</p></div>
        <label className="momentum-search"><span className="sr-only">Search stocks</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search symbol" /></label>
      </div>
      <label className="momentum-sort">Sort by <select value={`${sort.key || config.sort}:${sort.dir || config.dir}`} onChange={e => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir }); }}>
        <option value="rs_percentile:desc">Strongest RS</option><option value="rs_percentile:asc">Weakest RS</option><option value="chg_today:desc">Biggest rise</option><option value="chg_today:asc">Biggest fall</option><option value="vol_ratio:desc">Highest volume ratio</option>
        {sort.key && !['rs_percentile:desc', 'rs_percentile:asc', 'chg_today:desc', 'chg_today:asc', 'vol_ratio:desc'].includes(`${sort.key}:${sort.dir}`) && <option value={`${sort.key}:${sort.dir}`}>{columns.find(c => c.key === sort.key)?.label} · {sort.dir}</option>}
      </select><span>{!loading && snapshot ? `${rows.length} shown` : ''}</span></label>
      {error ? <div className="card momentum-empty" role="alert"><h3>Data unavailable</h3><p>{error}</p><button type="button" onClick={reload}>Retry</button></div>
        : loading ? <div role="status" aria-label="Loading stocks"><DataTable columns={columns} rows={[]} loading /></div>
        : !snapshot?.session_date && view !== 'leaders' ? <div className="card momentum-empty">This snapshot does not include the new scan fields. Reload after the backend update.</div>
        : rows.length === 0 ? <div className="card momentum-empty"><h3>{query ? 'No matching symbols' : `No ${config.label.toLowerCase()} found`}</h3><p>{query ? 'Try another symbol or clear your search.' : 'No stocks meet this view’s criteria in the available snapshot. Coverage is shown above.'}</p>{query && <button onClick={() => setQuery('')}>Clear search</button>}</div>
        : isEvent ? <div className="momentum-card-grid">{rows.map(b => <BreakoutCard key={b.ticker} b={b} market={market} cur={cur} />)}</div>
        : <>
          <div className="momentum-mobile-list">{rows.map(r => <div className="card momentum-mobile-stock" key={r.ticker}>
            <div className="momentum-mobile-title"><span className="momentum-stock"><WatchlistStar symbol={r.ticker} market={market.toUpperCase()} size={16} /><Link to={`/chart?symbol=${encodeURIComponent(r.ticker)}`}>{r.ticker.replace('.NS', '')}</Link></span><strong>{pct(r.chg_today)}</strong></div>
            <dl><div><dt>RS / 100</dt><dd>{rs(r)}</dd></div><div><dt>Price</dt><dd>{cur}{Number(r.price).toLocaleString('en-IN')}</dd></div><div><dt>Volume</dt><dd>{number(r.vol_ratio, '×')}</dd></div><div><dt>vs 50DMA</dt><dd>{pct(r.dist_50dma)}</dd></div></dl>
          </div>)}</div>
          <div className="momentum-desktop-table"><DataTable columns={columns} rows={rows} rowKey={r => r.ticker} sortKey={sort.key || config.sort} sortDir={sort.dir || config.dir} onSort={onSort} /></div>
        </>}
      <details className="momentum-method"><summary>How to read this scan</summary><p>RS is a 0–100 percentile of the average 21, 126 and 252-session returns, ranked only among stocks with full history on the same source date. Ties receive the same rank. It is not a market-wide rating or benchmark-relative return. Low RS is ≤20; RS requires at least two eligible stocks.</p><p>Break levels exclude the current bar and require the full lookback. The widest broken level is shown. A daily bar can change during trading; session moves are provisional until close. Older snapshots are labelled by date.</p><p>Volume compares the current daily bar with the prior 20-session average; partial-session volume is not time-adjusted. Source: {snapshot?.source || 'Yahoo Finance daily adjusted OHLCV'}. Snapshots may be cached for up to an hour. Research only.</p></details>
    </div>
  );
};

export default Momentum;
