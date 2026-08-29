import { Link } from 'react-router-dom';

const formatNumber = (value, decimals = 2) => (
  value === null || value === undefined || Number.isNaN(Number(value))
    ? 'N/A'
    : Number(value).toLocaleString('en-IN', { maximumFractionDigits: decimals })
);

const formatTimestamp = (value) => {
  if (!value) return 'Timestamp unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function SignalSetupCards({ plans = [], currency = '₹', market = 'IN' }) {
  return (
    <div className="signal-setup-cards" aria-label="Qualifying signal setups">
      {plans.map((plan) => (
        <article className="signal-setup-card" key={`${plan.symbol}-${plan.side}`}>
          <header>
            <div>
              <Link to={`/chart?symbol=${encodeURIComponent(plan.symbol)}`} className="signal-setup-card__symbol">
                {plan.symbol}
              </Link>
              <span className={`side-${plan.side}`}>{plan.side}</span>
            </div>
            <div className="signal-setup-card__score">
              <span>Quality Score</span>
              <strong>{formatNumber(plan.score, 0)}/100</strong>
            </div>
          </header>
          <dl className="signal-setup-card__levels">
            <div><dt>Entry</dt><dd>{currency}{formatNumber(plan.entry)}</dd></div>
            <div><dt>Stop</dt><dd>{currency}{formatNumber(plan.stop)}</dd></div>
            <div><dt>Target {plan.target_label || (market === 'US' ? '1.5R' : '')}</dt><dd>{currency}{formatNumber(plan.target)}</dd></div>
            <div><dt>Quantity</dt><dd>{formatNumber(plan.qty, 0)}</dd></div>
          </dl>
          <p className="signal-setup-card__drivers">{plan.why || 'Signal drivers unavailable'}</p>
          <p className="signal-setup-card__timestamp">
            Data: <time dateTime={plan.observed_at || plan.as_of || undefined}>{formatTimestamp(plan.observed_at || plan.as_of)}</time>
          </p>
        </article>
      ))}
    </div>
  );
}
