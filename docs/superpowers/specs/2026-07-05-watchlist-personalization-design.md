# Watchlist & Personalized Dashboard — Design

**Date:** 2026-07-05
**App:** Alpha Nova (FastAPI `api/main.py` + React/Vite `web/`, Vercel)
**Status:** Approved for planning

## Goal & Motivation

Retention-first. People sign up but don't return daily. Today every user sees the
*same* app — no watchlist, no personalization; the Dashboard is a static
movers + macro + module grid. The keystone fix is a **watchlist**: it gives users
a personal stake ("what happened to *my* stocks?"), which is the single most
reliable reason to reopen a markets app each morning.

This spec covers **Phase 1 only**: watchlist storage + API, a watchlist page and
add-affordances across the app, and a personalized dashboard. Alert
personalization and the daily-call / streak / leaderboard system are **Phase 2**
(see Future Scope) and are intentionally out of scope here.

## Scope

**In scope (Phase 1):**
- Per-user watchlist, stored server-side (SQLite + Blob mirror, matching auth).
- Watchlist CRUD API + a thin batch-quote endpoint reusing existing primitives.
- A dedicated `/watchlist` page and a reusable "star" add/remove control placed
  where symbols already appear.
- A personalized Dashboard: "My Watchlist" pinned above Top Movers, with a
  first-run empty state that teaches the core loop.

**Explicitly out of scope (Phase 1):**
- Watchlist-aware alerts. The existing `SignalAlertProvider` stays market-wide,
  unchanged. (Phase 2.)
- Daily market call, streaks, leaderboards, per-stock accuracy stats. (Phase 2.)
- Multiple / named watchlists (single list per user for now).
- Configurable / drag-drop widget dashboard.
- Ticker autocomplete against a symbol master (plain type-the-ticker add for now).

## Architecture Decision

**Watchlist lives in the backend** — a table in the existing `data/alphanova.db`,
mirrored to Vercel Blob exactly like the auth tables. Rationale:
- Cross-device durability (the app is an installable PWA — add on desktop, see it
  on mobile), survives localStorage/cache clears.
- Reuses the durability pattern already trusted for auth (`_blob_pull_db` /
  `_blob_push_db`, versioned snapshots).
- Phase 2 (per-stock accuracy, leaderboard) requires server-side data anyway;
  building on the backend now avoids a later migration.

localStorage-only and hybrid approaches were rejected: per-device is a non-starter
for a cross-device PWA, and both would force a migration for Phase 2.

## Data Model

One new table in `data/alphanova.db` (blob-mirrored):

```sql
CREATE TABLE IF NOT EXISTS watchlist (
    user_id    INTEGER NOT NULL,
    symbol     TEXT    NOT NULL,   -- NSE ticker, UPPERCASE, no ".NS" (e.g. "RELIANCE")
    added_at   TEXT    NOT NULL,   -- ISO UTC, default sort key
    sort_order INTEGER,            -- optional manual ordering; NULL = fall back to added_at
    PRIMARY KEY (user_id, symbol)
);
```

- **Composite PK `(user_id, symbol)`** → add is idempotent, remove is trivial.
- **Symbol canonical form:** uppercased, `.NS` suffix stripped on store. The `.NS`
  suffix is re-appended only where a downstream API needs it (e.g. chart links,
  yfinance quote calls). Prevents `RELIANCE` / `reliance.ns` splitting into two rows.
- **`sort_order`** kept (approved) to allow drag-to-reorder later with no migration;
  NULL rows sort by `added_at`.
- **Single list per user** — no separate `watchlists` table in Phase 1.
- Created lazily via `CREATE TABLE IF NOT EXISTS` inside the DB-open helper, same as
  the `users` / `sessions` tables in `_auth_db()`.

## API

