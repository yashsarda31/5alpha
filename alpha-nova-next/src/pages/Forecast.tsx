import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, RefreshCw, Sparkles } from 'lucide-react';
import { EmptyState, ErrorState, Loading, PageHeading, Panel } from '../components/ui';
import { formatNumber, formatPrice, formatStamp, number } from '../lib/market';
import { useResource } from '../lib/useResource';
import { useMarket } from '../legacy/MarketContext';
import TickerSearch from '../legacy/components/TickerSearch';
import { resolveAnalysisSymbol } from './analyseData.js';
import './Forecast.css';

type Market = 'IN' | 'US';
interface ForecastReport {
  ticker: string; market: Market; currency: string; status: 'ready' | 'insufficient_data';
  current_price: number | null; prediction: number | null; risk_level: number | null;
  range: { low: number; high: number } | null; direction: 'bullish' | 'bearish' | 'neutral' | null;
  change_pct: number | null; risk_note: string; horizon_label: string; generated_at: string;
  sources: { prices: string; price_as_of: string | null; fundamentals: string; fundamentals_retrieved_at: string | null; statement_period: string | null };
  fundamentals: { name: string | null; roe_pct: number | null; trailing_pe: number | null; forward_pe: number | null;
    earnings_growth_pct: number | null; revenue_growth_pct: number | null; profit_margin_pct: number | null;
    debt_to_equity_pct: number | null; trailing_eps: number | null; forward_eps: number | null;
    forward_eps_change_pct: number | null; forward_note: string; valuation_note: string; roe_outlook: string;
    roe_basis: string; roe_source: string | null; roe_method: string | null;
    roe_history: Array<{ period: string; roe_pct: number }> };
  technicals: { atr14: number; sma50: number; sma200: number; rsi14: number; observations: number } | null;
  validation: { windows: number; mape_pct: number | null; flat_price_mape_pct: number | null; range_coverage_pct: number | null; note: string } | null;
  news: Array<{ title: string; url: string; published_at: string; provider: string }>;
  warnings: string[]; methodology: string;
}

function metric(value: unknown, suffix = '') {
  return number(value) === null ? 'Unavailable' : `${formatNumber(value)}${suffix}`;
}
function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="an-forecast-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function safeUrl(value: string) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}

