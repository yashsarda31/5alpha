# Daily Nifty Call — Streak & Leaderboard (Phase 2A) — Design

**Date:** 2026-07-05
**App:** Alpha Nova (FastAPI `api/main.py` + React/Vite `web/`, Vercel)
**Status:** Approved for planning
**Predecessor:** `2026-07-05-watchlist-personalization-design.md` (Phase 1, shipped)

## Goal

Retention. Give users a reason to open the app **every trading morning** even on
quiet days: a single daily prediction — *"NIFTY 50: Green or Red at close?"* —
that builds a streak and feeds competitive leaderboards. This is Phase 2A of the
retention plan; per-stock accuracy and alert personalization remain later phases
and are out of scope here.

## Scope

**In scope:**
- One universal daily call (NIFTY 50 green/red), locked at market open, resolved
  after close by a cron.
- Streak mechanic (rule: miss a trading day OR call it wrong → reset to 0).
- Two leaderboards — Current Streak and All-time Accuracy — with a toggle.
- Dashboard "Today's Call" card + a dedicated "Nifty Leaderboard" page.
- Public-by-default identity (display name) with a sidebar opt-out.

**Out of scope (later phases):**
- Per-stock accuracy predictions on watchlist names.
- Watchlist-aware / personalized alerts.
- Streak freezes, badges, weekly resets, multi-index questions.

## Mechanic & Daily Lifecycle

- **Question:** same for all users, one per trading day. Green = today's NIFTY 50
  close ≥ previous close.
- **Window:** opens when the prior day resolves; **locks at 9:15 IST** (market
  open). Before lock, submit/change freely; after lock, read-only until close.
- **Resolution:** post-close cron (~16:00 IST / `30 10 * * 1-5` UTC). Reads NIFTY 50
  day change from NSE `allIndices` (`percentChange`), falls back to yfinance `^NSEI`.
  `change_pct >= 0` → outcome `UP` (green), else `DOWN`.
- **Streak update on resolution (rule A):**
  - Correct prediction → `current_streak += 1`, update `longest_streak`.
  - Wrong prediction → `current_streak = 0`.
  - Live streak (`current_streak > 0`) but **no prediction that trading day** →
    `current_streak = 0`. (Scans all users with a live streak; fine at current scale.)
- **Holidays:** if `allIndices` has no NIFTY 50 row for the day, nothing is resolved
  and no streak is touched — holidays are skipped, never a "miss."
- **Idempotent:** resolving an already-resolved `qdate` is a no-op; safe on retry or
  double-fire. Resolution also runs opportunistically inside `/api/predict/today`
  when it detects an unresolved past-close day, so it isn't solely cron-dependent.

## Data Model (3 tables in the auth/blob SQLite DB)

```sql
CREATE TABLE IF NOT EXISTS daily_questions (
    qdate TEXT PRIMARY KEY,          -- trading day, ISO date (IST)
    symbol TEXT NOT NULL DEFAULT 'NIFTY 50',
    outcome TEXT,                    -- 'UP' | 'DOWN' | NULL until resolved
    change_pct REAL,
    resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS predictions (
    user_id INTEGER NOT NULL,
    qdate   TEXT NOT NULL,
    choice  TEXT NOT NULL,           -- 'UP' | 'DOWN'
    correct INTEGER,                 -- NULL until resolved, else 0/1
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, qdate)
);
CREATE TABLE IF NOT EXISTS streak_stats (
    user_id INTEGER PRIMARY KEY,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    total_calls    INTEGER NOT NULL DEFAULT 0,
    correct_calls  INTEGER NOT NULL DEFAULT 0,
    last_resolved_date TEXT,
    hide_from_board INTEGER NOT NULL DEFAULT 0
);
```

- Accuracy = `correct_calls / total_calls`; Accuracy board gates on `total_calls ≥ 20`.
- Streaks maintained incrementally on resolution (not recomputed), so leaderboard
  queries stay a simple `JOIN users … ORDER BY`.
