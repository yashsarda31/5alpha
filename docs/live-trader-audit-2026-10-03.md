# Live trader audit — 3 October 2026

Target: https://abovealphasolutions.com (Cloudflare + Render).
Gemini API calls are excluded. Existing workspace changes are preserved.

## Plan

1. Exercise the live dashboard, signal evidence and direction filters, charts,
   company search, watchlist sign-in handoff, all research tools, and mobile navigation.
2. Compare prices, timestamps, session status, missing-data states and sizing arithmetic
   with the actual API responses and relevant exchange rules.
3. Reproduce defects in focused regression tests, repair their root causes, then
   run the affected suites, type checking, build and local browser verification.
4. Record coverage, residual provider limitations and deployment status explicitly.
   Deployment authorized by the user during this audit: Cloudflare + Render.

## Reproduced defects and repairs

- Signals incorrectly expects an NSE session on 2 October 2026 (Gandhi Jayanti),
  marking the 1 October snapshot stale on Saturday 3 October.
  Source: https://nsearchives.nseindia.com/content/circulars/FAOP71777.pdf
- Position Sizing and the independent Druckenmiller calculator produce -200 shares
  and negative exposure for negative capital. A shared finite-input guard now
  withholds invalid plans and explains the required correction.
- R targets use the risk budget rather than actual rounded quantity: 333 shares,
  entry 101, stop 98 incorrectly show 1R profit 1000. Correct actual risk/profit: 999.
- Option symbol/expiry switches retain the previous quote and matrix under a new
  symbol. Clear old evidence immediately, abort superseded requests, reject late
  responses, bound requests, and expose refresh failures with retry.
- Fundamentals converts provider nulls into 0.00 (ROE, ROA, current ratio etc.).
  Missing evidence now remains N/A; measured zero remains zero.
- Delivery labels comparisons as 20-session averages with only one prior session.
  Withhold averages/ratios until all 20 validated baseline sessions exist.
- NSE holiday handling also fixes the weekly sector close (1 October rather than
  dropping the holiday week), forecast freshness, and expected Delivery date.
  US session logic remains separate. Calendar covers published 2026 closures;
  special sessions and future-year calendars need their published schedules.
- The live build requests a Vercel analytics script that returns 404. Adopt the
  already prepared removal into the scoped production release.
- First dashboard request hit the 45-second timeout. Render explicitly documents
  free-instance wake delays of 50 seconds or more. Give resource requests a bounded
  90-second deadline; a 55-second local delayed response completed without retry.
- Actions refresh scheduling requires exact clock minutes, missing delayed ticks.
  Two after-close push routes return 404. Use the existing dispatch endpoint,
  deduplicate per run, tolerate delayed periodic ticks, and retry idempotent daily
  refreshes during their scheduled hour. Add data-only manual refresh selection.

## Live coverage before release

Dashboard and index switching; IN/US Signals and direction/symbol filters;
RELIANCE daily/intraday chart with EMA, Bollinger bands and RSI; company-name
search suggestions; guest Watchlist and login/signup handoff; Settings panel;
all 19 Explore destinations were opened.

Executed research: custom 3-stock screener (RELIANCE/TCS/INFY, 3 complete results),
Momentum breakdown filtering (RELIANCE), Delivery stock drilldown, sector rotation,
FII/DII, bulk/block deals, option symbol switching, fundamentals, RELIANCE DCF,
10-day SARIMAX projection, FLCL analysis, historical one-month Forecast, and News.
Learn categories, empty Track Record/Leaderboard and local Discipline Arena render.
Mobile Signals navigation/filtering at 390px has no horizontal page overflow.

Gemini buttons and Gemini-dependent visual analysis were deliberately excluded.
Authenticated watchlist synchronization and actual push delivery are unverified:
no private account session was supplied. No real trades were placed.

## Release verification

- Isolated release checkout based on the actual Render production commit b2873f2.
- 42 frontend tests, 66 affected backend tests, 3 SEO tests passed.
- Type checking and production build passed. Plotly's existing large-chunk warning
  remains; legacy JSX is excluded by the repository ESLint configuration.
- Local browser: invalid capital withheld; rounded 333-share profit 999; rapid
  NIFTY/BANKNIFTY/FINNIFTY switching clears old prices and rejects late data;
  secondary sizing validation; simulated 55-second dashboard response loads.
- Original checkout's unrelated dirty work remains untouched. The existing
  zero-open-interest row-hiding experiment is excluded from the release.
- Rollback baseline: Render commit b2873f2; roll back both services if core routes
  fail, API returns sustained 5xx, or symbol/evidence identity mismatches reappear.

## Remaining live data concern

Delivery initially contains only 24-25 August with zero complete baselines.
Attempt a data-only refresh after backend deployment; report its actual result.
Provider timing/source timestamps remain visible; unavailable values are not filled.

## Deployment

Pending: push the scoped commit to Render's existing production branch
codex/owner-traffic-dashboard, verify both services, apply the cron-only fix to the
GitHub default branch, refresh Delivery without dispatching alerts, then verify
the public Cloudflare domain and repaired workflows.
