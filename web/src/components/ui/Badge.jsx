import React from 'react';

// Pill badge with a currentColor border. tone sets the color role.
const Badge = ({ tone = 'accent', children, style }) => (
  <span className={`ui-badge tone-${tone}`} style={style}>{children}</span>
);

export default Badge;
