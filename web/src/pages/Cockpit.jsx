import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  Activity, ArrowUpRight, ChevronDown, Clock3, Database,
  RefreshCw, ShieldCheck, Sparkles, WalletCards,
} from 'lucide-react';
import { Skeleton } from '../components/ui';
import { useSWR } from '../lib/swrCache';
import './Cockpit.css';

const DEFAULT_CAPITAL = 10_000_000;

const money = (value, currency = '₹', compact = false) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  const locale = currency === '$' ? 'en-US' : 'en-IN';
  if (compact && currency === '₹') {
    if (Math.abs(number) >= 10_000_000) return `₹${(number / 10_000_000).toFixed(2)} Cr`;
    if (Math.abs(number) >= 100_000) return `₹${(number / 100_000).toFixed(1)} L`;
  }
  return `${currency}${number.toLocaleString(locale, { maximumFractionDigits: 2 })}`;
};

const pct = (value, digits = 1) => value === null || value === undefined ? '—' : `${Number(value).toFixed(digits)}%`;
const signedPct = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `${number >= 0 ? '+' : ''}${number.toFixed(2)}%` : '—';
};

const SourceStatus = ({ source }) => (
  <span className={`cockpit-source is-${source.state}`} title={source.warning || source.market_time || ''}>
    <span aria-hidden="true" className="cockpit-source-dot" />
    {source.source}
    <span className="sr-only">: {source.state}</span>
  </span>
);

const ScoreRing = ({ value, confidence }) => (
  <div
    className="cockpit-score-ring"
    style={{ '--score': `${Math.max(0, Math.min(100, value || 0)) * 3.6}deg` }}
    aria-label={`Alpha Score ${value} out of 100; ${confidence.toLowerCase()} data confidence`}
  >
    <strong>{value ?? '—'}</strong>
    <span>alpha</span>
  </div>
);

