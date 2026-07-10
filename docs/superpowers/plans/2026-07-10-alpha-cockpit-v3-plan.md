# Alpha Cockpit V3 — Implementation Plan

**Date:** 2026-07-10
**Spec:** `docs/superpowers/specs/2026-07-10-alpha-cockpit-v3-design.md`
**Delivery strategy:** vertical slices, preserving the existing React/Vite and
FastAPI application and all pre-existing working-tree changes.

## Working Rules

- Treat the approved spec as the source of truth.
- Reuse existing quote, momentum, signal, watchlist, track-record, sector,
  fundamentals, news, options, delivery, FII/DII, auth, and cache code.
- Do not rewrite stable research modules just to move them into the new navigation.
- Keep calculation and lifecycle decisions on the backend. The browser only renders
  normalized values and local planning state.
- Add or update tests with every calculation or contract change.
- Never convert a missing market value to zero.
- Preserve existing uncommitted changes in `vercel.json`, generated `web/dist`
  assets, branding assets, `SignalAlertProvider.jsx`, `AppLogo.jsx`, and `Login.jsx`.
- Commit only files changed for the current milestone.

## Milestone 0 — Baseline and Safety Map

### Purpose

Establish a known-good baseline and identify the reusable V2 code paths before
changing contracts.

### Tasks

1. Record `git status --short` and keep the list of pre-existing changes outside
   every V3 commit.
2. Run the current frontend build from `web/`.
3. Run focused backend suites for dashboard, signals, signal tracking, watchlist,
   sectors, momentum, delivery, and JSON serialization.
4. Map reusable functions in `api/main.py` for:
   - Dashboard market/session status.
   - Signal regime and option summaries.
   - Momentum and sector candidates.
   - Alpha score inputs.
   - Delivery and derivatives participation.
   - Signal portfolio snapshots and outcome resolution.
5. Save representative `/api/dashboard`, `/api/signals`, `/api/momentum`,
   `/api/sectors`, and `/api/signals/portfolio` fixtures for deterministic contract
   tests. Remove credentials, user data, and request-specific tokens.

### Verification

```powershell
cd web
npm run build
cd ..
python -m pytest api/test_dashboard_movers.py api/test_main.py api/test_us_signals.py api/test_signal_tracking.py api/test_watchlist.py api/test_sectors.py api/test_momentum.py api/test_delivery.py api/test_json_safe.py -q
```

If an existing baseline test fails because of live-provider instability, document
the observed failure and replace only the new V3 tests with deterministic fixtures;
do not weaken unrelated existing tests.

## Milestone 1 — Cockpit Contracts and Provider Status

### Purpose

Create one auditable domain contract that can power Cockpit, Opportunities,
Portfolio Lab, and Track Record without screen-specific calculations.

### New backend files

- `api/cockpit_models.py`
  - Validated enums or constants for freshness and lifecycle states.
  - `ProviderStatus`, `RegimeSnapshot`, `ScoreComponent`, `OpportunitySnapshot`,
    `AllocationGuidance`, `AttentionItem`, and `CockpitResponse` structures.
  - Explicit JSON-safe serialization for timestamps and missing numeric values.
- `api/cockpit_providers.py`
  - Thin adapters around existing V2 acquisition helpers.
  - Normalize payload, source, market timestamp, retrieval timestamp, state,
    warnings, and last-valid fallback age.
  - No duplicated network fetchers in the first slice.
- `api/cockpit_engine.py`
  - Pure orchestration functions accepting normalized inputs.
  - No FastAPI request objects, global UI state, or provider-specific payloads.

### Modified backend files

- `api/main.py`
  - Register `GET /api/cockpit`.
  - Reuse the existing cache and session/market-open helpers.
  - Assemble provider adapters independently with bounded timeouts.
  - Return partial results with source status rather than failing the entire request.
- `api/requirements.txt` and root `requirements.txt`
  - Change only if the contract implementation genuinely needs a dependency.
  - Prefer the existing Pydantic/FastAPI stack.

### New tests

