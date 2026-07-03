# Implementation Plan — Glass Terminal Design System

**Spec:** [docs/superpowers/specs/2026-07-04-glass-terminal-design-system-design.md](../specs/2026-07-04-glass-terminal-design-system-design.md)
**Date:** 2026-07-04

## Strategy

Incremental, verify-as-you-go. Build the foundation, convert the highest-visibility page (Dashboard) to prove the kit end-to-end, then roll the medium then light pages, then a global contrast/mobile audit. **Every phase ends with: `npm run lint` + `npm run build` clean → visual verification in the browser preview at 1440px and 375px → commit.** Backend is never touched; the 30 existing tests are a sanity gate only.

Each phase is independently shippable. Deploy to Vercel after Phase 2 (optional checkpoint) and after Phase 4 (final).

---

## Phase 0 — Prep

- Start the preview server; capture baseline screenshots of Dashboard, Market Signals, Option Chain, Screener (for before/after reference).
- Confirm current build + lint are clean before changing anything.

## Phase 1 — Foundations (tokens + component kit)

**Tokens — `web/src/index.css` `:root`:**
- `--text-secondary: #A1A1AA` (raise from `#86868B`), add `--text-tertiary: #6B6B75`.
- `--font-mono: 'SF Mono', ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace`.
- Radius: `--r-sm: 8px`, `--r-tile: 12px`, `--r-card: 16px`, `--r-pill: 20px`.
- Surfaces: `--surface-tile`, `--surface-panel`, `--border-subtle`, `--border-hairline`.
- Utility: `.tnum { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }`.

**Component kit — new `web/src/components/ui/`:**
- `PageHeader.jsx` — `{ code, title, subtitle, right? }`.
- `SectionTitle.jsx` — `{ icon?, children }`.
- `StatTile.jsx` + `StatGrid.jsx` — `{ label, value, tone, sub? }`; tone → color role.
- `Panel.jsx` — `{ padding?, className, children }`.
- `DataTable.jsx` — `{ columns, rows, sortKey?, sortDir?, onSort?, loading?, empty? }`.
- `Badge.jsx` — `{ tone, children }`.
- `StatusPill.jsx` — `{ open, note? }`.
- `EmptyState.jsx`, `Skeleton.jsx`.
- `ui.css` (kit styles) + `index.js` barrel export.

**Verify:** build + lint clean; mount `PageHeader` on one page (e.g. Learn) as a smoke test; no route breaks. **Commit:** "Add Glass Terminal token foundations + shared UI kit".

## Phase 2 — Dashboard conversion (heavy)

- Rewrite `Dashboard.jsx` using `PageHeader` (code `DASH`) + `StatusPill` + `Panel` + `DataTable` (macro indices) + `StatTile`/tiles (movers) + module launcher cards restyled via `Panel`.
- Delete the `bbg-*` terminal rules from `Dashboard.css`; keep only layout not covered by the kit.
- Grep for any remaining `bbg-` usage; remove orphans.
- **Verify:** desktop + 375px; market-open pill correct; `preview_inspect` contrast on title/secondary/table cells; no overflow. **Commit:** "Convert Dashboard to Glass Terminal".

## Phase 3 — Medium pages (data-heavy glass)

For each: header → `PageHeader`; metric boxes → `StatTile`/`StatGrid`; apply `.tnum`; empty/loading → kit; contrast fixes.

- **Market Signals** — regime cards → `StatTile`/`Panel`; buildup + setups tables → `DataTable`; keep `StatusPill`.
- **Focus List** — context strip via `Panel`; reason chips via `Badge`.
- **Option Chain** — its two-sided CE│STRIKE│PE matrix is bespoke; **do not force into `DataTable`** — instead restyle in place with the tokens (mono `.tnum`, uppercase micro-headers, `--surface-panel`, contrast). Metric boxes → `StatTile`.
- **Quant Screener** — results table → `DataTable` (map its existing sort onto the `onSort` API); guru chips → `Badge`; keep universe/filter logic.
- **Momentum**, **FII/DII** — tables → `DataTable`.
- **Fundamentals** — metric groups → `StatTile`/`StatGrid`.
- **DCF** — inputs stay; the light summary rows become dark glass rows with gold `.tnum` values (removes the off-language light-on-dark blocks); gauge untouched.

**Verify** each at desktop + 375px (contrast + overflow). **Commit** in 1–2 batches, e.g. "Adopt UI kit across signals/focus/option-chain/screener" then "…momentum/fiidii/fundamentals/dcf".

## Phase 4 — Light pages + global audit

- **Chart, Druck & Minervini, SARIMAX** — wrap with `PageHeader` + `Panel`; **leave Plotly configs untouched**; verify charts still render/resize.
- **Position Sizing, News, Learn, Discipline Arena** — `PageHeader` + `Panel`/`StatTile` where relevant.
- **Global sweep:** walk all 16 routes at 1440px + 375px; `preview_inspect` representative text nodes; fix any sub-AA or dark-on-dark stragglers; confirm no horizontal overflow anywhere.
- Full `lint` + `build`; run `pytest api/` (sanity, expect 30 passing).
- **Commit:** "Adopt UI kit across remaining pages + global contrast audit". Deploy to Vercel (`npx vercel --prod`) and push to `main`.

---

## Per-page verification checklist

- [ ] Header rendered via `PageHeader` (mono code chip + title + subtitle).
- [ ] All figures use `.tnum` and align in columns.
- [ ] Secondary text = `--text-secondary` (#A1A1AA); **no dark-on-dark** (`preview_inspect`).
- [ ] Cards/tables use kit components (`Panel` / `DataTable` / `StatTile`).
- [ ] Loading + empty states via `Skeleton` / `EmptyState`.
- [ ] No horizontal overflow at 375px; drawer nav intact.

## Risks (from spec) to watch during build

- Orphaned `bbg-*` styles after Dashboard rewrite — remove in the same change.
- Plotly theming — wrap only, never touch chart internals.
- Option Chain matrix — restyle in place, don't shoehorn into `DataTable`.
- Mobile drawer / 16px inputs — preserve; re-verify per page.

## Commit map

1. Foundations + kit
2. Dashboard
3. Medium pages (×1–2 commits)
4. Light pages + global audit → deploy + push
