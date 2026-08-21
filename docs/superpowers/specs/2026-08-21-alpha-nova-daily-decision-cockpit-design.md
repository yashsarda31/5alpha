# Alpha Nova Daily Decision Cockpit Design

## Goal

Make Alpha Nova answer a trader's daily questions in a clear sequence instead
of presenting the product as a catalogue of analytics modules.

The release should help a signed-out or signed-in visitor understand:

1. What is the market regime?
2. What changed in the stocks they follow?
3. Are there any high-conviction setups?
4. What is the next useful action?

## Approved Direction

Alpha Nova remains a complete research terminal, but its primary experience is
a daily decision cockpit for active Indian traders. The four primary routes stay
`Today`, `Signals`, `Analyse`, and `Watchlist`. Specialist research remains in
the existing `More tools` navigation.

This pass improves the current experience without adding new APIs, removing
routes, changing model logic, or introducing a new analytics provider.

## Experience Design

### Today becomes a decision ladder

The Today screen uses this order:

1. `Market Brief`: the existing NIFTY, BANKNIFTY, and breadth snapshot, plus a
   concise regime label from the Signals payload when available.
2. `My Watchlist`: personalized names and live quotes, with the existing
   account-intent flow when a signed-out visitor saves a stock.
3. `Priority Setups`: up to three unique, highest-scored setups. Each setup
   shows side, score, entry, stop, target, freshness, and a direct Analyse link.
4. `No-trade guidance`: when no setup passes the model threshold, show a useful
   explanation based on the available regime, breadth, and volatility context,
   with a link to inspect Signals rather than rendering nothing.
5. `Market Details`: top movers and macro data remain available below the daily
   decisions.
6. `Today's Call`: retained as a secondary engagement feature below the
   decision content.

The nine `Analytics Modules` cards are removed from Today because every tool is
already available through `More tools`. This substantially shortens the mobile
page and eliminates duplicate navigation.

### Setup cards connect research steps

Each Priority Setup links to
`/chart?symbol=<symbol>` so the next step is analysis of that setup, not a
generic return to the Signals page. The full Signals page remains the source
for complete derivatives context and the current model portfolio.

The setup cards do not invent explanations or performance statistics that the
API does not provide. Missing entry, stop, target, score, or timestamps are
omitted or labelled unavailable.

### Analyse has a useful first state

When Analyse is opened without a `symbol` query parameter, it automatically
loads the current default symbol instead of displaying `NVDA` in the search box
beside `No Ticker Loaded`.

The existing latest-request-wins protection remains authoritative. Automatic
first load must use the same fetch path as a manual search and must not trigger
duplicate AI requests.

The Dashboard-level `AI OFFLINE` badge is removed. AI commentary is optional
and belongs inside Analyse and Settings; its absence does not mean the market
terminal is offline.

### Signals respects market state

Automatic 60-second refresh is available only while the reported market is
open. After hours, Signals shows the last-session timestamp and a manual
refresh action. This preserves freshness controls without implying that closed
market data changes every minute.

### Compliance and mobile behavior

The existing dismissible compliance notice and compact reminder are preserved.
The release must not weaken the notice or remove access to it.

At 390x844:

- the four primary tabs remain reachable;
- Today has no horizontal overflow;
- Priority Setup cards fit in one column;
- the duplicated Analytics Modules stack is absent;
- content is not obscured by the fixed tab bar.

## Component and Data Changes

### `web/src/pages/Dashboard.jsx`

- Replace the passive setups teaser with a `Priority Setups` section.
- Add a deterministic no-trade explanation using only existing Signals fields.
- Link each setup to its ticker-specific Analyse route.
- Move market details below the decision section.
- Remove the `Analytics Modules` list and Dashboard AI badge.

### `web/src/pages/Dashboard.css`

- Style the regime summary, setup risk levels, no-trade state, and responsive
  one-column mobile layout using existing design tokens.
- Remove or leave unused module-card styles only when deleting them would risk
  unrelated pages; no broad CSS cleanup is part of this pass.

### `web/src/pages/Chart.jsx`

- Run the existing chart fetch once for the initial symbol.
- Preserve URL-driven ticker loading and the latest-request guard.

### `web/src/pages/MarketSignals.jsx`

- Stop the automatic interval after the API reports a closed market.
- Replace the after-hours auto-refresh control with an explicit refresh button.

### Contract tests

Add focused source-contract tests for:

- Today no longer rendering `Analytics Modules`;
- setup cards linking to ticker-specific Analyse routes;
- an explicit no-trade state;
- Dashboard not labelling optional AI commentary as offline;
- Analyse performing an initial fetch;
- after-hours Signals offering manual refresh rather than active polling UI.

## Data Flow

1. Today loads `/api/dashboard` and `/api/signals` through the existing SWR
   cache.
2. The Signals payload supplies regime and setup fields.
3. Today derives presentation-only summaries without altering scores or model
   output.
4. Selecting a setup navigates to Analyse with a symbol query parameter.
5. Analyse fetches the chart through its existing guarded request path.
6. Signals polling is enabled or disabled from the payload's `market_open`
   value.

## Error Handling

- If Dashboard data fails, keep the current market-feed error state.
- If Signals data fails but Dashboard data succeeds, Market Brief and market
  details continue to render; Priority Setups shows a neutral unavailable state.
- If a setup lacks optional risk fields, do not substitute zeroes or inferred
  prices.
- If initial Analyse loading fails, preserve the existing actionable chart error
  and search controls.
- Manual after-hours refresh uses the existing error and retry behavior.

## Testing and Verification

### Focused automated checks

- Run the new decision-cockpit contract tests.
- Run chart latest-request and single-product contract tests.
- Run focused lint on changed files.

### Full regression checks

- Run all frontend tests.
- Run frontend lint and production build.
- Run backend tests excluding the intentionally live-provider suite.
- Run dependency audit and `git diff --check`.

### Browser verification

Verify locally at desktop and 390x844:

1. Today renders the decision order and no duplicate module grid.
2. A Priority Setup opens the correct ticker in Analyse.
3. No-setup data produces useful guidance.
4. Analyse automatically loads its initial symbol.
5. Closed-market Signals exposes manual refresh and no active 60-second toggle.
6. Navigation, compliance, watchlist intent, mobile tab bar, and error states
   remain usable.

## Boundaries

- No deployment without a separate explicit request.
- No signal-score, portfolio, price-provider, or model changes.
- No removal of specialist routes.
- No new event-tracking backend in this pass.
- No pricing, subscription, or paywall work.
- Preserve unrelated working-tree changes.
