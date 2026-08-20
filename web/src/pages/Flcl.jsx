import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageHeader, SectionTitle, StatTile, StatGrid, Badge, DataTable } from '../components/ui';
import Plot from '../components/Plot';
import TickerSearch from '../components/TickerSearch';
import ShareButton from '../components/ShareButton';
import useAutoAiInsight from '../lib/useAutoAiInsight';
import revealResults from '../lib/revealResults';

const currencyFor = (ticker) => {
  const t = (ticker || '').toUpperCase();
  return t.endsWith('.NS') || t.endsWith('.BO') ? '₹' : '$';
};
const pctTxt = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);

// Concrete hex only — react-plotly silently ignores CSS vars (renders black).
const C = {
  text: '#F5F5F7', dim: '#A1A1AA', gold: '#F5DC8C', green: '#32D74B', red: '#FF453A',
  purple: '#BF5AF2', grid: 'rgba(255,255,255,0.06)',
  candleUp: '#34c759', candleDn: '#ff3b30',
  bullTint: 'rgba(50,215,75,0.07)', bearTint: 'rgba(255,69,58,0.07)',
};

const LOOKBACKS = [
  { label: '6 Months', value: 126 },
  { label: '1 Year', value: 252 },
  { label: '2 Years', value: 504 },
  { label: '3 Years', value: 756 },
];
const SENSITIVITIES = [
  { label: 'Fast (more flips)', window: 3 },
  { label: 'Balanced', window: 5 },
  { label: 'Smooth (fewer flips)', window: 8 },
];
const NOISE_FILTERS = [
  { label: 'Loose (1.0 ATR)', mult: 1.0 },
  { label: 'Standard (1.5 ATR)', mult: 1.5 },
  { label: 'Strict (2.0 ATR)', mult: 2.0 },
];

const regimeTone = (r) => (r === 'Bullish' ? 'gain' : r === 'Bearish' ? 'loss' : 'neutral');
const strengthTone = (s) => (s === 'STRONG' ? 'gold' : s === 'MODERATE' ? 'accent' : 'neutral');

