import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, DataTable } from '../components/ui';
import WatchlistStar from '../components/WatchlistStar';

// Concrete hex (theme values) — keeps SVG rendering deterministic
const C = { gain: '#32D74B', loss: '#FF453A', gold: '#F5DC8C', dim: '#A1A1AA' };

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
  '52W HIGH': { color: '#000', background: C.gold },
  '3M HIGH': { color: '#000', background: C.gain },
  '20D HIGH': { color: 'var(--text-primary)', background: 'rgba(255,255,255,0.14)' },
};

const BreakoutCard = ({ b, market, cur }) => {
  const chartSym = market === 'in' ? b.ticker : b.ticker; // tickers already carry .NS for IN
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: '4px', ...BADGE_STYLE[b.type] }}>
          {b.type}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          broke {cur}{Number(b.level).toLocaleString('en-IN')} · now +{b.margin}% above
        </span>
      </div>
      {b.candles
        ? <CandleChart candles={b.candles} level={b.level} width={280} height={110} />
        : <Spark values={b.spark} level={b.level} id={`bo-${name}`} width={280} height={74} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span>LTP <strong style={{ color: 'var(--text-primary)' }}>{cur}{Number(b.price).toLocaleString('en-IN')}</strong></span>
        <span title="Today's volume vs 20-day average">
          Vol <strong style={{ color: b.vol_ratio >= 1.5 ? C.gain : 'var(--text-primary)' }}>×{b.vol_ratio}</strong>
        </span>
        <span title="RSI(14) — above 70 is hot">RSI <strong style={{ color: b.rsi >= 70 ? C.gold : 'var(--text-primary)' }}>{b.rsi}</strong></span>
      </div>
    </div>
  );
};

const Momentum = () => {
  const [market, setMarket] = useState('in'); // NSE-first audience — Indian tab default
  const [data, setData] = useState([]);
  const [breakouts, setBreakouts] = useState([]);
  const [universe, setUniverse] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`/api/momentum?market=${market}`);
      setData(response.data.data || []);
      setBreakouts(response.data.breakouts || []);
      setUniverse(response.data.universe || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market]);

  const cur = market === 'in' ? '₹' : '$';
  const columns = [
    { key: 'ticker', label: 'Ticker', render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <WatchlistStar symbol={r.ticker} market={market === 'in' ? 'IN' : 'US'} size={15} />
        <Link to={`/chart?symbol=${r.ticker}`} style={{ fontWeight: 700, color: 'var(--text-primary)' }} title="Open in Chart Analyser">
          {r.ticker.replace('.NS', '')}
        </Link>
      </span>
    ) },
    // Fixed-width wrapper: the table scrolls horizontally on small screens,
    // so the mini chart keeps its natural size instead of shrinking
    { key: 'spark', label: 'Trend (6W)', render: (r) => (
      <div style={{ width: 150 }}>
        {r.candles
          ? <CandleChart candles={r.candles} bars={30} width={150} height={46} />
          : <Spark values={r.spark} width={110} height={30} id={`ld-${r.ticker}`} />}
      </div>
    ) },
    { key: 'price', label: 'Price', align: 'right', render: (r) => `${cur}${r.price}` },
    { key: 'chg_today', label: 'Today', align: 'right', render: (r) => pct(r.chg_today ?? 0) },
    { key: 'mom_1m', label: '1M', align: 'right', render: (r) => pct(r.mom_1m) },
    { key: 'mom_6m', label: '6M', align: 'right', render: (r) => pct(r.mom_6m) },
    { key: 'mom_12m', label: '12M', align: 'right', render: (r) => pct(r.mom_12m) },
    { key: 'off_52w_high', label: 'vs 52W High', align: 'right', render: (r) => (
      r.off_52w_high === undefined ? '—'
        : <span style={{ color: r.off_52w_high > -3 ? C.gain : 'var(--text-secondary)' }} title="Distance below the 52-week high — near zero means at highs">
            {Number(r.off_52w_high).toFixed(1)}%
          </span>
    ) },
    { key: 'rsi', label: 'RSI', align: 'right', render: (r) => (
      r.rsi === undefined ? '—'
        : <span style={{ color: r.rsi >= 70 ? C.gold : r.rsi <= 40 ? C.loss : 'var(--text-primary)' }}>{r.rsi}</span>
    ) },
    { key: 'vol_ratio', label: 'Vol×', align: 'right', render: (r) => (
      r.vol_ratio === undefined ? '—'
        : <span style={{ color: r.vol_ratio >= 1.5 ? C.gain : 'var(--text-secondary)' }}>×{r.vol_ratio}</span>
    ) },
    { key: 'score', label: 'Score', align: 'right', render: (r) => <span className="tone-gold">{r.score >= 0 ? '+' : ''}{Number(r.score).toFixed(2)}%</span> },
  ];

  return (
    <div className="fade-in">
      <PageHeader
        code="MOM"
        title="Momentum Leaders"
        subtitle={`${market === 'us' ? 'US' : 'Indian'} large caps · ${universe || '~50'}-stock universe · momentum ranks + today's breakouts`}
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
          <button onClick={fetchData} style={{ width: 'auto', padding: '8px 16px', background: 'rgba(255, 69, 58, 0.15)', border: '1px solid var(--red-loss)', color: 'var(--red-loss)' }}>Retry</button>
        </div>
      ) : (
        <>
          {/* ---- Breaking out today ---- */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '4px 0 12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', letterSpacing: '0.04em' }}>BREAKING OUT TODAY</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              price above its prior 20-day / 3-month / 52-week high · dashed line = level broken
            </span>
          </div>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px', marginBottom: '26px' }}>
              {[1, 2, 3].map((i) => <div key={i} className="card" style={{ height: 160, opacity: 0.4 }} />)}
            </div>
          ) : breakouts.length === 0 ? (
            <div className="card" style={{ padding: '18px', marginBottom: '26px', fontSize: '13px', color: 'var(--text-secondary)' }}>
              No fresh breakouts in the {market === 'in' ? 'Nifty' : 'US'} large-cap universe this session — the leaders below show where the sustained trends are.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px', marginBottom: '26px' }}>
              {breakouts.map((b) => <BreakoutCard key={b.ticker} b={b} market={market} cur={cur} />)}
            </div>
          )}

          {/* ---- Momentum leaders ---- */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', margin: '4px 0 12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', letterSpacing: '0.04em' }}>MOMENTUM LEADERS</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              ranked by average of 1M / 6M / 12M returns · click a ticker for the full chart
            </span>
          </div>
          <DataTable columns={columns} rows={data} loading={loading} rowKey={(r) => r.ticker} />
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '10px' }}>
            vs 52W High near 0% = trading at highs (strength, or little headroom — read with RSI).
            Vol× is today against the 20-day average; ×1.5+ marks conviction moves. Analytics, not investment advice.
          </p>
        </>
      )}
    </div>
  );
};

export default Momentum;
