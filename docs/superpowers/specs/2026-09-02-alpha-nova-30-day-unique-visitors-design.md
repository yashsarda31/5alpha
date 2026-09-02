# Alpha Nova 30-Day Unique Visitors Design

**Date:** 2026-09-02  
**Status:** Approved for implementation planning  
**Scope:** Add one rolling 30-day unique-browser aggregate and KPI to the existing first-party visitor dashboard.

## Goal

Show the number of distinct anonymous browsers that visited Alpha Nova during the latest 30 IST calendar days. Keep the existing daily visitor KPI and all registered-user metrics unchanged.

## Metric Contract

- The metric label is **Unique visitors · 30 days**.
- The window includes today and the previous 29 IST calendar days.
- Each anonymous browser UUID counts once across the entire window, even if it visited on multiple days.
- Events before the 30-day window, future timestamps, invalid timestamps, and non-`site_visit` events do not count.
- This remains a browser estimate rather than a person count. Clearing or blocking local storage can affect counts.
- Historical coverage begins with the release of first-party `site_visit` collection; existing product events are not backfilled.

## Architecture and Data Flow

`aggregate_visitors` in `api/analytics_events.py` will build a distinct set of `device_id` values from valid `site_visit` events whose IST date falls between today minus 29 days and today. The protected `/api/admin/metrics` response will add this value to the existing `visitors` object as:

```json
{
  "unique_30d": 0
}
```

The standalone `alphanova48-growth-dashboard.html` will retain **Unique visitors today** and add a separate **Unique visitors · 30 days** KPI. Its context text will read `One browser counted once`.

The new field remains optional in dashboard payload validation. If an older backend omits `unique_30d`, the 30-day KPI will show `—` and `Backend update required` without hiding or breaking other metrics.

## Layout

The KPI grid will contain nine cards. Wide screens will use nine compact columns. At widths up to 1240px, the grid will use three columns for a balanced 3-by-3 layout; the existing two-column and one-column mobile breakpoints remain unchanged.

## Privacy and Error Handling

- Reuse only the existing anonymous browser UUID and stored `site_visit` events.
- Do not add IP addresses, cookies, fingerprinting, personal data, or third-party analytics.
- Preserve the 90-day analytics retention and anonymous-device deletion behavior.
- Ignore invalid and future timestamps rather than failing the protected metrics response.
- Keep `X-Admin-Metrics-Key` protection unchanged.

## Testing and Verification

Implementation will follow red-green-refactor and cover:

1. One browser visiting multiple days counts once across 30 days.
2. Different browsers inside the window count separately.
3. Events outside the window, future events, invalid timestamps, and other event types do not count.
4. The admin payload exposes `visitors.unique_30d`.
5. The dashboard renders the new KPI and remains compatible with older payloads.
6. Focused backend/dashboard tests, broader backend/frontend suites, focused lint, production build, and `git diff --check`.

## Delivery Boundary

This request authorizes local source changes, tests, and commits only. It does not authorize deployment, secret rotation, or copying the dashboard to Downloads. The live dashboard will not receive the new field until a separately authorized deployment.
