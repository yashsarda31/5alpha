# Magical Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Cosmic Glass Overlay reskin in `alpha-nova-next/` with EMA/RSI/Bollinger overlays, keeping all routes and APIs unchanged.

**Architecture:** Single fixed Three.js canvas behind the existing shell plus GSAP entrances and count-ups; frontend-computed EMA/BB from `/api/chart` closes; auto-degrade to CSS gradient on failure or low fps.

**Tech Stack:** React 19 + Vite 8 + TypeScript, three 0.166.1, gsap 3.12.5, lightweight-charts 5, node --test.

## Global Constraints

- Work only in `alpha-nova-next/src/`. Do not touch `web/`, `api/`, routes, or API payloads.
- No new network requests. Indicators compute client-side from existing `close[]`.
- Canvas is `position fixed`, `z-index 0`, `pointer-events none`; content stays above at `z-index 1`.
- Motion off when `prefers-reduced-motion`, tab hidden, or WebGL/GSAP failure.
- Tables and charts keep solid backgrounds for readability.
- Every task ends with a commit. No TBD/TODO placeholders.
- Feature flag `VITE_MAGIC=off` renders legacy shell with zero magic code paths.

---

### Task 1: Indicator math library (EMA + Bollinger)

**Files:**
- Create: `alpha-nova-next/src/lib/indicators.ts`
- Create: `alpha-nova-next/tests/indicators.test.mjs`

**Interfaces:**
- Consumes: nothing (pure math on `close[]`).
- Produces: `ema(values, period)`, `bollinger(values, period, mult)` used by Task 5.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, bollinger } from '../src/lib/indicators.ts';
```

> NOTE: Node cannot import TS directly. Test file imports the compiled-equivalent JS implementation. To keep `npm test` green without a TS loader, implement `indicators.ts` in plain-JS-compatible TypeScript (no enums, no advanced syntax) and mirror logic in the test via a `.mjs` loader-free copy. Simpler approved approach below: write `src/lib/indicators.js` (plain JS + JSDoc) instead of `.ts` so both Vite and node --test import it directly. File path becomes `alpha-nova-next/src/lib/indicators.js`.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ema, bollinger } from '../src/lib/indicators.js';

const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

test('ema seeds with SMA and tracks upward trend', () => {
  const out = ema(closes, 5);
  assert.equal(out.length, closes.length);
  assert.equal(out[0], null);
  assert.equal(out[3], null);
  assert.ok(out.at(-1) > out.at(-2));
});

test('ema returns nulls when history is insufficient', () => {
  assert.deepEqual(ema([1, 2], 5), [null, null]);
  assert.deepEqual(ema([], 5), []);
});

test('bollinger middle equals SMA20 and bands widen with volatility', () => {
  const flat = Array(20).fill(100);
  const b = bollinger(flat, 20, 2);
  assert.equal(b.middle.at(-1), 100);
  assert.equal(b.upper.at(-1), 100);
  assert.equal(b.lower.at(-1), 100);
  const volatile = [...Array(19).fill(100), 200];
  const b2 = bollinger(volatile, 20, 2);
  assert.ok(b2.upper.at(-1) > b2.middle.at(-1));
  assert.ok(b2.lower.at(-1) < b2.middle.at(-1));
});

test('bollinger guards short history with nulls', () => {
  const b = bollinger([1, 2, 3], 20, 2);
  assert.deepEqual(b.middle, [null, null, null]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd alpha-nova-next && node --test tests/indicators.test.mjs`
Expected: FAIL with "Cannot find module '../src/lib/indicators.js'"

- [ ] **Step 3: Write minimal implementation**

