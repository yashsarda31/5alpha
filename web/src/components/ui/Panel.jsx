import React from 'react';

// Generic glass card container. Replaces ad-hoc .card / .panel usages.
const Panel = ({ children, className = '', padding, style, ...rest }) => (
  <div
    className={`ui-panel ${className}`}
    style={{ ...(padding !== undefined ? { padding } : {}), ...style }}
    {...rest}
  >
    {children}
  </div>
);

export default Panel;
