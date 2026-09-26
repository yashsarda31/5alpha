const parseDate = (value) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) return new Date(`${match[2]} ${match[1]}, ${match[3]} 00:00:00 UTC`);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const displayDate = (value) => {
  const parsed = parseDate(value);
  if (!parsed) return 'unavailable';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parsed.getUTCDate()} ${months[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
};

export const fiidiiFreshness = (payload = {}) => {
  const latestRaw = payload.latest_session_date || payload.data?.[0]?.date;
  const updated = displayDate(payload.updated_at);
  const isStale = payload.is_stale === true || payload.source_status === 'stale';
  return {
    latestSession: displayDate(latestRaw),
    isStale,
    message: isStale
      ? `Snapshot last refreshed ${updated}. The scheduled source refresh has not completed; treat these figures as delayed.`
      : `Snapshot refreshed ${updated}.`,
  };
};
