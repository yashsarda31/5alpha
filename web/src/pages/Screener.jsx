import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Check, Download, Search, SlidersHorizontal, BookmarkPlus, X } from 'lucide-react';
import LazyMarkdown from '../components/LazyMarkdown';
import { PageHeader } from '../components/ui';
import WatchlistStar from '../components/WatchlistStar';
import useAutoAiInsight from '../lib/useAutoAiInsight';
import { useMarket } from '../MarketContext';
import { EMPTY_RULES, PRESETS, UNIVERSES, BENCHMARKS, TREND_OPTIONS, RS_OPTIONS, NUMBER_FILTERS,
  applyPreset, buildPayload, filterChips, sortRows, sanitizeSaved, csvForRows, screenDefaultsForMarket,
  configFromSearchParams, configToSearchParams } from '../lib/screenerView';
import './Screener.css';

const SAVED_KEY = 'alphanova_saved_screens_v1';
const fmt = (v, suffix = '') => v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${suffix}`;
const money = r => `${/\.(NS|BO)$/i.test(r.ticker) ? '₹' : '$'}${fmt(r.price)}`;
const getSaved = () => { try { return sanitizeSaved(JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')); } catch { return []; } };

function StockName({ row }) {
  const india = /\.(NS|BO)$/i.test(row.ticker);
  return <span className="screen-stock">
    {(row.ticker.endsWith('.NS') || !row.ticker.includes('.')) && <WatchlistStar symbol={row.ticker} market={india ? 'IN' : 'US'} size={17} />}
    <Link to={`/chart?symbol=${encodeURIComponent(row.ticker)}`} title={`Open ${row.ticker} chart`}>{row.ticker.replace(/\.(NS|BO)$/, '')}<ArrowUpRight size={13} aria-hidden="true" /></Link>
    <small>{india ? 'IN' : 'US'}</small>
  </span>;
}

export default function Screener() {
  const { market } = useMarket();
  const [searchParams, setSearchParams] = useSearchParams();
  const [config, setConfig] = useState(() => configFromSearchParams(searchParams, screenDefaultsForMarket(market)));
  const [category, setCategory] = useState('Technical');
  const [saved, setSaved] = useState(getSaved);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'ticker', direction: 'asc' });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReport, setAiReport] = useState('');
  const drawer = useRef(null);
  const request = useRef(null);
  const aiRequest = useRef(null);
  const resultsHeading = useRef(null);
  const previousMarket = useRef(market);
  useEffect(() => () => { request.current?.abort(); aiRequest.current?.abort(); }, []);
  useEffect(() => {
    if (previousMarket.current === market) return;
    previousMarket.current = market;
    request.current?.abort();
    aiRequest.current?.abort();
    setConfig(old => screenDefaultsForMarket(market, old));
    setResult(null);
    setSnapshot(null);
    setLoading(false);
    setError('');
    setAiLoading(false);
    setAiReport('');
  }, [market]);
  const chips = filterChips(config);
  const activePreset = PRESETS.find(p => JSON.stringify(filterChips(applyPreset(config, p))) === JSON.stringify(chips));
  const changed = snapshot && JSON.stringify(config) !== JSON.stringify(snapshot);
  const visibleRows = useMemo(() => sortRows((result?.data || []).filter(r => r.ticker.toLowerCase().includes(search.trim().toLowerCase())), sort.key, sort.direction), [result, search, sort]);
  const set = (key, value) => setConfig(old => ({ ...old, [key]: value }));
  const changeUniverse = universe => setConfig(old => ({ ...old, universe,
    benchmark: universe === 'custom' ? 'auto' : ['sp100', 'nasdaq100'].includes(universe) ? (universe === 'nasdaq100' ? '^NDX' : '^GSPC') : '^NSEI' }));

  const run = async event => {
    event?.preventDefault();
    let payload;
    try { payload = buildPayload(config); } catch (err) { setError(err.message); return; }
    request.current?.abort(); aiRequest.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const submitted = { ...config };
    setLoading(true); setError(''); setAiReport(''); setAiLoading(false);
    try {
      const response = await axios.post('/api/screener', payload, { signal: controller.signal, timeout: 65000 });
      if (controller.signal.aborted) return;
      if (!Array.isArray(response.data.data) || response.data.incomplete_count == null) throw new Error('The screener service needs updating. Please retry shortly.');
      setResult(response.data); setSnapshot(submitted); setSearch(''); setSort({ key: 'ticker', direction: 'asc' });
      setSearchParams(configToSearchParams(submitted), { replace: true });
      requestAnimationFrame(() => resultsHeading.current?.focus({ preventScroll: true }));
    } catch (err) {
      if (!controller.signal.aborted) setError(typeof err.response?.data?.detail === 'string' ? err.response.data.detail : err.message || 'Could not complete the screen. Please retry.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };
  const persistSaved = next => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); setSaved(next); return true; }
    catch { setNotice('This browser could not save your screens. Check its storage settings.'); return false; }
  };
  const saveScreen = event => {
    event.preventDefault();
    try { buildPayload(config); } catch (err) { setNotice(err.message); return; }
    const name = saveName.trim(); if (!name) return;
    const existing = saved.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!existing && saved.length >= 30) { setNotice('You can keep 30 saved screens. Remove one to add another.'); return; }
    const entry = { id: existing?.id || crypto.randomUUID(), name, config: { ...config } };
    if (persistSaved([...saved.filter(s => s.id !== entry.id), entry])) { setSaveOpen(false); setSaveName(''); setNotice(`“${name}” saved on this browser.`); }
  };
  const exportRows = () => {
    const url = URL.createObjectURL(new Blob([csvForRows(visibleRows)], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `alpha-nova-screen-${result.generated_at.slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const runAiAnalysis = async () => {
    if (!result?.data.length) return;
    let apiKey;
    try { apiKey = localStorage.getItem('gemini_api_key'); } catch { /* Restricted browser storage. */ }
    if (!apiKey) { setAiReport('Add your Gemini API key in Settings to generate the screener brief.'); return; }
    aiRequest.current?.abort();
    const controller = new AbortController(); aiRequest.current = controller;
    setAiLoading(true);
    try {
      const response = await axios.post('/api/ai/screener', { screener_data: result.data, apiKey }, { signal: controller.signal });
      if (!controller.signal.aborted) setAiReport(response.data.report);
    } catch (err) { if (!controller.signal.aborted) setAiReport(`Could not generate the brief: ${err.message}`); }
    finally { if (!controller.signal.aborted) setAiLoading(false); }
  };
  useAutoAiInsight(!loading && result?.data.length ? result.data : null, runAiAnalysis);

  const columns = [{ key: 'ticker', label: 'Stock', render: r => <StockName row={r} /> },
    { key: 'price', label: 'Scan close', render: r => <><strong>{money(r)}</strong><small className="screen-cell-date">{r.priceDate}</small></> }];
  if (snapshot?.price_trend) columns.push({ key: 'dist200', label: 'From 200 DMA', render: r => fmt(r.dist200, '%') });
  if (snapshot?.rs_screen) columns.push({ key: 'rsNewHigh', label: 'RS new high', render: r => r.rsNewHigh == null ? '—' : r.rsNewHigh ? <span className="screen-positive">Yes</span> : 'No' });
  if (snapshot?.volume_breakout) columns.push({ key: 'volumeRatio', label: 'Volume / avg', render: r => fmt(r.volumeRatio, '×') });
  const fundamentalColumns = [
    { key: 'peRatio', label: 'P/E', filter: ['min_pe', 'max_pe'] }, { key: 'roe', label: 'ROE', suffix: '%', filter: ['min_roe'] },
    { key: 'epsGrowth', label: 'EPS growth', suffix: '%', filter: ['min_eps_growth'] }, { key: 'divYield', label: 'Div. yield', suffix: '%', filter: ['min_div_yield'] },
    { key: 'momentum', label: 'Momentum', suffix: '%', filter: ['min_momentum'] }, { key: 'alphaScore', label: 'Alpha Score', filter: ['min_alpha_score'] }];
  for (const col of fundamentalColumns) if ((snapshot && col.filter.some(k => snapshot[k] !== '' && snapshot[k] != null)) || (!result?.technical && col.key !== 'momentum')) columns.push({ ...col, render: r => fmt(r[col.key], col.suffix) });
  const dateLabel = !result?.price_dates?.length ? 'No usable candle dates' : result.price_dates.length === 1 ? `Close · ${result.price_dates[0]}` : `Mixed candle dates · ${result.price_dates[0]} – ${result.price_dates.at(-1)}`;

  return <div className="screener-page">
    <PageHeader code="EQS" title="Quant Screener" subtitle="Find a shortlist. Understand every match." />
    <form className="screen-toolbar card" onSubmit={run}>
      <label>Universe<select aria-label="Universe" value={config.universe} onChange={e => changeUniverse(e.target.value)}>{Object.entries(UNIVERSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>RS benchmark<select aria-label="RS benchmark" value={config.benchmark} onChange={e => set('benchmark', e.target.value)}>{Object.entries(BENCHMARKS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="screen-daily"><span className="screen-eyebrow">DAILY SCREEN</span><span>Completed sessions</span><small>Adjusted closing prices</small></div>
      <button className="screen-run" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Scanning…</> : <><Search size={17} /> Run screen</>}</button>
      {config.universe === 'custom' && <label className="screen-custom">Custom tickers<input value={config.tickers} onChange={e => set('tickers', e.target.value)} placeholder="TCS.NS, RELIANCE.NS, INFY.NS" aria-describedby="screen-ticker-help" /><small id="screen-ticker-help">Comma-separated. Add .NS for NSE stocks. Up to 250 symbols.</small></label>}
    </form>
    <div className="screen-section-title"><div><h2>Start with a screen</h2><p>Choose a setup, then make the rules your own.</p></div></div>
    <div className="screen-categories" role="group" aria-label="Preset categories">{['Technical', 'Fundamental', 'Combined', 'Saved'].map(c => <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}{c === 'Saved' && saved.length > 0 ? ` (${saved.length})` : ''}</button>)}</div>
    <div className="screen-preset-grid">
      {category !== 'Saved' ? PRESETS.filter(p => p.category === category).map(p => <button type="button" className={`screen-preset ${activePreset?.id === p.id ? 'selected' : ''}`} key={p.id} aria-pressed={activePreset?.id === p.id} onClick={() => { setConfig(old => applyPreset(old, p)); setError(''); }}>
        <span className="screen-preset-name">{p.name}{activePreset?.id === p.id ? <Check size={16} aria-hidden="true" /> : <ArrowUpRight size={15} aria-hidden="true" />}</span><span>{p.desc}</span>
      </button>) : saved.length ? saved.map(s => <div className="screen-saved-item" key={s.id}><button type="button" className="screen-preset" onClick={() => { setConfig({ ...s.config }); setNotice(`Loaded “${s.name}”. Run screen to refresh results.`); }}><span className="screen-preset-name">{s.name}<BookmarkPlus size={15} aria-hidden="true" /></span><span>{UNIVERSES[s.config.universe]} · {filterChips(s.config).length} rules</span></button><button type="button" className="screen-remove-saved" onClick={() => persistSaved(saved.filter(item => item.id !== s.id))} aria-label={`Delete saved screen ${s.name}`}><X size={14} /></button></div>) : <div className="screen-saved-empty"><BookmarkPlus size={20} /><div><strong>Keep your best screens here</strong><p>Choose your filters, then save the screen. Saved on this browser.</p></div></div>}
    </div>
    <section className="screen-rules" aria-label="Active rules">
      <div className="screen-rule-heading"><div><span className="screen-eyebrow">YOUR RULES</span><strong>{activePreset?.name || (chips.length ? 'Custom screen' : 'All stocks in your universe')}</strong></div><div className="screen-actions"><button type="button" className="secondary" onClick={() => drawer.current.showModal()}><SlidersHorizontal size={15} /> Edit filters</button><button type="button" className="secondary" onClick={() => { setSaveOpen(!saveOpen); setNotice(''); }} aria-expanded={saveOpen}><BookmarkPlus size={15} /> Save screen</button></div></div>
      <div className="screen-chips">{chips.map(chip => <button type="button" key={chip.key} onClick={() => set(chip.key, chip.key === 'volume_breakout' ? false : '')} aria-label={`Remove ${chip.label}`}>{chip.label}<X size={13} aria-hidden="true" /></button>)}{chips.length ? <button type="button" className="screen-clear" onClick={() => setConfig(old => ({ ...old, ...EMPTY_RULES }))}>Clear all</button> : <span className="screen-muted">No filters yet. Pick a preset above or add your own.</span>}</div>
      {chips.length > 0 && <div className="screen-rule-footer"><small className="screen-muted">Stocks must meet all active rules.</small><button type="button" onClick={run} disabled={loading}>{loading ? 'Scanning…' : 'Run these rules'}</button></div>}
      {saveOpen && <form className="screen-save-form" onSubmit={saveScreen}><label>Screen name<input autoFocus maxLength={60} required placeholder="e.g. My RS leaders" value={saveName} onChange={e => setSaveName(e.target.value)} /></label><button type="submit">Save on this browser</button><button type="button" className="secondary" onClick={() => setSaveOpen(false)}>Cancel</button></form>}
      {notice && <p className="screen-notice" role="status">{notice}</p>}
    </section>
    <dialog ref={drawer} className="screen-filter-dialog" aria-labelledby="screen-filter-title">
      <div className="screen-dialog-head"><div><h2 id="screen-filter-title">Edit your filters</h2><p>Combine technical and fundamental rules.</p></div><button type="button" className="secondary" aria-label="Close filters" onClick={() => drawer.current.close()}><X size={20} /></button></div>
      <div className="screen-dialog-body"><h3>Technical</h3><label>Price & trend<select aria-label="Price & trend" value={config.price_trend} onChange={e => set('price_trend', e.target.value)}><option value="">Any trend</option>{Object.entries(TREND_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Relative strength<select aria-label="Relative strength" value={config.rs_screen} onChange={e => set('rs_screen', e.target.value)}><option value="">Any relative strength</option>{Object.entries(RS_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>RS lookback<select aria-label="RS lookback" value={config.rs_lookback} onChange={e => set('rs_lookback', Number(e.target.value))}><option value={63}>3 months · 63 sessions</option><option value={126}>6 months · 126 sessions</option><option value={252}>12 months · 252 sessions</option></select></label>
        <label className="screen-checkbox"><input type="checkbox" checked={config.volume_breakout} onChange={e => set('volume_breakout', e.target.checked)} /><span>20-session breakout with volume &gt; 1.5× average</span></label>
        <p className="screen-help">DMA = simple daily moving average. RS compares the stock with your selected benchmark; it is different from RSI.</p>
        <h3>Fundamentals & momentum</h3><div className="screen-number-grid">{NUMBER_FILTERS.map(f => <label key={f.key}>{f.label}<input type="number" step="any" min={f.min} max={f.max} value={config[f.key]} placeholder="Any" onChange={e => set(f.key, e.target.value)} /></label>)}</div>
        <p className="screen-help">Momentum is the average 1 / 6 / 12-month return. Alpha Score is Alpha Nova’s estimated value, quality, growth and yield score. Guru screens are simplified research proxies.</p>
      </div><div className="screen-dialog-footer"><button type="button" className="secondary" onClick={() => setConfig(old => ({ ...old, ...EMPTY_RULES }))}>Reset filters</button><button type="button" onClick={() => drawer.current.close()}>Done · {chips.length} rules</button></div>
    </dialog>
    {error && <div className="screen-error" role="alert"><strong>Screen could not complete</strong><p>{error}</p><button type="button" className="secondary" onClick={run} disabled={loading}>Retry screen</button></div>}
    {loading && <div className="screen-loading" role="status"><span className="spinner" /><div><strong>Scanning {UNIVERSES[config.universe]}…</strong><p>Checking daily history{config.rs_screen ? ' and benchmark alignment' : ''}. Large universes can take up to a minute.</p></div></div>}
    {result ? <section className="screen-results" aria-busy={loading}>
      <div className="screen-section-title"><div><h2 ref={resultsHeading} tabIndex={-1}>{result.matched} {result.matched === 1 ? 'match' : 'matches'}<span className="screen-result-universe"> / {result.requested} stocks</span></h2><p>{UNIVERSES[snapshot.universe]} · {dateLabel}{snapshot.rs_screen ? ` · RS vs ${BENCHMARKS[snapshot.benchmark]}` : ''}</p></div><button type="button" className="secondary" onClick={exportRows} disabled={!visibleRows.length || loading}><Download size={15} /> Export CSV</button></div>
      {(changed || loading) && <div className="screen-pending" role="status">{loading ? 'Previous results remain below while the new screen runs.' : 'Filters changed. Run screen to update these results.'}</div>}
      <div className="screen-coverage"><span><strong>{result.scanned}</strong> evaluated</span><span><strong>{result.non_matches}</strong> did not match</span><span className={result.incomplete_count ? 'screen-warning' : ''}><strong>{result.incomplete_count}</strong> incomplete</span><span>{result.source}</span></div>
      {result.universe_source && <p className={`screen-membership ${result.universe_fallback ? 'screen-warning' : ''}`}>{result.universe_source}{result.universe_checked_at ? ` · checked ${result.universe_checked_at.slice(0, 10)}` : ''}</p>}
      {result.incomplete_count > 0 && <details className="screen-incomplete"><summary>{result.incomplete_count} stocks could not be evaluated{result.truncated ? ' · scan time limit reached' : ''}</summary><p>These stocks are excluded from both matches and non-matches. Retry to refresh missing data.</p><ul>{result.incomplete.map(item => <li key={item.ticker}><strong>{item.ticker}</strong><span>{item.reason}</span></li>)}</ul></details>}
      {result.data.length > 0 ? <>
        <div className="screen-result-controls"><label className="screen-search"><Search size={16} aria-hidden="true" /><input aria-label="Search results" placeholder="Find a stock in results" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="screen-sort">Sort by<select value={sort.key} onChange={e => setSort({ key: e.target.value, direction: e.target.value === 'ticker' ? 'asc' : 'desc' })}>{columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label><button type="button" className="secondary" onClick={() => setSort(old => ({ ...old, direction: old.direction === 'asc' ? 'desc' : 'asc' }))} aria-label={`Sort ${sort.direction === 'asc' ? 'descending' : 'ascending'}`}>{sort.direction === 'asc' ? '↑ Asc' : '↓ Desc'}</button></div>
        {!visibleRows.length ? <div className="screen-empty">No matching ticker in these results. <button type="button" className="secondary" onClick={() => setSearch('')}>Clear search</button></div> : <>
          <div className="table-container screen-desktop"><table><thead><tr>{columns.map(c => <th key={c.key} aria-sort={sort.key === c.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => setSort(old => ({ key: c.key, direction: old.key === c.key && old.direction === 'desc' ? 'asc' : 'desc' }))}>{c.label}{sort.key === c.key ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ''}</button></th>)}<th>Why it matched</th></tr></thead><tbody>{visibleRows.map(r => <tr key={r.ticker}>{columns.map(c => <td key={c.key}>{c.render(r)}</td>)}<td className="screen-reasons">{r.reasons.join(' · ')}</td></tr>)}</tbody></table></div>
          <div className="screen-mobile">{visibleRows.map(r => <article className="card screen-stock-card" key={r.ticker}><div className="screen-stock-card-head"><StockName row={r} /><strong>{money(r)}</strong></div><p className="screen-card-date">Scan close · {r.priceDate}</p><dl>{columns.filter(c => !['ticker', 'price'].includes(c.key)).slice(0, 4).map(c => <div key={c.key}><dt>{c.label}</dt><dd>{c.render(r)}</dd></div>)}</dl><details><summary>Why it matched & details</summary><ul>{r.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>{r.sma200 != null && <p>200 DMA: {fmt(r.sma200)}</p>}{columns.filter(c => !['ticker', 'price'].includes(c.key)).slice(4).map(c => <p key={c.key}>{c.label}: {c.render(r)}</p>)}<Link to={`/chart?symbol=${encodeURIComponent(r.ticker)}`}>Open chart →</Link></details></article>)}</div>
        </>}
      </> : <div className="screen-empty"><Search size={24} /><h3>{result.scanned ? 'No stocks matched these rules' : 'No stocks could be evaluated'}</h3><p>{result.scanned ? 'Try removing a rule or widening the universe.' : 'Data was unavailable or incomplete. Retry the screen to check again.'}</p><button type="button" className="secondary" onClick={() => result.scanned ? drawer.current.showModal() : run()} disabled={loading}>{result.scanned ? 'Adjust filters' : 'Retry screen'}</button></div>}
      {result.data.length > 0 && !loading && <details className="screen-ai"><summary>Screener research brief</summary><button type="button" className="secondary" onClick={runAiAnalysis} disabled={aiLoading}>{aiLoading ? 'Preparing brief…' : aiReport ? 'Refresh brief' : 'Generate brief'}</button>{aiReport && <LazyMarkdown>{aiReport}</LazyMarkdown>}</details>}
    </section> : !loading && !error && <div className="screen-first-run"><Search size={24} /><div><strong>Your shortlist starts here</strong><p>Choose a preset and run your first screen. Every match includes its rules and candle date.</p></div></div>}
    <details className="screen-method"><summary>How these screens work</summary><p>Daily prices are adjusted consistently by the data provider. Today’s candle is excluded until 4:00 pm in India or 4:15 pm in New York. Source data can lag; actual candle dates are shown. Histories over seven calendar days old are incomplete. Indian index membership refreshes from Nifty Indices with a six-hour cache. If unavailable, the configured fallback list is labelled in results. US universes use configured lists and may differ from current membership.</p><p>RS = stock close ÷ benchmark close on matching sessions. A new high must exceed all values in the preceding 63, 126 or 252 sessions. RS leading price also requires the stock to remain below its preceding 252-session closing high. These are ratios, not RS percentile ratings or RSI.</p><p>A 200 DMA uses 200 completed closes. A cross-under compares each close to its own day’s average. Strong trend means close &gt; 50 DMA &gt; 150 DMA &gt; 200 DMA, with the 200 DMA rising over 20 sessions. A volume breakout requires close above the preceding 20-session intraday high and volume above 1.5× the preceding 20-session average.</p><p>All active rules must pass. Required missing values remain incomplete. Fundamentals use the provider’s latest available figures and are not historical point-in-time observations.</p></details>
  </div>;
}
