import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { Lock, ShieldCheck } from 'lucide-react';
import { track } from '@vercel/analytics';
import AppLogo from '../components/AppLogo';
import { Skeleton } from '../components/ui';
import { useSWR } from '../lib/swrCache';
import {
  resolveGateSetups, formatGateDate, destinationLabel, gateContent, GUEST_PREVIEW_SETUPS,
} from '../lib/accessGate';
import './GuestGate.css';

const UNLOCKS = [
  'Scored setups with fixed levels',
  'NSE research tools',
  'Watchlist and alerts',
];

// The one page a signed-out visitor gets. Shows real, currently-live scored
// setups as proof, with the trade levels withheld — the levels are the reason
// to create an account, so they are the thing behind the gate.
const GuestGate = () => {
  const location = useLocation();

  // Same cache key SignalAlertProvider seeds once the visitor is in, so signing
  // up hands them a warm terminal instead of a fresh round-trip.
  const { data: signals, error } = useSWR(
    'signals',
    () => axios.get('/api/signals').then((r) => r.data),
    120000,
  );

  // The engine publishes nothing for most of the clock, and an empty proof
  // panel behind a signup wall converts nobody. Fetched alongside the live
  // payload rather than after it, so a quiet market costs no extra round-trip.
  const { data: preview, error: previewError } = useSWR(
    'signals-preview',
    () => axios.get('/api/signals/preview').then((r) => r.data),
    300000,
  );

  const { setups, live, asOf } = resolveGateSetups(signals, preview);
  // Only hold the skeleton while the panel is genuinely undecided — the moment
  // either source lands with calls, show them.
  const loading = setups.length === 0
    && !((signals || error) && (preview || previewError));
  const heading = destinationLabel(location.pathname);
  const content = gateContent(location.pathname);

  useEffect(() => {
    track('Guest Gate Viewed', { path: location.pathname });
  }, [location.pathname]);

  // Carry the attempted destination so signup lands them where they aimed.
  const signupTo = { pathname: '/login', search: '?mode=signup' };
  const signupState = { from: location };

  return (
    <main className="gate">
      <div className="gate-inner">
        <header className="gate-head">
          <Link to="/" className="gate-brand" aria-label="Alpha Nova home">
            <AppLogo size={30} />
            <span><span className="gate-brand-alpha">Alpha</span> Nova</span>
          </Link>
          <Link to="/login" className="gate-login-link">Log in</Link>
        </header>

        <div className="gate-layout">
        <div className="gate-primary">
          <h1 className="gate-title">
            {heading
              ? <>Create a free account to open <em>{heading}</em>.</>
              : <>Research with a repeatable process. <em>Start free.</em></>}
          </h1>
          <p className="gate-lede">{content.lede}</p>

        {content.showSignals ? (
        <section className="gate-setups" aria-label="Scored setups">
          {loading && (
            [...Array(GUEST_PREVIEW_SETUPS)].map((_, i) => <Skeleton key={i} height={86} />)
          )}

          {!loading && setups.length > 0 && (
            <p className="gate-setups-meta">
              {live
                ? <><span className="gate-live-dot" aria-hidden="true" />Live now</>
                : `Last published ${formatGateDate(asOf)}`}
            </p>
          )}

          {!loading && setups.length === 0 && (
            <div className="gate-empty">
              No qualifying setups yet. Sign up for alerts.
            </div>
          )}

          {!loading && setups.map((plan) => (
            <article key={plan.symbol} className="gate-setup">
              <div className="gate-setup-main">
                <span className={`gate-side ${plan.side === 'LONG' ? 'long' : 'short'}`}>
                  {plan.side}
                </span>
                <span className="gate-sym">{plan.symbol}</span>
                <span className="gate-score tnum">
                  {plan.score}<small>/100</small>
                </span>
              </div>
              <div className="gate-levels" aria-label="Trade levels available after signup">
                {['Entry', 'Stop', 'Target'].map((label) => (
                  <span className="gate-level" key={label}>
                    <span className="gate-level-label">{label}</span>
                    <span className="gate-level-locked"><Lock size={11} aria-hidden="true" />•••</span>
                  </span>
                ))}
              </div>
            </article>
          ))}
        </section>
        ) : (
          <section className="gate-route-preview" aria-label={content.previewTitle}>
            <span>WHAT YOU WILL BE ABLE TO DO</span>
            <h2>{content.previewTitle}</h2>
            <ul>
              {content.points.map((point) => (
                <li key={point}><ShieldCheck size={15} aria-hidden="true" />{point}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="gate-trust" aria-labelledby="gate-trust-heading">
          <span>WHY TRUST THE SIGNAL?</span>
          <h2 id="gate-trust-heading">Every signal should come with receipts.</h2>
          <p>Entry, stop and target are published first. Wins, losses and open calls stay visible.</p>
        </section>
        </div>

        <div className="gate-conversion">

        <Link
          to={signupTo}
          state={signupState}
          className="gate-cta"
          onClick={() => track('Signup CTA Clicked', { source: 'guest_gate' })}
        >
          Create free account
        </Link>
        <p className="gate-free">Free · No card · 20 seconds</p>

        <section className="gate-unlocks" aria-label="What an account unlocks">
          <h2>What you unlock</h2>
          <ul>
            {UNLOCKS.map((item) => (
              <li key={item}><ShieldCheck size={14} aria-hidden="true" />{item}</li>
            ))}
          </ul>
        </section>

        <nav className="gate-legal" aria-label="Legal and support">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
        </nav>
        </div>
        </div>

        <p className="gate-disclaimer">
          Research only. Not investment advice.
        </p>
      </div>
    </main>
  );
};

export default GuestGate;
