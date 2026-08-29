import React, { useState } from 'react';
import { X } from 'lucide-react';

const DISMISS_KEY = 'alphanova_disclaimer_acknowledged_v1';

// Full notice once per session, dismissible; afterwards a one-line reminder
// keeps the compliance message present without owning the top of every page.
const Disclaimer = () => {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  if (dismissed) {
    return (
      <div className="disclaimer-mini">
        <span>Educational analytics — not investment advice.</span>
        <button type="button" className="disclaimer-view" onClick={() => setDismissed(false)}>
          View notice
        </button>
      </div>
    );
  }

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
      setDismissed(true);
    } catch {
      // Keep the full notice visible if acknowledgement cannot be persisted.
    }
  };

  return (
    <div className="disclaimer-alert">
      <div>
        <strong>COMPLIANCE NOTICE:</strong> The quantitative models and AI-generated insights provided on the Alpha Nova platform are for <em>educational and analytical purposes only</em>. They rely on third-party data which may be delayed or inaccurate. They do not constitute financial advice, investment recommendations, or an offer to buy/sell securities.
      </div>
      <button className="disclaimer-dismiss" onClick={dismiss} aria-label="Dismiss compliance notice">
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

export default Disclaimer;
