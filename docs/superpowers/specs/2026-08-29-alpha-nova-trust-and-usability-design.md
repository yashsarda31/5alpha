# Alpha Nova Trust and Usability Design

## Goal

Make Alpha Nova a trustworthy daily decision system by correcting ambiguous
signal outcomes, exposing data quality, simplifying the mobile Signals journey,
and helping a first-time visitor complete one useful research workflow.

This is the first implementation phase of the approved improvement roadmap.
Pricing and payment execution remain gated until the product has a credible
forward record and paid-discovery evidence.

## Product Contract

1. Alpha Nova remains a public, research-only terminal. Market data, research,
   signals, levels, dashboards, tables, and tools do not move behind a paywall.
2. Watchlist persistence and browser alerts remain the contextual reasons to
   create an account.
3. A manual score is labelled `Quality Score`, never `Conviction`, probability,
   confidence, or expected win rate.
4. The track record never classifies an outcome without enough post-publication
   evidence. Ambiguous rows are labelled and excluded from performance metrics.
5. Missing, stale, or provider-limited essential inputs cannot produce an
   actionable setup.
6. Desktop retains the complete analytical surface. Mobile presents the same
   data through progressive disclosure and readable cards.
7. No deployment is part of this phase. Preserve unrelated dirty-worktree
   content.

## Scope Decomposition

The approved roadmap covers several independent systems. They are sequenced as:

1. **Phase 1 — trust and usability:** signal resolution, model/data status,
   mobile Signals, first-run workflow, privacy-safe activation measurement, and
   targeted extraction from `api/main.py`.
2. **Phase 2 — validated model promotion:** connect the existing calibrated
   model package to shadow operation, accumulate forward outcomes, and permit
   manual promotion only after locked validation and the agreed forward gate.
3. **Phase 3 — monetization:** use paid discovery to choose packaging, then add
   pricing, entitlement, trial, and a selected payment provider. Paid value is
   durable workflow functionality, not an unvalidated return claim.
4. **Phase 4 — broader architecture:** continue modular extraction only where
   measured reliability or delivery speed warrants it.

This specification covers Phase 1. The existing calibrated-model modules under
`api/signal_model/` are preserved and become the boundary for later Phase 2
work.

## Alternatives Considered

### A. Full platform and model rewrite

This would replace the monolithic API and Signals UI at once. It offers clean
boundaries but carries unnecessary migration risk for authentication,
watchlists, alerts, provider integrations, and the live track record.

### B. Cosmetic UI pass only

This would improve mobile readability quickly but leave the most serious trust
problem—the ambiguous signal ledger—unchanged. It cannot be called a product
improvement while displayed outcomes may contradict displayed stops.

### C. Staged vertical slices — selected

Correct and disclose the evidence contract first, then simplify how that
contract is presented. Extract only the signal-portfolio logic touched by the
repair. This provides a testable improvement without a broad rewrite.

## Signal Lifecycle and Outcome Integrity

### Published position contract

Each paper position records its market, symbol, side, entry, stop, target,
publication timestamp, model version, source, and coverage. Publication means
the paper book assumes a fill at the published entry at `signal_at`; it does not
claim a broker execution.

### Post-publication resolution

Resolution follows this evidence order:

1. Use timestamped intraday bars beginning at or after `signal_at` when they are
   available.
2. On a bar touching both stop and target with no tick ordering, resolve at the
   stop. This is the conservative outcome.
3. Apply gap-aware fills: an opening price beyond a stop or target is the fill;
   otherwise the touched level is the fill.
4. After the entry session, complete daily bars may resolve the position using
   the existing gap-aware rules.
5. If post-publication intraday evidence is unavailable and the entry-session
   close is already beyond a stop or target, set status to `unresolved`, record
   reason `missing_post_entry_intraday_evidence`, and exclude the row from wins,
   losses, return, and equity-curve calculations.
6. An unresolved row never consumes an open portfolio slot and is displayed in
   a separate `Needs resolution` group.

This closes the current loophole where the entire entry-day bar is ignored even
when the displayed end-of-session price has moved beyond the published stop.

### Portfolio metrics

Performance headers report:

- forward closed sample size;
- wins, losses, and unresolved rows;
- win rate with an explicit small-sample label below 100 forward outcomes;
- realized and marked-to-market return;
- maximum drawdown;
- market, model version, source, and inception date; and
- costs status (`gross` until verified date-correct costs are included).

