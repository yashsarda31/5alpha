import React, { useState, useMemo } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Plot from '../components/Plot';
import ShareButton from '../components/ShareButton';
import { PageHeader } from '../components/ui';
import { useSWR } from '../lib/swrCache';
import './SectorRotation.css';

// Concrete hex (react-plotly can't resolve CSS vars — silent black fallback).
const C = {
  text: '#F5F5F7', dim: '#A1A1AA', gold: '#F5DC8C', accent: '#3EE6FF',
  green: '#32D74B', red: '#FF453A', grid: 'rgba(255,255,255,0.08)',
};
// Quadrant identity: colour + one-line meaning, reused by chart and table.
const QUAD = {
  Leading: { color: '#32D74B', label: 'Leading', hint: 'Strong & strengthening' },
  Weakening: { color: '#F5DC8C', label: 'Weakening', hint: 'Strong but fading' },
  Improving: { color: '#3EE6FF', label: 'Improving', hint: 'Weak but turning up' },
  Lagging: { color: '#FF453A', label: 'Lagging', hint: 'Weak & weakening' },
};

const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(2)}%`);
const toneOf = (v) => (v === null || v === undefined ? 'dim' : v > 0 ? 'green' : v < 0 ? 'red' : 'dim');

const OutlookBadge = ({ outlook }) => {
  const map = {
    Favored: { bg: 'rgba(50,215,75,0.14)', fg: '#32D74B', txt: 'Tailwind' },
    Headwind: { bg: 'rgba(255,69,58,0.14)', fg: '#FF453A', txt: 'Headwind' },
    Neutral: { bg: 'rgba(161,161,170,0.14)', fg: '#A1A1AA', txt: 'Neutral' },
  };
  const s = map[outlook] || map.Neutral;
  return <span className="sr-badge" style={{ background: s.bg, color: s.fg }}>{s.txt}</span>;
};

// Relative Rotation Graph: RS-Ratio (x) vs RS-Momentum (y), both centred at 100.
// Each sector is a short tail (recent weeks) ending in a labelled head dot.
const RrgChart = ({ sectors }) => {
  const { traces, bounds } = useMemo(() => {
    const xs = [], ys = [];
    const tr = [];
    sectors.forEach((s) => {
      const tailX = s.tail.map((p) => p.x);
      const tailY = s.tail.map((p) => p.y);
      xs.push(...tailX); ys.push(...tailY);
      const col = (QUAD[s.quadrant] || {}).color || C.accent;
      // faint trajectory tail
      tr.push({
        x: tailX, y: tailY, mode: 'lines', type: 'scatter',
        line: { color: col, width: 1.5, shape: 'spline' }, opacity: 0.45,
        hoverinfo: 'skip', showlegend: false,
      });
      // head dot + label
      tr.push({
        x: [tailX[tailX.length - 1]], y: [tailY[tailY.length - 1]],
        mode: 'markers+text', type: 'scatter',
        marker: { color: col, size: 12, line: { color: '#000', width: 1 } },
        text: [s.name.replace('Nifty ', '')], textposition: 'top center',
        textfont: { color: C.text, size: 11 },
        customdata: [[s.quadrant, s.score, s.outlook]],
        hovertemplate: `<b>${s.name}</b><br>%{customdata[0]} · score %{customdata[1]}<br>RS-Ratio %{x:.2f} · RS-Mom %{y:.2f}<extra></extra>`,
        showlegend: false,
      });
    });
    const pad = 0.6;
    const lo = Math.min(97, ...xs, ...ys) - pad;
    const hi = Math.max(103, ...xs, ...ys) + pad;
    return { traces: tr, bounds: [lo, hi] };
  }, [sectors]);

  const [lo, hi] = bounds;
  // Quadrant background tints (Leading NE, Weakening SE, Lagging SW, Improving NW)
  const shapes = [
    { type: 'rect', x0: 100, x1: hi, y0: 100, y1: hi, fillcolor: 'rgba(50,215,75,0.06)', line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: 100, x1: hi, y0: lo, y1: 100, fillcolor: 'rgba(245,220,140,0.06)', line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: lo, x1: 100, y0: lo, y1: 100, fillcolor: 'rgba(255,69,58,0.06)', line: { width: 0 }, layer: 'below' },
    { type: 'rect', x0: lo, x1: 100, y0: 100, y1: hi, fillcolor: 'rgba(62,230,255,0.06)', line: { width: 0 }, layer: 'below' },
    { type: 'line', x0: 100, x1: 100, y0: lo, y1: hi, line: { color: C.grid, width: 1, dash: 'dot' } },
    { type: 'line', x0: lo, x1: hi, y0: 100, y1: 100, line: { color: C.grid, width: 1, dash: 'dot' } },
  ];
  const annotations = [
    { x: hi, y: hi, xanchor: 'right', yanchor: 'top', text: 'LEADING', showarrow: false, font: { color: C.green, size: 10 }, opacity: 0.7 },
    { x: hi, y: lo, xanchor: 'right', yanchor: 'bottom', text: 'WEAKENING', showarrow: false, font: { color: C.gold, size: 10 }, opacity: 0.7 },
    { x: lo, y: lo, xanchor: 'left', yanchor: 'bottom', text: 'LAGGING', showarrow: false, font: { color: C.red, size: 10 }, opacity: 0.7 },
    { x: lo, y: hi, xanchor: 'left', yanchor: 'top', text: 'IMPROVING', showarrow: false, font: { color: C.accent, size: 10 }, opacity: 0.7 },
  ];

  return (
    <Plot
      data={traces}
      layout={{
        autosize: true, height: 460,
        margin: { l: 48, r: 20, t: 12, b: 40 },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
        xaxis: { title: { text: 'RS-Ratio  (relative strength →)', font: { color: C.dim, size: 11 } }, range: [lo, hi], color: C.dim, gridcolor: C.grid, zeroline: false, tickfont: { size: 10 } },
        yaxis: { title: { text: 'RS-Momentum  (↑ improving)', font: { color: C.dim, size: 11 } }, range: [lo, hi], color: C.dim, gridcolor: C.grid, zeroline: false, tickfont: { size: 10 } },
        shapes, annotations, showlegend: false,
        hoverlabel: { bgcolor: '#1c1c1e', bordercolor: C.grid, font: { color: C.text } },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
      useResizeHandler
    />
  );
};

const SectorRotation = () => {
  const { data, refreshing, error: swrError, revalidate } = useSWR(
    'sectors',
    () => axios.get('/api/sectors').then((r) => r.data),
    0,
  );
  const [aiReport, setAiReport] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const runAi = async () => {
    const apiKey = localStorage.getItem('gemini_api_key') || '';
    if (!apiKey) { setAiReport('Add your Gemini API key in Settings to generate the rotation brief.'); return; }
    setAiLoading(true); setAiReport('');
    try {
      const res = await axios.post('/api/ai/sectors', { sector_data: data, apiKey });
      setAiReport(res.data.report || 'No response.');
    } catch (err) {
      setAiReport(`Failed: ${err.response?.data?.detail || err.message}`);
    }
    setAiLoading(false);
  };

  const loading = !data && !swrError;
  const error = !data && swrError ? (swrError.response?.data?.detail || 'Failed to load sector data.') : null;

  if (loading) {
    return (
      <div className="sr-container fade-in">
        <PageHeader code="SEC" title="Sector Rotation" subtitle="Which sectors are gaining and losing strength vs the broad market" />
        <div className="card" style={{ padding: 24 }}>
          <div className="skeleton skeleton-header" />
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton skeleton-row" style={{ height: 36, marginTop: 14 }} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sr-container fade-in">
        <PageHeader code="SEC" title="Sector Rotation" subtitle="Which sectors are gaining and losing strength vs the broad market" />
        <div className="card sr-error">
          <p>{error}</p>
          <button className="secondary" onClick={revalidate}>Retry</button>
        </div>
      </div>
    );
  }

  const { sectors, quadrant_counts: qc, leaders, laggards, benchmark, as_of } = data;
  // US sector map (SPDR ETFs vs S&P 500) serves during US market hours; India
  // (NSE sectors vs Nifty 50) otherwise. Labels follow whichever is live.
  const isUS = data.market === 'US';
  const benchName = isUS ? 'S&P 500' : 'Nifty 50';
  const benchShort = isUS ? 'S&P' : 'Nifty';
  // Simple posture read: more sectors leading/improving than lagging/weakening
  // = broad strength (risk-on); the reverse leans defensive.
  const offensive = (qc.Leading || 0) + (qc.Improving || 0);
  const defensive = (qc.Weakening || 0) + (qc.Lagging || 0);
  const posture = offensive > defensive ? 'Risk-on — breadth is expanding'
    : offensive < defensive ? 'Defensive — breadth is contracting'
    : 'Mixed — no clear breadth tilt';

  return (
    <div className="sr-container fade-in">
      <PageHeader
        code="SEC"
        title="Sector Rotation"
        subtitle={`Which sectors are gaining and losing strength vs the ${benchName}`}
        right={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="sr-market-pill">{isUS ? 'US market' : 'India'}</span>
            <button data-noshare="" className="secondary sr-refresh" onClick={revalidate} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
          </div>
        }
      />

      {/* Outlook summary: favored vs headwind */}
      <div className="sr-outlook-grid">
        <div className="card sr-outlook sr-outlook-fav">
          <div className="sr-outlook-head">Likely tailwind next week</div>
          {leaders.length ? (
            <div className="sr-chips">{leaders.map((n) => <span key={n} className="sr-chip sr-chip-up">{n.replace('Nifty ', '')}</span>)}</div>
          ) : <div className="sr-empty">No sector shows a clear tailwind right now.</div>}
        </div>
        <div className="card sr-outlook sr-outlook-head-wind">
          <div className="sr-outlook-head">Likely headwind next week</div>
          {laggards.length ? (
            <div className="sr-chips">{laggards.map((n) => <span key={n} className="sr-chip sr-chip-down">{n.replace('Nifty ', '')}</span>)}</div>
          ) : <div className="sr-empty">No sector shows a clear headwind right now.</div>}
        </div>
      </div>

      {/* Market posture strip */}
      <div className="card sr-posture">
        <span className="sr-posture-label">Market posture</span>
        <span className="sr-posture-value">{posture}</span>
        <ShareButton
          label="Share"
          filename="alpha-nova-sector-rotation.png"
          shareText="Indian sector rotation read — Alpha Nova"
          capture={() => document.querySelector('.sr-container')}
        />
        <span className="sr-posture-counts">
          <span style={{ color: QUAD.Leading.color }}>{qc.Leading} leading</span> ·
          <span style={{ color: QUAD.Improving.color }}> {qc.Improving} improving</span> ·
          <span style={{ color: QUAD.Weakening.color }}> {qc.Weakening} weakening</span> ·
          <span style={{ color: QUAD.Lagging.color }}> {qc.Lagging} lagging</span>
        </span>
      </div>

      {/* RRG chart */}
      <div className="card sr-chart-card">
        <div className="sr-card-title">
          <span>Relative Rotation Graph</span>
          <span className="sr-asof">{benchmark.name} benchmark · {as_of}</span>
        </div>
        <RrgChart sectors={sectors} />
        <div className="sr-legend">
          {Object.values(QUAD).map((q) => (
            <span key={q.label} className="sr-legend-item">
              <span className="sr-dot" style={{ background: q.color }} />
              <b>{q.label}</b> — {q.hint}
            </span>
          ))}
        </div>
        <p className="sr-note">
          Sectors rotate clockwise: Improving → Leading → Weakening → Lagging. A sector drifting toward the
          top-right (Leading) is gaining strength; toward the bottom-left (Lagging) is losing it.
        </p>
      </div>

      {/* Ranked table */}
      <div className="card sr-table-card">
        <div className="sr-card-title"><span>Sector strength ranking</span></div>
        <div className="sr-table-scroll">
          <table className="sr-table">
            <thead>
              <tr>
                <th>#</th><th>Sector</th><th>Outlook</th><th>Quadrant</th>
                <th className="sr-num">Score</th>
                <th className="sr-num">1W vs {benchShort}</th>
                <th className="sr-num">1M vs {benchShort}</th>
                <th className="sr-num">3M vs {benchShort}</th>
                <th className="sr-num">vs 50-DMA</th>
                <th className="sr-num">Today</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s, i) => (
                <tr key={s.name}>
                  <td className="sr-rank">{i + 1}</td>
                  <td className="sr-name">{s.name}</td>
                  <td><OutlookBadge outlook={s.outlook} /></td>
                  <td>
                    <span className="sr-quad" style={{ color: (QUAD[s.quadrant] || {}).color }}>
                      <span className="sr-dot" style={{ background: (QUAD[s.quadrant] || {}).color }} />{s.quadrant}
                    </span>
                  </td>
                  <td className="sr-num sr-score-cell">
                    <span className="sr-score-bar"><span style={{ width: `${s.score}%`, background: (QUAD[s.quadrant] || {}).color }} /></span>
                    <b>{s.score}</b>
                  </td>
                  <td className={`sr-num tone-${toneOf(s.rel_1w)}`}>{pct(s.rel_1w)}</td>
                  <td className={`sr-num tone-${toneOf(s.rel_1m)}`}>{pct(s.rel_1m)}</td>
                  <td className={`sr-num tone-${toneOf(s.rel_3m)}`}>{pct(s.rel_3m)}</td>
                  <td className={`sr-num tone-${toneOf(s.trend_50d)}`}>{pct(s.trend_50d)}</td>
                  <td className={`sr-num tone-${toneOf(s.live_pct)}`}>{pct(s.live_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sr-note">
          "vs {benchShort}" = the sector's return minus the {benchName}'s over the same window (positive = outperforming).
          Score blends short-term relative strength, rotation momentum and trend. Momentum-based — it can reverse.
        </p>
      </div>

      {/* AI brief */}
      <div className="card sr-ai-card" data-noshare="">
        <div className="sr-card-title">
          <span>AI rotation brief</span>
          <button className="secondary" onClick={runAi} disabled={aiLoading}>{aiLoading ? 'Analysing…' : 'Generate'}</button>
        </div>
        {aiReport
          ? <div className="sr-ai-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{aiReport}</ReactMarkdown></div>
          : <p className="sr-note">Get a plain-English read of where money is rotating and what it implies for market posture.</p>}
      </div>
    </div>
  );
};

export default SectorRotation;
