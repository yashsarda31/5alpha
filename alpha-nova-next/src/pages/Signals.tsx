import { lazy, Suspense, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Clock3, Search, ShieldAlert } from 'lucide-react';
import { EmptyState, ErrorState, Loading, PageHeading, Panel } from '../components/ui';
import { formatNumber, formatPrice, formatStamp, symbolPath } from '../lib/market';
import { useResource } from '../lib/useResource';
import { useMarket, useMarketParam } from '../legacy/MarketContext';
import WatchlistStar from '../legacy/components/WatchlistStar';
import { earlySignals, filterSignals, finiteNumber, isActionableSnapshot, signalLifecycle, WATCH_LIFECYCLES } from './signalsData.js';
import './Signals.css';

const LegacyMarketSignals = lazy(() => import('../legacy/pages/MarketSignals'));

type Market = 'IN' | 'US';
type Direction = 'LONG' | 'SHORT';
type Lifecycle = 'qualifying' | 'open' | 'triggered' | 'forming' | 'extended' | 'invalidated' | string;

interface SignalPlan {
  symbol: string;
  side?: Direction | string;
  lifecycle?: Lifecycle;
  actionable?: boolean;
  levels_locked?: boolean;
  score?: number | null;
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
  trigger?: number | null;
  initial_stop?: number | null;
  qty?: number | null;
  why?: string | null;
  timing_reason?: string | null;
  chase_r?: number | null;
  observed_at?: string | null;
  detected_at?: string | null;
  first_seen_at?: string | null;
  published_at?: string | null;
}

interface SignalsResponse {
  as_of?: string;
  signals_market?: Market;
  market_open?: boolean;
  market_note?: string;
  currency?: string;
  index_names?: { primary?: string; secondary?: string };
  timing?: { source_age_seconds?: number | null; scan_interval_seconds?: number | null };
  data_status?: {
    status?: 'fresh' | 'last_session' | 'stale' | 'provider_limited' | string;
    observed_at?: string | null;
    market_session?: string;
    sources?: string[];
    required_inputs_complete?: boolean;
    warnings?: string[];
  };
  regime?: {
    overall?: string;
    dir?: string;
    vol_scale?: number | null;
    vix?: number | null;
    nifty?: { label?: string; detail?: string };
    banknifty?: { label?: string; detail?: string };
    breadth?: { adv?: number; dec?: number };
    vol?: { label?: string; play?: string };
    iv?: { label?: string; detail?: string };
  };
  setups?: {
    plans?: SignalPlan[];
    watchlist?: SignalPlan[];
    index_bias?: string;
    radar_size?: number;
    risk_pct?: number;
    capital?: number;
  };
}

