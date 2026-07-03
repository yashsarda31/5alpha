import React from 'react';

// Standardized empty state for tables/lists that returned nothing.
const EmptyState = ({ icon = '🕸', title, children }) => (
  <div className="ui-empty">
    <div className="ui-empty-icon" aria-hidden="true">{icon}</div>
    {title && <div className="ui-empty-title">{title}</div>}
    {children && <p className="ui-empty-body">{children}</p>}
  </div>
);

export default EmptyState;