Backfill, legacy, shadow, and forward outcomes remain segmented. A quality
score is not displayed as a probability.

## Data Trust Contract

### Status envelope

Signals responses add a `data_status` object:

```json
{
  "status": "fresh",
  "observed_at": "2026-08-28T15:40:07+05:30",
  "market_session": "closed_weekend",
  "sources": ["NSE"],
  "required_inputs_complete": true,
  "warnings": []
}
```

`status` is one of `fresh`, `last_session`, `stale`, `provider_limited`, or
`unavailable`. A weekend or holiday snapshot may be `last_session` without
being stale when it is the latest completed trading session.

### Fail-closed publication

Actionable plans require:

- a complete price and open-interest observation for the same market session;
- the existing minimum coverage threshold;
- a valid observation timestamp;
- a non-stale latest completed market session; and
- no required-provider failure.

If any gate fails, `setups.plans` is empty, quality metadata retains the
rejection counts, and the UI displays `No qualifying setup — inputs incomplete`
with the specific warning. Context cards may still show available data but may
not imply an actionable conclusion.

### UI provenance

A shared status component displays freshness, observation time, market-session
state, primary source, and warnings. Full source details remain one disclosure
away. Status is placed next to the page timestamp, not repeated on every cell.

## Mobile Signals Experience

### Default reading order

At widths up to 850 pixels, Signals renders:

1. market state and data-status summary;
2. actionable setup cards or the fail-closed no-setup explanation;
3. compact regime summary;
4. section jump links; and
5. collapsed detail sections for volatility, options, buildup tables, index
   structures, and the current model portfolio.

The first three sections must fit within approximately two initial mobile
viewports when there are at most three setups.

### Responsive representation

- Actionable setups use cards with symbol, side, Quality Score, entry, stop,
  target, timestamp, and Analyse link.
- Wide tables use labelled row cards below 650 pixels.
- Detail disclosures preserve semantic headings, `aria-expanded`, keyboard
  operation, and visible focus.
- Expanding one section does not automatically close another.
- Desktop continues rendering the existing analytical grids and tables.

## First-Run Workflow

When the public Today page has no watchlist items, it presents a compact
`Start your workflow` ladder:

1. choose one of the displayed market movers or search a symbol;
2. open Analyse for that symbol;
3. review the chart and define risk with Position Sizing; and
4. save the symbol or enable alerts when durable value is desired.

The guide does not create a fake watchlist, does not require an account, and
does not claim that a setup exists. Completion state is device-local and must
not crash when storage is blocked.

## Activation Measurement

Add a first-party, allowlisted event endpoint and client helper for:

- `today_viewed`;
- `analyse_loaded`;
- `position_sizing_completed`;
- `watchlist_intent_started`;
- `watchlist_saved`;
- `alerts_enabled`; and
- `return_visit`.

Events contain event name, UTC timestamp, route, market, and an anonymous
device identifier. They never include ticker symbols, names, email addresses,
query strings, free text, API keys, notification endpoints, or auth tokens.
The identifier is random, device-local, and resettable from Settings. Analytics
failure never blocks a product action. The owner-only metrics response reports
aggregate funnel counts and 1-day/7-day return cohorts.

## Readability and Compliance

- Body copy uses at least 14px on desktop and mobile, with a line height of at
  least 1.4. Metadata may use 12px; no essential instruction uses smaller text.
- Monospace display remains for prices, levels, timestamps, and compact labels;
  explanatory prose uses the standard readable UI font.
- The full compliance notice appears until acknowledged. Afterwards a compact
  persistent `Educational analytics · view notice` control remains available.
- Acknowledgement is device-local and failure to store it leaves the full
  notice visible.
- No return, accuracy, confidence, or urgency claim is introduced.

## Architecture

### Backend

Extract the portfolio-specific code currently embedded in `api/main.py` into
`api/signal_model/portfolio.py`. It owns:

- position-state constants;
- evidence-aware outcome resolution;
- portfolio aggregation and segmentation; and
- the serializable track-record snapshot.

Provider fetching is injected through callables so deterministic tests use
fixed bars and quotes. `api/main.py` remains responsible for FastAPI routing,
database/blob coordination, caching, and calling the extracted service.

Add `api/analytics_events.py` for the allowlisted event schema, persistence,
aggregation, retention, and device-reset operation. It exposes plain functions
used by the existing FastAPI routes.

