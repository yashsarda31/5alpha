import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, Loading, PageHeading, Panel, Change } from '../components/ui';
import { formatMarketCap, formatNumber, formatPrice, formatStamp, number } from '../lib/market';
import { useResource } from '../lib/useResource';
import TickerSearch from '../legacy/components/TickerSearch';
import WatchlistStar from '../legacy/components/WatchlistStar';
import { useMarket } from '../legacy/MarketContext';
import { normaliseChart, resolveAnalysisSymbol } from './analyseData.js';
import { ema, bollinger } from '../lib/indicators.js';
import './Analyse.css';

type Market = 'IN' | 'US';

interface ChartResponse {
  ticker?: string;
  dates: string[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume?: number[];
  rsi?: Array<number | null>;
  sma20?: Array<number | null>;
  sma50?: Array<number | null>;
  sma200?: Array<number | null>;
  vcp_rating?: number;
}

interface IntradayResponse extends ChartResponse {
  as_of: string;
  retrieved_at: string;
  last_price: number;
  source: string;
  interval: string;
}

interface FundamentalsResponse {
  ticker?: string;
  name?: string;
  shortName?: string;
  longName?: string;
  sector?: string;
  industry?: string;
  marketCap?: number | string;
  trailingPE?: number | string;
  forwardPE?: number | string;
  priceToBook?: number | string;
  trailingEps?: number | string;
  forwardEps?: number | string;
  earningsGrowth?: number | string;
  returnOnEquity?: number | string;
  debtToEquity?: number | string;
  dividendYield?: number | string;
  alphaScore?: number | string;
  error?: string;
  dataQuality?: { provider?: string; retrievedAt?: string; missingFields?: string[]; fieldSources?: Record<string, string>; fieldPeriods?: Record<string, string> };
}

const LegacyChart = lazy(() => import('../legacy/pages/Chart'));

const fallbackSymbol = (market: Market) => (market === 'US' ? 'NVDA' : 'RELIANCE.NS');
const isIndian = (symbol: string) => /\.(NS|BO)$/i.test(symbol);
const latestFinite = (values?: Array<number | null>) => number(values?.at(-1));

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="an-analyse__metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export default function Analyse() {
  const { market, setMarket } = useMarket() as { market: Market; setMarket: (market: Market) => void };
  const [params, setParams] = useSearchParams();
  const urlSymbol = resolveAnalysisSymbol(params.get('symbol') || fallbackSymbol(market), market).symbol;
  const [query, setQuery] = useState(urlSymbol);
  const chartUrl = `/api/chart/${encodeURIComponent(urlSymbol)}`;
  const chart = useResource<ChartResponse>(chartUrl);
  const validChart = useMemo(() => normaliseChart(chart.data) as ChartResponse | null, [chart.data]);
  const ema20Snap = useMemo(() => (validChart ? ema(validChart.close, 20).at(-1) ?? null : null), [validChart]);
  const ema50Snap = useMemo(() => (validChart ? ema(validChart.close, 50).at(-1) ?? null : null), [validChart]);
  const bbSnap = useMemo(() => (validChart ? bollinger(validChart.close, 20, 2) : null), [validChart]);
  const bbUpperSnap = bbSnap?.upper.at(-1) ?? null;
  const bbLowerSnap = bbSnap?.lower.at(-1) ?? null;
  const resolvedSymbol = validChart?.ticker || urlSymbol;
  const intraday = useResource<IntradayResponse>(validChart ? `/api/intraday/${encodeURIComponent(resolvedSymbol)}` : null, 15000);
  const intradayChart = useMemo(() => normaliseChart(intraday.data) as IntradayResponse | null, [intraday.data]);
  const fundamentals = useResource<FundamentalsResponse>(validChart ? `/api/fundamentals/${encodeURIComponent(resolvedSymbol)}` : null);

  useEffect(() => setQuery(urlSymbol), [urlSymbol]);

  const loadSymbol = (raw = query) => {
    const { symbol, market: inferredMarket } = resolveAnalysisSymbol(raw, market);
    if (!symbol) return;
    setQuery(symbol);
    setParams({ symbol, market: inferredMarket });
    if (symbol === urlSymbol) {
      chart.refresh();
      fundamentals.refresh();
    }
  };

  const switchMarket = (next: Market) => {
    setMarket(next);
    const symbol = fallbackSymbol(next);
    setQuery(symbol);
    setParams({ symbol, market: next });
  };

