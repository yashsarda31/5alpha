import { normalizeDataStatus, warningLabel } from '../lib/signalView.js';

const STATUS_LABELS = {
  fresh: 'Fresh data',
  last_session: 'Last completed session',
  stale: 'Stale data',
  provider_limited: 'Provider limited',
};

const formatObservedAt = (value) => {
  if (!value) return 'Observation time unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function DataStatus({ status, refreshing = false }) {
  const normalized = normalizeDataStatus(status);
  const sourceCopy = normalized.sources.length
    ? normalized.sources.join(' · ')
    : 'Sources unavailable';

  return (
    <section className={`signal-data-status is-${normalized.status}`} aria-label="Signal data status">
      <div className="signal-data-status__summary">
        <span className="signal-data-status__pill">{STATUS_LABELS[normalized.status]}</span>
        <span>{normalized.market_session.replaceAll('_', ' ')}</span>
        <span className="signal-data-status__refresh" role="status">
          {refreshing ? 'Refreshing snapshot…' : ''}
        </span>
      </div>
      <p className="signal-data-status__meta">
        <time dateTime={normalized.observed_at || undefined}>{formatObservedAt(normalized.observed_at)}</time>
        <span aria-hidden="true"> · </span>
        <span>{sourceCopy}</span>
      </p>
      {normalized.warnings.length > 0 && (
        <details className="signal-data-status__warnings">
          <summary>Data limitations ({normalized.warnings.length})</summary>
          <ul>
            {normalized.warnings.map((warning) => <li key={warning}>{warningLabel(warning)}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