- `api/test_cockpit_models.py`
  - Reject NaN and infinite values.
  - Preserve `None` for unavailable values.
  - Serialize all timestamps consistently.
- `api/test_cockpit_providers.py`
  - Fresh, stale, partial, unavailable, and fallback states.
  - Provider warnings survive normalization.
- `api/test_cockpit_api.py`
  - Happy-path contract.
  - One-provider timeout still returns a valid partial Cockpit.
  - Source status and `as_of` metadata are present.
  - No opportunity becomes confirmed when required data is stale or unavailable.

### Initial contract shape

```text
CockpitResponse
├── market: market, session, as_of, is_open
├── regime: label, posture, cash_guidance, summary, components
├── opportunities[]: immutable opportunity snapshots
├── allocation: capital, deployed, cash, total_risk, warnings
├── attention[]: priority, type, opportunity_id, message
└── sources[]: source, state, market_time, retrieved_at, age, warnings
```

### Verification

```powershell
python -m pytest api/test_cockpit_models.py api/test_cockpit_providers.py api/test_cockpit_api.py -q
python -m pytest api/test_json_safe.py api/test_main.py api/test_us_signals.py api/test_dashboard_movers.py -q
```

### Commit

`Add normalized Alpha Cockpit API contract`

## Milestone 2 — Alpha Score 2.0 Feature Engine

### Purpose

Produce explainable, bounded, regime-aware 2–20 day opportunity scores without
look-ahead inputs.

### Backend work

- Add `api/alpha_score_v2.py` containing independent pure functions:
  - `trend_features(history, benchmark_history)`
  - `participation_features(volume, delivery, derivatives)`
  - `quality_features(fundamentals)`
  - `catalyst_features(events, as_of)`
  - `risk_features(history, liquidity, events, regime)`
  - `eligibility_gate(features, freshness, liquidity)`
  - `score_components(features)`
  - `regime_weights(regime)`
  - `combine_score(components, weights)`
  - `confidence_from_coverage(features, freshness)`
- Keep every component within 0–100 and expose its evidence, missing inputs, and
  calculation time.
- Define weight sets as versioned constants whose totals equal 1.0.
- Enforce minimum liquidity, price-history length, and freshness before a setup can
  become `CONFIRMED`.
- Reuse existing `_alpha_nova_score`, momentum, delivery, options, and trend helpers
  as input references. Do not silently change their current consumers.
- Add `score_version="2.0.0"` and retain the current V2 score where useful for
  comparison during rollout.

### Test-first cases

- `api/test_alpha_score_v2.py`
  - One extreme feature cannot create a top score.
  - Missing required history fails eligibility.
  - Missing optional fundamentals lowers confidence but remains explicit.
  - Stale participation data prevents confirmation.
  - Bull, neutral, and unstable regime weight sets are bounded and sum to 1.
  - Score components and final score stay within 0–100.
  - No feature reads observations after the supplied `as_of` timestamp.
  - Identical input produces identical score and evidence ordering.

### Cockpit integration

- Update `api/cockpit_engine.py` to score a bounded candidate universe assembled
  from existing momentum, sector, signal radar, and watchlist sources.
- Return only the best diversified 3–7 confirmed opportunities in the Cockpit.
- Keep emerging candidates available to the Opportunities route added later.

### Verification

```powershell
python -m pytest api/test_alpha_score_v2.py api/test_cockpit_api.py api/test_alpha_score.py api/test_momentum.py api/test_delivery.py -q
```

### Commit

`Add explainable regime-aware Alpha Score 2.0`

## Milestone 3 — Portfolio-Aware Ranking and Trade Plan Math

### Purpose

Turn good standalone setups into a practical ₹1 crore model basket.

### Backend work

- Add `api/portfolio_guidance.py` with pure functions for:
  - ATR- and structure-aware entry zones and invalidation stops.
  - First and second targets.
  - Rupee risk per share and gross position value.
  - Volatility, confidence, and liquidity caps.
  - Sector exposure and rolling-return correlation clusters.
  - Marginal portfolio-value ranking and duplicate suppression.