const OpportunityCard = ({ opportunity, featured = false }) => {
  const [expanded, setExpanded] = useState(false);
  const { levels, allocation, score } = opportunity;
  const long = opportunity.side === 'LONG';
  const confidence = score.confidence?.label || 'LOW';

  return (
    <article className={`cockpit-opportunity ${featured ? 'is-featured' : ''}`}>
      <div className="cockpit-opportunity-topline">
        <div>
          <span className={`cockpit-side ${long ? 'is-long' : 'is-short'}`}>{opportunity.side}</span>
          <span className="cockpit-state">{opportunity.state}</span>
        </div>
        <span className="cockpit-horizon"><Clock3 size={13} /> {opportunity.holding_period}</span>
      </div>

      <div className="cockpit-opportunity-heading">
        <div>
          <h2>{opportunity.symbol}</h2>
          <p>{confidence.toLowerCase()} data confidence · score {score.version}</p>
        </div>
        <ScoreRing value={score.score} confidence={confidence} />
      </div>

      <div className="cockpit-levels">
        <div>
          <span>Entry zone</span>
          <strong>{money(levels.entry_zone[0], opportunity.currency)}–{money(levels.entry_zone[1], opportunity.currency)}</strong>
        </div>
        <div>
          <span>Invalidation</span>
          <strong className="is-loss">{money(levels.stop, opportunity.currency)}</strong>
        </div>
        <div>
          <span>Target one</span>
          <strong className="is-gain">{money(levels.targets[0], opportunity.currency)}</strong>
        </div>
      </div>

      <div className="cockpit-allocation-line">
        <div>
          <span>Suggested allocation</span>
          <strong>{money(allocation.value, opportunity.currency, true)} <small>· {pct(allocation.portfolio_pct)}</small></strong>
        </div>
        <div>
          <span>Defined portfolio risk</span>
          <strong>{money(allocation.risk_rupees, opportunity.currency, true)} <small>· {pct(allocation.risk_pct, 2)}</small></strong>
        </div>
      </div>

      <ul className="cockpit-reasons">
        {opportunity.why_it_qualifies.slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}
      </ul>

      {expanded && (
        <div className="cockpit-expanded" id={`details-${opportunity.id.replaceAll(':', '-')}`}>
          <div className="cockpit-score-grid">
            {score.components.map((component) => (
              <div className={`cockpit-score-row ${!component.available ? 'is-missing' : ''}`} key={component.name}>
                <span>{component.name}</span>
                <div className="cockpit-score-track"><i style={{ width: `${component.value || 0}%` }} /></div>
                <strong>{component.available ? component.value : 'N/A'}</strong>
              </div>
            ))}
          </div>
          <div className="cockpit-detail-columns">
            <div>
              <h3>What would change our mind</h3>
              <ul>{opportunity.what_changes_our_mind.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div>
              <h3>Missing evidence</h3>
              <ul>{score.missing_inputs.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </div>
      )}

      <div className="cockpit-card-actions">
        <button
          type="button"
          className="cockpit-text-button"
          aria-expanded={expanded}
          aria-controls={`details-${opportunity.id.replaceAll(':', '-')}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide evidence' : 'Review evidence'}
          <ChevronDown size={16} className={expanded ? 'is-rotated' : ''} />
        </button>
        <Link className="cockpit-primary-link" to={`/chart?symbol=${opportunity.symbol}${opportunity.market === 'IN' ? '.NS' : ''}`}>
          Open research <ArrowUpRight size={15} />
        </Link>
      </div>
    </article>
  );
};

const CockpitLoading = () => (
  <div className="cockpit-page" aria-busy="true" aria-label="Loading Alpha Cockpit">
    <Skeleton height={42} width="42%" />
    <div style={{ height: 18 }} />
    <Skeleton height={184} />
    <div className="cockpit-loading-grid">
      {[1, 2, 3].map((item) => <Skeleton key={item} height={430} />)}
    </div>
  </div>
);

const Cockpit = () => {
  const { data, refreshing, error, revalidate } = useSWR(
    'alpha_cockpit_v3',
    () => axios.get(`/api/cockpit?capital=${DEFAULT_CAPITAL}&risk_pct=0.75`).then((response) => response.data),
    120000,
  );

  if (!data && !error) return <CockpitLoading />;
  if (!data && error) {
    return (
      <div className="cockpit-page cockpit-fatal">
        <span className="cockpit-kicker">Alpha Cockpit</span>
        <h1>The decision view is temporarily unavailable.</h1>
        <p>The last trustworthy snapshot could not be loaded. No market values have been substituted.</p>
        <button type="button" onClick={revalidate}><RefreshCw size={16} /> Try again</button>
      </div>
    );
  }

  const top = data.opportunities.slice(0, 3);
  const rest = data.opportunities.slice(3);
  const confidenceWarning = data.sources.some((source) => source.state === 'partial' || source.state === 'unavailable');

  return (
    <main className="cockpit-page fade-in">
      <header className="cockpit-header">
        <div>
          <span className="cockpit-kicker"><Sparkles size={14} /> Alpha Cockpit · V3</span>
          <h1>Today’s decision view.</h1>
          <p>Ranked 2–20 day opportunities, sized against a ₹1 crore reference portfolio.</p>
        </div>
        <button type="button" className="cockpit-refresh" onClick={revalidate} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />
          {refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      <section className="cockpit-statusbar" aria-label="Market and data status">
        <span className={`cockpit-market-state ${data.market.is_open ? 'is-open' : ''}`}>
          <Activity size={14} /> {data.market.code} · {data.market.is_open ? 'Market live' : data.market.note}
        </span>
        <div className="cockpit-indices">
          {data.market.indices.slice(0, 4).map((index) => (
            <span key={index.name}>{index.name} <strong>{signedPct(index.change_pct)}</strong></span>
          ))}
        </div>
        <span className="cockpit-asof">As of {new Date(data.as_of).toLocaleString()}</span>
      </section>

      <section className="cockpit-regime">
        <div className="cockpit-regime-copy">
          <span className={`cockpit-regime-label is-${data.regime.label.toLowerCase()}`}>{data.regime.label}</span>
          <h2>{data.regime.summary}</h2>
          <p>{data.regime.posture}. The model currently preserves approximately {data.regime.cash_guidance_pct}% cash.</p>
        </div>
        <div className="cockpit-regime-metrics">
          {data.regime.components.map((component) => (
            <div key={component.label}><span>{component.label}</span><strong>{component.value}</strong></div>
          ))}
        </div>
      </section>

      {confidenceWarning && (
        <div className="cockpit-confidence-note">
          <Database size={17} />
          <div><strong>Confidence is intentionally reduced.</strong><span>Incomplete evidence is shown as missing—not replaced with synthetic values.</span></div>
        </div>
      )}

      <div className="cockpit-section-heading">
        <div><span>Highest conviction</span><h2>{top.length ? `${top.length} setups worth your attention` : 'No confirmed setup right now'}</h2></div>
        <Link to="/signals">View the complete signal engine <ArrowUpRight size={15} /></Link>
      </div>

      {top.length ? (
        <section className="cockpit-opportunity-grid">
          {top.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} featured />)}
        </section>
      ) : (
        <section className="cockpit-empty">
          <ShieldCheck size={28} />
          <h2>Cash is a valid position.</h2>
          <p>No setup clears the current confirmation, freshness, and risk gates. The Cockpit will refresh as evidence improves.</p>
        </section>
      )}

      <section className="cockpit-lower-grid">
        <article className="cockpit-portfolio-card">
          <div className="cockpit-card-title"><WalletCards size={18} /><span>Portfolio posture</span></div>
          <div className="cockpit-capital"><span>Reference capital</span><strong>{money(data.allocation.reference_capital, '₹', true)}</strong></div>
          <div className="cockpit-allocation-bar" aria-label={`${pct(data.allocation.deployed_pct)} deployed and ${pct(data.allocation.cash_pct)} cash`}>
            <i style={{ width: `${data.allocation.deployed_pct || 0}%` }} />
          </div>
          <div className="cockpit-allocation-stats">
            <div><span>Proposed deployment</span><strong>{money(data.allocation.deployed, '₹', true)} · {pct(data.allocation.deployed_pct)}</strong></div>
            <div><span>Reserve cash</span><strong>{money(data.allocation.cash, '₹', true)} · {pct(data.allocation.cash_pct)}</strong></div>
            <div><span>Total risk at stops</span><strong>{money(data.allocation.total_risk, '₹', true)} · {pct(data.allocation.total_risk_pct, 2)}</strong></div>
          </div>
          <Link className="cockpit-primary-link is-wide" to="/position-sizing">Open Portfolio Lab <ArrowUpRight size={15} /></Link>
        </article>

        <article className="cockpit-attention-card">
          <div className="cockpit-card-title"><Activity size={18} /><span>Needs attention</span></div>
          <div className="cockpit-attention-list">
            {data.attention.map((item, index) => (
              <div key={`${item.type}-${index}`} className={`is-${item.priority}`}>
                <span>{index + 1}</span><p>{item.message}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      {rest.length > 0 && (
        <>
          <div className="cockpit-section-heading is-compact"><div><span>Also confirmed</span><h2>More diversified candidates</h2></div></div>
          <section className="cockpit-opportunity-grid is-secondary">
            {rest.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}
          </section>
        </>
      )}

      <footer className="cockpit-footer">
        <div>
          <span>Data health</span>
          <div>{data.sources.map((source) => <SourceStatus key={source.source} source={source} />)}</div>
        </div>
        <p>Decision support only. Verify live prices, liquidity, and suitability before acting.</p>
      </footer>
    </main>
  );
};

export default Cockpit;
