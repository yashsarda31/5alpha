import React, { useId } from 'react';

// Concrete hex only — never CSS vars inside SVG paint (theme values).
const GAIN = '#32D74B';
const LOSS = '#FF453A';

/**
 * Shared inline-SVG sparkline (Dashboard tiles, Watchlist rows, Arena mood).
 * Fluid by default (viewBox + width:100% + height:auto per the fluid-SVG rule);
 * pass `fixed` for table cells that live inside a fixed-width wrapper.
 * Renders nothing with fewer than 2 finite values — spark data is always
 * treated as a progressive enhancement.
 */
const Sparkline = ({
  values,
  width = 120,
  height = 36,
  stroke,           // concrete hex; defaults to gain/loss by direction
  area = true,      // soft gradient fill under the line
  strokeWidth = 1.5,
  fixed = false,    // fixed pixel size (table cells) instead of fluid
  stretch = false,  // fill the parent box, ignoring aspect (tile backgrounds)
  className,
  style,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const vals = (values || []).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return null;

  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const range = hi - lo || 1;
  const px = (i) => (i / (vals.length - 1)) * (width - 2) + 1;
  const py = (v) => height - 2 - ((v - lo) / range) * (height - 4);
  const line = vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  const areaPath = `${line} L${px(vals.length - 1).toFixed(1)},${height - 1} L1,${height - 1} Z`;
  const color = stroke || (vals[vals.length - 1] >= vals[0] ? GAIN : LOSS);
  const gid = `spk-${uid}`;

  const sizing = stretch
    ? { display: 'block', width: '100%', height: '100%' }
    : fixed
      ? { display: 'block', width, height }
      : { display: 'block', width: '100%', maxWidth: width, height: 'auto' };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'}
      className={className}
      style={{ ...sizing, ...style }}
      aria-hidden="true"
    >
      {area && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {area && <path d={areaPath} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export default Sparkline;
