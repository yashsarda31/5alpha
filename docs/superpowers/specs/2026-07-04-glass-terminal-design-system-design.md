# Glass Terminal Design System — UI/UX Unification

**Date:** 2026-07-04
**Status:** Approved design, ready for implementation planning

## Goal

Unify all 16 pages of Alpha Nova onto a single design language — **"Glass Terminal"** — that keeps the premium dark-glass chrome (translucent panels, blur, ice-blue + light-golden accents, rounded corners) but adopts the discipline of a trading terminal for data: monospace **tabular numerals that align in columns**, dense tables, and uppercase micro-labels.

Consistency is enforced **structurally** — by composing every page from a small set of shared React components — not by hoping each page's hand-rolled styles happen to match. Today the app has drifted into two visual languages (the Dashboard is a Bloomberg-style monospace/amber grid; every other page is Apple-glass cards), and each page rolls its own header, cards, and tables.

## Non-goals

- **No functional changes.** No new features, no API/endpoint/business-logic changes. Backend is untouched.
- **No information-architecture / layout redesign.** Pages keep their existing content and block layout. The Dashboard keeps its macro table, movers, and module launcher — it is only re-skinned, not restructured.
- **No navigation restructuring.** The sidebar/drawer nav and its 16 entries stay as-is (that was a separate audit option not selected for this pass).
- **No theme/color change.** The electric-ice-blue + light-golden palette stays; we formalize how it's applied.

## Hard requirements

- **WCAG-AA contrast everywhere.** No text below AA on its surface; **no dark/near-black text on any dark surface**. Dark text is permitted only on deliberately light chips.
- **Numeric alignment.** All figures render in a monospace, `tabular-nums` treatment so columns line up.
- **Mobile parity.** The existing ≤850px drawer navigation, responsive grids, and 16px-input (anti-iOS-zoom) rules are preserved; no new horizontal overflow on any route at 375px.

## Design tokens (foundations)

Added to `web/src/index.css` `:root` (extending the existing theme):

- **Text roles**
  - `--text-primary: #F5F5F7` (~19:1 on dark) — titles, values.
  - `--text-secondary: #A1A1AA` (~7:1, safe at 10px) — body, labels. *(Bumped up from today's `#86868B` for legibility.)*
  - `--text-tertiary: #6B6B75` — throwaway captions only, ≥12px, never for data or labels.
- **Monospace numerals**
  - `--font-mono: 'SF Mono', ui-monospace, 'Cascadia Mono', Menlo, Consolas, monospace`.
  - Utility class `.tnum { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }`.
- **Radius scale:** `--r-sm: 8px`, `--r-tile: 12px`, `--r-card: 16px`, `--r-pill: 20px`.
- **Spacing scale:** 6 / 10 / 12 / 16 / 20 / 24 px (documented convention; used consistently in components).
- **Surfaces:** `--surface-tile: rgba(255,255,255,.04)`, `--surface-panel: rgba(18,18,20,.65)`, `--border-subtle: rgba(255,255,255,.09)`, `--border-hairline: rgba(255,255,255,.05)`.
- **Color roles (existing tokens, formalized usage):** ice-blue `--primary-accent` = labels / interactive / section titles; gold `--primary-gold` = key figures; `--green-gain` / `--red-loss` = gain/loss; `--text-primary` = neutral value.

## Shared component kit

New directory `web/src/components/ui/`, each component small, documented, independently testable, and built purely from the tokens above:

1. **`PageHeader`** — props: `code` (mono chip, e.g. `SIG`), `title`, `subtitle`, `right?` (action/status node). Replaces every page's bespoke header.
2. **`SectionTitle`** — props: `icon?`, children. Uppercase ice-blue section label.
3. **`StatTile`** + **`StatGrid`** — `StatTile` props: `label`, `value`, `tone` (`neutral|gain|loss|gold|accent`), `sub?`. Value renders in `.tnum`. `StatGrid` is the responsive auto-fit wrapper.
4. **`Panel`** — glass card container (radius 16), props: `padding?`, `className`. Generic replacement for today's ad-hoc `.card` / `.panel` usages.
5. **`DataTable`** — props: `columns` (`{key,label,align,render?,sortable?}`), `rows`, `sortKey?`, `sortDir?`, `onSort?`, `loading?`, `empty?`. Renders the standardized glass table: uppercase micro-headers, `.tnum` cells, hairline row separators, optional sticky header; delegates empty/loading to the components below.
6. **`Badge`** — props: `tone`, children (LONG/SHORT, levels, tags). Pill with `border: 1px solid currentColor`.
7. **`StatusPill`** — the LIVE / CLOSED market pill (reused by Signals, Focus, and the new Dashboard).
8. **`EmptyState`** and **`Skeleton`** — standardized empty and loading treatments used across pages.

Existing per-page CSS files are reduced to page-specific layout only; shared visual concerns move into these components.

## Application per page (rollout)

| Weight | Pages | Work |
|---|---|---|
| **Heavy** | Dashboard | Remove the `bbg-*` terminal styles in `Dashboard.css` and the monospace/amber look; rebuild from `PageHeader` + `Panel` + `DataTable` + `StatTile` + movers tiles. Same content/blocks, Glass Terminal skin. |
| **Medium** | Market Signals, Focus List, Option Chain, Quant Screener, Momentum, FII/DII, Fundamentals, DCF | Already glass. Swap hand-rolled headers → `PageHeader`, metric boxes → `StatTile`, tables → `DataTable`; apply `.tnum`; contrast-audit. |
| **Light** | Chart Analyser, Druck & Minervini, SARIMAX, Position Sizing, News, Learn, Discipline Arena | Standardize header + card wrappers to `PageHeader`/`Panel`; leave internal logic (incl. Plotly chart configs) intact; contrast-audit. |

Plotly-based pages (Chart, SARIMAX, Druck) keep their chart configs; only the surrounding header/panel chrome is standardized.

## Contrast audit

For every route: load in the browser preview (desktop + 375px), and via `preview_inspect` verify computed text colors on representative nodes (titles, secondary text, micro-labels, table cells) meet AA and that no dark-on-dark exists. Fix any offenders by mapping to the text-role tokens.

## Testing / verification

- `npm run lint` and `npm run build` clean.
- Per-route visual verification in the browser preview at 1440px and 375px: no horizontal overflow, headers/cards/tables render via the shared components, figures align, contrast checks pass.
- Backend is untouched → the existing 30 backend tests still pass (sanity run).
- Spot-check tabular alignment on a data-dense page (Option Chain / Screener).

## Suggested implementation phases (for the plan)

1. **Foundations** — tokens in `index.css` + the `components/ui/` kit, with a throwaway demo route or Storybook-free manual check.
2. **Dashboard conversion** — highest-visibility change; deletes the terminal skin.
3. **Medium pages** — the data-heavy glass pages adopt the kit.
4. **Light pages + global contrast audit** — remaining pages, then a full-app contrast/mobile sweep.

Each phase is independently shippable and verifiable.

## Risks & mitigations

- **Orphaned `bbg-*` styles** after the Dashboard rewrite — remove `Dashboard.css` terminal rules in the same change; grep for stale class usage.
- **Plotly theming drift** — don't touch chart internals; only wrap. Verify chart pages still render and resize.
- **Regression in mobile drawer / inputs** — keep the ≤850px rules; re-verify at 375px per page.
- **Scope creep into layout redesign** — explicitly out of scope; if a page's layout is genuinely broken, note it separately rather than redesigning here.