- Default reference capital to `10_000_000` rupees and allow a bounded query override.
- Return the assumptions used for every number.
- Refuse sizing when entry, stop, liquidity, or volatility is invalid.
- Make cash guidance an output of aggregate opportunity quality and regime posture,
  not a hard-coded headline.

### Tests

- `api/test_portfolio_guidance.py`
  - Stop above entry on a long and below entry on a short is rejected.
  - Rupee risk cannot exceed configured limits.
  - Liquidity and volatility caps reduce—not increase—size.
  - Highly correlated names are suppressed or flagged.
  - Sector concentration limits are enforced.
  - Invalid inputs return an explanation and no quantity.
  - The sum of recommended allocations and cash equals reference capital within
    rounding tolerance.
- Add `api/test_position_sizing_regression.py` to preserve the existing
  `/api/ai/position-sizing` endpoint contract while Portfolio Lab math is introduced.

### Verification

```powershell
python -m pytest api/test_portfolio_guidance.py api/test_cockpit_api.py api/test_position_sizing_regression.py -q
```

### Commit

`Add portfolio-aware opportunity ranking and sizing`

## Milestone 4 — V3 Design Foundations and Application Shell

### Purpose

Introduce the Apple-like V3 interface without breaking working V2 research routes.

### Frontend files

- Modify `web/src/index.css`
  - Add graphite and warm-white semantic tokens.
  - Add cobalt interaction roles, gain/loss-only semantic roles, elevation,
    spacing, radius, typography, focus, and motion tokens.
  - Preserve compatibility aliases used by existing pages.
- Modify `web/src/App.css`
  - Add the slim desktop sidebar, mobile bottom navigation, global command-search
    overlay, safe-area padding, and reduced-motion behavior.
- Modify `web/src/App.jsx`
  - Make `/cockpit` the authenticated default.
  - Reduce primary navigation to Cockpit, Opportunities, Portfolio Lab, Research,
    and Track Record.
  - Keep every existing route reachable within Research.
  - Reuse current lazy imports and route prefetching.
  - Do not overwrite the current branding, auth, or alert-provider changes.
- Add shared files under `web/src/components/cockpit/`:
  - `FreshnessIndicator.jsx`
  - `RegimeSummary.jsx`
  - `OpportunityCard.jsx`
  - `ScoreBreakdown.jsx`
  - `AllocationPanel.jsx`
  - `AttentionList.jsx`
  - `CommandSearch.jsx`
  - `cockpit.css`
- Add `web/src/lib/cockpitApi.js` for one normalized fetch boundary and abort logic.

### Interaction requirements

- 44×44 minimum touch targets.
- Visible `:focus-visible` treatment.
- Card expansion uses buttons with `aria-expanded` and stable panel identifiers.
- Reduced motion removes expansion and overlay animation.
- Gain/loss and signal states include labels or icons, never color alone.
- Source freshness is keyboard- and screen-reader-readable.

### Tests and checks

- Add focused component tests only if the current project already has a supported
  test runner. Do not introduce a large testing stack solely for snapshots.
- Run ESLint before changing its configuration.
- Build after the complete shell patch.

```powershell
cd web
npm run lint
npm run build
```

### Commit

`Add Alpha Cockpit V3 application shell and design system`

## Milestone 5 — Cockpit Vertical Slice

### Purpose

Deliver the first complete user-visible V3 workflow using the consolidated API.

### Frontend files

- Add `web/src/pages/Cockpit.jsx` and `web/src/pages/Cockpit.css`.
- Compose the first viewport in this order:
  1. Session and source-status strip.
  2. Large regime headline and evidence summary.
  3. Three hero opportunities.
  4. Allocation and residual-cash summary.
  5. Active attention list.
  6. Remaining confirmed opportunities.
- Reuse the existing SWR cache with a Cockpit-appropriate refresh interval and
  manual refresh action.
- Preserve the last valid response during recoverable refresh failures.
- Implement loading, no-confirmed-opportunity, market-closed, partial-data, stale,
  offline, and fatal-error states.
