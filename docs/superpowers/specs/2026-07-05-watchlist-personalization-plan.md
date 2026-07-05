# Watchlist & Personalized Dashboard — Implementation Plan

Companion to `2026-07-05-watchlist-personalization-design.md`. Phase 1 only.
Build order is dependency-first: backend → context → controls → pages.

## Step 1 — Backend: table + shared auth helper
- In `_auth_db()` (api/main.py ~2771), add `CREATE TABLE IF NOT EXISTS watchlist`
  (user_id, symbol, added_at, sort_order; PK (user_id, symbol)).
- Add `_require_user(authorization)` helper near `_session_user`: does the
  `_session_user` → on-miss `_blob_pull_db(force=True)` retry → `raise 401`, returns
  the user row. Refactor `/api/auth/me` to use it (keeps one copy of the retry).

## Step 2 — Backend: watchlist CRUD + quotes
- `_normalize_symbol(raw)`: strip, upper, drop trailing `.NS`, regex `[A-Z0-9&-]{1,20}`.
- `GET /api/watchlist` → sorted rows.
- `POST /api/watchlist` → validate + 50-cap → INSERT OR IGNORE (idempotent) → blob push.
- `DELETE /api/watchlist/{symbol}` → normalize → delete → blob push (idempotent).
- `PUT /api/watchlist/order` → rewrite sort_order from body list → blob push.
- `GET /api/watchlist/quotes` → read symbols, fan out `_yf_quote_change(sym + ".NS")`
  over a ThreadPoolExecutor (mirror fetch_movers), 300s API_CACHE keyed per user,
  return in sort order; null price fields on quote miss.
- All writes: `_blob_pull_db(force=True)` before mutate, `_blob_push_db()` after.

## Step 3 — Backend tests
- `api/test_watchlist.py` (pattern from test_auth.py): signup throwaway → add / list
  sorted / idempotent re-add / remove idempotent / reorder / cap 400 / 401 no-token /
  normalization (`reliance.ns` → `RELIANCE`).

## Step 4 — Frontend: WatchlistContext
- `web/src/WatchlistContext.jsx` (model on AuthContext): load symbols after login,
  expose `symbols`, `has`, `add`, `remove`, `reload`. Optimistic add/remove with
  rollback + toast on failure. Reuse the `authHeader()` bearer pattern.
- Wrap the app inside AuthProvider (in App.jsx) so it only mounts when authed.

## Step 5 — Frontend: WatchlistStar
- `web/src/components/WatchlistStar.jsx`: filled/outline star bound to context
  `has`/`add`/`remove`. Small, prop = `symbol`, optional size/className.

## Step 6 — Frontend: Watchlist page
- `web/src/pages/Watchlist.jsx` using ui primitives; columns Symbol/LTP/Chg%/actions;
  poll `/api/watchlist/quotes` @120s; type-a-ticker add box; teaching empty state.
- Route `/watchlist` + lazy import in App.jsx; sidebar NavLink under Dashboard (⭐).

## Step 7 — Frontend: place stars
- Add `<WatchlistStar>` to Chart header, Screener rows, Momentum rows, Focus rows,
  Dashboard Top Movers tiles. (Verify each page's row/symbol shape first.)

## Step 8 — Frontend: personalized Dashboard
- New "My Watchlist" section atop Dashboard.jsx: tiles from context + quotes when
  non-empty; teaching nudge when empty; Skeletons on load; symbols-only degrade on
  quote failure. Reuse dash-mover-grid styling.

## Step 9 — Build + verify
- `npm run build` in web/; verify via `preview_start "web-dist"` against prod API:
  star sync across pages, dashboard My Watchlist populates, empty state for fresh acct.
- Run `python -m pytest api/test_watchlist.py`.
