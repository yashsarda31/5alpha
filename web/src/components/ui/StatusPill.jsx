import React from 'react';

// Market LIVE / CLOSED status pill. `open` drives the color + label;
// `note` appends the closed reason (e.g. "after-hours").
const StatusPill = ({ open, liveLabel = 'MARKET LIVE', closedLabel = 'CLOSED', note }) => (
  <span className={`ui-status-pill ${open ? 'open' : 'closed'}`}>
    <span className="ui-status-dot" aria-hidden="true" />
    {open ? liveLabel : `${closedLabel}${note ? ` — ${note}` : ''}`}
  </span>
);

export default StatusPill;