All routes in `api/main.py`, auth-gated. Introduce a shared helper
`_require_user(authorization)` that wraps the existing `_session_user` →
`_blob_pull_db(force=True)` retry → `raise HTTPException(401)` logic in one place
(currently inlined in `/api/auth/me`), and reuse it across all watchlist routes.

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/watchlist` | — | `{ symbols: [{symbol, added_at, sort_order}, ...] }`, sorted by `sort_order` then `added_at` |
| `POST /api/watchlist` | `{symbol}` | Adds (idempotent). Returns the stored row. |
| `DELETE /api/watchlist/{symbol}` | — | Removes. `{ ok: true }` |
| `PUT /api/watchlist/order` | `{symbols: [...]}` | Rewrites `sort_order` to match the given order. |
| `GET /api/watchlist/quotes` | — | `[{symbol, last, change_pct}, ...]` in the user's sort order. |

**Write path** (POST/DELETE/PUT) mirrors auth exactly: `_blob_pull_db(force=True)`
→ mutate → `conn.commit()` → `_blob_push_db()`. Reads (`GET`) do a normal
(non-forced) pull then select.

**Symbol validation on POST:** strip whitespace, uppercase, strip a trailing
`.NS`, accept only `[A-Z0-9&-]` up to 20 chars, reject empty. Enforce a soft cap of
**50 symbols per user** (bounds blob size / abuse) — return a 400 with a clear
message when exceeded.

**`GET /api/watchlist/quotes`** — the thin batch-quote endpoint. There is **no
existing batch-quote route** to reuse, but the lightweight primitive
`_yf_quote_change(ticker)` → `{last, change_pct}` exists and is already fanned out
over a `concurrent.futures.ThreadPoolExecutor` in the dashboard's `fetch_movers`
(main.py:2082). This endpoint reuses that primitive and the same thread-pool
fan-out over the caller's watchlist symbols (with `.NS` appended for the yfinance
call), applies the same `API_CACHE` 300s treatment the dashboard uses, and returns
results in the user's `sort_order`. Auth-gating it to the caller's own list avoids
exposing an open quote proxy. Symbols with no quote degrade gracefully (returned
with `last`/`change_pct` null rather than dropped).

## Frontend

### WatchlistContext
A React context (modeled on the existing `AuthContext`) that:
- Loads the user's symbols once after login and holds the set in memory.
- Exposes `symbols`, `has(symbol)`, `add(symbol)`, `remove(symbol)`.
- `add`/`remove` are **optimistic**: update local state immediately, call the API,
  reconcile on response, and on failure roll back + surface a toast via the existing
  `ToastStack`.
- Every `WatchlistStar` and the Dashboard read from this context so all stars stay
  in sync without refetching.

### WatchlistStar (reusable control)
- A star toggle: filled ⭐ = on list, outline ☆ = not. Reads/writes via
  `WatchlistContext`.
- Placed where symbols already appear: **Chart Analyser** header, **Screener**
  result rows, **Momentum Leaders** rows, **Focus List** rows, **Dashboard Top
  Movers** tiles.

### Watchlist page (`/watchlist`)
- New route + sidebar nav link directly under Dashboard (icon ⭐) — it's a primary
  surface now.
- Built from existing `ui` primitives (`PageHeader`, `DataTable`, `EmptyState`,
  `Skeleton`, `StatusPill`). Columns: Symbol · LTP · Chg% (green/red tone) · quick
  actions (open in Chart 📈 / Fundamentals 📊 / remove ✕).
- Polls `/api/watchlist/quotes` on the existing 120s cadence.
- **Add-by-search:** a plain text input that accepts a ticker; validated on add by
  the POST route (no autocomplete). Errors shown inline.
- **Empty state** teaches the loop: "Add stocks from any Chart, Screener, or the Top
  Movers on your Dashboard," plus the inline add box so a new user isn't stuck.

### Personalized Dashboard
Reorder `web/src/pages/Dashboard.jsx` so the top is about the user's stocks:

1. **My Watchlist** (new, top):
   - Has stocks → compact tile grid (reusing `dash-mover-grid` styling) with LTP +
     Chg%, each tile links to Chart and carries a `WatchlistStar` for inline remove;
     a "Manage ⭐" link to `/watchlist`. Data from `WatchlistContext` +
     `/api/watchlist/quotes`.
   - Empty → single-line nudge teaching the core loop (tap ⭐ on any Chart, Screener
     result, or a mover below). This is the key first-run conversion moment.
2. **Top Movers** (unchanged) — every tile now carries a `WatchlistStar`, making
   movers the easiest on-ramp to building a list.
3. **Macro** (unchanged).
4. **Analytics Modules** grid (unchanged).

- Watchlist section shows `Skeleton`s while loading; if `/api/watchlist/quotes`
  fails it degrades to symbols-only (still clickable), mirroring how the dashboard
  already tolerates a dead movers feed.
- Reuses existing `Dashboard.css` classes — near-zero new CSS.

## Error Handling & Edge Cases
- **Unauthenticated API calls** → 401 via `_require_user` (the whole app is already
  behind auth, so this is a guard, not a user-facing flow).
- **Duplicate add** → no-op (idempotent PK), returns success.
- **Remove of a symbol not on the list** → treated as success (idempotent).
- **Over the 50-symbol cap** → 400 with a clear message; the star/add UI surfaces it
  via toast.
- **Quote fetch failure for a symbol** → returned with null price fields; UI shows
  the symbol without a quote rather than dropping it.
- **Blob write races** → same posture as auth: force-pull before every write. Note:
  watchlist writes now share the auth DB's push/pull cycle, so frequent toggles mean
  frequent blob pushes — acceptable, and optimistic UI hides the latency.

## Testing
- **Backend** (`api/test_watchlist.py`, following `api/test_auth.py`): signup a
  throwaway user → add / list (sorted) / idempotent re-add / remove / reorder /
  cap-exceeded 400 / 401 without token / symbol normalization (`reliance.ns` →
  `RELIANCE`). Quotes endpoint returns rows for the user's symbols (mock or tolerate
  live).
- **Frontend:** manual verification via the vite-preview-against-prod-API harness
  (`preview_start "web-dist"`): star toggles reflect in context across pages,
  dashboard "My Watchlist" populates, empty state renders for a fresh account.

## Future Scope (Phase 2 — not this spec)
- Watchlist-aware alerts (two-tier or filtered) extending `SignalAlertProvider`.
- Daily universal market call (Nifty green/red) → global streak + leaderboard by
  accuracy, resolved by a post-close Vercel cron.
- Per-stock accuracy stat from optional watchlist calls (private, not on the global
  board).
- Possible: multiple named watchlists, drag-to-reorder (schema already supports
  `sort_order`).
