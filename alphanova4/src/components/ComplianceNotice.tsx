import { useState } from 'react';

const DISMISS_KEY = 'alphanova_disclaimer_acknowledged_v1';

const readDismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

export const ComplianceNotice = () => {
  const [dismissed, setDismissed] = useState(readDismissed);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
      setDismissed(true);
    } catch {
      setDismissed(false);
    }
  };

  if (dismissed) {
    return (
      <aside className="compliance-mini">
        <span>Educational analytics — not investment advice.</span>
        <button type="button" onClick={() => setDismissed(false)}>View notice</button>
      </aside>
    );
  }

  return (
    <aside className="compliance-full">
      <span className="compliance-pulse" aria-hidden="true" />
      <span>Discl: Not Investment Advice</span>
      <button type="button" aria-label="Dismiss compliance notice" onClick={dismiss}>×</button>
    </aside>
  );
};