```js
// alpha-nova-next/src/lib/indicators.js
// Pure price math. No DOM, no network. Null = insufficient history.

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length < period || period < 1) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) return out;
    seed += v;
  }
  const k = 2 / (period + 1);
  let prev = seed / period;
  out[period - 1] = round2(prev);
  for (let i = period; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { out[i] = null; continue; }
    prev = v * k + prev * (1 - k);
    out[i] = round2(prev);
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const middle = new Array(values.length).fill(null);
  const upper = new Array(values.length).fill(null);
  const lower = new Array(values.length).fill(null);
  if (!Array.isArray(values) || period < 1) return { middle, upper, lower };
  for (let i = period - 1; i < values.length; i++) {
    const window = values.slice(i - period + 1, i + 1);
    if (!window.every(Number.isFinite)) continue;
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    middle[i] = round2(mean);
    upper[i] = round2(mean + mult * sd);
    lower[i] = round2(mean - mult * sd);
  }
  return { middle, upper, lower };
}

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd alpha-nova-next && node --test tests/indicators.test.mjs`
Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add alpha-nova-next/src/lib/indicators.js alpha-nova-next/tests/indicators.test.mjs
git commit -m "feat(chart): add EMA and Bollinger frontend indicator math"
```

### Task 2: Magic quality governor (auto-degrade brain)

**Files:**
- Create: `alpha-nova-next/src/magic/qualityGovernor.js`
- Create: `alpha-nova-next/tests/qualityGovernor.test.mjs`

**Interfaces:**
- Consumes: fps samples, WebGL support flag, mobile flag (all primitives).
- Produces: `nextQuality(fps, current)`, `particleCountFor(level, isMobile)`, `shouldUseMagic(env)` used by Task 3.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextQuality, particleCountFor, shouldUseMagic } from '../src/magic/qualityGovernor.js';

test('low fps degrades full to reduced to static', () => {
  assert.equal(nextQuality(20, 'full'), 'reduced');
  assert.equal(nextQuality(20, 'reduced'), 'static');
  assert.equal(nextQuality(20, 'static'), 'static');
});

test('high fps never upgrades automatically', () => {
  assert.equal(nextQuality(60, 'reduced'), 'reduced');
  assert.equal(nextQuality(60, 'full'), 'full');
});

test('particle budgets respect level and mobile', () => {
  assert.equal(particleCountFor('full', false), 900);
  assert.equal(particleCountFor('reduced', false), 450);
  assert.equal(particleCountFor('static', false), 0);
  assert.equal(particleCountFor('full', true), 350);
});

test('magic disables on flag, no WebGL, or reduced motion', () => {
  assert.equal(shouldUseMagic({ flag: 'off', webgl: true, reducedMotion: false }), false);
  assert.equal(shouldUseMagic({ flag: 'on', webgl: false, reducedMotion: false }), false);
  assert.equal(shouldUseMagic({ flag: 'on', webgl: true, reducedMotion: true }), false);
  assert.equal(shouldUseMagic({ flag: 'on', webgl: true, reducedMotion: false }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd alpha-nova-next && node --test tests/qualityGovernor.test.mjs`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```js
// alpha-nova-next/src/magic/qualityGovernor.js
export function nextQuality(fps, current) {
  if (current === 'static') return 'static';
  if (fps < 30) return current === 'full' ? 'reduced' : 'static';
  return current;
}

export function particleCountFor(level, isMobile) {
  if (level === 'static') return 0;
  if (level === 'reduced') return isMobile ? 180 : 450;
  return isMobile ? 350 : 900;
}

export function shouldUseMagic({ flag, webgl, reducedMotion }) {
  if (String(flag).toLowerCase() === 'off') return false;
  if (!webgl) return false;
  if (reducedMotion) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd alpha-nova-next && node --test tests/qualityGovernor.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add alpha-nova-next/src/magic/qualityGovernor.js alpha-nova-next/tests/qualityGovernor.test.mjs
git commit -m "feat(magic): add quality governor with auto-degrade"
```

### Task 3: MagicCanvas + CSS + App shell integration

**Files:**
- Create: `alpha-nova-next/src/magic/MagicCanvas.jsx`
- Create: `alpha-nova-next/src/magic/magic.css`
- Create: `alpha-nova-next/src/magic/MagicErrorBoundary.jsx`
- Modify: `alpha-nova-next/src/App.tsx` (mount canvas + boundary, wrap main in PageTransition from Task 4 — mount point only here)
- Modify: `alpha-nova-next/src/main.tsx` (import `./magic/magic.css`)

**Interfaces:**
- Consumes: `shouldUseMagic`, `particleCountFor`, `nextQuality` from Task 2.
- Produces: `<MagicCanvas/>` mounted once in `Shell`; `.magic-canvas` CSS class.

- [ ] **Step 1: Create magic.css**

