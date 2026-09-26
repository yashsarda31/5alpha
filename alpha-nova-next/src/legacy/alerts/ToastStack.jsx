import React from 'react';

const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN'));

// Presentational toast stack. Toasts are colored by side; clicking the body
// invokes onOpen (navigate to signals), the × invokes onDismiss.
const ToastStack = ({ toasts, onOpen, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`signal-toast ${t.side === 'LONG' ? 'long' : 'short'}`}
          role="status"
          onClick={() => onOpen(t)}
        >
          <button
            className="st-close"
            aria-label="Dismiss"
            onClick={(e) => { e.stopPropagation(); onDismiss(t.id); }}
          >×</button>
          <div className="st-head">
            <span className="st-side">{t.side}</span>
            <span className="st-sym">{t.symbol}</span>
            <span className="st-score">{t.score}/100</span>
          </div>
          <div className="st-levels">
            <span><span className="k">entry</span> {t.currency || '₹'}{fmt(t.entry)}</span>
            <span><span className="k">stop</span> {t.currency || '₹'}{fmt(t.stop)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToastStack;