export default function Forecast() {
  const { market, setMarket } = useMarket() as { market: Market; setMarket: (value: Market) => void };
  const [params, setParams] = useSearchParams();
  const marketParam = (params.get('market') || '').toUpperCase();
  const selectedMarket: Market = marketParam === 'US' ? 'US' : marketParam === 'IN' ? 'IN' : market;
  const requested = resolveAnalysisSymbol(params.get('symbol') || '', selectedMarket);
  const [query, setQuery] = useState(requested.symbol);
  const [inputError, setInputError] = useState('');
  const resource = useResource<ForecastReport>(requested.symbol ? `/api/forecast/${encodeURIComponent(requested.symbol)}` : null);
  useEffect(() => { setQuery(requested.symbol); setInputError(''); }, [requested.symbol]);
  useEffect(() => { if (requested.market !== market) setMarket(requested.market as Market); }, [requested.market, market, setMarket]);

  const submit = (raw = query) => {
    const resolved = resolveAnalysisSymbol(raw, selectedMarket);
    if (!/^[A-Z0-9][A-Z0-9&-]{0,24}(?:\.NS|\.BO)?$/.test(resolved.symbol)) {
      setInputError('Enter an NSE, BSE or US stock ticker, or select a company from search.');
      return;
    }
    setInputError('');
    setQuery(resolved.symbol);
    if (resolved.symbol !== requested.symbol || resolved.market !== selectedMarket) {
      setParams({ symbol: resolved.symbol, market: resolved.market });
    } else {
      resource.refresh();
    }
  };
  // A picked suggestion is authoritative: never re-derive its exchange from the
  // active segment (e.g. a US pick while the IN segment is active).
  const selectSuggestion = (picked: string) => {
    const symbol = picked.trim().toUpperCase();
    const targetMarket: Market = /\.NS$/i.test(symbol) || /\.BO$/i.test(symbol) ? 'IN' : selectedMarket;
    setInputError('');
    setQuery(symbol);
    if (symbol !== requested.symbol) setParams({ symbol, market: targetMarket });
    else resource.refresh();
  };
  const switchMarket = (value: Market) => {
    setMarket(value); setParams({ market: value }); setQuery(''); setInputError('');
  };
  // Never show retained targets while refreshing or after a failed refresh.
  const report = !resource.error && !resource.refreshing && resource.data?.ticker === requested.symbol ? resource.data : null;
  const ready = report?.status === 'ready' && number(report.prediction) !== null && report.range;
  const facts = report?.fundamentals;
  const price = (value: unknown) => number(value) === null ? 'Unavailable' : formatPrice(value, report?.market || requested.market);

  return <div className="an-forecast">
    <PageHeading eyebrow={<><Sparkles size={13}/> FEATURED RESEARCH</>} title="One month. A clearer outlook."
      description="A price scenario, its invalidation level, and the business evidence behind your research."/>
    <form className="an-forecast-search" onSubmit={event => { event.preventDefault(); submit(); }}>
      <div className="an-segments" role="group" aria-label="Forecast market">
        <button type="button" aria-pressed={selectedMarket === 'IN'} onClick={() => switchMarket('IN')}>India</button>
        <button type="button" aria-pressed={selectedMarket === 'US'} onClick={() => switchMarket('US')}>US</button>
      </div>
      <div className="an-forecast-input"><TickerSearch value={query} onChange={setQuery} onSelect={selectSuggestion}
        placeholder={selectedMarket === 'IN' ? 'Search a company or NSE / BSE ticker' : 'Search a company or US ticker'}
        inputStyle={{}} inputProps={{ 'aria-label': 'Forecast stock ticker', autoComplete: 'off' }}/></div>
      <button className="an-button an-button-primary" type="submit" disabled={!query.trim()}>Generate forecast <ArrowUpRight size={15}/></button>
    </form>
    {inputError && <ErrorState message={inputError}/>}
    {!requested.symbol && <Panel><EmptyState title="Start with a stock" description="Select a listing to explore a one-month price scenario, ROE, valuation, earnings growth and recent news."/>
      <div className="an-forecast-examples"><span>Try</span>{(selectedMarket === 'IN' ? ['RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS'] : ['AAPL', 'MSFT', 'NVDA']).map(symbol => <button key={symbol} className="an-button" onClick={() => submit(symbol)}>{symbol}</button>)}</div></Panel>}
    {(resource.loading || resource.refreshing) && <Loading label={`Checking price history, fundamentals and news for ${requested.symbol}`}/>}
    {resource.error && !resource.refreshing && <ErrorState message={resource.error} retry={resource.refresh}/>}
    {!resource.error && !resource.refreshing && resource.data && !report && <ErrorState message="The returned listing does not match your search. Retry to load the correct research." retry={resource.refresh}/>}
    {report && <>
      <div className="an-forecast-heading"><div><h2>{facts?.name || report.ticker}</h2><p>{report.ticker} · {report.horizon_label}</p></div>
        <button className="an-button" onClick={resource.refresh}><RefreshCw size={14}/>Refresh evidence</button></div>
      <Panel className="an-forecast-summary" title={ready ? `${report.direction === 'bullish' ? 'Bullish' : report.direction === 'bearish' ? 'Bearish' : 'Neutral'} historical scenario` : 'Insufficient evidence for a forecast'}
        subtitle={`Completed price date: ${formatStamp(report.sources.price_as_of)} · ${report.currency}`}>
        <div className="an-forecast-metrics an-forecast-key">
          <Metric label="Current price" value={price(report.current_price)} note="Latest validated completed close"/>
          <Metric label="Prediction" value={ready ? price(report.prediction) : 'Withheld'} note={ready ? `${metric(report.change_pct, '%')} implied change` : 'Required evidence is incomplete'}/>
          <Metric label="Expected range" value={ready && report.range ? `${price(report.range.low)} – ${price(report.range.high)}` : 'Withheld'} note="Historical 10th–90th percentile scenario"/>
          <Metric label="Risk level · invalidation" value={ready ? report.risk_level === null ? 'No directional level' : price(report.risk_level) : 'Withheld'} note={ready && report.risk_level !== null ? `Daily close ${report.direction === 'bullish' ? 'below' : 'above'} this price` : undefined}/>
        </div>
        <p className="an-forecast-note">{ready ? report.risk_note : 'Refresh or choose another stock. A target will appear only when price history and core fundamental evidence pass the data checks.'}</p>
      </Panel>
      {report.warnings.length > 0 && <aside className="an-forecast-warnings" aria-label="Evidence limitations"><strong>Evidence to keep in view</strong><ul>{report.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></aside>}
      {facts && <div className="an-forecast-columns">
        <Panel title="Business & valuation" subtitle={`${report.sources.fundamentals} · retrieved ${formatStamp(report.sources.fundamentals_retrieved_at)}`}>
          <div className="an-forecast-metrics"><Metric label="ROE" value={metric(facts.roe_pct, '%')} note={facts.roe_basis}/><Metric label="Trailing P/E" value={metric(facts.trailing_pe, '×')}/><Metric label="Earnings growth" value={metric(facts.earnings_growth_pct, '%')}/><Metric label="Revenue growth" value={metric(facts.revenue_growth_pct, '%')}/><Metric label="Profit margin" value={metric(facts.profit_margin_pct, '%')}/><Metric label="Debt / equity" value={metric(facts.debt_to_equity_pct, '%')}/></div>
          <p className="an-forecast-note">{facts.valuation_note} Financial period: {report.sources.statement_period || 'not supplied'}.</p>
        </Panel>
        <Panel title="What could improve ROE?" subtitle="Separate operating improvement from leverage">
          <p className="an-forecast-prose">{facts.roe_outlook}</p>
          {facts.roe_history?.length > 0 && <><div className="an-forecast-roe-history">{facts.roe_history.map((point, index) => <Metric key={`${point.period}-${index}`} label={point.period} value={metric(point.roe_pct, '%')} note="Annual ROE"/>)}</div><p className="an-forecast-prose">{facts.roe_source}: {facts.roe_method}</p></>}
          <div className="an-forecast-metrics"><Metric label="Trailing EPS" value={metric(facts.trailing_eps)}/><Metric label="Forward EPS" value={metric(facts.forward_eps)}/><Metric label="Forward vs trailing EPS" value={metric(facts.forward_eps_change_pct, '%')}/><Metric label="Forward P/E" value={metric(facts.forward_pe, '×')}/></div>
          <p className="an-forecast-note">{facts.forward_note}</p>
        </Panel>
      </div>}
      {report.technicals && <Panel title="Technical context" subtitle={`${report.technicals.observations} adjusted daily observations`}>
        <div className="an-forecast-metrics an-forecast-key"><Metric label="50-session average" value={price(report.technicals.sma50)}/><Metric label="200-session average" value={price(report.technicals.sma200)}/><Metric label="14-session RSI · simple" value={metric(report.technicals.rsi14)}/><Metric label="14-session ATR · simple" value={price(report.technicals.atr14)}/></div>
      </Panel>}
      <Panel title="Recent news & event risk" subtitle="Dated headlines from the past 14 days; relevance should be checked against company filings.">
        {report.news.length ? <ul className="an-forecast-news">{report.news.filter(item => safeUrl(item.url)).map((item, index) => <li key={`${item.url}-${index}`}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}<ArrowUpRight size={14}/></a><span>{item.provider} · {formatStamp(item.published_at)}</span></li>)}</ul> : <p className="an-forecast-prose">No recent dated headlines are available. This does not mean that the company has no upcoming events or risks.</p>}
      </Panel>
      <details className="an-forecast-method"><summary>Method, historical checks & sources</summary><p>{report.methodology}</p>
        {report.validation && <><div className="an-forecast-metrics"><Metric label="Historical windows" value={String(report.validation.windows)}/><Metric label="Target mean absolute error" value={metric(report.validation.mape_pct, '%')}/><Metric label="Flat-price baseline error" value={metric(report.validation.flat_price_mape_pct, '%')}/><Metric label="Historical range coverage" value={metric(report.validation.range_coverage_pct, '%')}/></div><p>{report.validation.note}</p></>}
        <p>Prices: {report.sources.prices}. As of {formatStamp(report.sources.price_as_of)}. Report generated {formatStamp(report.generated_at)}.</p>
        <p>One month is approximated by 21 trading observations; exchange holidays can shift the calendar horizon. The current day's candle is excluded. Price discontinuities and incomplete inputs can prevent a forecast.</p>
      </details>
      <div className="an-forecast-links"><Link className="an-text-link" to={`/chart?symbol=${encodeURIComponent(report.ticker)}&market=${report.market}`}>Inspect the chart <ArrowUpRight size={14}/></Link><Link className="an-text-link" to="/position-sizing">Explore position sizing <ArrowUpRight size={14}/></Link></div>
    </>}
  </div>;
}
