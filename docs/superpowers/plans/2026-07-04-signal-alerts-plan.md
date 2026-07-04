# In-App Signal Alerts — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-04-signal-alerts-design.md`

## Phase 1 — Alert module (`web/src/alerts/`)
1. `alerts.css` — toast stack (fixed top-right, glass panel, green/red side accent), bell button styles.
2. `ToastStack.jsx` — presentational: list of toasts, side color, entry/stop/target line, `×` and body-click handlers, `role="status"`.
3. `SignalAlertProvider.jsx`:
   - Context + `useSignalAlerts()` hook (`browserEnabled`, `toggleBrowser`, `permission`).
   - Poll `/api/signals` on mount + every 120s (in-flight guard, 20s AbortController). Runs regardless of `document.hidden`.
   - Detection vs `localStorage["alphanova_seen_signals"] {date, keys}`; seed-silent on first/day-change; toast + conditional `Notification` per spec.
   - `window.__fireTestSignal(overrides?)` dev hook.
   - Renders `{children}` + `<ToastStack/>`. Uses `useNavigate` for click-through.

## Phase 2 — Wire into app (`web/src/App.jsx`)
1. Wrap `AppLayout`'s returned tree in `<SignalAlertProvider>`.
2. Add a bell toggle button in the sidebar account box using `useSignalAlerts()` (shows on/off + permission state).

## Phase 3 — Verify (preview browser, prod API)
1. Load app → confirm seed-silent (no toast blast), no console errors.
2. `window.__fireTestSignal()` → toast renders correctly, styled by side; click → `/signals`.
3. Bell toggle → permission flow; simulate `document.hidden` → notification path.
4. Regression: existing pages unaffected.

## Phase 4 — Ship
Build → commit → `npx vercel --prod --yes` → prod smoke (frontend loads, `__fireTestSignal` works on prod bundle).
