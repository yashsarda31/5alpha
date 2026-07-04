# Delivery % Integration — Design

**Date:** 2026-07-04
**Status:** Approved
**Feature:** Auto-fetched daily NSE delivery-percentage data feeding the Market Signals conviction score and the Focus List. Core rule: HIGH CLV + HIGH delivery % = bullish conviction; HIGH delivery % + LOW CLV = distribution (bearish).

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Where surfaced | Market Signals scoring + Focus List reasons only (no new page/section) |
| "HIGH delivery" definition | Relative: today's `DELIV_PER` ≥ 1.3× the stock's own 20-day average ("spurt") |
| Fetch trigger | Lazy fetch-on-request + daily Vercel cron at 7:30pm IST as warmer |
| Universe | F&O underlyings ∪ Nifty 200 (~250 names), EQ series only |
| Storage | New `delivery_daily` table in the existing SQLite DB (`data/alphanova.db`), mirrored via the existing Vercel Blob push/pull |

## Data source (verified 2026-07-04)

`https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{DDMMYYYY}.csv`
— one file per trading day, published ~7pm IST, ~370KB, ~3,300 rows. Fetched with the app's existing `NSE_HEADERS`; 401/403 → session warm-up retry (existing pattern). 404 for a weekday = market holiday, skip silently.

Columns used: `SYMBOL, SERIES, HIGH_PRICE, LOW_PRICE, CLOSE_PRICE, DELIV_PER, DATE1`.
Derived: `CLV = ((C−L)−(H−C))/(H−L)`, defined as 0 when `H == L`. Note the file's header/fields carry leading spaces — parser must strip.

## Architecture

All backend work lives in `api/main.py`, following the app's single-file pattern.

### Storage

```sql
CREATE TABLE IF NOT EXISTS delivery_daily (
  symbol     TEXT NOT NULL,
  trade_date TEXT NOT NULL,   -- ISO yyyy-mm-dd
  close      REAL,
  deliv_per  REAL,
  clv        REAL,
  PRIMARY KEY (symbol, trade_date)
);
```

Rows older than 45 calendar days are pruned on each insert batch. Expected steady state: ~250 symbols × ~30 trading days ≈ 7,500 rows (~500KB in the blob).

### Universe filter

`SERIES == "EQ"` AND symbol ∈ (F&O underlyings ∪ Nifty 200). F&O list from the signals engine's futures snapshot (`liveEquity-derivatives?index=stock_fut` symbols); Nifty 200 from the screener's existing `nifty200` preset (strip `.NS`). Union computed at ingest time; if the F&O snapshot is unavailable during ingest, the Nifty 200 list alone is used (superset restored next ingest).

### Freshness / ingest — `_ensure_delivery_fresh()`

1. Compute the last expected trading day: today if a weekday and now ≥ 7:15pm IST, else the previous weekday.
2. If `MAX(trade_date)` in the table already equals it → return (fast path, one SQL query).
3. Otherwise fetch each missing weekday between `MAX(trade_date)` and the expected day (cap 5; 404 = holiday, skip). Parse, filter, upsert, prune.
4. First-ever run (empty table): backfill the last 30 trading days (~45 fetch attempts, one time — normally done by the cron, not a user request).
5. Push blob via existing `_blob_push_db()` only when rows were added.

Concurrency: a module-level lock + "already checked this process this hour" flag prevents duplicate fetch storms within one serverless instance.

### Triggers

- **Lazy:** `/api/signals` and `/api/focus` call `_ensure_delivery_fresh()` wrapped in try/except with a short internal budget — on any failure they proceed without delivery data.
- **Cron:** `GET /api/delivery/refresh` runs the same ingest, returns `{"added": N, "latest": "yyyy-mm-dd"}` (or 502 with detail on total failure). `vercel.json` gains:

```json
"crons": [{ "path": "/api/delivery/refresh", "schedule": "0 14 * * 1-5" }]
```

(14:00 UTC = 7:30pm IST, Mon–Fri.)

### Delivery metrics — `_delivery_signal(symbol)`

Returns `{spurt, clv, deliv_per}` or `None`:
- `spurt` = latest `deliv_per` ÷ AVG(`deliv_per`) over the prior 20 trading days (excluding latest). Requires ≥ 10 days of history, else `None`.
- `clv` = latest stored CLV.

## Signal integration — `score_signal_plans`

Component weights rebalanced; max total stays 100:

| Component | Old | New |
|---|---|---|
| OI intensity | 25 | 22 |
| Price momentum | 20 | 18 |
| Liquidity | 10 | 10 |
| Options-flow agreement | 15 | 15 |
| Index day-bias | 10 | 10 |
| Intraday trend | 10 | 10 |
| Regime direction | 5 | 5 |
| **Delivery conviction** | — | **10** |

Raw CLV lives in [−1, 1]. All thresholds below use the normalized value `clv01 = (clv_raw + 1) / 2` ∈ [0, 1] (1 = close at day high), matching the existing `dpos` convention.

Delivery conviction `s_dlv` (0–10), from `_delivery_signal`:
- LONG: `min(spurt / 1.3, 1) × clv01 × 10` — full 10 when spurt ≥ 1.3 and clv01 = 1.0; the approved rule "spurt ≥ 1.3 AND clv01 ≥ 0.7" yields ≥ 7 points.
- SHORT: `min(spurt / 1.3, 1) × (1 − clv01) × 10` mirrored (delivery into a weak close = distribution).
- No data → 0 (component silently absent, like existing opt/idx when data is missing).
- `why` string: append `dlv✓` when `s_dlv ≥ 7`.

Docstring updated to the new weight breakdown.

## Focus List integration — `/api/focus`

New source appended alongside existing ones (momentum leader / big mover / buildups):
- Candidates: symbols with `spurt ≥ 1.5` and `clv01 ≥ 0.7` (LONG, reason e.g. `Delivery spurt — 1.6× avg delivery into a strong close (68% delivered)`) or `clv01 ≤ 0.3` (SHORT, `…into a weak close`).
- Weight: +12 per hit. Cap: top 5 by spurt so delivery can't flood the list.

## Error handling

- Fetch/parse failures: logged, swallowed at trigger sites; app behavior degrades to exactly today's (score max effectively 90 for affected symbols).
- Malformed CSV rows skipped row-by-row.
- `/api/delivery/refresh` surfaces failures (502 + detail) so cron misfires are visible in Vercel logs.
- Blob push only on actual inserts; reuses existing debounce/error handling in `_blob_push_db()`.

## Testing — `api/test_delivery.py`

Isolated temp DB (same pattern as `test_auth.py`):
1. CLV math: strong close, weak close, H == L → 0.
2. Spurt: seeded 20-day history, verifies ratio and the ≥ 10-day minimum-history rule.
3. Universe filter: EQ-only, symbol filtering, header-whitespace stripping (real captured header line as fixture).
4. Freshness: mocked "now" around weekend/holiday/pre-7pm boundaries → correct expected-trading-day and fetch set.
5. Scoring: `s_dlv` bounds (0 ≤ s ≤ 10) for LONG and SHORT across spurt/clv grid; absent data → 0.
6. Ingest: parse a fixture CSV (few rows), upsert idempotency (re-ingest same day = no dupes), prune.

## Out of scope

- No dedicated delivery page/section (revisit later if wanted).
- No delivery data for non-F&O/non-Nifty-200 smallcaps.
- No intraday delivery estimates — EOD file only.
