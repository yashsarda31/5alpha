# In-App Signal Alerts — Design

**Date:** 2026-07-04
**Status:** Approved
**Feature:** Pop-up (toast) notification whenever a new scored setup appears in the Market Signals engine, with optional native browser notifications when the tab is backgrounded.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| What triggers an alert | Any new scored setup (new `symbol\|side\|kind`) in `/api/signals` → `setups.plans`. All of them (engine already floors at score ≥ 45). |
| Delivery | In-app toast always; also a native browser notification when the tab is hidden AND the user enabled it (permission asked once via a sidebar bell toggle). |
| Transport | Frontend polling of the existing `/api/signals` (no backend changes). |

## Why polling, not push

Vercel's Python serverless functions can't hold SSE/WebSocket connections, and the signals data itself only refreshes every 120s (server cache TTL). A 120s client poll aligns with that TTL — polls mostly hit the warm server cache, adding negligible load and no extra NSE calls. Real push would need an Edge-runtime rewrite for no practical latency gain.

## Architecture

New `web/src/alerts/` module, wrapping the authenticated app shell:

- **`SignalAlertProvider.jsx`** — context provider mounted inside `AppLayout` (so it sits within `BrowserRouter` and only runs for logged-in users). Responsibilities:
  - Poll `/api/signals` on mount and every 120s, regardless of tab visibility (so background notifications fire). An in-flight guard skips overlapping polls; each fetch is bounded by a ~20s `AbortController` timeout so cold starts don't pile up.
  - Detect new signals, raise toasts, and (conditionally) fire browser notifications.
  - Expose `useSignalAlerts()` → `{ browserEnabled, toggleBrowser, permission }` for the sidebar bell.
  - Render the toast stack (fixed overlay; tree position irrelevant).
- **`ToastStack.jsx`** — presentational; renders up to 4 newest toasts, each auto-dismissing after 10s.
- **`alerts.css`** — glass-terminal styling.
- **Sidebar bell** — a small toggle button added to `AppLayout`'s account box, driven by `useSignalAlerts()`.

## New-signal detection

- Each setup keyed `` `${symbol}|${side}|${kind}` ``.
- Persistence: `localStorage["alphanova_seen_signals"] = { date, keys[] }`, where `date` is the feed's `as_of` date (`YYYY-MM-DD`).
- Per poll:
  1. `dateKey = data.as_of?.slice(0,10) || "unknown"`, `plans = data.setups?.plans || []`, `currentKeys = plans.map(key)`.
  2. If no stored record **or** `stored.date !== dateKey` → **seed silently**: store `{date: dateKey, keys: currentKeys}`, raise no toasts. (Prevents an alert blast when opening the app or at a new session/day.)
  3. Else → `newKeys = currentKeys − stored.keys`; for each, raise a toast (+ browser notif per rules); then persist `keys = union(stored.keys, currentKeys)`.
- This makes refreshes idempotent (already-seen keys never re-alert) and resets naturally each trading day.

## Toast

Glass panel, top-right stack, colored by side (green LONG / red SHORT). Content:
`⚡ {SIDE} {SYMBOL} — conviction {score}/100` and a second line `entry ₹{entry} · stop ₹{stop} · target ₹{target}`.
Auto-dismiss 10s; `×` closes; clicking the body navigates to `/signals` and dismisses. Max 4 shown (newest win). `role="status"`.

## Browser notifications

- `'Notification' in window` guard throughout.
- Sidebar bell: off by default. First enable calls `Notification.requestPermission()`; preference persisted in `localStorage["alphanova_browser_notifs"]`. If permission is denied, the toggle reflects that and in-app toasts still work.
- On a new signal: if `document.hidden && browserEnabled && Notification.permission === 'granted'` → `new Notification("⚡ {SIDE} {SYMBOL} {score}/100", {body, tag:key})`. `onclick` → `window.focus()` + navigate to `/signals`.

## Error handling

- The whole provider body is defensive: poll failures are caught, logged to console, and retried next cycle. Malformed/empty `setups` yields zero keys (no crash, no alerts).
- The provider must never break the app: any render/notification error is swallowed. Notifications are strictly best-effort.

## Testing / verification

- `window.__fireTestSignal(overrides?)` dev hook injects a synthetic new signal (toast + browser-notif path) so the UI is demoable even when the live engine has no setups (weekends/off-hours).
- Manual verification in the preview browser: seed-silent on first load (no toast blast), a `__fireTestSignal()` call produces a correctly styled toast, click-through navigates to `/signals`, bell toggles permission, and background-notification path fires when `document.hidden` is simulated. Confirm no console errors and that existing pages are unaffected.

## Out of scope

- No server-side alert history or persistence, no email/push-service delivery, no per-symbol watchlists or thresholds (engine's ≥45 floor is the only filter), no sound.
