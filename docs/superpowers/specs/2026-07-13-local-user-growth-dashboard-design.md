# Local User Growth Dashboard Design

**Date:** 2026-07-13
**Status:** Design approved; awaiting written specification review

## Goal

Create a new, self-contained HTML dashboard that runs only on the owner's computer and reads current user-growth data from the live `https://alphanova48.in` backend. It replaces the existing broken metrics HTML rather than modifying it.

## Root Cause Addressed

The current local dashboard defaults to the retired Vercel hostname, while the FastAPI CORS policy only permits that hostname. A page opened from disk has the `null` origin, so its request to the live domain is blocked by the browser. The replacement requires a narrowly scoped backend CORS response for the protected admin metrics endpoint.

## Deliverables

1. A new root-level file named `alphanova48-growth-dashboard.html`.
2. A small backend change that lets the admin metrics endpoint accept local-file requests without opening the rest of the API to local origins.
3. Backend tests covering authorization, local-origin access, and rejected origins.
4. A short usage note inside the dashboard connection screen.

The existing `alpha-nova-metrics.html` and `web/public/metrics.html` remain untouched.

## Access and Security

- The dashboard defaults to `https://alphanova48.in/api/admin/metrics`.
- The owner enters the `ADMIN_METRICS_KEY` when opening the file.
- The key is kept in memory for the current page only. It is not written to `localStorage`, embedded in the HTML, or shown after connection.
- The dashboard sends the key in an `X-Admin-Metrics-Key` request header. The endpoint retains query-key compatibility for existing clients during transition.
- The endpoint returns `Access-Control-Allow-Origin: null` only for the admin metrics route when the request origin is `null` and the admin key is valid. The global API CORS policy is not broadened.
- Failed authentication shows a generic access error and no user data.

## Dashboard Content

### Header

- Alpha Nova identity and `User Growth` title
- Live/failed connection indicator
- Last refreshed timestamp
- Refresh button
- Range selector: 7, 30, 60, or 90 days

### KPI Cards

- Total users
- New users in the selected period
- Week-over-week signup growth
- Activation rate: users who have logged in at least once divided by total users
- Active users in the last 7 days
- Active users in the last 30 days
- Unexpired sessions

When a comparison denominator is zero, growth is shown as `No prior-period baseline` rather than an infinite percentage.

### Visuals

- Cumulative user-growth line/area chart
- Daily signup bar chart for the selected range
- Engagement funnel: total users, ever logged in, active 30-day users, active 7-day users

Charts use inline SVG and JavaScript so the HTML has no CDN or package dependency.

### Recent Users

A responsive table showing display name, partially masked email, signup date, last login, and status (`New`, `Active`, or `Dormant`). Raw full email addresses are not displayed in the local UI.

## Data Contract

The backend response will keep the existing `totals`, `growth`, `recent`, and `generated_at` fields. It will add period-ready values needed for accurate comparisons:

- `new_previous_7d`
- `new_previous_30d`
- growth history covering 90 days

The frontend derives selected-range totals from the daily growth series. It derives activation and funnel percentages from aggregate totals. It must not fabricate historical activity: the database stores only each user's latest login timestamp, so true DAU/retention history is outside this scope.

## States and Error Handling

- **Connection:** live URL and admin-key inputs with a Connect button.
- **Loading:** skeleton cards and chart placeholders.
- **Success:** dashboard content with generated-at timestamp.
- **Unauthorized:** concise invalid-key or server-configuration message.
- **CORS/network failure:** diagnosis explaining that the live API could not be reached.
- **Empty dataset:** zero-valued KPIs and a useful `No users yet` state.
- **Malformed response:** dashboard remains on the connection screen and reports an incompatible API response.

## Responsive and Accessibility Requirements

- Desktop-first owner dashboard with a usable single-column mobile layout.
- Keyboard-operable controls with visible focus states.
- Semantic buttons, labels, table headers, and status text that does not rely on color alone.
- Reduced-motion support.
- No horizontal page overflow; the user table may scroll inside its card.

## Validation

Before deployment or handoff:

1. Run the focused admin metrics test suite.
2. Verify valid and invalid admin keys.
3. Verify `Origin: null` succeeds only on the protected metrics endpoint.
4. Verify an unapproved web origin remains blocked.
5. Validate the HTML and JavaScript for syntax errors.
6. Open the file locally and check loading, success, empty, error, range-filter, refresh, desktop, and mobile states.
7. Run the existing relevant backend test suite to catch regressions.

## Out of Scope

- Public or in-app analytics pages
- Third-party analytics integrations
- Revenue, subscription, acquisition-channel, or feature-event analytics
- True historical DAU, retention cohorts, and churn tracking without a new event-history model
- Automatic deployment without completed tests
