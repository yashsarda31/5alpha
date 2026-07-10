import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { PageHeader, SectionTitle, StatusPill, Badge, Skeleton } from '../components/ui';
import { useWatchlist } from '../WatchlistContext';
import { usePrediction } from '../PredictionContext';
import { useAuth } from '../AuthContext';
import WatchlistStar from '../components/WatchlistStar';
import Sparkline from '../components/Sparkline';
import { useSWR, getCached, subscribe } from '../lib/swrCache';
import './Dashboard.css';

// Read the app-wide signals snapshot without triggering a fetch of our own —
// SignalAlertProvider polls /api/signals and seeds this cache key already.
const useSignalsCache = () => {
  const [entry, setEntry] = useState(() => getCached('signals'));
  useEffect(() => subscribe('signals', setEntry), []);
  return entry ? entry.data : null;
};

// "₹2,987.65" / "$214.30" — null when the quote has no price yet
const fmtPrice = (v, market) => {
  if (v === null || v === undefined || isNaN(v)) return null;
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
  const dir = chg === null || chg === undefined ? '' : chg >= 0 ? 'up' : 'down';
  return (
    <Link
      to={`/chart?symbol=${sym}${market === 'US' ? '' : '.NS'}`}
      title={`Open ${sym} in Chart Analyser`}
      className={`dash-mover ${dir}`}
    >
      <WatchlistStar symbol={sym} market={market} size={15} className="dash-mover-star" />
      <span className="dash-mover-sym">{sym}</span>
      <span className="dash-mover-row">
        <span className="dash-mover-price tnum">{fmtPrice(last, market) ?? '—'}</span>
        <span className={`tnum ${dir === 'down' ? 'tone-loss' : dir === 'up' ? 'tone-gain' : ''}`}>
          {chg === null || chg === undefined ? '—' : `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`}
        </span>
      </span>
      {spark && spark.length > 1 && (
        <span className="dash-mover-spark" aria-hidden="true">
          <Sparkline values={spark} stretch height={30} strokeWidth={2} area={false} />
        </span>
      )}
    </Link>
  );
};

