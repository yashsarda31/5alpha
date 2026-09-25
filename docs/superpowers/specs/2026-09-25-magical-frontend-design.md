# Magical Frontend Reskin — Design (Cosmic Glass Overlay)

Date: 2026-09-25
Scope: Full reskin of `alpha-nova-next/` (live deploy target). No route, API, or data-logic changes.
Vibe: Fancy but readable. Max magic with auto-degrade. Juice-only addiction (no gamification).

## 1. Architecture
- Work only in `alpha-nova-next/src/`. `web/` untouched (legacy).
- New `src/magic/` layer:
  - `MagicCanvas.tsx` — single fixed Three.js canvas (`z-index 0`, `pointer-events none`) rendering nebula particle field (gold `#F5DC8C` + ice `#3EE6FF`, additive blending, slow drift + mouse parallax).
  - `qualityGovernor.ts` — caps `pixelRatio <= 1.5`, samples fps; if low for 2s halve particles, then fall back to CSS gradient. WebGL failure → CSS gradient immediately.
  - `PageTransition.tsx` — GSAP route fade-up wrapper. Reduced-motion or GSAP failure → instant render.
  - `useCountUp.ts` — GSAP-free rAF count-up for stat numbers.
- Content layer stays at `z-index 1` in existing frosted-glass cards. Canvas never intercepts input. Error boundary isolates magic so a crash cannot blank the terminal.
- Motion off when `prefers-reduced-motion`, tab hidden (pause rAF), or touch-only (no parallax).

## 2. Components / visual system
- Tokens reused: `--primary-gold`, `--primary-accent`, existing glass surfaces. No new palette.
- Entrances: route fade-up 0.35s, staggered card entrance 0.05s stagger, glow pulse on fresh signals (CSS + GSAP, transform/opacity only).
- Numbers: count-up on Dashboard hero stats and Analyse quote; respects reduced motion (final value instantly).
- Tables/charts keep solid backgrounds for contrast. Magic stays in background + entrances, never behind body text.
- Mobile: same shell; particles reduced by default; tab bar untouched.

## 3. Data flow
- Zero API changes. All fetchers/contexts (`Auth`, `Market`, `Watchlist`, `Prediction`, `useResource`) unchanged.
- Magic reads only: current route (transition trigger) and optional signal count (pulse intensity). No new requests or stores.
- Chart indicators (new, see §6) computed client-side from `close` series already in `/api/chart` payload.

## 4. Error handling
- WebGL fail → CSS gradient fallback, silent (no toast).
- GSAP import fail → skip animations, render content.
- Low fps → degrade steps: 100% → 50% particles → static gradient.
- Canvas wrapped in error boundary; failure never blocks content or navigation.
- `prefers-reduced-motion: reduce` → all animation off (CSS + JS checks).

## 5. Testing (errors + speed)
- Must pass: `tsc --noEmit`, `vite build`, `eslint`, existing `node --test` suite.
- Error checks: zero console errors on Dashboard / Signals / Analyse; WebGL-off renders; GSAP-off renders; blocked-CDN still usable (three/gsap are bundled, not CDN).
- Speed checks: record bundle delta vs baseline; fps sample desktop + 360px mobile; verify auto-degrade triggers; verify tables/charts opaque and WCAG-AA text contrast preserved.
- Rollback: feature-flag `VITE_MAGIC=off` renders legacy shell with zero magic code paths.

## 6. Chart indicators addendum (user request 2026-09-25)
- Status quo: `/api/chart` returns `sma20/50/200` + `rsi` only. No EMA or Bollinger Bands.
- Change (frontend-only, no backend change): on Analyse/LegacyChart, compute from `close[]`:
  - `EMA20`, `EMA50` (standard k=2/(n+1), seeded with SMA).
  - Bollinger Bands `BB20` (SMA20 ± 2σ, σ = population std of last 20 closes).
  - Keep API `RSI14` as-is; show RSI panel with 30/70 guides.
- UI: toggle chips `[EMA20] [EMA50] [BB] [RSI]` default ON for EMA20 + BB; legend with current values; missing/insufficient history shows `Unavailable`, never fake values.
- Tests: unit test EMA/BB math on fixture series; verify null-guard when <20 closes.