```css
.magic-canvas{position:fixed;inset:0;z-index:0;pointer-events:none;opacity:.85}
.magic-fallback{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 90% 45% at 50% -8%,rgba(228,197,139,.08),transparent 60%),radial-gradient(circle at 15% 50%,rgba(228,197,139,.05),transparent 50%),radial-gradient(circle at 85% 30%,rgba(139,226,223,.06),transparent 50%),#0b0e11}
.an-app{position:relative;z-index:1}
@media (prefers-reduced-motion:reduce){.magic-canvas{display:none}}
```

- [ ] **Step 2: Create MagicErrorBoundary.jsx**

```jsx
import { Component } from 'react';
export default class MagicErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="magic-fallback" aria-hidden="true" /> : this.props.children; }
}
```

- [ ] **Step 3: Create MagicCanvas.jsx**

```jsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { nextQuality, particleCountFor, shouldUseMagic } from './qualityGovernor.js';

export default function MagicCanvas() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let webgl = true;
    try {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      webgl = !!gl;
    } catch { webgl = false; }
    if (!shouldUseMagic({ flag: import.meta.env.VITE_MAGIC ?? 'on', webgl, reducedMotion })) {
      canvas.parentElement?.classList.add('magic-fallback');
      return undefined;
    }
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.z = 8;
    const isMobile = window.matchMedia?.('(max-width: 760px)').matches ?? false;
    let level = 'full';
    let count = particleCountFor(level, isMobile);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const gold = new THREE.Color('#e4c58b');
    const ice = new THREE.Color('#8be2df');
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      const c = Math.random() > 0.5 ? gold : ice;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize);
    let mx = 0; let my = 0;
    const onMove = (e) => { mx = (e.clientX / window.innerWidth - 0.5) * 0.6; my = (e.clientY / window.innerHeight - 0.5) * -0.4; };
    if (!isMobile) window.addEventListener('pointermove', onMove);
    let raf = 0; let last = performance.now(); let frames = 0; let lowSince = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) { last = now; return; }
      frames += 1;
      if (now - last >= 1000) {
        const fps = (frames * 1000) / (now - last);
        frames = 0; last = now;
        const next = nextQuality(fps, level);
        if (next !== level) {
          level = next;
          if (level === 'static') { cancelAnimationFrame(raf); canvas.style.display = 'none'; return; }
          points.geometry.dispose();
          const n = particleCountFor(level, isMobile);
          const g2 = new THREE.BufferGeometry();
          g2.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, n * 3), 3));
          g2.setAttribute('color', new THREE.BufferAttribute(col.slice(0, n * 3), 3));
          points.geometry = g2;
        }
        if (fps < 30) lowSince += 1; else lowSince = 0;
      }
      points.rotation.y += 0.0006;
      points.rotation.x += (my * 0.3 - points.rotation.x) * 0.02;
      points.rotation.y += (mx * 0.3) * 0.01;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); geo.dispose(); mat.dispose(); renderer.dispose(); };
  }, []);
  return <canvas ref={ref} className="magic-canvas" aria-hidden="true" />;
}
```

- [ ] **Step 4: Wire into App.tsx + main.tsx**

In `src/main.tsx`, add after `./styles.css` import:
```ts
import './magic/magic.css';
```

In `src/App.tsx`, add imports:
```tsx
import MagicCanvas from './magic/MagicCanvas';
import MagicErrorBoundary from './magic/MagicErrorBoundary';
```

Inside `Shell` return, directly under `<div className="an-app">`, insert:
```tsx
<MagicErrorBoundary><MagicCanvas /></MagicErrorBoundary>
```

- [ ] **Step 5: Verify shell still builds**

Run: `cd alpha-nova-next && npx tsc --noEmit`
Expected: PASS with no errors.

Run: `cd alpha-nova-next && npm run build`
Expected: `dist/` emitted successfully.

- [ ] **Step 6: Commit**

```bash
git add alpha-nova-next/src/magic/MagicCanvas.jsx alpha-nova-next/src/magic/MagicErrorBoundary.jsx alpha-nova-next/src/magic/magic.css alpha-nova-next/src/App.tsx alpha-nova-next/src/main.tsx
git commit -m "feat(magic): add nebula canvas shell with safe fallback"
```

### Task 4: GSAP transitions + count-up juice

