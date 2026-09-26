export const MOMENTUM_VIEWS = {
  leaders: { label: 'Leaders', field: 'ranked', sort: 'rs_percentile', dir: 'desc' },
  breakouts: { label: 'Breakouts', field: 'breakouts', sort: 'chg_today', dir: 'desc' },
  breakdowns: { label: 'Breakdowns', field: 'breakdowns', sort: 'chg_today', dir: 'asc' },
  low_rs: { label: 'Low RS', field: 'low_rs', sort: 'rs_percentile', dir: 'asc' },
};

export function momentumRows(snapshot, view, query = '', sortKey, sortDir, eventType) {
  const config = MOMENTUM_VIEWS[view] || MOMENTUM_VIEWS.leaders;
  const rows = snapshot?.[config.field] || (view === 'leaders' ? snapshot?.data : []) || [];
  const key = sortKey || config.sort;
  const dir = (sortDir || config.dir) === 'asc' ? 1 : -1;
  return rows.filter(r => r.ticker.toLowerCase().includes(query.trim().toLowerCase())
    && (!eventType || r.type === eventType)).slice().sort((a, b) => {
    if (a[key] == null && b[key] == null) return a.ticker.localeCompare(b.ticker);
    if (a[key] == null) return 1;
    if (b[key] == null) return -1;
    return dir * (a[key] - b[key]) || a.ticker.localeCompare(b.ticker);
  });
}

export function sessionLabel(snapshot, market, now = new Date()) {
  const date = snapshot?.session_date;
  if (!date) return 'Session date unavailable';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: market === 'in' ? 'Asia/Kolkata' : 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return date === today ? `Today · ${date} · daily bar may be in progress` : `Latest available session · ${date}`;
}