- Add contextual links from every opportunity to the existing Chart, Fundamentals,
  News, Options, and Position Sizing routes.
- Add “Add to plan” as a non-execution action; persistence arrives in Milestone 7.

### Contract verification

- Ensure no score, entry, stop, target, allocation, or confidence is recalculated
  in React.
- Render explicit `—` plus explanation for unavailable values.
- Display score version and source timestamps in expanded details.

### Verification

```powershell
python -m pytest api/test_cockpit_api.py api/test_alpha_score_v2.py api/test_portfolio_guidance.py -q
cd web
npm run lint
npm run build
```

Manual checks:

- Desktop first viewport establishes regime and top three setups without scrolling.
- At 375 pixels there is no horizontal viewport overflow.
- Keyboard can navigate, expand, research, and add every visible setup to a plan.
- Partial source failure leaves trustworthy sections usable.

### Commit

`Build the Alpha Cockpit decision workflow`

## Milestone 6 — Opportunities and Research Consolidation

### Purpose

Expose the broader candidate universe and retain V2 analytical depth without
returning to module-heavy navigation.

### Frontend work

- Add `web/src/pages/Opportunities.jsx` and `Opportunities.css`.
  - Confirmed and emerging state filters.
  - Side, sector, score, confidence, liquidity, holding period, and freshness filters.
  - Sort by portfolio value, score, risk/reward, and recency.
  - Saved filter state in device-local storage.
- Add `web/src/pages/Research.jsx` and `Research.css`.
  - Group existing routes into Market, Company, Derivatives, Models, and Learn.
  - Provide search and concise descriptions.
  - Keep all old deep links working.
- Implement `CommandSearch` over stocks, five primary destinations, and existing
  research routes.
- Add `GET /api/opportunities` using the same stored/normalized opportunity contract
  and server-side filtering where the candidate universe makes it necessary.

### Tests

- API filter and sort tests return stable results.
- Cockpit and Opportunities return identical values for the same opportunity ID and
  snapshot version.
- Existing route smoke coverage remains green.

### Verification

```powershell
python -m pytest api/test_opportunities_api.py api/test_cockpit_api.py -q
cd web
npm run lint
npm run build
```

### Commit

`Add opportunity discovery and consolidated research navigation`

## Milestone 7 — Signal Lifecycle, Snapshots, and Portfolio Lab

### Purpose

Make recommendations traceable and let users plan allocations without implying
execution.

### Persistence and backend work

- Extend the existing SQLite/blob database pattern with versioned migrations for:
  - `opportunity_snapshots`
  - `opportunity_transitions`
  - `portfolio_plans`
  - `portfolio_plan_items`
- Store source times, features, components, weights, score version, entry zone, stop,
  targets, confidence, lifecycle state, and later outcomes.
- Add deterministic transitions: Emerging → Confirmed → Active → Weakening → Closed.
- Never overwrite a historical snapshot; append transitions and revisions.
- Reuse the current signal resolver safeguards that avoid entry-day look-ahead.
- Add auth-gated plan CRUD endpoints. Store intended allocations and manual status,
  not inferred broker positions.

### Frontend work

- Add `web/src/pages/PortfolioLab.jsx` and `PortfolioLab.css`.
- Show capital, deployed amount, cash, total stop risk, sector exposure, correlation
  groups, and plan warnings.
- Allow add/remove, intended quantity/allocation adjustment, notes, and manual status.
- Label all status and performance inputs as user-entered unless derived from a
  stored signal snapshot.
- Update Cockpit and Opportunities “Add to plan” to use the persistent API.

### Tests

- Migration and idempotency tests.
- Transition matrix tests, including invalid transitions.
- Immutable snapshot tests.
- Auth isolation between users' portfolio plans.
- Same signal snapshot values across Cockpit, Opportunities, Portfolio Lab, and
  Track Record.
- Entry-day outcomes are never resolved using future close data.

### Verification

```powershell
python -m pytest api/test_cockpit_persistence.py api/test_opportunity_lifecycle.py api/test_portfolio_plans.py api/test_signal_tracking.py -q
cd web
npm run lint
npm run build
```

