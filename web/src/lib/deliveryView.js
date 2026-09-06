const SYMBOL_RE = /^[A-Z0-9][A-Z0-9&.-]{0,24}$/;

export function normalizeDeliverySymbol(value) {
  const symbol = String(value || '').trim().toUpperCase().replace(/\.NS$/, '');
  return SYMBOL_RE.test(symbol) ? symbol : '';
}

export function deliveryStockPath(value) {
  const symbol = normalizeDeliverySymbol(value);
  return symbol ? `/stocks/${encodeURIComponent(symbol)}/delivery-percentage` : '/delivery-radar';
}

export function deliveryApiPath(value, limit = 90) {
  const symbol = normalizeDeliverySymbol(value);
  return symbol ? `/api/delivery/stock/${encodeURIComponent(symbol)}?limit=${Math.max(1, Math.min(Number(limit) || 90, 120))}` : '';
}

export function formatDeliveryNumber(value, kind = 'number') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (kind === 'quantity') return Math.round(number).toLocaleString('en-IN');
  if (kind === 'ratio') return `${number.toFixed(2)}×`;
  if (kind === 'percent') return `${number.toFixed(2)}%`;
  if (kind === 'price') return `₹${number.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  return number.toLocaleString('en-IN');
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

export function sourceNotice(payload) {
  const date = formatDate(payload?.trade_date);
  if (!date) return 'NSE delivery data unavailable';
  if (payload?.source_status === 'stale') return `Latest available NSE session ${date} · delayed`;
  return `NSE session ${date}`;
}