const label = (value?: string | null) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unavailable';
const age = (seconds?: number | null) => {
  const value = finiteNumber(seconds);
  if (value == null || value < 0) return 'Unavailable';
  if (value < 60) return `${Math.round(value)}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  return `${Math.round(value / 3600)}h`;
};

const stateOf = (plan: SignalPlan, early = false) => {
  const state = signalLifecycle(plan, early ? 'early' : 'published');
  return state === 'open' ? 'Open position' : label(state);
};

function SignalCard({ plan, market, early, actionable, sourceCurrent = actionable }: {
  plan: SignalPlan; market: Market; early?: boolean; actionable: boolean; sourceCurrent?: boolean;
}) {
  const direction = String(plan.side || '').toUpperCase();
  const stamp = plan.observed_at || plan.detected_at || plan.first_seen_at;
  return (
    <article className={`an-signals__card ${early ? 'is-early' : ''} ${!actionable ? 'is-disabled' : ''}`}>
      <div className="an-signals__card-head">
        <div>
          <div className="an-signals__symbol-row">
            <Link to={symbolPath(plan.symbol, market)}>{plan.symbol}</Link>
            <WatchlistStar symbol={plan.symbol} market={market} size={17} />
          </div>
          <span className={`an-signals__direction is-${direction.toLowerCase()}`}>
            {direction === 'SHORT' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
            {direction || 'No direction'}
          </span>
        </div>
        <div className="an-signals__score"><span>Quality</span><strong>{formatNumber(plan.score, 0)}</strong><small>/100</small></div>
      </div>

      <div className="an-signals__status-row">
        <span className={`an-signals__lifecycle is-${String(plan.lifecycle || (early ? 'forming' : 'published')).toLowerCase()}`}>{stateOf(plan, early)}</span>
        <span><Clock3 size={13} /> observed {formatStamp(stamp)}</span>
      </div>

      {early ? (
        <div className="an-signals__levels is-watch">
          <div><span>Potential trigger</span><strong>{sourceCurrent ? formatPrice(plan.trigger, market) : 'Withheld'}</strong></div>
          <div><span>Invalidation</span><strong>{sourceCurrent ? formatPrice(plan.initial_stop, market) : 'Withheld'}</strong></div>
          <div><span>Chase</span><strong>{plan.chase_r == null ? '—' : `${formatNumber(plan.chase_r, 2)}R`}</strong></div>
        </div>
      ) : (
        <div className="an-signals__levels">
          <div><span>Entry</span><strong>{actionable ? formatPrice(plan.entry, market) : 'Withheld'}</strong></div>
          <div><span>Stop</span><strong>{actionable ? formatPrice(plan.stop, market) : 'Withheld'}</strong></div>
          <div><span>Target</span><strong>{actionable ? formatPrice(plan.target, market) : 'Withheld'}</strong></div>
          <div><span>Quantity</span><strong>{actionable ? formatNumber(plan.qty, 0) : '—'}</strong></div>
        </div>
      )}

      <div className="an-signals__evidence">
        <span>{early ? 'Watch rationale' : 'Signal evidence'}</span>
        <p>{plan.why || label(plan.timing_reason) || 'Evidence unavailable.'}</p>
      </div>
      {!actionable && !early && <div className="an-signals__guard"><ShieldAlert size={15} /> Levels hidden until required inputs are current and complete.</div>}
      <small className="an-signals__timestamps">
        Detected {formatStamp(plan.detected_at || plan.first_seen_at)}
        {!early && <> · Published {formatStamp(plan.published_at)}</>}
      </small>
    </article>
  );
}

export default function Signals() {
  const [params, setParams] = useSearchParams();
  const { setMarket } = useMarket();
  const market = useMarketParam((params.get('market') || undefined) as never) as Market;
  const [direction, setDirection] = useState('ALL');
  const [lifecycle, setLifecycle] = useState('ALL');
  const [query, setQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { data, loading, refreshing, error, refresh } = useResource<SignalsResponse>(`/api/signals?market=${market}`, 30000);

  const status = data?.data_status;
  const current = isActionableSnapshot(status, error as never);
  const published = Array.isArray(data?.setups?.plans) ? data!.setups!.plans! : [];
  const early = earlySignals(data?.setups, market) as SignalPlan[];
  const filteredPublished = filterSignals(published, { direction, lifecycle, query, lane: 'published' }) as SignalPlan[];
  const filteredEarly = filterSignals(early, { direction, lifecycle, query, lane: 'early' }) as SignalPlan[];
  const regime = data?.regime;
  const adv = finiteNumber(regime?.breadth?.adv);
  const dec = finiteNumber(regime?.breadth?.dec);
  const breadth = adv != null && dec != null && adv + dec > 0 ? Math.round((adv / (adv + dec)) * 100) : null;
  const chooseMarket = (next: Market) => {
    (setMarket as (value: Market) => void)(next);
    const nextParams = new URLSearchParams(params);
    nextParams.set('market', next);
    setParams(nextParams);
  };

  if (loading && !data) return <Loading label="Reading the latest signal ledger…" />;
  if (error && !data) return <ErrorState message={error} retry={refresh} />;

  return (
    <div className="an-signals">
      <PageHeading
        eyebrow="Signal ledger"
        title="Signals"
        description="Setups and market context."
        actions={<div className="an-signals__market" aria-label="Market"><button className={market === 'IN' ? 'is-active' : ''} onClick={() => chooseMarket('IN')}>India</button><button className={market === 'US' ? 'is-active' : ''} onClick={() => chooseMarket('US')}>US</button></div>}
      />

      <section className="an-signals__snapshot" aria-label="Market snapshot">
        <div className="an-signals__regime"><span className="an-kicker">Market regime</span><strong>{regime?.overall || 'Unavailable'}</strong><small>{label(regime?.dir)} bias · sizing ×{formatNumber(regime?.vol_scale, 2)}</small></div>
        <div><span>Primary trend</span><strong>{regime?.nifty?.label || '—'}</strong><small>{regime?.nifty?.detail || data?.index_names?.primary || 'No detail'}</small></div>
        <div><span>Volatility</span><strong>{regime?.vol?.label || '—'}</strong><small>VIX {formatNumber(regime?.vix, 1)} · {regime?.vol?.play || 'No playbook'}</small></div>
        <div><span>Breadth</span><strong>{breadth == null ? '—' : `${breadth}% advancing`}</strong><small>{formatNumber(adv, 0)} adv · {formatNumber(dec, 0)} dec</small></div>
        <div><span>Source state</span><strong className={current ? 'an-positive' : 'an-negative'}>{label(status?.status)}</strong><small>{formatStamp(status?.observed_at || data?.as_of)}</small></div>
      </section>

      {!current && (
        <div className="an-signals__notice" role="status"><ShieldAlert size={18} /><div><strong>Nonactionable snapshot</strong><span>Required inputs are stale or incomplete. Evidence remains visible; trade levels are withheld.</span></div></div>
      )}
      {error && <div className="an-signals__refresh-error">Refresh failed. Showing the last available snapshot. <button onClick={refresh}>Try again</button></div>}

      <div className="an-signals__toolbar">
        <label className="an-signals__search"><Search size={16} /><input className="an-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol" aria-label="Filter signals by symbol" /></label>
        <div className="an-signals__filters" aria-label="Direction filter">{['ALL', 'LONG', 'SHORT'].map((value) => <button key={value} className={direction === value ? 'is-active' : ''} onClick={() => setDirection(value)}>{value === 'ALL' ? 'All directions' : value}</button>)}</div>
        <select className="an-input" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)} aria-label="Lifecycle">
          <option value="ALL">All lifecycle states</option><option value="published">Published</option><option value="open">Open position</option><option value="triggered">Triggered</option>{market === 'IN' && <>{[...WATCH_LIFECYCLES].map((state) => <option key={state} value={state}>{label(state)}</option>)}</>}
        </select>
        <button className="an-button" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <Panel title="Published setups" subtitle={`${filteredPublished.length} recorded setup${filteredPublished.length === 1 ? '' : 's'} · check source freshness`} action={<span className="an-chip">Threshold 65</span>}>
        {filteredPublished.length ? <div className="an-signals__cards">{filteredPublished.map((plan, index) => <SignalCard key={`${plan.symbol}-${plan.side}-${plan.lifecycle}-${index}`} plan={{ ...plan, observed_at: plan.observed_at || status?.observed_at }} market={market} actionable={current} />)}</div> : <EmptyState title={current ? 'No qualifying setup' : 'No qualifying setup — inputs incomplete'} description={current ? 'The current complete snapshot did not clear publication rules or match these filters.' : (status?.warnings || ['Required market inputs are unavailable.']).map(label).join(' · ')} />}
      </Panel>

      {market === 'IN' && <Panel className="an-signals__early" title="Early setup watchlist" subtitle="Observations only · no trade status" action={<span className="an-chip">{early.length} watched</span>}>
        <div className="an-signals__early-note">Forming, extended and invalidated observations stay outside the published ledger. They are not qualifying entries.</div>
        {filteredEarly.length ? <div className="an-signals__cards">{filteredEarly.map((plan, index) => <SignalCard key={`${plan.symbol}-${plan.side}-${plan.lifecycle}-${index}`} plan={{ ...plan, observed_at: plan.observed_at || status?.observed_at }} market={market} early actionable={false} sourceCurrent={current} />)}</div> : <EmptyState title="No early setups" description="No watch states match the current filters." />}
      </Panel>}

      <footer className="an-signals__provenance">
        <div><span>Sources</span><strong>{status?.sources?.length ? status.sources.join(' · ') : 'Not reported'}</strong></div>
        <div><span>Source observed</span><strong>{formatStamp(status?.observed_at || data?.as_of)}</strong></div>
        <div><span>Source age</span><strong>{age(data?.timing?.source_age_seconds)}</strong></div>
        <div><span>Scan interval</span><strong>{age(data?.timing?.scan_interval_seconds)}</strong></div>
      </footer>

      <details className="an-signals__advanced" onToggle={event => setShowAdvanced(event.currentTarget.open)}>
        <summary>Advanced market intelligence <span>Options, volatility, buildups and model portfolio</span></summary>
        {showAdvanced && (current ? <Suspense fallback={<Loading label="Loading advanced intelligence…" />}><LegacyMarketSignals /></Suspense> : <EmptyState title="Advanced intelligence unavailable" description="A complete, current snapshot is needed to open this panel." />)}
      </details>
    </div>
  );
}