// Personalized top section: the user's tracked stocks with live prices, or a
// teaching nudge when the list is empty (the key first-run conversion moment).
const MyWatchlist = () => {
  const { symbols, marketOf, loading } = useWatchlist();
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
    fetchQuotes();
    const id = setInterval(fetchQuotes, 120000);
    return () => clearInterval(id);
  }, [fetchQuotes]);

  return (
    <div>
      <div className="dash-section-head">
        <SectionTitle>My Watchlist</SectionTitle>
        {symbols.length > 0 && <Link to="/watchlist" className="dash-manage-link">Manage</Link>}
      </div>
      {loading ? (
        <div className="dash-mover-grid">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={62} />)}
        </div>
      ) : symbols.length === 0 ? (
        <div className="dash-wl-empty">
          <strong>Track your stocks.</strong> Tap the ☆ on any Chart, Screener result,
          Momentum leader, or a mover below — your picks show up here with live prices,
          so you can see what moved on <em>your</em> names in one glance.
        </div>
      ) : (
        <div className="dash-mover-grid">
          {symbols.map((sym) => {
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
    </div>
  );
};

// Lead indices + breadth: the one-glance "what's the market doing" strip.
const PULSE_NAMES = ['NIFTY 50', 'BANKNIFTY'];

const PulseStrip = ({ indices, movers, loading }) => {
  if (loading) {
    return (
      <div className="dash-pulse">
        {[1, 2].map((i) => <Skeleton key={i} height={64} />)}
      </div>
    );
  }
  const lead = PULSE_NAMES
    .map((n) => indices.find((i) => i.name === n))
    .filter(Boolean);
  if (!lead.length) return null;
  const up = movers.filter((m) => m.change_pct > 0).length;
  const down = movers.filter((m) => m.change_pct < 0).length;
  return (
    <div className="dash-pulse">
      {lead.map((ix) => {
        const dir = ix.change_pct >= 0 ? 'up' : 'down';
        return (
          <div key={ix.name} className={`dash-pulse-tile ${dir}`}>
            <span className="dash-pulse-name">{ix.name}</span>
            <span className="dash-pulse-row">
              <span className="dash-pulse-value tnum">{formatIndexValue(ix.last)}</span>
              <span className={`tnum ${dir === 'up' ? 'tone-gain' : 'tone-loss'}`}>
                {ix.change_pct >= 0 ? '+' : ''}{Number(ix.change_pct).toFixed(2)}%
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
          <span className="dash-pulse-name">Movers breadth</span>
          <span className="dash-pulse-row">
            <span className="tone-gain tnum">{up}↑</span>
            <span className="tone-loss tnum">{down}↓</span>
          </span>
          <span className="dash-breadth-bar" aria-hidden="true">
            <span style={{ width: `${(up / (up + down)) * 100}%` }} />
          </span>
        </div>
      )}
    </div>
  );
};

// Top scored setups from the app-wide signals poll — a live reason to open
// the Signals tab. Renders nothing until the cache holds plans.
const SetupsTeaser = () => {
  const signals = useSignalsCache();
  const plans = (signals && signals.setups && signals.setups.plans) || [];
  if (!plans.length) return null;
  const best = new Map();
  plans.forEach((p) => {
    if (!p || !p.symbol || !p.side) return;
    const held = best.get(p.symbol);
    if (!held || (p.score || 0) > (held.score || 0)) best.set(p.symbol, p);
  });
  const top = [...best.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  if (!top.length) return null;
  const asOf = (signals.as_of || '').slice(11, 16);
  return (
    <div className="dash-teaser">
      <div className="dash-section-head">
        <SectionTitle>Live Setups</SectionTitle>
        <Link to="/signals" className="dash-manage-link">All setups →</Link>
      </div>
      <div className="dash-teaser-grid">
        {top.map((p) => {
          const cur = p.currency || '₹';
          return (
            <Link key={`${p.symbol}-${p.side}`} to="/signals" className="dash-teaser-card">
              <span className={`dash-teaser-side ${p.side === 'LONG' ? 'long' : 'short'}`}>{p.side}</span>
              <span className="dash-teaser-sym">{p.symbol}</span>
              <span className="dash-teaser-score tnum">{p.score}/100</span>
              <span className="dash-teaser-entry tnum">entry {cur}{p.entry}</span>
            </Link>
          );
        })}
      </div>
      {asOf && <div className="dash-teaser-asof">as of {asOf} · scored by the signals engine</div>}
    </div>
  );
};

const NAV_MODULES = [
  { to: '/signals', code: 'SIG', title: 'Market Signals', desc: 'Options intelligence, regime context & scored setups.' },
  { to: '/track-record', code: 'TRACK', title: 'Signal Track Record', desc: 'Model portfolio & win rate — every signal, marked to market.' },
  { to: '/option-chain', code: 'OCHN', title: 'Option Chain', desc: 'Institutional derivative analytics & structural mapping.' },
  { to: '/chart', code: 'GP', title: 'Chart Analyser', desc: 'Technical analysis with Minervini VCP ratings.' },
  { to: '/flcl', code: 'FLCL', title: 'FLCL Analysis', desc: 'Floor/ceiling regime engine with trailing structure levels.' },
  { to: '/screener', code: 'EQS', title: 'Quant Screener', desc: 'Filter market using institutional constraints.' },
  { to: '/dcf', code: 'DCF', title: 'Valuations', desc: 'Intrinsic value via reverse-engineered cash flows.' },
  { to: '/fiidii', code: 'FLOW', title: 'Inst. Activity', desc: 'Track FII/DII cash market activity and flow.' },
  { to: '/arima', code: 'FORE', title: 'SARIMAX', desc: 'Time-series modeling for equity trajectory.' },
];

// Daily NIFTY call — the retention hook. Pre-lock: two buttons. Locked: your
// pick + streak. Resolved: ✓/✗ result. Placed below movers, above modules.
const TodaysCall = () => {
  const { currentUser } = useAuth();
  const { today, stats, submit, loading } = usePrediction();
  const [busy, setBusy] = useState(false);

  // Guests get a static teaser — /api/predict/today is auth'd, and the daily
  // call is one of the app's best reasons to sign up.
  if (!currentUser) {
    return (
      <div className="tc-card">
        <div className="tc-head">
          <div>
            <div className="tc-title">Today's Call</div>
            <div className="tc-prompt">Will NIFTY close green or red today?</div>
          </div>
          <div className="tc-right">
            <Link to="/leaderboard" className="dash-manage-link">Leaderboard →</Link>
          </div>
        </div>
        <div className="tc-result">
          <span style={{ color: 'var(--text-secondary)' }}>
            One call a day — build a streak, see the community split, climb the board.
          </span>
          <Link to="/login?mode=signup" className="dash-manage-link">Create free account →</Link>
        </div>
      </div>
    );
  }

  if (loading && !today) return null;
  if (!today) return null;

  const streak = stats?.current_streak || 0;
  const yourChoice = today.your_choice;         // 'UP' | 'DOWN' | null
  const outcome = today.outcome;                 // 'UP' | 'DOWN' | 'VOID' | null
  const resolved = outcome === 'UP' || outcome === 'DOWN';
  const locked = today.locked;

  const pick = async (choice) => {
    if (busy || locked) return;
    setBusy(true);
    try { await submit(choice); } catch { /* context surfaces error */ } finally { setBusy(false); }
  };

  const flame = <span className="tc-streak" title="Current streak">Streak {streak}</span>;
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
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Dashboard = () => {
  const [apiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  // Stale-while-revalidate: last snapshot renders instantly, refresh runs behind it
  const { data: dashData, error: swrError } = useSWR(
    'dashboard',
    () => axios.get('/api/dashboard').then((r) => r.data),
    120000,
  );
  const loading = !dashData && !swrError;
  const error = !dashData && swrError
    ? (swrError.response?.data?.detail || swrError.message)
    : null;

  const movers = dashData?.movers || [];
  const moversMarket = dashData?.movers_market || 'IN'; // US megacaps 8pm–2am IST
  const indices = dashData?.indices || [];
  const marketOpen = dashData?.market_open;
  // Lead indices live in the pulse strip; everything else is the macro column.
  const macroRows = indices.filter((i) => !PULSE_NAMES.includes(i.name));
  const signalsData = useSignalsCache();
  const liveSetupCount = new Set(
    ((signalsData && signalsData.setups && signalsData.setups.plans) || [])
      .filter((p) => p && p.symbol).map((p) => p.symbol),
  ).size;

  return (
    <div className="dash fade-in">
      <PageHeader
        code="DASH"
        title="Dashboard"
        subtitle="Live market snapshot & analytics modules"
        right={
          <>
            <StatusPill open={marketOpen} liveLabel="MKT OPEN" closedLabel="MKT CLOSED" />
            <Badge tone={apiKey ? 'accent' : 'loss'}>{apiKey ? 'AI ACTIVE' : 'AI OFFLINE'}</Badge>
          </>
        }
      />

      {error && (
        <div className="dash-error">Live market feed unavailable: {error}</div>
      )}

      <PulseStrip indices={indices} movers={movers} loading={loading} />

      <div style={{ marginBottom: 8 }}>
        <MyWatchlist />
      </div>

      <div className="dash-grid">
        <div>
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
              <div className="dash-mover"><span className="dash-mover-sym">No data</span></div>
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
                const dir = r.change_pct >= 0 ? 'up' : 'down';
                return (
                  <div key={r.name} className="dash-macro-tile">
                    <span className="dash-macro-name">{r.name}</span>
                    <span className="dash-mover-row">
                      <span className="dash-mover-price tnum">{formatIndexValue(r.last)}</span>
                      <span className={`tnum ${dir === 'up' ? 'tone-gain' : 'tone-loss'}`}>
                        {r.change_pct >= 0 ? '+' : ''}{Number(r.change_pct).toFixed(2)}%
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

      <TodaysCall />

      <SetupsTeaser />

      <SectionTitle>Analytics Modules</SectionTitle>
      <div className="dash-nav-grid">
        {NAV_MODULES.map((mod) => (
          <Link key={mod.to} to={mod.to} className="dash-nav-card">
            <span className="dash-nav-icon-row">
              <span className="dash-nav-icon ui-code-chip">{mod.code}</span>
              {mod.to === '/signals' && liveSetupCount > 0 && (
                <span className="dash-nav-live">{liveSetupCount} live</span>
              )}
            </span>
            <span className="dash-nav-title">{mod.title}</span>
            <span className="dash-nav-desc">{mod.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
