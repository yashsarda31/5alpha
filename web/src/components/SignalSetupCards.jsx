import { Link } from 'react-router-dom';
import { chaseValue, setupStateLabel, timestampValue, timingReasonLabel } from '../lib/signalTimingView.js';

const formatNumber = (value, decimals = 2) => (
  value === null || value === undefined || Number.isNaN(Number(value))
    ? 'N/A'
    : Number(value).toLocaleString('en-IN', { maximumFractionDigits: decimals })
);

export default function SignalSetupCards({ plans = [], currency = '₹', market = 'IN', watch = false }) {
  return (
    <div className="signal-setup-cards" aria-label={watch ? 'Early setup watchlist' : 'Qualifying signal setups'}>
      {plans.map((plan) => (
        <article className={`signal-setup-card${watch ? ' signal-setup-card--watch' : ''}`} key={`${plan.symbol}-${plan.side}-${plan.lifecycle || 'published'}`}>
          <header>
            <div>
              <Link to={`/chart?symbol=${encodeURIComponent(plan.symbol)}`} className="signal-setup-card__symbol">
                {plan.symbol}
              </Link>
              <span className={`side-${plan.side}`}>{plan.side}</span>
              <span className={`signal-setup-card__state state-${plan.lifecycle || 'qualifying'}`}>{setupStateLabel(plan)}</span>
            </div>
            <div className="signal-setup-card__score">
              <span>Quality score</span>
              <strong>{formatNumber(plan.score, 0)}/100</strong>
            </div>
          </header>
          <div className="signal-setup-card__timestamps">
            {['observed_at', 'detected_at', 'first_seen_at', ...(!watch ? ['published_at'] : [])].map((field) => {
              const stamp = timestampValue(plan[field]);
              const label = field === 'observed_at' ? 'Source observed' : field === 'detected_at' ? 'Detected' : field === 'published_at' ? 'Published' : 'First seen';
              return <p className="signal-setup-card__timestamp" key={field}>{label}: <time dateTime={stamp.dateTime}>{stamp.text}</time></p>;
            })}
          </div>
          {watch && (
            <dl className="signal-setup-card__watch-levels">
              <div><dt>Trigger</dt><dd>{currency}{formatNumber(plan.trigger)}</dd></div>
              <div><dt>Invalidation</dt><dd>{currency}{formatNumber(plan.initial_stop)}</dd></div>
              <div><dt>Chase</dt><dd>{chaseValue(plan.chase_r)}</dd></div>
              <div><dt>Reason</dt><dd>{timingReasonLabel(plan.timing_reason)}</dd></div>
            </dl>
          )}
          {!watch && !plan.why && <p className="signal-setup-card__limitation">Signal drivers unavailable</p>}
          {!watch && <>
            <dl className="signal-setup-card__levels">
            <div><dt>Entry</dt><dd>{currency}{formatNumber(plan.entry)}</dd></div>
            <div><dt>Stop</dt><dd>{currency}{formatNumber(plan.stop)}</dd></div>
            <div><dt>Target {plan.target_label || (market === 'US' ? '1.5R' : '')}</dt><dd>{currency}{formatNumber(plan.target)}</dd></div>
            <div><dt>Quantity</dt><dd>{formatNumber(plan.qty, 0)}</dd></div>
            </dl>
            {plan.why && <details className="signal-setup-card__details">
              <summary>Signal evidence<span aria-hidden="true" className="signal-setup-card__chevron">⌄</span></summary>
              <p className="signal-setup-card__drivers">{plan.why.replace(/levels locked/gi, 'original levels retained')}</p>
            </details>}
          </>}
        </article>
      ))}
    </div>
  );
}
