import React from 'react';

// Alpha Nova's mark — the supplied artwork, used as is.
// Master lives at web/public/brand/alpha-nova-logo.jpg; /icons/mark-v4.png is
// the 128px render of it (2x/3x headroom for the sizes we draw here).
// Bump the -vN suffix on the asset whenever the artwork changes, so installed
// PWAs and cached tabs pick it up.
const AppLogo = ({ size = 20, style }) => (
  <img
    src="/icons/mark-v4.png"
    alt=""
    aria-hidden="true"
    width={size}
    height={size}
    style={{ borderRadius: Math.round(size * 0.22), display: 'block', flexShrink: 0, ...style }}
  />
);

export default AppLogo;