### Commit

`Add immutable signal lifecycle and Portfolio Lab`

## Milestone 8 — Track Record 2.0 and Historical Evaluation

### Purpose

Make signal quality measurable and resistant to survivorship, revision, and
look-ahead bias.

### Backend work

- Extend the existing signal portfolio output with:
  - Sample size.
  - Hit rate by target and horizon.
  - Expectancy in R and percent.
  - Profit factor.
  - Maximum drawdown.
  - Calibration by confidence band.
  - Results by regime, sector, side, and score version.
- Include estimated trading costs, slippage, missed entries, and stop gaps.
- Preserve failed, expired, and unresolved signals.
- Add an offline walk-forward evaluation command under `research/` that consumes
  point-in-time fixtures and writes versioned JSON summaries. It must not run inside
  a user request.

### Frontend work

- Upgrade `web/src/pages/TrackRecord.jsx` using the V3 design system.
- Separate live forward performance from historical walk-forward evaluation.
- Display sample sizes and assumptions beside every headline statistic.
- Link a result back to its immutable opportunity snapshot.

### Tests

- Metric calculations on small hand-checkable fixtures.
- Slippage and stop-gap behavior.
- Confidence calibration bins require adequate sample counts.
- Walk-forward code cannot access observations after the evaluation timestamp.

### Verification

```powershell
python -m pytest api/test_track_record_v2.py api/test_signal_tracking.py -q
cd web
npm run lint
npm run build
```

### Commit

`Upgrade Alpha Cockpit signal track record and evaluation`

## Milestone 9 — Accessibility, Performance, and Full Regression

### Purpose

Prepare the complete V3 experience for handoff without regressing the broad V2
research surface.

### Tasks

- Verify Cockpit, Opportunities, Portfolio Lab, Research, Track Record, Login,
  Watchlist, Chart, Signals, Momentum, Sector Rotation, Fundamentals, Options, News,
  and Position Sizing at desktop and 375-pixel widths.
- Confirm no horizontal viewport overflow.
- Audit contrast, keyboard order, focus visibility, dialog behavior, reduced motion,
  screen-reader labels, and chart summaries.
- Measure initial bundle impact. Keep Plotly-bearing research routes lazy and out of
  the Cockpit entry bundle.
- Verify route prefetch does not eagerly download heavy research modules.
- Run the full backend suite, lint, and production build.
- Remove only dead code made obsolete by V3 navigation after confirming no deep link
  or feature still imports it.
- Update `web/README.md` with the V3 product surface and local verification steps.

### Verification

```powershell
python -m pytest api -q
cd web
npm run lint
npm run build
```

### Final acceptance checklist

- [ ] The first viewport answers regime, opportunity, sizing, and attention.
- [ ] Only 3–7 confirmed setups appear in the Cockpit.
- [ ] Every setup exposes evidence, invalidation, freshness, and score version.
- [ ] Missing or stale required data cannot produce high conviction.
- [ ] Portfolio recommendations respect risk, liquidity, sector, and correlation.
- [ ] Signal snapshots and outcomes are immutable and auditable.
- [ ] Live forward results are visually distinct from historical evaluation.
- [ ] Primary workflows pass keyboard and 375-pixel mobile checks.
- [ ] Existing research routes and deep links still work.
- [ ] Frontend build, lint, and backend tests pass.
- [ ] No pre-existing unrelated working-tree change enters a V3 commit.

### Commit

`Complete Alpha Cockpit V3 regression and accessibility pass`

## Recommended Execution Order

Implement Milestones 0–5 as the first focused release. That produces a real,
Apple-like Alpha Cockpit backed by a stronger auditable signal contract while
reusing the existing research pages. Milestones 6–9 deepen discovery, persistence,
portfolio planning, and proof without delaying the usable Cockpit.

Do not begin Milestone 7 persistence until the Cockpit opportunity contract has
survived Milestone 5 end-to-end verification. This avoids storing a prematurely
unstable schema.