**Files:**
- Create: `alpha-nova-next/src/magic/PageTransition.jsx`
- Create: `alpha-nova-next/src/magic/useCountUp.js`
- Modify: `alpha-nova-next/src/App.tsx` (wrap `<PageBoundary>` in `<PageTransition/>`)
- Modify: none other (hook ships unused-ready; wiring into Today stats is deferred to avoid touching unknown hero markup)

**Interfaces:**
- Consumes: route path from `useLocation` (already in App).
- Produces: `<PageTransition>` wrapper; `useCountUp(target)` hook returning display string.

- [ ] **Step 1: Create PageTransition.jsx**

```jsx
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export default function PageTransition({ children }) {
  const ref = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    import('gsap').then(({ gsap }) => {
      if (cancelled) return;
      gsap.fromTo(el, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', overwrite: true });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);
  return <div ref={ref}>{children}</div>;
}
```

- [ ] **Step 2: Create useCountUp.js**

```js
import { useEffect, useState } from 'react';

export function useCountUp(target, duration = 800) {
  const numeric = Number(target);
  const [display, setDisplay] = useState(() => (Number.isFinite(numeric) ? numeric : target));
  useEffect(() => {
    if (!Number.isFinite(numeric)) { setDisplay(target); return; }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setDisplay(numeric); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(numeric * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(numeric);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [numeric, duration, target]);
  return display;
}
```

- [ ] **Step 3: Wire PageTransition in App.tsx**

Wrap the `<main id="main-content">` children (Routes block) — minimal edit: import PageTransition and wrap `<PageBoundary>`:
```tsx
import PageTransition from './magic/PageTransition';
...
<PageTransition><PageBoundary key={location.pathname}>...</PageBoundary></PageTransition>
```

- [ ] **Step 4: Verify**

Run: `cd alpha-nova-next && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add alpha-nova-next/src/magic/PageTransition.jsx alpha-nova-next/src/magic/useCountUp.js alpha-nova-next/src/App.tsx
git commit -m "feat(magic): add GSAP page transitions and count-up hook"
```

### Task 5: Chart overlays — EMA20/EMA50/Bollinger/RSI + toggles

**Files:**
- Modify: `alpha-nova-next/src/legacy/components/TradingViewChart.jsx` (add overlay series + `overlays` prop)
- Modify: `alpha-nova-next/src/legacy/pages/Chart.jsx` (OWNS toggles + computation from its own `chartData.close`; forwards `overlays` to TradingViewChart)
- Modify: `alpha-nova-next/src/pages/Analyse.tsx` (snapshot metrics only: latest EMA20/EMA50/BB values via same lib on `validChart.close`; no toggle state here to avoid dual sources of truth)

**Interfaces:**
- Consumes: `ema`, `bollinger` from Task 1; `close[]`, `dates[]`, API `rsi`, `sma20` already in `ChartResponse`.
- Produces: visible toggles `[EMA20] [EMA50] [BB] [RSI]`, legend values, snapshot metrics.

- [ ] **Step 1: Extend TradingViewChart.jsx with overlay props**

Props: `{ data, intraday, overlays }` where `overlays = { ema20, ema50, bbUpper, bbLower, showEma20, showEma50, showBb, showRsi }`.
After the existing SMA20 block, add:

```jsx
const lineFor = (values, color, width = 1, dashed = false) => {
  const s = chart.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, ...(dashed ? { lineStyle: 2 } : {}) });
  s.setData(data.dates.flatMap((date, i) => Number.isFinite(values?.[i]) ? [{ time: time(date), value: values[i] }] : []));
};
if (!intraday && overlays?.showEma20 && overlays?.ema20) lineFor(overlays.ema20, '#e4c58b', 2);
if (!intraday && overlays?.showEma50 && overlays?.ema50) lineFor(overlays.ema50, '#8be2df', 2);
if (!intraday && overlays?.showBb && overlays?.bbUpper) lineFor(overlays.bbUpper, '#5b6b76', 1, true);
if (!intraday && overlays?.showBb && overlays?.bbLower) lineFor(overlays.bbLower, '#5b6b76', 1, true);
if (!intraday && overlays?.showRsi && data.rsi) {
  const rsi = chart.addSeries(LineSeries, { color: '#b48ce8', lineWidth: 1, priceScaleId: 'rsi', priceLineVisible: false, lastValueVisible: false });
  chart.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  rsi.setData(data.dates.flatMap((date, i) => Number.isFinite(data.rsi[i]) ? [{ time: time(date), value: data.rsi[i] }] : []));
}
```

