# Five-Tab Insight & Polish Pass — Design

**Date:** 2026-07-10
**Scope:** Dashboard, Watchlist, Sector Rotation, Position Sizing, Discipline Arena
**Goal:** Make each tab look better *and* deliver more user value. Each tab gains one
headline "insight layer" (the value) plus a visual upgrade on the existing premium
design tokens (the looks).
**Constraint (user-chosen):** Mostly frontend. Backend changes limited to small
*additive* fields on existing endpoints — no new routes, no new tables, no schema
migrations. New client-side state lives in localStorage only.

---

## 0. Cross-cutting

- All new UI uses the existing premium tokens (`--shadow-card`, `--surface-grad`,
  gold gradient buttons, `--font-display` headings) and the shared `ui` kit
  (StatTile-pattern tiles, `Badge`, `SectionTitle`, `EmptyState`).
- **New shared component `web/src/components/Sparkline.jsx`**: fluid inline-SVG
  line/area mini-chart. Props: `values: number[]`, `width`, `height`, `stroke`
  (concrete hex), `fill` (optional area tint), `strokeWidth`. Follows the fluid-SVG
  rule (viewBox + `width:100%`, `maxWidth` = natural width, `height:auto`, no
  width/height attributes) except when placed in a fixed-width table-cell wrapper.
  Extracted from the Momentum `Spark` pattern; Momentum itself is NOT refactored in
  this pass (out of scope).
- No Plotly on any of these five pages except Sector Rotation's existing RRG.
- Numerics use the `tnum` class. Palette hexes unchanged.
- Signals-derived UI on Dashboard/Watchlist reads the swr cache key `signals`
  (seeded by `SignalAlertProvider`'s existing app-wide poll) via `useSWR` with the
  same fetcher — **zero additional network requests**. All such UI must render
  nothing (not an empty shell) when the cache has no data, and must handle
  `pcr`/fields being null.

## 1. Dashboard — "what's happening right now?"

1. **Market pulse strip** directly under the PageHeader: compact tiles for the two
   lead indices from `indices` (NIFTY + BANKNIFTY when IN; the US extras already in
   the payload during US hours) with last value, % change, and sparkline; plus a
   breadth chip computed frontend from movers ("4↑ 2↓").
2. **Sparklines on tiles**: mover tiles and My-Watchlist tiles render a low-opacity
   sparkline behind/beside price using the new `spark` field (§6). Tiles without
   `spark` (stale cache) render exactly as today — the sparkline is progressive
   enhancement.
3. **Live setups teaser**: slim card between Today's Call and Analytics Modules.
   Shows top 2–3 scored plans (symbol · side badge · score · entry, currency from
   plan `currency` field) from the `signals` swr cache, with "View all →" linking
   to /signals. Hidden entirely when no plans in cache.
4. **Macro tiles**: the Macro `DataTable` is replaced with compact tiles in the
   same visual family as mover tiles (name, value, %). No sparkline requirement for
   macro rows (spark on indices is optional server-side; render only if present).
5. **Today's Call — community bar**: after the user's call is locked or the day is
   resolved, show a split bar "62% GREEN · 38% RED" from the new `community` field
   (§6). Never shown pre-lock for users who haven't called (no anchoring).
6. **SIG module card**: shows "N setups live" chip from the signals cache; other
   module cards unchanged.

## 2. Watchlist — "how are my names doing?"

1. **Summary bar** above the table (only when ≥1 quote has data): average % move,
   up/down count, best and worst symbol. Computed from fetched quotes.
2. **Sortable table**: clicking Symbol / LTP / Chg% headers sorts asc/desc; null
   values always sort to the bottom (both directions), matching the Screener
   comparator convention.
3. **New columns**:
   - **Day range**: horizontal bar showing where `last` sits between `day_low` and
     `day_high` (§6). Renders "—" when fields absent.
   - **Trend**: 30-session sparkline in a fixed-width cell wrapper (DataTable
     scrolls horizontally, per the table-cell mini-chart rule).
4. **"Setup live" badge** on rows whose symbol appears in today's scored plans
   (frontend join vs the `signals` swr cache, matching plan symbol to watchlist
   symbol, market-aware). Badge links to /signals.
5. **Market grouping**: when the list contains both IN and US rows, group them
   under subtle "NSE" / "US" section headers; single-market lists render flat.
6. **Row actions**: Chart / Fundamentals / News links + remove ✕ (News added).
7. Guest empty-state and signed-in empty-state remain as today.

## 3. Sector Rotation — "what changed?"

1. **"This week's rotations" strip** above the RRG card: for each sector, compare
   the quadrant of the tail's first point vs its head (quadrant = sign of x−100 /
   y−100 on the existing `tail` data). Sectors whose quadrant changed render as
   chips: "IT → Leading", "Metal → Weakening", colored by destination quadrant.
   When none changed: single quiet line "No quadrant changes this week."
