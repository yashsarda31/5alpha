import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { formatChange, number } from '../lib/market';
export function PageHeading({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="an-page-heading"><div>{eyebrow && <div className="an-kicker">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="an-heading-actions">{actions}</div>}</header>;
}
export function Panel({ title, subtitle, action, children, className = '' }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`an-panel ${className}`}>{(title || action) && <header className="an-panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>}{children}</section>;
}
export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div className="an-empty"><span className="an-empty-icon"><Search size={24} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function Loading({ label = 'Loading research' }: { label?: string }) {
  return <div className="an-loading" role="status" aria-live="polite"><div className="an-skeleton"/><div className="an-skeleton"/><div className="an-skeleton"/><span>{label}…</span></div>;
}
export function ErrorState({ message, retry }: { message: ReactNode; retry?: () => void }) {
  return <div className="an-error" role="status"><AlertCircle size={18}/><span>{message}</span>{retry && <button className="an-button" onClick={retry}><RefreshCw size={14}/>Retry</button>}</div>;
}
export function Change({ value }: { value: unknown }) {
  const n = number(value);
  return <span className={`an-change ${n === null || n === 0 ? 'an-muted' : n > 0 ? 'an-positive' : 'an-negative'}`}>{n !== null && n !== 0 && (n > 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>)}{formatChange(value)}</span>;
}
