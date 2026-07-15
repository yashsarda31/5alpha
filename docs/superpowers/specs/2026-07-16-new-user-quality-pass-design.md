# Alpha Nova New-User Quality Pass Design

**Date:** 2026-07-16
**Status:** Approved for implementation

## Goal

Make the first Alpha Nova session trustworthy, understandable, and continuous
from discovery through research and account creation. Fix the reproduced data
association bugs and the highest-friction onboarding paths without redesigning
the approved terminal structure or changing signal-model semantics.

## Reproduced Problems

The production audit covered the landing page, dashboard, signals, Chart
Analyser, signup, screener, track record, watchlist intent, and a 390 x 844
mobile viewport. It reproduced these issues:

1. During a chart search, the new input ticker immediately relabels the previous
   response. For roughly 19 seconds, NVDA's price and fundamentals appeared as
   `RELIANCE.NS` values with a rupee symbol.
2. A direct `/chart?symbol=...` load shows `No Ticker Loaded` while the ticker is
   actively loading, which contradicts the disabled `LOAD...` button.
3. `/chart` starts with `NVDA` in the input but does not load it, making the
   empty state look broken.
4. Tapping a watchlist star as a guest opens signup, but the post-auth redirect
   keeps only `pathname`. It drops the ticker query/hash and the watchlist-save
   intent.
5. The landing terminal preview uses hard-coded prices and presents them as
   `MKT OPEN`, `LIVE SETUPS`, and an active signal engine even when the market is
   closed and the values are not live.
6. Signup and screener visual labels are not associated with their controls, so
   several inputs have placeholder-only or empty accessible names.
7. Signal and screener symbols are plain text, preventing the natural drill-down
   into Chart Analyser.
8. The dashboard repeats signup calls in the banner, sidebar, and embedded guest
   watchlist, while the watchlist empty state consumes prime above-the-fold space.
9. An unavailable GJR-GARCH forecast renders as `N/A%` instead of `N/A`.

## Product Decisions

- Correctness and trust take priority over cosmetic expansion.
- A rendered stock label, currency, watchlist star, share filename, and AI
  request must be owned by the loaded response ticker, never by the editable
  search field.
- Old analysis is hidden while a different ticker is loading. The page displays
  a clear, ticker-specific loading state instead of retaining stale numbers.
- The bare `/chart` route starts with an empty search field. Deep links with a
  `symbol` query continue to auto-load.
- Guest watchlist intent survives signup/login and completes automatically once
  authentication succeeds.
- Landing sample values remain visually useful but are explicitly labelled as
  an illustrative preview; no static value is described as live or market-open.
- Existing terminal navigation, visual language, Stock Pro layout, signal
  scoring, ledger behavior, and backend data contracts remain unchanged.

## Component Design

### Chart Analyser State Ownership

Separate the editable search value from the loaded response identity:

- `ticker` is the draft/search value.
- `pendingTicker` identifies the in-flight request.
- `chartData.ticker` is the authoritative rendered identity.

At request start, clear any prior fetch error and AI report, set the pending
ticker, and hide the old analysis. Render a deterministic loading card such as
`Loading RELIANCE.NS analysis...`. On success, render only the returned response
and derive currency, labels, watchlist market, sharing metadata, and AI context
from its ticker. On failure, show the attempted ticker in the error and do not
reveal stale data. Abort handling remains request-scoped so an older response
cannot overwrite a newer search.

### Authentication Return Intent

Watchlist-star navigation to signup carries:

- the full originating location (`pathname`, `search`, and `hash`); and
- a typed pending intent containing `symbol` and `market`.

After successful login/signup, navigate to the complete origin and pass the
pending intent in navigation state. The matching `WatchlistStar` consumes the
intent once the authenticated watchlist context is ready, calls the existing
`add` action, then replaces the location state so refresh/back navigation cannot
repeat the write. If the add fails, the existing watchlist rollback/error path
remains authoritative.

### Honest Landing Preview

Keep the preview visually unchanged, but replace real-time claims with explicit
sample language: `TERMINAL PREVIEW`, `SAMPLE DATA`, and `EXAMPLE SETUPS`.
The preview must not imply current market status or current recommendations.
The production dashboard remains the route for live/current information.

### Accessible Forms

Signup inputs receive stable `id`, `name`, and associated `label htmlFor`
attributes. The password field gets a concise minimum-length hint referenced by
`aria-describedby`; request failures use an alert role.

The screener universe, ticker list, and numeric filters receive the same label
associations and stable names. Existing layouts and submitted values do not
change.

### Research Continuity

Market Signals and Screener render each symbol as a link to
`/chart?symbol=...`. NSE symbols use the `.NS` suffix; US symbols remain bare.
The current row contents, sorting, stars, scoring, and signal calculations are
unchanged.

### Guest Dashboard Density

For the embedded guest watchlist only, use a compact explanatory state and one
text link instead of another large signup button. The global guest banner and
sidebar remain the primary account calls to action. Authenticated watchlist
behavior is unchanged.

### Missing Forecast Formatting

Render the GJR-GARCH value as a formatted percentage only when the value is
finite. Otherwise render exactly `N/A`. No forecast calculation changes.

## Error Handling and Edge Cases

- Empty chart searches do nothing and keep the empty state.
- A failed replacement search never falls back to the previous ticker's data.
- Bare NSE symbols resolved by the backend adopt the response ticker.
- Rapid consecutive searches abort the older request and only the newest
  controller may clear loading state.
- A pending watchlist intent is consumed only by the matching symbol and only
  for an authenticated user.
- Direct login/signup visits without a return state continue to land on the
  dashboard.
- Existing signup errors remain visible even if the pending watchlist action is
  present.
- Missing optional volatility legs render without suffixes or invalid numbers.

## Testing and Release Gates

Add focused regression coverage for:

- response-owned chart presentation and pending-state behavior;
- full auth return URLs and typed watchlist intents;
- single-consumption watchlist intent matching;
- NSE/US chart-link generation;
- percentage-or-`N/A` forecast formatting; and
- associated signup/screener labels where practical.

Before deployment:

1. Run all frontend Node tests.
2. Run frontend lint and production build.
3. Run the complete backend test suite and Python compile checks.
4. Reproduce the chart replacement flow locally and confirm stale values never
   appear under a new ticker.
5. Verify landing, dashboard, signup, signals, screener, chart deep links, and
   watchlist intent on desktop and a 390 x 844 mobile viewport.
6. Deploy only after every relevant gate passes.
7. Smoke-test the same production flows on `alphanova48.in`, including one
   failing chart symbol and one valid NSE/US symbol.

## Non-Goals

- No broad visual redesign.
- No signal-scoring, trade-plan, portfolio-ledger, or market-data changes.
- No broker execution, payment, or subscription work.
- No generalized accessibility overhaul of every historical tool in this pass.
- No performance rewrite of the chart or screener APIs; loading feedback and
  correctness are addressed first, while measured latency remains a follow-up
  candidate.