2. **Click-through to Chart**: sector names in the ranking table (and RRG hover
   note) link to `/chart?symbol=<ticker>` via a frontend map: IN sectors → their
   `^CNX*` / `^NSEBANK` / `NIFTY_FIN_SERVICE.NS` index tickers (mirror of
   `SECTOR_INDICES` in api/main.py); US sectors → their SPDR ETF (XLK…). The map
   lives in SectorRotation.jsx; keep it in sync with the backend map when sectors
   are added.
3. **Mobile card view** for the ranking table at ≤700px: one card per sector
   (rank, name, quadrant dot + label, outlook badge, score bar, 1W & 1M vs bench).
   Desktop keeps the full table. Implemented as CSS-switched dual rendering
   (table hidden on mobile, cards hidden on desktop).
4. **Responsive RRG**: height 460 desktop → ~380 below 700px (pass height from a
   `matchMedia`-derived value); posture strip wraps cleanly on mobile.
5. AI brief card unchanged.

## 4. Position Sizing — "what's my actual trade plan?"

1. **Market toggle** NSE ₹ (default) / US $ — same toggle pattern as Watchlist
   AddBox. All labels, symbols, and number formatting follow the market
   (`en-IN` / `en-US`).
2. **Symbol prefill (optional)**: a TickerSearch field above Entry; selecting a
   symbol fetches the latest close from the existing `/api/chart` endpoint and
   prefills Entry Price (user-editable afterwards; fetch failure = quiet inline
   note, manual entry unaffected). No new endpoint.
3. **Trade plan output**:
   - Existing outputs restyled as `ui-stat-tile`s (Risk Amount, Risk/Share,
     Quantity hero tile, Total Position, % of Capital).
   - **Targets table**: rows for 1R / 1.5R / 2R / 3R → target price, % gain,
     reward:risk. Plus a stop-distance line ("Stop is 5.0% below entry").
4. **Risk preset chips**: 0.5% / 1% / 2% set `riskPercent`.
5. **Persistence**: capital, risk %, and market persist in localStorage
   (`alphanova_sizing_prefs`) and restore on mount.