### Frontend

Create focused components and helpers:

- `web/src/components/DataStatus.jsx` — status and provenance disclosure;
- `web/src/components/CollapsibleSection.jsx` — accessible detail disclosure;
- `web/src/components/SignalSetupCards.jsx` — responsive setup presentation;
- `web/src/components/FirstRunWorkflow.jsx` — device-local activation ladder;
- `web/src/lib/productAnalytics.js` — privacy-safe, non-blocking event client;
  and
- `web/src/lib/signalView.js` — pure formatting and status-view derivation.

`MarketSignals.jsx`, `Dashboard.jsx`, `TrackRecord.jsx`, `SettingsSheet.jsx`,
and shared styles consume these units without changing route paths.

## Error Handling

- Missing or malformed `data_status` is treated as `provider_limited`, not
  fresh.
- Intraday-provider failure produces an unresolved entry-session outcome when
  the closing evidence contradicts an open position; it does not invent an
  exit.
- Analytics writes are bounded by short timeouts and ignored after recording a
  local diagnostic counter.
- Blocked local storage leaves first-run guidance usable for the current render
  and keeps the full compliance notice visible.
- A disclosure component renders its children expanded if JavaScript state
  initialization fails.
- Existing cached market data may render with an explicit stale warning but
  cannot produce actionable plans.

## Testing and Verification

### Backend regression coverage

- entry-day post-publication intraday stop and target resolution;
- conservative stop when both levels occur in one bar;
- gap-aware fills;
- ambiguous entry-session close becomes unresolved;
- unresolved rows excluded from returns and portfolio slots;
- forward/backfill/legacy/shadow segmentation;
- stale or incomplete required inputs publish zero actionable plans;
- weekend latest-session data remains valid `last_session` data;
- analytics event allowlist, field rejection, aggregation, retention, and
  device reset; and
- existing authentication, watchlist, alerts, Signals, and track-record tests.

### Frontend regression coverage

- `Quality Score` replaces `Conviction` in setup and track-record surfaces;
- missing status displays a provider-limited warning;
- mobile setup cards expose every required risk field;
- detail sections are accessible and collapsed by default on mobile;
- desktop retains complete detail;
- first-run progression survives refresh and tolerates blocked storage;
- analytics payloads exclude query strings and symbol data;
- compliance acknowledgement leaves the notice reachable; and
- existing single-product, signed-in UX, chart, watchlist, and Signals
  contracts continue to pass.

### Browser verification

Verify signed out and signed in at 1440x1000 and 390x844:

1. Today communicates the first useful action without an account wall.
2. A chosen mover opens the correct Analyse route.
3. Signals shows trust state, setups, and regime within the first two mobile
   viewports.
4. Every detail section expands, collapses, and supports keyboard navigation.
5. Track Record separates unresolved positions and labels the sample honestly.
6. Stale/provider-limited fixtures produce no actionable setup.
7. Watchlist and alert authentication intents still return to the originating
   route.
8. The acknowledged compliance notice remains accessible.
9. There is no horizontal overflow, console error, or failed essential request.

### Release gate

Before any later deployment, run the complete frontend tests, frontend lint,
production build, dependency audit, complete backend suite excluding the
explicit live-provider file, the live-provider suite against a local server,
Python compilation, whitespace checks, and desktop/mobile browser smoke tests.
Production deployment still requires a separate explicit request.

## Phase Completion Criteria

Phase 1 is complete only when:

- no open paper position can silently remain beyond a displayed stop without a
  resolved or unresolved explanation;
- performance metrics exclude ambiguous outcomes;
- all actionable setups carry a valid latest-session data status;
- mobile Signals is readable through progressive disclosure;
- the first-run ladder reaches Analyse, Position Sizing, and contextual save;
- activation events are aggregateable without storing symbol or identity data;
- the extracted portfolio module owns outcome and snapshot logic; and
- all specified automated and browser checks pass locally.

## Boundaries

- Do not deploy, publish, push, or alter production data in this phase.
- Do not add pricing, checkout, entitlement, a payment SDK, or a paywall.
- Do not promote the calibrated model or claim the agreed forward target has
  been achieved.
- Do not remove specialist routes or analytical data.
- Do not modify unrelated `OpenBB/`, `nourishfit/`, `sales-momentum/`, local ad
  assets, webinar collateral, or other untracked work.