const Flcl = () => {
  const [ticker, setTicker] = useState('RELIANCE.NS');
  const [days, setDays] = useState(252);
  const [swingWindow, setSwingWindow] = useState(5);
  const [atrMult, setAtrMult] = useState(1.5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState('');

  const runAnalysis = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post('/api/flcl', {
        ticker,
        days: Number(days),
        swing_window: Number(swingWindow),
        atr_mult: Number(atrMult),
      });
      setData(res.data);
      revealResults('flcl-analysis');
    } catch (err) {
      // Inline error — alert() freezes the preview renderer and interrupts flows
      setError(err.response?.data?.detail || err.message);
      setData(null);
    }
    setLoading(false);
  };

  const runAiAnalysis = async () => {
    const apiKey = localStorage.getItem('gemini_api_key');
    if (!apiKey) {
      setAiReport('**Add your Gemini API key in Settings to generate the regime brief.**');
      return;
    }
    setAiLoading(true);
    setAiReport('');
    try {
      const res = await axios.post('/api/ai/flcl', {
        ticker: data?.ticker || ticker,
        // summary only — the full per-bar series would bloat the prompt
        flcl_data: {
          params: data?.params, current: data?.current,
          signals: data?.signals, scorecard: data?.scorecard,
          recent_segments: (data?.segments || []).slice(-6),
        },
        apiKey,
      });
      setAiReport(res.data.report);
    } catch (err) {
      setAiReport(`**Error generating analysis:** ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  // With a saved Gemini key the regime brief generates itself after each run.
  useAutoAiInsight(data, runAiAnalysis);

  const cur = currencyFor(data?.ticker || ticker);
  const c = data?.current;
  const sc = data?.scorecard;
  const sig = data?.signals;

  // ---- chart pieces (only when data is loaded) ----
  let traces = [], layout = {};
  if (data) {
    const k = data.candles;
    const lv = data.levels;
    const swingH = data.swings.filter((s) => s.type === 'H');
    const swingL = data.swings.filter((s) => s.type === 'L');

    traces = [
      {
        x: k.dates, open: k.open, high: k.high, low: k.low, close: k.close,
        type: 'candlestick', name: data.ticker, whiskerwidth: 0.5, yaxis: 'y',
        increasing: { line: { color: C.candleUp, width: 1.4 } },
        decreasing: { line: { color: C.candleDn, width: 1.4 } },
      },
      {
        x: k.dates, y: lv.floor, type: 'scatter', mode: 'lines', name: 'Floor (support)',
        line: { color: C.green, width: 2, dash: 'dash', shape: 'hv' }, yaxis: 'y',
        hovertemplate: `%{x}<br>Floor ${cur}%{y:,.2f}<extra></extra>`,
      },
      {
        x: k.dates, y: lv.ceiling, type: 'scatter', mode: 'lines', name: 'Ceiling (resistance)',
        line: { color: C.red, width: 2, dash: 'dash', shape: 'hv' }, yaxis: 'y',
        hovertemplate: `%{x}<br>Ceiling ${cur}%{y:,.2f}<extra></extra>`,
      },
      {
        x: swingH.map((s) => s.date), y: swingH.map((s) => s.price),
        type: 'scatter', mode: 'markers', name: 'Swing high', yaxis: 'y',
        marker: { symbol: 'triangle-down', size: 8, color: C.dim },
        hovertemplate: `%{x}<br>Swing high ${cur}%{y:,.2f}<extra></extra>`,
      },
      {
        x: swingL.map((s) => s.date), y: swingL.map((s) => s.price),
        type: 'scatter', mode: 'markers', name: 'Swing low', yaxis: 'y',
        marker: { symbol: 'triangle-up', size: 8, color: C.dim },
        hovertemplate: `%{x}<br>Swing low ${cur}%{y:,.2f}<extra></extra>`,
      },
      {
        x: data.flips.map((f) => f.date), y: data.flips.map((f) => f.price),
        type: 'scatter', mode: 'markers', name: 'Regime flip', yaxis: 'y',
        marker: { symbol: 'diamond', size: 10, color: C.gold, line: { color: '#000', width: 1 } },
        hovertemplate: '%{x}<br>Flip → %{text}<extra></extra>',
        text: data.flips.map((f) => f.to),
      },
      {
        x: k.dates, y: lv.range_pos, type: 'scatter', mode: 'lines', name: 'Range position',
        line: { color: C.purple, width: 1.6 }, yaxis: 'y2', connectgaps: false,
        hovertemplate: '%{x}<br>%{y:.0f}% of range<extra></extra>',
      },
    ];

    // Per-segment regime tint over the price pane only
    const tintShapes = data.segments
      .filter((s) => s.regime !== 'Neutral')
      .map((s) => ({
        type: 'rect', xref: 'x', yref: 'paper',
        x0: s.start, x1: s.end, y0: 0.3, y1: 1,
        fillcolor: s.regime === 'Bullish' ? C.bullTint : C.bearTint,
        line: { width: 0 }, layer: 'below',
      }));
    const rpGuides = [20, 80].map((y) => ({
      type: 'line', xref: 'paper', yref: 'y2', x0: 0, x1: 1, y0: y, y1: y,
      line: { color: y === 20 ? 'rgba(50,215,75,0.4)' : 'rgba(255,69,58,0.4)', width: 1, dash: 'dot' },
    }));

    layout = {
      autosize: true,
      height: 560,
      margin: { l: 8, r: 56, t: 8, b: 24 },
      paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: { color: C.dim, family: 'Inter', size: 11 },
      xaxis: {
        rangeslider: { visible: false },
        gridcolor: C.grid, linecolor: C.grid, automargin: true, nticks: 8,
      },
      yaxis: {
        domain: [0.3, 1], side: 'right', tickprefix: cur,
        gridcolor: C.grid, linecolor: C.grid, automargin: true, nticks: 7,
      },
      yaxis2: {
        domain: [0, 0.22], side: 'right', range: [-8, 108],
        tickvals: [20, 50, 80], gridcolor: C.grid, linecolor: C.grid,
        title: { text: 'RANGE %', font: { size: 9, color: C.dim } },
      },
      showlegend: true,
      legend: { orientation: 'h', x: 0, y: 1.05, font: { size: 11, color: C.dim } },
      hoverlabel: { bgcolor: '#1c1c1e', bordercolor: C.grid, font: { color: C.text } },
      shapes: [...tintShapes, ...rpGuides],
    };
  }

  const segColumns = [
    { key: 'regime', label: 'Regime', render: (r) => <Badge tone={regimeTone(r.regime)}>{r.regime}</Badge> },
    { key: 'start', label: 'Start' },
    { key: 'end', label: 'End' },
    { key: 'days', label: 'Sessions', align: 'right' },
    { key: 'return_pct', label: 'Return', align: 'right', render: (r) => (
      <span style={{ color: (r.return_pct || 0) >= 0 ? C.green : C.red }}>{pctTxt(r.return_pct)}</span>
    ) },
  ];

  return (
    <div>
      <PageHeader code="FLCL" title="FLCL Analysis"
        subtitle="Floor/Ceiling regime engine — confirmed swing structure, trailing levels and an honest regime scorecard." />

      <form onSubmit={runAnalysis} className="panel" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px', alignItems: 'end', padding: 16, marginBottom: 20,
      }}>
        <div>
          <label style={{ display: 'block', fontSize: 12 }}>Ticker Symbol</label>
          <TickerSearch value={ticker} onChange={setTicker} placeholder="Ticker or company name…" />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12 }}>Lookback</label>
          <select value={days} onChange={(e) => setDays(e.target.value)} style={{ width: '100%', marginBottom: 0 }}>
            {LOOKBACKS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12 }}>Sensitivity</label>
          <select value={swingWindow} onChange={(e) => setSwingWindow(e.target.value)} style={{ width: '100%', marginBottom: 0 }}>
            {SENSITIVITIES.map((o) => <option key={o.window} value={o.window}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12 }}>Noise Filter</label>
          <select value={atrMult} onChange={(e) => setAtrMult(e.target.value)} style={{ width: '100%', marginBottom: 0 }}>
            {NOISE_FILTERS.map((o) => <option key={o.mult} value={o.mult}>{o.label}</option>)}
          </select>
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', minHeight: 44 }}>
          {loading ? <><span className="spinner"></span> Analyzing…</> : 'Run Analysis'}
        </button>
      </form>

      {error && (
        <div style={{ color: 'var(--red-loss)', padding: '14px 16px', background: 'rgba(255,69,58,0.1)', borderRadius: 10, marginBottom: 20 }}>
          <strong>Analysis error:</strong> {error}
        </div>
      )}

      {data && c && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }} data-noshare>
          <ShareButton
            label="Share this analysis"
            filename={`alpha-nova-flcl-${(data.ticker || ticker).replace(/\W+/g, '-')}.png`}
            shareText={`${data.ticker} floor/ceiling regime: ${c.regime} — Alpha Nova`}
            capture={() => document.getElementById('flcl-analysis')}
          />
        </div>
      )}

      {data && c && (
      <div id="flcl-analysis">
        <StatGrid style={{ marginBottom: 16 }}>
          <StatTile label="Regime" tone={regimeTone(c.regime)} value={c.regime}
            sub={`${c.days_in_regime} sessions · bias ${sig?.bias || '—'}`} />
          <StatTile label="Last Price" value={`${cur}${(c.price ?? 0).toLocaleString()}`} sub={`as of ${c.as_of}`} />
          <StatTile label="Floor · Support" tone="gain"
            value={c.floor === null ? '—' : `${cur}${c.floor.toLocaleString()}`}
            sub={c.dist_floor_pct === null ? 'not established yet'
              : `price ${Math.abs(c.dist_floor_pct).toFixed(1)}% ${c.dist_floor_pct >= 0 ? 'above' : 'below'}`} />
          <StatTile label="Ceiling · Resistance" tone="loss"
            value={c.ceiling === null ? '—' : `${cur}${c.ceiling.toLocaleString()}`}
            sub={c.dist_ceiling_pct === null ? 'not established yet'
              : c.dist_ceiling_pct >= 0 ? `${c.dist_ceiling_pct.toFixed(1)}% to reach` : `broken — price ${Math.abs(c.dist_ceiling_pct).toFixed(1)}% above`} />
          <StatTile label="Range Position"
            value={c.range_pos_pct === null ? '—'
              : c.range_pos_pct < 0 ? 'Below floor'
              : c.range_pos_pct > 100 ? 'Above ceiling'
              : `${Math.round(c.range_pos_pct)}%`}
            sub="0% = floor · 100% = ceiling" />
          {sc && (
            <StatTile label="Regime Edge" tone={(sc.edge_pct || 0) >= 0 ? 'gain' : 'loss'}
              value={pctTxt(sc.edge_pct)}
              sub={`regime-long ${pctTxt(sc.strategy_return_pct)} vs hold ${pctTxt(sc.buy_hold_return_pct)}`} />
          )}
        </StatGrid>

        <div className="card" style={{ padding: '12px 8px 4px' }}>
          <Plot
            data={traces}
            layout={layout}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%' }}
            useResizeHandler
          />
          <p style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5, margin: '4px 8px 8px' }}>
            Green/red tint = regime in force at that time, using only information available then (swings confirm
            {` ${data.params.swing_window} `}bars after they print — no hindsight). Dashed green = trailing floor,
            dashed red = ceiling; gold diamonds mark regime flips. Bottom pane: where price sits inside the
            floor→ceiling range.
          </p>
        </div>

        {sig && (
          <div className="panel" style={{ padding: 16, marginTop: 16 }}>
            <SectionTitle>Signal Read</SectionTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '10px 0 14px' }}>
              <Badge tone={regimeTone(c.regime)}>BIAS: {sig.bias}</Badge>
              {sig.suggested_stop !== null && sig.suggested_stop !== undefined && (
                <Badge tone="gold">STRUCTURE STOP {cur}{sig.suggested_stop.toLocaleString()}</Badge>
              )}
              {c.range_width_atr !== null && c.range_width_atr !== undefined && (
                <Badge tone="neutral">RANGE {c.range_width_atr} ATRs WIDE</Badge>
              )}
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {sig.items.map((it, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)', borderRadius: 10,
                }}>
                  <Badge tone={strengthTone(it.strength)} style={{ flexShrink: 0 }}>{it.type.replace(/_/g, ' ')}</Badge>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{it.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sc && (
          <div className="panel" style={{ padding: 16, marginTop: 16 }}>
            <SectionTitle>Regime Scorecard · does the filter earn its keep on this name?</SectionTitle>
            <StatGrid style={{ marginTop: 12 }}>
              <StatTile label="Long-in-Bull Return" tone={(sc.strategy_return_pct || 0) >= 0 ? 'gain' : 'loss'}
                value={pctTxt(sc.strategy_return_pct)} sub={`vs buy & hold ${pctTxt(sc.buy_hold_return_pct)}`} />
              <StatTile label="Time Invested" value={`${sc.exposure_pct ?? '—'}%`}
                sub={`bull ${sc.time_bull_pct}% · bear ${sc.time_bear_pct}% · neutral ${sc.time_neutral_pct}%`} />
              <StatTile label="Max Drawdown" tone={
                sc.max_dd_strategy_pct !== null && sc.max_dd_bh_pct !== null && sc.max_dd_strategy_pct > sc.max_dd_bh_pct ? 'gain' : 'neutral'
              }
                value={sc.max_dd_strategy_pct === null ? '—' : `${sc.max_dd_strategy_pct}%`}
                sub={`buy & hold ${sc.max_dd_bh_pct === null ? '—' : `${sc.max_dd_bh_pct}%`}`} />
              <StatTile label="Regime Flips" value={sc.flips}
                sub={`${sc.bull_segments_won}/${sc.bull_segments} bull runs positive`} />
            </StatGrid>
            <p style={{ color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1.5, margin: '10px 4px 0' }}>
              Simulated close-to-close over the lookback: long only while the regime read Bullish (entered at the flip
              day's close), flat otherwise. No costs or slippage. A positive edge means the regime filter beat holding —
              on strong one-way trends, holding often wins; the filter's job is sidestepping the bear legs.
            </p>
          </div>
        )}

        {data.segments && data.segments.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <SectionTitle>Regime History</SectionTitle>
            <DataTable columns={segColumns} rows={[...data.segments].reverse()}
              rowKey={(r) => `${r.start}-${r.regime}`} />
          </div>
        )}
      </div>
      )}

      {data && (
        <div style={{ marginTop: '24px' }} data-noshare>
          {!aiReport ? (
            <button onClick={runAiAnalysis} disabled={aiLoading} className="secondary">
              {aiLoading ? <><span className="spinner"></span> ENGINE ANALYZING...</> : 'GENERATE GEMINI REGIME BRIEF'}
            </button>
          ) : (
            <div className="ai-insight">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                <h3>Gemini Regime Analysis</h3>
                <button onClick={runAiAnalysis} disabled={aiLoading} style={{ width: 'auto', padding: '6px 14px', fontSize: '12px' }} className="secondary">
                  {aiLoading ? <><span className="spinner"></span> RE-ANALYZING...</> : 'REFRESH'}
                </button>
              </div>
              <div className="ai-insight-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiReport}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Flcl;
