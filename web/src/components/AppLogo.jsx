import React from 'react';

// The Geometric Nova — Alpha Nova's mark: an elongated chrome crystal fractured
// by a glowing 4-point nova star. Inline SVG (no network fetch); geometry is the
// same source as /favicon.svg (scratch gen_nova_logo.py) — keep them in sync.
// Gradient ids are namespaced per instance so several marks can share a page.
const APEX = [48, 0], LEFT = [24, 49.92], RIGHT = [72, 49.92], BOTTOM = [48, 96], CTR = [48, 50.88];
const FACETS = [
  [[APEX, LEFT, CTR], '#FFFFFF', '#C2C6D3'],
  [[APEX, RIGHT, CTR], '#E8EBF2', '#9FA4B5'],
  [[LEFT, BOTTOM, CTR], '#CED2DE', '#83889A'],
  [[RIGHT, BOTTOM, CTR], '#B2B6C4', '#65697B'],
];
const EDGES = [[APEX, LEFT], [APEX, RIGHT], [LEFT, BOTTOM], [RIGHT, BOTTOM],
  [APEX, CTR], [CTR, BOTTOM], [LEFT, CTR], [RIGHT, CTR]];
const STAR = [[48, 28.8], [51.26, 46.56], [65.76, 50.88], [51.26, 55.2],
  [48, 74.88], [44.74, 55.2], [30.24, 50.88], [44.74, 46.56]];
const pts = (poly) => poly.map((p) => p.join(',')).join(' ');

const AppLogo = ({ size = 20, style }) => {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" style={style} aria-hidden="true">
      <defs>
        {FACETS.map(([, c0, c1], i) => (
          <linearGradient key={i} id={`an${uid}g${i}`} gradientUnits="userSpaceOnUse" x1="14.4" y1="1.9" x2="82.6" y2="97.9">
            <stop offset="0" stopColor={c0} />
            <stop offset="1" stopColor={c1} />
          </linearGradient>
        ))}
        <radialGradient id={`an${uid}glow`} cx="0.5" cy="0.53" r="0.42">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#FFB020" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFB020" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="9.6" y="13.4" width="76.8" height="76.8" fill={`url(#an${uid}glow)`} />
      {FACETS.map(([tri], i) => (
        <polygon key={i} points={pts(tri)} fill={`url(#an${uid}g${i})`} />
      ))}
      {EDGES.map(([a, b], i) => (
        <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#FFFFFF"
          strokeWidth="0.7" strokeOpacity="0.85" strokeLinecap="round" />
      ))}
      <polygon points={pts(STAR)} fill="#FFF6DD" />
      <circle cx="48" cy="50.88" r="2.69" fill="#FFFFFF" />
    </svg>
  );
};

export default AppLogo;