  const last = validChart?.close.at(-1) ?? null;
  const previous = validChart?.close.at(-2) ?? null;
  const delta = last !== null && previous !== null ? last - previous : null;
  const deltaPct = delta !== null && previous ? (delta / previous) * 100 : null;
  const latestDate = validChart?.dates.at(-1);
  const name = fundamentals.data?.name || fundamentals.data?.shortName || fundamentals.data?.longName || resolvedSymbol;
  const marketForSymbol: Market = isIndian(resolvedSymbol) ? 'IN' : 'US';
  // Index series are measured in points, not a stock's quote currency.
  const isIndex = resolvedSymbol.startsWith('^');
  const instrumentLabel = isIndex ? 'Index points' : marketForSymbol === 'IN' ? 'India' : 'United States';
  const instrumentPrice = (value: unknown) => isIndex ? formatNumber(value) : formatPrice(value, marketForSymbol);
  const metricValue = (value: unknown, suffix = '') => {
    const n = number(value);
    return n !== null ? `${formatNumber(n, 2)}${suffix}` : 'Unavailable';
  };

  return (
    <div className="an-analyse">
      <PageHeading
        eyebrow="Research workspace"
        title="Analyse"
        description="Price, momentum and company context."
        actions={<div className="an-analyse__market" role="group" aria-label="Market"><button aria-pressed={market === 'IN'} className={market === 'IN' ? 'is-active' : ''} onClick={() => switchMarket('IN')}>India</button><button aria-pressed={market === 'US'} className={market === 'US' ? 'is-active' : ''} onClick={() => switchMarket('US')}>US</button></div>}
      />

      <section className="an-analyse__search" aria-label="Instrument search">
        <Search size={18} aria-hidden="true" />
        <TickerSearch value={query} onChange={setQuery} onSelect={(symbol: string) => loadSymbol(symbol)} placeholder="Search symbol or company" inputStyle={undefined} inputProps={{ 'aria-label': 'Search symbol or company', onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter') loadSymbol(); } }} />
        <button className="an-button an-button-primary" onClick={() => loadSymbol()} disabled={!query.trim()}>Analyse</button>
      </section>

      {chart.loading && <Loading label={`Loading ${urlSymbol} market history`} />}
      {chart.error && <ErrorState message={`Could not load ${urlSymbol}. Check the symbol and try again.`} retry={chart.refresh} />}
      {!chart.loading && !chart.error && chart.data && !validChart && <ErrorState message="The chart provider returned incomplete or invalid price history." retry={chart.refresh} />}

      {validChart && last !== null && (
        <div className="an-analyse__workspace">
          <Panel className="an-analyse__hero" title={name} subtitle={`${resolvedSymbol} · ${instrumentLabel} · close ${formatStamp(latestDate)}`} action={<div className="an-analyse__instrument-action"><WatchlistStar symbol={resolvedSymbol} market={marketForSymbol} size={21} /><button className="an-button an-analyse__refresh" onClick={() => { chart.refresh(); fundamentals.refresh(); }} aria-label="Refresh analysis"><RefreshCw size={16} className={chart.refreshing ? 'is-spinning' : ''} /></button></div>}>
            <div className="an-analyse__quote">
              <strong>{instrumentPrice(last)}</strong>
              {deltaPct !== null ? <Change value={deltaPct} /> : <span className="an-muted">Change unavailable</span>}
              {delta !== null && <span className="an-muted">{delta >= 0 ? '+' : ''}{instrumentPrice(delta)} vs previous close</span>}
            </div>
            <div className="an-analyse__intraday-status" role="status">
              {intradayChart && !intraday.error
                ? <>Latest one-minute bar: <strong>{instrumentPrice(intradayChart.last_price)}</strong> · {formatStamp(intradayChart.as_of)} · Yahoo Finance, may be delayed · checks every 15s</>
                : intraday.error ? 'Intraday feed unavailable. Daily chart remains available.' : 'Loading intraday prices…'}
            </div>
            <div className="an-analyse__legacy"><Suspense fallback={<Loading label="Loading chart" />}><LegacyChart embedded intradayData={intraday.error ? null : intradayChart} /></Suspense></div>
          </Panel>

          <aside className="an-analyse__side">
            <Panel title="Technical snapshot" subtitle={`As of ${formatStamp(latestDate)}`}>
              <div className="an-analyse__metrics">
                <Metric label="RSI · 14" value={latestFinite(validChart.rsi) === null ? 'Unavailable' : formatNumber(latestFinite(validChart.rsi), 1)} detail="Momentum gauge" />
                <Metric label="SMA · 20" value={latestFinite(validChart.sma20) === null ? 'Unavailable' : instrumentPrice(latestFinite(validChart.sma20))} />
                <Metric label="SMA · 50" value={latestFinite(validChart.sma50) === null ? 'Unavailable' : instrumentPrice(latestFinite(validChart.sma50))} />
                <Metric label="SMA · 200" value={latestFinite(validChart.sma200) === null ? 'Unavailable' : instrumentPrice(latestFinite(validChart.sma200))} />
                <Metric label="EMA · 20" value={ema20Snap === null ? 'Unavailable' : instrumentPrice(ema20Snap)} detail="Local overlay" />
                <Metric label="EMA · 50" value={ema50Snap === null ? 'Unavailable' : instrumentPrice(ema50Snap)} detail="Local overlay" />
                <Metric label="BB upper · 20" value={bbUpperSnap === null ? 'Unavailable' : instrumentPrice(bbUpperSnap)} detail="SMA20 + 2σ" />
                <Metric label="BB lower · 20" value={bbLowerSnap === null ? 'Unavailable' : instrumentPrice(bbLowerSnap)} detail="SMA20 − 2σ" />
                <Metric label="Day high" value={instrumentPrice(validChart.high.at(-1))} />
                <Metric label="Day low" value={instrumentPrice(validChart.low.at(-1))} />
              </div>
              <p className="an-analyse__note"><Activity size={15} /> Indicators are descriptive research inputs, not a recommendation.</p>
            </Panel>
          </aside>

          <Panel className="an-analyse__fundamentals" title="Company research" subtitle="Available provider data" action={<Link className="an-button" to={`/fundamentals?symbol=${encodeURIComponent(resolvedSymbol)}&market=${marketForSymbol}`}><BarChart3 size={16} aria-hidden="true" />Full fundamentals</Link>}>
            {fundamentals.loading && <Loading label="Loading fundamentals" />}
            {fundamentals.error && <EmptyState title="Fundamentals unavailable" description="Price history is available, but the company-data provider did not return a usable response." action={<button className="an-button" onClick={fundamentals.refresh}>Retry</button>} />}
            {!fundamentals.loading && !fundamentals.error && fundamentals.data && !fundamentals.data.error && (
              <div className="an-analyse__fund-grid">
                <Metric label="Market cap" value={formatMarketCap(fundamentals.data.marketCap, marketForSymbol)} />
                <Metric label="Trailing P/E" value={metricValue(fundamentals.data.trailingPE)} />
                <Metric label="Forward P/E" value={metricValue(fundamentals.data.forwardPE)} />
                <Metric label="Price / book" value={metricValue(fundamentals.data.priceToBook)} />
                <Metric label="EPS · TTM" value={metricValue(fundamentals.data.trailingEps)} />
                <Metric label="Forward EPS" value={metricValue(fundamentals.data.forwardEps)} />
                <Metric label="ROE" value={metricValue(fundamentals.data.returnOnEquity, '%')} detail={fundamentals.data.dataQuality?.fieldPeriods?.returnOnEquity ? `Annual · ${formatStamp(fundamentals.data.dataQuality.fieldPeriods.returnOnEquity)}` : undefined} />
                <Metric label="Debt / equity" value={metricValue(fundamentals.data.debtToEquity, '%')} />
              </div>
            )}
            {!fundamentals.loading && !fundamentals.error && (!fundamentals.data || fundamentals.data.error) && <EmptyState title="No fundamentals returned" description="This instrument may not have company fundamentals from the current provider." />}
            {fundamentals.data?.dataQuality && <p className="an-muted">{fundamentals.data.dataQuality.provider || 'Provider fundamentals'} · retrieved {formatStamp(fundamentals.data.dataQuality.retrievedAt)}. {fundamentals.data.dataQuality.missingFields?.length ? 'Unavailable fields were not supplied by the provider.' : ''} {fundamentals.data.dataQuality.fieldSources?.marketCap ? `Market cap: ${fundamentals.data.dataQuality.fieldSources.marketCap}.` : ''}</p>}
            {(fundamentals.data?.sector || fundamentals.data?.industry) && <p className="an-analyse__classification"><TrendingUp size={15} /> {[fundamentals.data.sector, fundamentals.data.industry].filter(Boolean).join(' · ')}</p>}
          </Panel>

        </div>
      )}
    </div>
  );
}