Add `overlays` to the effect dependency array.

- [ ] **Step 2: Extend Analyse.tsx**

Add import:
```tsx
import { ema, bollinger } from '../lib/indicators.js';
```

Inside component after `validChart` memo, add snapshot-only values (no toggles here):
```tsx
const ema20Snap = useMemo(() => (validChart ? ema(validChart.close, 20).at(-1) ?? null : null), [validChart]);
const ema50Snap = useMemo(() => (validChart ? ema(validChart.close, 50).at(-1) ?? null : null), [validChart]);
const bbSnap = useMemo(() => (validChart ? bollinger(validChart.close, 20, 2) : null), [validChart]);
```
Render two extra `<Metric>` rows in the Technical snapshot panel: `EMA · 20` and `BB · 20 (upper/middle/lower)` showing `Unavailable` when null. Toggles live in LegacyChart (below).

Pass to LegacyChart (unchanged — LegacyChart owns its own fetch + overlays, single source of truth for toggle state):
```tsx
<Suspense fallback={<Loading label="Loading chart" />}><LegacyChart embedded intradayData={intraday.error ? null : intradayChart} /></Suspense>
```

- [ ] **Step 3: Extend legacy/pages/Chart.jsx (toggles live here)**

Add at top:
```jsx
import { ema, bollinger } from '../../lib/indicators.js';
```
Inside the component after `chartData` state:
```jsx
const [showEma20, setShowEma20] = useState(true);
const [showEma50, setShowEma50] = useState(false);
const [showBb, setShowBb] = useState(true);
const [showRsi, setShowRsi] = useState(true);
const ema20 = chartData ? ema(chartData.close, 20) : null;
const ema50 = chartData ? ema(chartData.close, 50) : null;
const bb = chartData ? bollinger(chartData.close, 20, 2) : null;
```
Render toggle chips above the chart and forward at every existing `<TradingViewChart` call site:
```jsx
<TradingViewChart data={chartData} overlays={{ ema20, ema50, bbUpper: bb?.upper, bbLower: bb?.lower, showEma20, showEma50, showBb, showRsi }} />
```

- [ ] **Step 4: Verify chart page**

Run: `cd alpha-nova-next && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add alpha-nova-next/src/legacy/components/TradingViewChart.jsx alpha-nova-next/src/legacy/pages/Chart.jsx alpha-nova-next/src/pages/Analyse.tsx
git commit -m "feat(chart): add EMA20 EMA50 Bollinger RSI overlays with toggles"
```

### Task 6: Verify — errors, speed, readability

**Files:**
- Modify: nothing (verification only).

- [ ] **Step 1: Typecheck**

Run: `cd alpha-nova-next && npx tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 2: Unit tests**

Run: `cd alpha-nova-next && npm test`
Expected: all suites pass including `tests/indicators.test.mjs` and `tests/qualityGovernor.test.mjs`.

- [ ] **Step 3: Lint changed files**

Run: `cd alpha-nova-next && npx eslint src/magic/ src/lib/indicators.js src/legacy/components/TradingViewChart.jsx src/pages/Analyse.tsx`
Expected: no errors (warnings acceptable if pre-existing).

- [ ] **Step 4: Production build + bundle check**

Run: `cd alpha-nova-next && npm run build`
Expected: `dist/` emitted. Record total JS size vs pre-change baseline via `Get-ChildItem dist/assets/*.js | Measure-Object Length -Sum`.

- [ ] **Step 5: Manual smoke (dev server)**

Run: `cd alpha-nova-next && npm run dev`
Expected: Dashboard loads with nebula behind glass, no console errors; Analyse shows EMA20/BB/RSI toggles; `VITE_MAGIC=off` hides canvas; blocked WebGL (devtools sensor) falls back to gradient.

- [ ] **Step 6: Commit verification note (only if fixes were needed)**

If fixes were required, commit them separately:
```bash
git add -A
git commit -m "fix(magic): verification fixes for errors and speed"
```
