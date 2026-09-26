export function number(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return null;
  const result = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(result) ? result : null;
}
export function formatNumber(value: unknown, digits = 2): string {
  const n = number(value);
  return n === null ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function formatPrice(value: unknown, market = 'IN'): string {
  const n = number(value);
  return n === null ? '—' : `${market === 'US' ? '$' : '₹'}${n.toLocaleString(market === 'US' ? 'en-US' : 'en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
}
export function formatMarketCap(value: unknown, market = 'IN'): string {
  const n = number(value);
  if (n === null || n <= 0) return 'Unavailable';
  const currency = market === 'US' ? '$' : '₹';
  const unit = n >= 1e12 ? [1e12,'T'] as const : n >= 1e9 ? [1e9,'B'] as const : n >= 1e6 ? [1e6,'M'] as const : [1,''] as const;
  return `${currency}${(n / unit[0]).toLocaleString(market === 'US' ? 'en-US' : 'en-IN', { maximumFractionDigits:2 })}${unit[1]}`;
}
export function formatChange(value: unknown): string {
  const n = number(value);
  return n === null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}
export function formatStamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Source time unavailable';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dateOnly = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(dateOnly.getTime()) ? dateOnly.toLocaleDateString('en-IN', { timeZone:'UTC', day:'numeric', month:'short', year:'numeric' }) : 'Source time unavailable';
  }
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasZone ? value : `${value.replace(' ', 'T')}+05:30`);
  if (!Number.isFinite(date.getTime())) return 'Source time unavailable';
  return `${date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} IST`;
}
export function symbolPath(symbol: string, market = 'IN'): string {
  const clean = String(symbol || '').trim().toUpperCase();
  const effectiveMarket = /\.(NS|BO)$/.test(clean) ? 'IN' : market === 'US' ? 'US' : 'IN';
  const resolved = effectiveMarket === 'IN' && !clean.includes('.') && !clean.startsWith('^') ? `${clean}.NS` : clean;
  return `/chart?symbol=${encodeURIComponent(resolved)}&market=${effectiveMarket}`;
}
