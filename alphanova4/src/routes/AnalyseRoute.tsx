import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../lib/apiClient';
import { normalizeChart, normalizeFundamentals } from '../data/chart';
import type { ChartViewModel, FundamentalsViewModel } from '../data/contracts';
import type { UniverseRuntime } from '../scene/createUniverse';
import { createAnalyseZone } from '../scene/zones/analyseZone';

const latest = (values: Array<number | null>) => values.at(-1);
const fixed = (value: number | null | undefined) => value == null ? 'Unavailable' : value.toFixed(2);
const chartSummary = (chart: ChartViewModel) => {
  const close = latest(chart.close);
  const sma20 = latest(chart.sma20);
  const distance = close != null && sma20 != null && sma20 !== 0 ? `${((close / sma20 - 1) * 100).toFixed(2)}%` : 'Unavailable';
  return [
    `Ticker: ${chart.ticker}`,
    `Latest Close: ${fixed(close)}`,
    `Latest High: ${fixed(latest(chart.high))}`,
    `Latest Low: ${fixed(latest(chart.low))}`,
    `Current 20 SMA: ${fixed(sma20)}`,
    `Distance from 20 SMA: ${distance}`,
    `Latest 14-period RSI: ${fixed(latest(chart.rsi))}`,
  ].join('\n');
};

export const AnalyseRoute = ({ runtime }: { runtime: UniverseRuntime | null }) => {
  const [params, setParams] = useSearchParams();
  const symbol = params.get('symbol')?.trim().toUpperCase() || 'NVDA';
  const [query, setQuery] = useState(symbol);
  const [chart, setChart] = useState<ChartViewModel | null>(null);
  const [fundamentals, setFundamentals] = useState<FundamentalsViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const zone = useMemo(() => createAnalyseZone(), []);
  useEffect(() => { runtime?.registerZone(zone); }, [runtime, zone]);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/api/chart/${encodeURIComponent(symbol)}`, { signal: controller.signal }).then(normalizeChart).then((next) => {
      if (controller.signal.aborted) return;
      if (!next.close.length) throw new Error('No finite chart data available');
      setChart(next); runtime?.renderZone('analyse', next);
      apiRequest(`/api/fundamentals/${encodeURIComponent(next.ticker)}`, { signal: controller.signal }).then(normalizeFundamentals).then(setFundamentals).catch(() => undefined);
    }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof ApiError && reason.status === 404 ? `${symbol} was not found. Check the symbol and try again.` : reason instanceof Error ? reason.message : 'Chart unavailable'); });
    return () => controller.abort();
  }, [runtime, symbol]);
  const search = (event: FormEvent) => { event.preventDefault(); const next = query.trim().toUpperCase(); if (next) { setError(null); setChart(null); setFundamentals(null); setParams({ symbol: next }); } };
  const generate = async () => {
    if (!chart) return; setAiError(null); setInsight(null);
    const apiKey = localStorage.getItem('gemini_api_key')?.trim();
    if (!apiKey) { setAiError('Add your Gemini API key in Settings to generate the market insight.'); return; }
    try {
      const result = await apiRequest<{ report?: string; analysis?: string }>('/api/ai/chart', { method: 'POST', body: JSON.stringify({ ticker: chart.ticker, data_summary: chartSummary(chart), apiKey }) });
      setInsight(result.report ?? result.analysis ?? 'No insight returned.');
    } catch (reason) { setAiError(reason instanceof Error ? reason.message : 'Insight unavailable'); }
  };
  return <section className="route-panel analyse-layout">
    <form role="search" className="ticker-search" onSubmit={search}><label className="sr-only" htmlFor="ticker">Symbol</label><input id="ticker" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="NVDA or RELIANCE.NS"/><button className="primary-action" type="submit">Analyse symbol</button></form>
    {error ? <div className="data-message is-error" role="status">{error}</div> : !chart ? <p role="status">Building trajectory chamber…</p> : <>
      <div className="analyse-heading"><div><div className="route-code">FINITE PRICE GEOMETRY</div><h1>{chart.ticker} trajectory</h1></div><strong>{chart.close.at(-1)?.toLocaleString('en-IN')}</strong></div>
      <div className="metric-grid"><span>Bars<strong>{chart.close.length}</strong></span><span>RSI<strong>{chart.rsi.at(-1)?.toFixed(1)}</strong></span><span>P/E<strong>{fundamentals?.peRatio?.toFixed(1) ?? '—'}</strong></span><span>ROE<strong>{fundamentals?.roe?.toFixed(1) ?? '—'}</strong></span></div>
      <button className="primary-action" type="button" onClick={generate}>Generate market insight</button>{aiError && <p role="status" className="data-message is-error">{aiError}</p>}{insight && <pre className="insight-report">{insight}</pre>}
    </>}
  </section>;
};