6. **Inline sanity warnings**: stop ≥ entry ("stop must be below entry for longs"),
   risk% > 2% ("aggressive risk"), position value > capital ("position exceeds
   capital — needs margin"). Warnings are inline banners, never alert().
7. **ShareButton** on the results card (`#sizing-analysis` capture node,
   `data-noshare` on buttons), consistent with other analysis pages.
8. **Arena hook**: any input interaction stamps `alphanova_sized_today = YYYY-MM-DD`
   in localStorage (read by Discipline Arena §5.1).
9. Inline styles move to `web/src/pages/PositionSizing.css`.
10. Auto-AI insight behavior unchanged.

## 5. Discipline Arena — "am I actually getting more disciplined?"

Game identity (bosses, loot, emojis, shake, level-up) is retained deliberately.

1. **Auto-verified quests** (marked with a small "verified ✓" affordance, distinct
   from honor-system quests):
   - *Made today's market call* — auto-completes when `PredictionContext` shows
     `today.your_choice` set. Replaces nothing; added as a 6th quest, XP 20,
     10 boss damage.
   - *Journal quest* — the existing journal quest auto-checks when a journal entry
     is saved today (currently it's an unlinked honor checkbox even though the
     page has the journal form).
   - *Planned a trade properly* (sizing quest) — auto-completes when
     `alphanova_sized_today` equals today (set by Position Sizing §4.8). Manual
     check remains possible.
   - Honor-system quests (no overtrade, no revenge, calmness) stay manual.
   - Auto-completion runs on mount + when the source context changes; it routes
     through the same `handleQuestToggle` XP/damage path, and never *un*-checks.
2. **Discipline heatmap**: 10–12-week GitHub-style calendar of
   quests-completed-per-day. New `questHistory: { 'YYYY-MM-DD': count }` map in
   the saved state, updated on every quest completion; history starts accruing
   from ship date (no fabricated backfill). Cells: 0 = neutral, 1–2 = dim gold,
   3+ = bright gold.
3. **Mood trend**: inline-SVG sparkline of the last 30 `moodLogs` (1–5 scale) next
   to the mood form, with the average value labelled.
4. **Premium chrome**: the embedded `<style>` block moves to
   `web/src/pages/TradingGame.css`; cards, XP bar, HP bar, quest buttons restyled
   with the elevation tokens. Any quiet/dark button variants added must join the
   index.css "quiet button variants opt out" selector list.
5. **No more native dialogs**: `alert()`/`confirm()` (mood already-logged, import
   result, reset confirm) become inline banners / a two-step inline confirm on the
   reset button. (Also unblocks preview-browser testing of this page.)
6. **Journal upgrades**: tag-filter chips above the log list (All / sizing /
   overtrade / revenge / setup) with counts; list filters client-side.
7. State stays localStorage-only (account sync explicitly out of scope); the
   existing export/import stays as the migration path.

## 6. Backend — additive fields only (api/main.py)

1. **`/api/dashboard`**: each mover gains `spark: [~30 daily closes]`, fetched via
   one batched `yf.download` folded into the existing dashboard compute (inside
   the existing cache, so per-compute cost is one extra batch call; TTLs
   unchanged). Indices may also carry `spark` where the same batch covers them
   (optional; frontend treats it as optional).
2. **`/api/watchlist/quotes`**: each quote gains `spark` (~30 closes), `day_low`,
   `day_high` from the same batched download pattern; the 50-symbol cap and
   response shape otherwise unchanged. NOTE: this endpoint is user-shaped (auth) —
   it is already excluded from edge caching and must stay excluded.
3. **`/api/predict/today`**: gains `community: { up: int, down: int }` — one COUNT
   query over the existing `predictions` table for the active question date. The
   frontend only reveals it post-lock/post-call.
4. All touched responses pass through `_json_safe` where yfinance floats flow.
   New keys only — every existing consumer keeps working. Endpoints keep their
   current edge-cache rules (`/api/dashboard` rule already exists; no new rules
   needed).

## 7. Error handling

- Sparkline/day-range/community/rotation-strip are all progressive enhancements:
  absent or null data renders the current (pre-change) UI, never a broken shell.
- Chart-close prefill failure on Position Sizing shows a quiet inline note.
- Arena auto-verification failures (contexts unavailable) silently leave quests
  manual — the honor checkbox always works.

## 8. Testing & rollout

- **Backend tests** (offline, monkeypatched yfinance): spark/day-range fields on
  watchlist quotes; dashboard spark presence; community count on predict/today
  (unique qdates per the predictions-test rule). Extend `api/test_watchlist.py`,
  `api/test_dashboard_movers.py`, `api/test_predictions.py`.
- **Frontend verification**: full pass over the five tabs in the preview browser
  (`web-dist` prod-proxy flow) at desktop and 375px. Checklist: no fixed-width
  SVGs outside table-cell wrappers, all grids `minmax(min(Xpx,100%),1fr)`, no new
  Plotly imports, no console errors/failed requests, Arena reset/import flows work
  without native dialogs.
- Ship as one commit; deploy with `npx vercel --prod --yes`; smoke-test prod
  (dashboard spark present, watchlist columns, sector strip, sizing ₹ default,
  arena auto-quest).

## Out of scope (deliberate)

Account-synced Arena state, watchlist cost-basis/holdings tracking, saved trade
plans server-side, new routes/tables, Momentum refactor onto the shared Sparkline.
