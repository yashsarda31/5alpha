# Daily Nifty Call / Leaderboard (Phase 2A) — Implementation Plan

Companion to `2026-07-05-daily-call-leaderboard-design.md`. Build order:
backend → tests → context → dashboard card → leaderboard page → opt-out →
build/verify/deploy.

## Step 1 — Backend: tables + time helpers
- Add `daily_questions`, `predictions`, `streak_stats` to `_auth_db()`.
- `_ist_now()`, `_active_question_date(now)` → (qdate, locked): today if weekday &
  before close (locked once ≥9:15 IST), else next weekday unlocked.
- `_nifty_outcome_for_date(qdate)` via yfinance `^NSEI` history → ('UP'|'DOWN', chg)
  or None (holiday/no data).

## Step 2 — Backend: endpoints + resolver + cron
- `GET /api/predict/today`, `POST /api/predict` (423 if locked), `GET /api/predict/me`,
  `GET /api/leaderboard?board=`, `POST /api/predict/hide`, `GET /api/predict/resolve`.
- `_resolve_day(conn, qdate)`: claim via `outcome IS NULL` guard, mark predictions
  correct/incorrect, incrementally update `streak_stats` (guarded by
  `last_resolved_date < qdate`), reset live-streak non-participants.
- resolve ensures the last 5 weekday question rows, resolves pending past days,
  VOIDs stale unresolvable (holiday) days > 4 days old.
- Add cron `"30 10 * * 1-5"` → `/api/predict/resolve` in vercel.json.

## Step 3 — Backend tests (`api/test_predictions.py`)
submit before/after lock, upsert, resolve correct/wrong, streak inc then reset,
non-participant reset, holiday no-data leaves streak intact, accuracy min-sample,
hide removes from board, own-rank when below cut, idempotent resolve, 401.

## Step 4 — Frontend: PredictionContext
`web/src/PredictionContext.jsx` (like WatchlistContext): today + stats, submit,
reload, setHidden. Mounted in AppLayout.

## Step 5 — Dashboard "Today's Call" card
Below Movers/Macro, above Analytics Modules. Green/Red buttons pre-lock; locked
choice + 🔥 streak + status; ✓/✗ after resolution.

## Step 6 — Leaderboard page + nav
`web/src/pages/Leaderboard.jsx` "Nifty Leaderboard", route `/leaderboard`, sidebar
🏆 nav. Stats header, recent history, Streak/Accuracy toggle table (own row highlit).

## Step 7 — Sidebar opt-out
"Hide me from leaderboard" toggle near AlertBell → POST /api/predict/hide.

## Step 8 — Build, verify (local api + preview), deploy
pytest; submit pick → dashboard card + leaderboard reflect; opt-out hides row.
npm build; commit; `npx vercel --prod --yes`; verify routes live.
