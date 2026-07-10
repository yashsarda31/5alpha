# Premium Polish Pass — Design

**Date:** 2026-07-10
**Goal:** Make Alpha Nova read as a premium, top-tier terminal ("private-bank terminal" direction: restraint, depth, typographic signature) without changing any layout, feature, or the core palette (Plotly configs hardcode the hex values — palette must stay).

## Approach

Token/kit-level pass — all 20+ pages inherit from `index.css` tokens and the
shared UI kit (`components/ui/ui.css`), so the change surface stays small:

1. **Typographic signature** — self-evident premium marker. Load *Space Grotesk*
   (500/700, latin, `display=swap`, preconnected) from Google Fonts in
   `index.html`; expose as `--font-display`. Applied to: brand wordmark, page
   titles (`.ui-ph-title`), `h1–h4`, stat values keep mono for numbers.
2. **Layered depth** — cards/panels get a gradient surface, an inset top
   highlight hairline, and a two-layer shadow; body mesh gains a faint gold
   top-glow. Elevation tokens: `--shadow-card`, `--shadow-raised`, `--inset-hl`.
3. **Restraint on color** — mover tiles' green/red washes softened (10%→6%),
   cyan scrollbars → neutral white, section titles slightly desaturated.
4. **Microinteractions** — buttons: gold gradient + lift (no scale), live
   status dot pulses (collapsed by `prefers-reduced-motion`), nav links get a
   dot-accent active pill, hover transitions unified at 0.18s ease.
5. **Chrome polish** — sidebar brand block (classes replace inline styles,
   "PRO TERMINAL" chip), refined login card (gradient border ring, bigger
   glow), quieter disclaimer/guest banner.

## Non-goals / constraints

- No palette hue changes (`--primary-gold #F5DC8C`, `--primary-accent #3EE6FF`,
  gain/loss) — Plotly layouts across Chart/Arima/Druck/Sectors hardcode them.
- No layout/markup restructuring beyond the sidebar brand block in `App.jsx`.
- `-webkit-backdrop-filter` declared before `backdrop-filter` everywhere
  (rolldown minifier dedup gotcha).
- New grids use `minmax(min(Xpx, 100%), 1fr)`.
- No decorative emojis (user policy).

## Files

`web/index.html`, `web/src/index.css`, `web/src/components/ui/ui.css`,
`web/src/pages/Dashboard.css`, `web/src/App.jsx`, small sweeps of page CSS
where hardcoded values fight the new tokens.

## Verification

`npm run build`, preview at 1440px and 375px across dashboard, signals,
momentum, screener, login; no console errors; glass blur intact post-minify.
