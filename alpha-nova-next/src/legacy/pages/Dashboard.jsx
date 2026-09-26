import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, SectionTitle, StatusPill, Skeleton } from '../components/ui';
import { useWatchlist } from '../WatchlistContext';
import { usePrediction } from '../PredictionContext';
import WatchlistStar from '../components/WatchlistStar';
import Sparkline from '../components/Sparkline';
import { useSWR } from '../lib/swrCache';
import { useMarket, marketQS } from '../MarketContext';
import { buildNoTradeGuidance, selectPrioritySetups } from '../lib/decisionBrief';
import { markFirstRunStep, trackProductEvent, trackReturnVisit } from '../lib/productAnalytics.js';
import FirstRunWorkflow from '../components/FirstRunWorkflow';
import { ArrowUpRight, RefreshCw, Bookmark, ChevronDown } from 'lucide-react';
import { dashboardNumber, dashboardChange } from '../lib/dashboardDisplay';
import './Dashboard.css';

// "₹2,987.65" / "$214.30" — null when the quote has no price yet
const fmtPrice = (v, market) => {
  if (dashboardNumber(v) === null) return null;
  const us = market === 'US';
  return (us ? '$' : '₹') + Number(v).toLocaleString(us ? 'en-US' : 'en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
};

const TOKEN_KEY = 'alphanova_auth_token';
const authHeader = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// One price tile (movers + watchlist): symbol, price, %, star, and a soft
// sparkline footer when the quote carries history (progressive enhancement).
const MoverTile = ({ sym, market, last, chg, spark }) => {
  const change = dashboardChange(chg);
  const dir = chg === null || chg === undefined ? '' : chg >= 0 ? 'up' : 'down';
  return (
    <div className={`dash-mover ${dir}`}>
      <WatchlistStar symbol={sym} market={market} size={15} className="dash-mover-star" />
      <Link
        to={`/chart?symbol=${sym}${market === 'US' ? '' : '.NS'}`}
        onClick={() => markFirstRunStep('choose')}
        title={`Open ${sym} in Chart Analyser`}
        className="dash-mover-link"
      >
        <span className="dash-mover-sym">{sym}</span>
        <span className="dash-mover-row">
          <span className="dash-mover-price tnum">{fmtPrice(last, market) ?? '—'}</span>
          <span className={`tnum ${change.tone}`}>
            {change.label}
          </span>
        </span>
        {spark && spark.length > 1 && (
          <span className="dash-mover-spark" aria-hidden="true">
            <Sparkline values={spark} stretch height={30} strokeWidth={2} area={false} />
          </span>
        )}
      </Link>
    </div>
  );
};

// Personalized top section: the user's tracked stocks with live prices, or a
// teaching nudge when the list is empty (the key first-run conversion moment).
const MyWatchlist = () => {
  const { symbols, marketOf, loading, loadError, reload } = useWatchlist();
  const [quotes, setQuotes] = useState({});
  const symbolsKey = symbols.join(',');

  const fetchQuotes = useCallback(async () => {
    if (!symbolsKey) { setQuotes({}); return; }
    try {
      const res = await axios.get('/api/watchlist/quotes', { headers: authHeader() });
      const map = {};
      (res.data.quotes || []).forEach((q) => { map[q.symbol] = q; });
      setQuotes(map);
    } catch {
      // degrade to symbols-only
    }
  }, [symbolsKey]);

  useEffect(() => {
    const first = setTimeout(fetchQuotes, 0);
    const interval = setInterval(fetchQuotes, 120000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [fetchQuotes]);

  return (
    <section className="dash-watchlist" aria-label="My Watchlist">
      <div className="dash-section-head">
        <SectionTitle>My Watchlist</SectionTitle>
        <Link to="/watchlist" className="dash-manage-link">{symbols.length > 0 ? `View all (${symbols.length})` : 'Open watchlist'} <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </div>
      {loading ? (
        <div className="dash-mover-grid">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={62} />)}
        </div>
      ) : loadError ? (
        <div className="dash-watchlist-empty" role="status">
          <strong>Watchlist unavailable</strong>
          <p>Could not load your saved symbols. Please try again.</p>
          <button type="button" className="dash-refresh" onClick={reload}>Retry watchlist</button>
        </div>
      ) : symbols.length === 0 ? (
        <div className="dash-watchlist-empty">
          <Bookmark size={22} aria-hidden="true" />
          <strong>Your shortlist starts here</strong>
          <p>Star a stock to keep your research in one place.</p>
          <Link to="/watchlist" className="dash-watchlist-cta">Build your watchlist <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <details className="dash-start-guide">
            <summary>New here? Start with these steps <ChevronDown size={15} aria-hidden="true" /></summary>
            <FirstRunWorkflow />
          </details>
        </div>
      ) : (
        <div className="dash-mover-grid">
          {symbols.slice(0, 4).map((sym) => {
            const q = quotes[sym];
            return (
              <MoverTile
                key={sym}
                sym={sym}
                market={marketOf(sym)}
                last={q?.last}
                chg={q?.change_pct}
                spark={q?.spark}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

// Lead indices + breadth: the one-glance "what's the market doing" strip.
const PULSE_NAMES = ['NIFTY 50', 'BANKNIFTY', 'S&P 500', 'NASDAQ 100'];

const PulseStrip = ({ indices, movers, loading, signals }) => {
  if (loading) {
    return (
      <div className="dash-pulse">
        {[1, 2, 3].map((i) => <Skeleton key={i} height={64} />)}
      </div>
    );
  }
  const lead = PULSE_NAMES
    .map((n) => indices.find((i) => i.name === n))
    .filter(Boolean)
    .slice(0, 2);
  const up = movers.filter((m) => m.change_pct > 0).length;
  const down = movers.filter((m) => m.change_pct < 0).length;
  const regime = signals?.regime;
  return (
    <div className="dash-pulse">
        <div className="dash-pulse-regime">
          <span className="dash-pulse-name">Market regime</span>
          <span className="dash-pulse-value">{regime?.overall || 'Awaiting snapshot'}</span>
          <span className="dash-pulse-detail">
            {regime?.dir ? `${String(regime.dir).toUpperCase()} bias` : 'Direction pending'}
            {regime?.vol?.label ? ` · ${regime.vol.label}` : ''}
          </span>
        </div>
      {!lead.length && <p className="dash-pulse-detail">Index snapshot unavailable</p>}
      {lead.map((ix) => {
        const dir = ix.change_pct >= 0 ? 'up' : 'down';
        const change = dashboardChange(ix.change_pct);
        return (
          <div key={ix.name} className={`dash-pulse-tile ${dir}`}>
            <span className="dash-pulse-name">{ix.name}</span>
            <span className="dash-pulse-row">
              <span className="dash-pulse-value tnum">{formatIndexValue(ix.last)}</span>
              <span className={`tnum ${change.tone}`}>
                {change.label}
              </span>
            </span>
            {ix.spark && ix.spark.length > 1 && (
              <span className="dash-mover-spark" aria-hidden="true">
                <Sparkline values={ix.spark} stretch height={30} strokeWidth={2} area={false} />
              </span>
            )}
          </div>
        );
      })}
      {(up > 0 || down > 0) && (
        <div className="dash-pulse-breadth" title="Breadth of today's top movers">
          <span className="dash-pulse-name">Movers breadth <span className="dash-sample-note">· displayed stocks only</span></span>
          <span className="dash-pulse-row">
            <span className="tone-gain tnum">{up} advancing</span>
            <span className="tone-loss tnum">{down} declining</span>
          </span>
          <span className="dash-breadth-bar" aria-hidden="true">
            <span style={{ width: `${(up / (up + down)) * 100}%` }} />
          </span>
        </div>
      )}
    </div>
  );
};

const SetupLevel = ({ label, value, currency }) => {
  if (dashboardNumber(value) === null) return null;
  return (
    <span className="dash-setup-level">
      <span>{label}</span>
      <strong className="tnum">
        {currency}{Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
      </strong>
    </span>
  );
};

const PrioritySetups = ({ signals, loading }) => {
  const plans = selectPrioritySetups(signals, 3);

  if (loading) {
    return (
      <div className="dash-setups">
        <SectionTitle>Priority Setups</SectionTitle>
        <div className="dash-setup-grid">
          {[1, 2, 3].map((item) => <Skeleton key={item} height={116} />)}
        </div>
      </div>
    );
  }

  if (!plans.length) {
    const guidance = buildNoTradeGuidance(signals);
    return (
      <div className="dash-setups">
        <SectionTitle>Priority Setups</SectionTitle>
        <div className={`dash-no-trade ${guidance.state}`}>
          <div>
            <strong>{guidance.title}</strong>
            <p>{guidance.body}</p>
          </div>
          <Link to="/signals" className="dash-manage-link">Open Signals →</Link>
        </div>
      </div>
    );
  }

  const asOf = signals?.as_of?.replace('T', ' ');
  return (
    <div className="dash-setups">
      <div className="dash-section-head">
        <SectionTitle>Priority Setups</SectionTitle>
        <Link to="/signals" className="dash-manage-link">All setups →</Link>
      </div>
      <p className="dash-section-caption">Research candidates. Expand a row for entry, stop and target.</p>
      <div className="dash-setup-grid">
        {plans.map((plan) => {
          const currency = plan.currency || signals?.currency || '₹';
          const score = Number(plan.score);
          return (
            <details
              key={`${plan.symbol}-${plan.side}`}
              className="dash-setup-card"
            >
              <summary className="dash-setup-head">
                <span className="dash-setup-symbol">{plan.symbol}</span>
                <span className={`dash-teaser-side ${plan.side === 'LONG' ? 'long' : 'short'}`}>{plan.side}</span>
                {plan.score != null && Number.isFinite(score) && <span className="dash-setup-score tnum" aria-label={`Quality score ${score} out of 100`}>Quality {score}/100</span>}
                <span className="dash-setup-expand" aria-hidden="true">+</span>
              </summary>
              <div className="dash-setup-detail">
              <span className="dash-setup-levels">
                <SetupLevel label="Entry" value={plan.entry} currency={currency} />
                <SetupLevel label="Stop" value={plan.stop} currency={currency} />
                <SetupLevel label="Target" value={plan.target} currency={currency} />
              </span>
              <Link to={`/chart?symbol=${encodeURIComponent(plan.symbol)}`} className="dash-setup-analyse">Analyse {plan.symbol} →</Link>
              </div>
            </details>
          );
        })}
      </div>
      {asOf && <div className="dash-setup-asof">As of {asOf} IST · scored by the Signals engine</div>}
    </div>
  );
};

const NextActions = () => (
  <section className="dash-next-actions" aria-label="Next actions">
    <span className="dash-next-actions__label">Your research flow</span>
    <div className="dash-next-actions__links">
      <Link to="/signals">Review Signals</Link>
      <Link to="/delivery-radar">Scan delivery activity</Link>
      <Link to="/chart">Analyse a symbol</Link>
      <Link to="/position-sizing">Size a position</Link>
    </div>
  </section>
);

// Daily NIFTY call — the retention hook. Pre-lock: two buttons. Locked: your
// pick + streak. Resolved: ✓/✗ result. Placed below movers, above modules.
const TodaysCall = () => {
  const { today, stats, submit, loading } = usePrediction();
  const [busy, setBusy] = useState(false);

  if (loading && !today) return null;
  if (!today) return null;

  const yourChoice = today.your_choice;         // 'UP' | 'DOWN' | null
  const outcome = today.outcome;                 // 'UP' | 'DOWN' | 'VOID' | null
  const resolved = outcome === 'UP' || outcome === 'DOWN';
  const locked = today.locked;

  const pick = async (choice) => {
    if (busy || locked) return;
    setBusy(true);
    try { await submit(choice); } catch { /* context surfaces error */ } finally { setBusy(false); }
  };

  const flame = stats
    ? <span className="tc-streak" title="Current streak">Streak {stats.current_streak || 0}</span>
    : null;
  const label = (c) => (c === 'UP' ? 'GREEN' : c === 'DOWN' ? 'RED' : '—');

  let body;
  if (resolved) {
    const correct = yourChoice && yourChoice === outcome;
    body = (
      <div className="tc-result">
        <span className={`tc-badge ${outcome === 'UP' ? 'up' : 'down'}`}>
          NIFTY closed {label(outcome)} {today.change_pct != null ? `(${today.change_pct >= 0 ? '+' : ''}${today.change_pct}%)` : ''}
        </span>
        {yourChoice
          ? <span className={correct ? 'tone-gain' : 'tone-loss'}>You called {label(yourChoice)} {correct ? '✓' : '✗'}</span>
          : <span style={{ color: 'var(--text-secondary)' }}>No call today</span>}
      </div>
    );
  } else if (locked) {
    body = (
      <div className="tc-result">
        {yourChoice
          ? <span className="tc-badge locked">Locked in: {label(yourChoice)}</span>
          : <span style={{ color: 'var(--text-secondary)' }}>Market's open — you didn't call today</span>}
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Result after close (15:30 IST)</span>
      </div>
    );
  } else {
    body = (
      <div className="tc-buttons">
        <button
          className={`tc-btn up ${yourChoice === 'UP' ? 'active' : ''}`}
          onClick={() => pick('UP')} disabled={busy}
        >Green ▲</button>
        <button
          className={`tc-btn down ${yourChoice === 'DOWN' ? 'active' : ''}`}
          onClick={() => pick('DOWN')} disabled={busy}
        >Red ▼</button>
        {yourChoice && <span className="tc-locknote">Locks at market open · tap to change</span>}
      </div>
    );
  }

  // Community split — only revealed once the vote can no longer be influenced
  // (your call is locked for the day, or the day is resolved).
  const community = today.community;
  const commTotal = community ? (community.up || 0) + (community.down || 0) : 0;
  const showCommunity = (locked || resolved) && commTotal > 0;
  const upPct = showCommunity ? Math.round((community.up / commTotal) * 100) : 0;

  return (
    <div className="tc-card">
      <div className="tc-head">
        <div>
          <div className="tc-title">Today's Call</div>
          <div className="tc-prompt">{today.prompt}</div>
        </div>
        <div className="tc-right">
          {flame}
          <Link to="/leaderboard" className="dash-manage-link">Leaderboard →</Link>
        </div>
      </div>
      {body}
      {showCommunity && (
        <div className="tc-community">
          <span className="tc-community-bar" aria-hidden="true">
            <span style={{ width: `${upPct}%` }} />
          </span>
          <span className="tc-community-label">
            {commTotal} {commTotal === 1 ? 'call' : 'calls'} today · <span className="tone-gain">{upPct}% green</span> · <span className="tone-loss">{100 - upPct}% red</span>
          </span>
        </div>
      )}
    </div>
  );
};

const formatIndexValue = (value) => {
  if (dashboardNumber(value) === null) return 'N/A';
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Dashboard = () => {
  const { market } = useMarket();
  useEffect(() => {
    void trackProductEvent('today_viewed', { route: '/dashboard', market: '' });
    void trackReturnVisit({ route: '/dashboard', market: '' });
  }, []);

  // Stale-while-revalidate: last snapshot renders instantly, refresh runs behind it.
  // Keys and URLs carry the footer-selected market so toggling refetches.
  const { data: dashData, error: swrError, refreshing: dashRefreshing, revalidate: refreshDashboard } = useSWR(
    `dashboard:${market}`,
    () => axios.get(`/api/dashboard${marketQS(market)}`).then((r) => r.data),
    120000,
  );
  const { data: signalsData, error: signalsError, refreshing: signalsRefreshing, revalidate: refreshSignals } = useSWR(
    `signals:${market}`,
    () => axios.get(`/api/signals${marketQS(market)}`).then((r) => r.data),
    0,
  );
  const loading = !dashData && !swrError;
  const error = !dashData && swrError
    ? (swrError.response?.data?.detail || swrError.message)
    : null;

  const movers = dashData?.movers || [];
  const moversMarket = dashData?.movers_market || 'IN'; // US megacaps 8pm–2am IST
  const indices = dashData?.indices || [];
  const marketOpen = dashData?.market_open;
  const signalsLoading = !signalsData && !signalsError;
  const refreshing = dashRefreshing || signalsRefreshing;
  const refresh = () => Promise.all([refreshDashboard(), refreshSignals()]);
  // Lead indices live in the pulse strip; everything else is the macro column.
  const macroRows = indices.filter((i) => !PULSE_NAMES.includes(i.name));

  return (
    <div className="dash fade-in">
      <PageHeader
        code="DASH"
        title="Today"
        subtitle="Market context. Your shortlist. The next step."
        right={<div className="dash-header-actions"><StatusPill open={marketOpen} /><button type="button" className="dash-refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh dashboard"><RefreshCw size={15} aria-hidden="true" />{refreshing ? 'Refreshing…' : 'Refresh'}</button></div>}
      />

      <div className="dash-session-note" role="status">
        <span>{market === 'US' ? 'US markets' : 'India markets'} <span aria-hidden="true">/</span> Session overview</span>
        <span>{refreshing ? 'Checking the latest available snapshots…' : marketOpen === false ? 'Market closed · latest available snapshots' : 'Provider snapshots · quotes may be delayed'}</span>
      </div>

      {error && (
        <div className="dash-error">Live market feed unavailable: {error}</div>
      )}
      {dashData && swrError && (
        <div className="dash-error" role="status">Market refresh unavailable. Showing the last available snapshot.</div>
      )}
      {signalsData && signalsError && (
        <div className="dash-error" role="status">Setup refresh unavailable. Showing the last available Signals snapshot; check its timestamp before researching a setup.</div>
      )}

      <PulseStrip indices={indices} movers={movers} loading={loading} signals={signalsData} />

      <div className="dash-research-grid">
        <div className="dash-research-main">
          <PrioritySetups signals={signalsData} loading={signalsLoading} />
          <NextActions />
        </div>
        <MyWatchlist />
      </div>

      <SectionTitle>Market Details</SectionTitle>
      <div className="dash-grid">
        <div id="market-movers">
          <SectionTitle>Top Movers{moversMarket === 'US' ? ' · US markets' : ''}</SectionTitle>
          <div className="dash-mover-grid">
            {loading ? (
              [1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} height={62} />)
            ) : movers.length > 0 ? (
              movers.map((m) => (
                <MoverTile
                  key={m.ticker}
                  sym={m.ticker}
                  market={moversMarket}
                  last={m.last}
                  chg={m.change_pct}
                  spark={m.spark}
                />
              ))
            ) : (
              <div className="dash-market-empty">Mover snapshot unavailable. Use Refresh to try again.</div>
            )}
          </div>
        </div>

        <div>
          <SectionTitle>Macro</SectionTitle>
          <div className="dash-macro-grid">
            {loading ? (
              [1, 2, 3, 4].map((i) => <Skeleton key={i} height={54} />)
            ) : macroRows.length > 0 ? (
              macroRows.map((r) => {
                const change = dashboardChange(r.change_pct);
                return (
                  <div key={r.name} className="dash-macro-tile">
                    <span className="dash-macro-name">{r.name}</span>
                    <span className="dash-mover-row">
                      <span className="dash-mover-price tnum">{formatIndexValue(r.last)}</span>
                      <span className={`tnum ${change.tone}`}>
                        {change.label}
                      </span>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="ui-empty"><p className="ui-empty-body">No index data available</p></div>
            )}
          </div>
        </div>
      </div>

      {market === 'IN' && <TodaysCall />}
    </div>
  );
};

export default Dashboard;
