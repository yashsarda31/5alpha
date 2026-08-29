const KNOWN_STATUSES = new Set(['fresh', 'last_session', 'stale', 'provider_limited']);

export const warningLabel = (warning) => String(warning || '')
  .replaceAll('_', ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function normalizeDataStatus(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'provider_limited',
      observed_at: null,
      market_session: 'unknown',
      sources: [],
      required_inputs_complete: false,
      warnings: ['status_unavailable'],
    };
  }

  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter(Boolean) : [];
  const sources = Array.isArray(raw.sources) ? raw.sources.filter(Boolean) : [];
  return {
    status: KNOWN_STATUSES.has(raw.status) ? raw.status : 'provider_limited',
    observed_at: raw.observed_at || null,
    market_session: raw.market_session || 'unknown',
    sources,
    required_inputs_complete: raw.required_inputs_complete === true,
    warnings: raw.status && KNOWN_STATUSES.has(raw.status)
      ? warnings
      : [...new Set([...warnings, 'status_unavailable'])],
  };
}

export function signalEmptyState(data) {
  const status = normalizeDataStatus(data?.data_status);
  if (!status.required_inputs_complete || ['stale', 'provider_limited'].includes(status.status)) {
    const detail = status.warnings.length
      ? status.warnings.map(warningLabel).join(' · ')
      : 'Required market inputs are unavailable.';
    return { title: 'No qualifying setup — inputs incomplete', detail };
  }

  return {
    title: 'No qualifying setup',
    detail: 'The current, complete market snapshot did not clear the publication rules.',
  };
}
