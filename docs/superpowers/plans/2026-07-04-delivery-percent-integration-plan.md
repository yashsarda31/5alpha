# Delivery % Integration — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-04-delivery-percent-integration-design.md`
**Rider:** Dashboard Top Movers become click-through links that open the ticker in Chart Analyser (user request 2026-07-04).

## Phase 1 — Backend data layer (api/main.py, new "Delivery" section after auth code)

1. `_delivery_db()` — reuse `_auth_db()` connection; `CREATE TABLE IF NOT EXISTS delivery_daily (symbol, trade_date, close, deliv_per, clv, PRIMARY KEY(symbol, trade_date))`.
2. `_clv(high, low, close)` — pure helper, returns 0.0 when high <= low.
3. `_delivery_expected_day(now=None)` — last expected trading day: today if weekday and IST time ≥ 19:15, else previous weekday (skips back over weekends). `now` injectable for tests.
4. `_delivery_universe()` — Nifty 200 (from `SCREENER_UNIVERSES["nifty200"]`, `.NS` stripped) ∪ F&O underlyings (`nse_get stock_fut`, best-effort).
5. `_fetch_delivery_csv(day)` — GET `sec_bhavdata_full_{DDMMYYYY}.csv` with NSE UA/Referer headers; 404 → None (holiday); other errors raise.
6. `_ingest_delivery_day(conn, day, text, universe)` — csv.reader, strip whitespace, filter SERIES==EQ + universe, compute CLV, `INSERT OR REPLACE`, skip malformed rows, return count.
7. `_ensure_delivery_fresh(max_fetch=3, force=False)` — hourly checked-flag + threading.Lock; fast path when `MAX(trade_date)` == expected; else fetch missing weekdays (backfill 30 trading days when table empty, capped by max_fetch); prune > 45 days; `_blob_push_db()` when rows added; returns `{"added": N, "latest": iso}`.
8. `_delivery_signals()` — one SQL pass: latest-day rows + per-symbol AVG of prior ≤20 days (window fn), require ≥10 days history → `{sym: {spurt, clv01, deliv_per}}`. Cached in API_CACHE 10 min.
9. `_delivery_score(dlv, side)` — pure: `min(spurt/1.3, 1) × c01 × 10` with `c01 = clv01` (LONG) / `1 − clv01` (SHORT), clamped [0, 10]; None → 0.
10. `GET /api/delivery/refresh` — `_ensure_delivery_fresh(max_fetch=35, force=True)`; 502 with detail on total failure.
11. `vercel.json`: add `"crons": [{"path": "/api/delivery/refresh", "schedule": "0 14 * * 1-5"}]`.

## Phase 2 — Signal + focus integration

1. `score_signal_plans(..., delivery=None)` — weights OI 25→22, px 20→18; add `s_dlv` via `_delivery_score`; `why += " dlv✓"` when s_dlv ≥ 7; docstring updated.
2. `/api/signals` — add `_ensure_delivery_fresh` (bounded ~8s, max_fetch=2, best-effort) to the gather; fetch `_delivery_signals()`; pass into `score_signal_plans`.
3. `/api/focus` — new source: top-5 spurts with `spurt ≥ 1.5` and `clv01 ≥ 0.7` (LONG) / `≤ 0.3` (SHORT); weight +12; reason text per spec.

## Phase 3 — Tests (api/test_delivery.py)

Temp-DB isolation via `ALPHANOVA_DB_DIR` (test_auth.py pattern). Cover: `_clv` (3 cases), `_delivery_expected_day` (weekday pre/post 19:15, weekend), ingest fixture CSV (real header incl. leading spaces; EQ filter; universe filter; idempotent re-ingest; malformed row skip), `_delivery_signals` (seeded 21 days → spurt; <10 days → absent), `_delivery_score` bounds grid.

## Phase 4 — Dashboard → Chart Analyser click-through (frontend)

1. `Chart.jsx` — read `?symbol=` via `useSearchParams`; when present on mount: `setTicker(symbol)` + fetch it (refactor `fetchChart` to take an optional symbol arg).
2. `Dashboard.jsx` — Top Mover tiles become `<Link to={/chart?symbol=${ticker}.NS}>` keeping existing classes.
3. `Dashboard.css` — link reset (inherit color, no underline) + hover affordance on `.dash-mover`.

## Phase 5 — Verify + ship

1. `python -m pytest api/test_delivery.py test (+ existing suite)`.
2. Local run: hit `/api/delivery/refresh` once (backfill), then `/api/signals` and `/api/focus`; verify `dlv✓` appears when data supports it and nothing breaks when the table is empty.
3. Frontend build; verify dashboard mover click lands on Chart Analyser pre-loaded.
4. Commit, deploy to Vercel, verify prod refresh endpoint + signals, confirm cron registered.
