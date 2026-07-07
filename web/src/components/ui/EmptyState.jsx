import React from 'react';

// Standardized empty state for tables/lists that returned nothing.
// No default icon — emoji-free unless a caller explicitly passes one.
const EmptyState = ({ icon, title, children }) => (
  <div className="ui-empty">
    {icon && <div className="ui-empty-icon" aria-hidden="true">{icon}</div>}
    {title && <div className="ui-empty-title">{title}</div>}
    {children && <p className="ui-empty-body">{children}</p>}
  </div>
);

export default EmptyState;
