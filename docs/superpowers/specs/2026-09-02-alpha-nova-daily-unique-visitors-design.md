# Alpha Nova Daily Unique Visitors Design

**Date:** 2026-09-02  
**Status:** Approved for implementation planning  
**Scope:** First-party daily unique-browser tracking and one visitor KPI in the standalone growth dashboard.

## Goal

Track privacy-safe daily unique browsers across every Alpha Nova route and show one separate visitor KPI in `alphanova48-growth-dashboard.html`. Existing registered-user metrics and their meaning remain unchanged.

## Metric Contract

- A visitor is one anonymous browser identifier observed during an IST calendar day.
- The same browser counts once per IST day regardless of page or route count.
- A browser can count again on the next IST day.
- The KPI label is **Unique visitors today**.
- KPI context shows **Yesterday** and the **7-day average**.
- This is a browser estimate, not a person count. Clearing or blocking local storage can cause overcounting or undercounting.
- Tracking begins when the implementation is released. Existing product events are not backfilled because they do not cover every route consistently.

## Architecture and Data Flow

### Web application

The existing first-party product-analytics module will add a `site_visit` event. The global application shell will attempt to record it on route changes so all routes are covered. A dedicated local-storage day marker will suppress additional successful sends for that browser during the same IST day.

The marker will be written only after the API accepts the event. If a request fails, a later route change can retry. An in-flight guard will prevent duplicate concurrent requests.

The event will reuse the existing random anonymous browser UUID. It will not contain an IP address, email address, symbol, query string, token, or other identity data. Its route field will use the schema's site-level canonical route because landing-page reporting is outside this feature's scope.

### API and storage

`site_visit` will be added to the analytics event allowlist and stored in the existing `analytics_events` table. The existing 90-day retention and anonymous-device deletion flow will continue to apply.

The protected `GET /api/admin/metrics` response will add a separate `visitors` object containing:

```json
{
  "timezone": "Asia/Kolkata",
  "today": 0,
  "yesterday": 0,
  "average_7d": 0.0,
  "tracked_since": null
}
```

Counts will use distinct `device_id` values per IST calendar day. `average_7d` will be the mean of the seven daily counts ending today, including zero-visitor days. `tracked_since` will be the earliest valid `site_visit` timestamp, or `null` before tracking begins.

### Standalone growth dashboard

The dashboard will add one KPI card after the registered-user KPIs:

- Label: `Unique visitors today`
- Value: `visitors.today`
- Context: `Yesterday X · 7-day avg Y`

The dashboard will keep its current registered-user charts, funnel, recent-user table, date-range controls, authentication behavior, and in-memory admin key unchanged. If an older backend omits `visitors`, the KPI will show an unavailable state explaining that the backend update is required instead of rejecting the whole metrics payload.

## Error Handling and Privacy

- Visitor tracking must never block navigation or surface errors to public users.
- Failed sends remain retryable during the same day.
- Invalid event payloads remain rejected by the API.
- Admin metrics remain protected by `X-Admin-Metrics-Key`.
- No third-party analytics service, fingerprinting, IP hashing, cookies, or personal data will be introduced.
- Resetting anonymous product analytics will delete the browser's stored visitor events and rotate or remove its local browser identifier as it does for existing product events.

## Testing and Verification

Implementation will follow red-green-refactor and cover:

1. One successful visit per browser per IST day across multiple route attempts.
2. A new event on the next IST calendar day.
3. Retry after a failed send and suppression after success.
4. API allowlist and validation for `site_visit`.
5. Distinct-browser aggregation for today and yesterday.
6. Seven-day average including empty days and correct IST midnight boundaries.
7. Existing 90-day retention and device deletion behavior.
8. Dashboard KPI rendering and graceful behavior against an older payload.
9. Focused backend/frontend tests, existing relevant suites, HTML contract checks, and `git diff --check`.

## Delivery Boundary

This request authorizes local source and dashboard changes plus local verification. It does not authorize a production deployment, secret rotation, or copying the dashboard to Downloads. Production will not collect or display this metric until the API and web changes are deployed separately.