- Tables created via `CREATE TABLE IF NOT EXISTS` in the DB-open helper, like the
  existing `users`/`sessions`/`watchlist` tables.

## API

Auth-gated via `_require_user` except the cron resolver. Writes follow the auth
blob posture (`_blob_pull_db(force=True)` → mutate → `_blob_push_db()`).

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/predict/today` | — | `{ qdate, symbol, prompt, locked, your_choice, outcome, market_open }` |
| `POST /api/predict` | `{choice}` | Upsert today's pick; 400/423 if locked |
| `GET /api/predict/me` | — | `{ current_streak, longest_streak, total_calls, correct_calls, accuracy, recent:[…] }` |
| `GET /api/leaderboard?board=streak\|accuracy` | — | top ~50 + your own rank; respects `hide_from_board` |
| `POST /api/predict/hide` | `{hidden}` | toggle opt-out |
| `GET /api/predict/resolve` | — | cron resolver (idempotent) |

- **`/today`** lazily creates the `daily_questions` row on first hit of a trading day.
  `locked = now ≥ 9:15 IST` on that day.
- **`/resolve`** added to `vercel.json` crons (`"30 10 * * 1-5"`). No user auth,
  mirroring the existing `/api/delivery/refresh` cron; safe because it writes only
  deterministic resolution data and is idempotent.
- Leaderboards return the top ~50 **plus the caller's own rank** even when below the
  cut, so a user always sees where they stand.

## Frontend

- **`PredictionContext`** (modeled on `WatchlistContext`): loads `/api/predict/today`
  + `/api/predict/me`, exposes `today`, `stats`, `submit(choice)`, `reload`. Shared by
  the dashboard card and the leaderboard page so they stay in sync.
- **Dashboard "Today's Call" card:** placed **below the Movers/Macro row, above the
  Analytics Modules grid** (prominent but not the very top). Shows the question with
  two big Green/Red buttons before lock; after lock, the locked-in choice + 🔥 current
  streak + a lock/close status; after close, a ✓/✗ result. Uses `PredictionContext`.
- **`/leaderboard` page — "Nifty Leaderboard"** (sidebar nav, 🏆 icon): the user's
  streak/accuracy stats, recent call history, and the two leaderboards with a
  **Streak / Accuracy toggle** (own row highlighted). Built from `ui` primitives
  (`PageHeader`, `DataTable`, `StatusPill`, `Badge`).
- **Sidebar opt-out:** a small "Hide me from leaderboard" toggle near the alert bell,
  calling `/api/predict/hide`.

## Error Handling & Edge Cases
- **Submit after lock** → 423/400 with a clear message; UI disables the buttons once
  `locked`.
- **Submit with an invalid choice** → 400.
- **First-ever prediction** → lazily creates the user's `streak_stats` row.
- **Resolve when NIFTY data is unavailable** → skip (holiday/data outage), leave the
  day unresolved for a later retry; never falsely reset streaks.
- **Two serverless instances resolving at once** → idempotent guard on
  `daily_questions.outcome IS NULL` + `force` blob pull before writing.
- **Leaderboard with no eligible users** → empty state.

## Testing
- **Backend** (`api/test_predictions.py`): submit before/after lock, upsert overwrites
  a pick, resolve marks correct/incorrect, streak increments then resets on a wrong
  call, non-participant with a live streak resets, holiday (no data) leaves streak
  intact, accuracy min-sample gate, `hide_from_board` removes a user from the board,
  own-rank returned when below the cut, resolve idempotency, 401 without token.
  NIFTY fetch stubbed via monkeypatch.
- **Frontend:** verify via the local `api` server + preview harness — submit a pick,
  see it reflected in the dashboard card and `/leaderboard`, opt-out hides the row.

## Future Scope (later phases)
- Per-stock accuracy predictions on watchlist names (private stat).
- Watchlist-aware / personalized alerts.
- Streak freezes, achievement badges, weekly/seasonal leaderboards.
