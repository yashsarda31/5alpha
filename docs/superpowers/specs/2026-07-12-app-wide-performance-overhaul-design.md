# Alpha Nova App-Wide Performance Overhaul

## Objective

Make the Alpha Nova website and authenticated app materially faster on mobile and desktop without removing core functionality or weakening data freshness, session behavior, security, or the premium interface.

## Measured Baseline

Production Lighthouse and direct-request measurements taken on 12 July 2026:

| Surface | Performance | FCP | LCP | TBT | Speed Index |
|---|---:|---:|---:|---:|---:|
| Landing page | 97 | 1.4 s | 1.7 s | 170 ms | 1.8 s |
| Dashboard | 93 | 1.7 s | 2.0 s | 200 ms | 4.2 s |
| Chart Analyser with NVDA | 44 | 2.8 s | 4.7 s | 7,120 ms | 6.0 s |

Additional findings:

- The shared Plotly finance bundle is approximately 1.16 MB before transfer compression and causes severe main-thread blocking on chart routes.
- The initial application bundle is approximately 233 KB before transfer compression.
- A cold `/api/fiidii` request took approximately 19 seconds; the same cached request took approximately 0.3 seconds.
- FII/DII cold execution fetches many daily NSE files sequentially, making upstream latency cumulative.
- Static hashed assets already have immutable CDN caching and gzip compression.
- Public market-data endpoints already have an edge-cache foundation that can be extended safely.

## Approved Scope

The selected approach is a staged, app-wide performance overhaul covering chart rendering, application initialization, request scheduling, client caching, FII/DII generation, and public API edge caching.

## Chart Architecture

Plotly will be removed from the production dependency graph. Each visualization will use the lightest component appropriate to its behavior instead of one general-purpose plotting package.

### Financial charts

Chart Analyser, FLCL Analysis, and the Druck-Minervini trend overlay will use the `lightweight-charts` package.

The shared financial-chart adapter will support:

- candlesticks;
- synchronized price, volume, and oscillator panes;
- moving-average and support/resistance line series;
- markers for swing points and regime flips;
- crosshair, tooltip, zoom, and pan;
- automatic resize through `ResizeObserver`;
- desktop and mobile sizing;
- the existing black, graphite, green, red, purple, blue, and gold design language;
- cleanup on unmount so navigation does not leak chart instances or listeners.

### Forecast chart

The ARIMA history, forecast, endpoint marker, today divider, and confidence band will use a focused responsive SVG component. It will include readable axes, a hover/focus tooltip, the current forecast annotation, and a mobile-safe legend.

### Sector rotation chart

The RRG quadrant visualization will use a focused responsive SVG component with quadrant backgrounds, sector tails, head markers, labels, and pointer/keyboard tooltips.

### Data adapters

Small pure adapters will normalize API arrays into chart series, filter invalid points, map timestamps, and calculate visible ranges. Adapter tests will verify ordering, null handling, timestamps, and derived series.

## Application Initialization

The application shell and current route must become interactive before optional global work begins.

- Keep route-level code splitting.
- Lazy-load Settings and sharing/export code only when invoked.
- Initialize watchlist and prediction requests only for signed-in users and routes that consume them.
- Start signal polling and notification setup during browser idle time, while still triggering promptly on signal-related routes.
- Replace unconditional idle prefetching of every light route with connection-aware prefetching.
- Disable background prefetch when `Save-Data` is enabled or the effective connection is slow.
- Preserve hover, focus, and touch intent prefetch for the selected destination.
- Keep the optimistic cached-user session restoration behavior.

## Frontend Request Behavior

- Run independent requests in parallel. Chart data and fundamentals must no longer be serial.
- Add in-flight request deduplication to the shared stale-while-revalidate layer.
- Render the last good response immediately and refresh without replacing the page with a full skeleton.
- Abort page-owned requests when the route unmounts or the searched symbol changes.
- Prevent overlapping intervals and duplicate development-mode fetches.
- Keep compact inline retry states while stale data remains visible.

## FII/DII Performance Design

FII/DII data may be delayed by up to 15 minutes, as approved by the user.

### Response strategy

