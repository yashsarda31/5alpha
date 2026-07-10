# Five-Tab Insight & Polish Pass — Implementation Plan

**Date:** 2026-07-10
**Spec:** `docs/superpowers/specs/2026-07-10-five-tab-improvements-design.md`
**Delivery strategy:** backend first (additive fields + tests), then shared
component, then one milestone per tab, then a full verification/deploy pass.

## Working Rules

- The approved spec is the source of truth.
- Backend changes are additive-only: new response keys, no new routes/tables.
- Every `_blob_push_db` caller rule, `_json_safe` rule, and edge-cache rule in
  CLAUDE-memory applies; `/api/watchlist/quotes` stays off the edge-cache tables.
- Frontend: concrete hex in any SVG/Plotly config; fluid-SVG rule; grids use
  `minmax(min(Xpx,100%),1fr)`; no `alert()`; no new Plotly imports.
- New quiet/dark button variants join the index.css opt-out selector list.
- Commit per milestone; deploy once at the end.

## Milestone 0 — Baseline

1. `cd web; npm run build` — confirm green build before touching anything.
2. `python -m pytest api/test_watchlist.py api/test_dashboard_movers.py api/test_predictions.py api/test_sectors.py -q` (from `api/` where required) — record baseline.

## Milestone 1 — Backend additive fields

Files: `api/main.py`, `api/test_watchlist.py`, `api/test_dashboard_movers.py`,
`api/test_predictions.py`.

1. `/api/dashboard`: batched `yf.download` (~45d daily) over mover tickers inside
   the existing cached compute → `spark: [closes]` (last ~30) per mover; wrap in
   `_json_safe`; TTLs and cache keys unchanged.
2. `/api/watchlist/quotes`: same batch pattern → `spark`, `day_low`, `day_high`
   per quote (day range from the latest bar; None-safe).
3. `/api/predict/today`: `community: {up, down}` COUNT over `predictions` for the
   active question date.
4. Tests (offline, monkeypatched yfinance; unique qdates): spark presence/shape,
   day range fields, community counts, and back-compat of old keys.

## Milestone 2 — Shared Sparkline component

Files: `web/src/components/Sparkline.jsx`.

1. Props `values, width=120, height=36, stroke, fill, strokeWidth=1.5`; renders
   nothing for <2 finite values; fluid by default, fixed-width via prop for table
   cells. Concrete hex only.

## Milestone 3 — Dashboard

Files: `web/src/pages/Dashboard.jsx`, `web/src/pages/Dashboard.css`.

1. Market pulse strip (2 index tiles + breadth chip) under PageHeader.
2. Sparklines on mover + watchlist tiles (progressive: only when `spark` present).
3. Live setups teaser card from swr `signals` cache (hidden when empty); "N setups
   live" chip on the SIG module card from the same data.
4. Macro DataTable → macro tiles.
5. Today's Call community bar (post-lock/post-call only).

## Milestone 4 — Watchlist

Files: `web/src/pages/Watchlist.jsx`, `web/src/pages/Watchlist.css`.

1. Summary bar (avg %, up/down, best/worst).
2. Sortable columns with nulls-last both directions.
3. Day-range bar column + Trend sparkline column (fixed-width cell wrappers).
4. "Setup live" badge via swr `signals` join.
5. NSE/US group headers when mixed; News row action.

## Milestone 5 — Sector Rotation

Files: `web/src/pages/SectorRotation.jsx`, `web/src/pages/SectorRotation.css`.

1. "This week's rotations" strip from tail-vs-head quadrant diffs.
2. `SECTOR_TICKER` map (IN index tickers / US SPDR ETFs) + name click-through to
   /chart.
3. Mobile card view ≤700px for the ranking table (CSS-switched dual render).
4. RRG height 460→380 on small screens; posture strip wrap.

## Milestone 6 — Position Sizing

Files: `web/src/pages/PositionSizing.jsx`, new `web/src/pages/PositionSizing.css`.

1. NSE/US market toggle, ₹ default, market-aware formatting.
2. TickerSearch → latest close via `/api/chart` prefills Entry (quiet inline note
   on failure).
3. Stat tiles restyle + targets table (1R/1.5R/2R/3R, % gain, R:R) + stop-distance
   line.
4. Risk preset chips; `alphanova_sizing_prefs` persistence.
5. Inline sanity warnings (stop ≥ entry, risk >2%, position > capital).
6. ShareButton with `#sizing-analysis` capture; `data-noshare` on controls.
7. Stamp `alphanova_sized_today` on input interaction.

## Milestone 7 — Discipline Arena

Files: `web/src/pages/TradingGame.jsx`, new `web/src/pages/TradingGame.css`.

1. Extract embedded `<style>` to TradingGame.css; restyle with elevation tokens.
2. Auto-verified quests: daily-call (PredictionContext), journal (on save),
   sizing (`alphanova_sized_today`); "verified" affordance; never un-checks;
   routes through `handleQuestToggle`.
3. `questHistory` map + 10–12-week heatmap.
4. Mood trend sparkline (last 30 moods + avg).
5. Replace `alert()`/`confirm()` with inline banners + two-step reset confirm.
6. Journal tag-filter chips with counts.

## Milestone 8 — Verification & deploy

1. `cd web; npm run build`; full backend test run for touched suites.
2. Preview browser (`web-dist` prod-proxy) pass over all five tabs, desktop +
   375px: console clean, no failed requests, no horizontal overflow, arena flows
   work without native dialogs, sizing prefill works.
3. Commit, `npx vercel --prod --yes`, prod smoke test (spark in /api/dashboard,
   watchlist columns, sector strip, ₹ default, arena auto-quest).
