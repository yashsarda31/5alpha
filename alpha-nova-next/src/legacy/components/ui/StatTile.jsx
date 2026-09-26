import React from 'react';

// A single metric tile: uppercase micro-label + tabular-mono value.
// tone controls the value color role (neutral/gain/loss/gold/accent).
export const StatTile = ({ label, value, tone = 'neutral', sub }) => (
  <div className="ui-stat-tile">
    <div className="ui-stat-label">{label}</div>
    <div className={`ui-stat-value tnum tone-${tone}`}>{value}</div>
    {sub && <div className="ui-stat-sub">{sub}</div>}
  </div>
);

// Responsive auto-fit grid wrapper for a row of tiles.
export const StatGrid = ({ children, style }) => (
  <div className="ui-stat-grid" style={style}>{children}</div>
);

export default StatTile;