- Store the last successful FII/DII snapshot in browser stale-while-revalidate storage and a dedicated Vercel Blob snapshot, separate from authenticated user data.
- Return the last snapshot immediately with an explicit `updated_at` value.
- Refresh no more than once every 15 minutes.
- If upstream NSE or Yahoo data is unavailable, continue serving the last successful snapshot and mark it stale instead of returning an empty table.

### Refresh strategy

- Stop fetching an NSE participant-open-interest file sequentially for every historical session.
- Fetch only the recent dates whose published files can change or are required by the visible dataset.
- Fetch those recent files concurrently with a strict worker limit, short per-request timeout, and an overall deadline.
- Reuse persisted results for older dates.
- Keep the existing disclosure that historical values include modeled data where real free-source history is unavailable.
- Add `source_status`, `updated_at`, and `is_stale` metadata so the UI can communicate freshness honestly.

### Targets

- Warm FII/DII response: less than 1 second.
- Cold FII/DII response when a persisted snapshot exists: less than 3 seconds.
- No blank page when an upstream source times out.

## Backend and Edge Caching

- Preserve the rule that authorization-bearing responses are never publicly cached.
- Keep endpoint-specific `s-maxage` and `stale-while-revalidate` values for anonymous shared market data.
- Add safe public cache rules only for deterministic shared GET endpoints.
- Deduplicate simultaneous recomputations inside a warm function instance.
- Bound upstream requests with connect/read or total timeouts.
- Avoid caching error responses or user-specific payloads.

## Failure Handling

- Existing content remains visible while data refreshes.
- Upstream failures show a non-blocking stale-data or retry notice.
- Chart adapter failures produce an accessible empty state rather than breaking the route.
- Timeout and abort errors are distinguished from invalid-symbol errors.
- Every chart instance, observer, event listener, and request controller is released on unmount.

## Accessibility and Mobile Behavior

- Preserve readable labels and contrast.
- Provide keyboard-accessible data tooltips or concise tabular summaries for custom SVG charts.
- Respect `prefers-reduced-motion` for chart transitions.
- Maintain at least 44-pixel touch targets for chart controls.
- Avoid horizontal overflow at 320 CSS pixels.
- Reduce chart point density or marker labels on narrow screens without dropping the underlying data.

## Testing Strategy

### Automated tests

- Unit tests for financial, forecast, and sector chart data adapters.
- Unit tests for request deduplication, stale fallback, cancellation, and freshness metadata.
- Backend tests for FII/DII persisted snapshot behavior, bounded concurrency, stale fallback, and cache headers.
- Existing authentication, watchlist, signals, dashboard, and market-data tests must continue to pass.
- Production build and targeted lint must pass.

### Production verification

Before deployment, test Landing, Dashboard, Chart Analyser, FII/DII, ARIMA, FLCL, Druck-Minervini, and Sector Rotation on desktop and mobile widths.

After deployment, run live API smoke tests and mobile Lighthouse audits.

## Deployment Gates

- Chart Analyser Lighthouse performance score is at least 80 on the same audit profile used for the baseline.
- Dashboard performance remains at least 90.
- Chart candlesticks, indicators, volume, RSI, crosshair, zoom, pan, and mobile layout work.
- FII/DII renders cached data immediately and no longer waits on a long sequential cold refresh.
- FII/DII warm response is under 1 second and cold response with persisted data is under 3 seconds.
- No regression in authentication, watchlists, live setup links, signals, or route navigation.

## Rollout Order

1. Introduce shared lightweight chart primitives and adapters with tests.
2. Migrate Chart Analyser and verify the largest performance gain.
3. Migrate FLCL, Druck-Minervini, ARIMA, and Sector Rotation; remove Plotly.
4. Optimize application providers, optional imports, prefetching, and request deduplication.
5. Rework FII/DII snapshot persistence and bounded refresh.
6. Tune safe API edge caching and timeouts.
7. Run the full test, build, functional, performance, and live smoke-test gates.
8. Deploy only after every required gate passes.

## Out of Scope

- Visual redesigns unrelated to loading or interaction performance.
- Changes to trading logic, scores, forecasts, or investment methodology.
- Real-time streaming infrastructure.
- Paid market-data subscriptions.
- Caching authenticated or personalized data at the public CDN edge.
