# Alpha Nova Market Intelligence Ordering and Sector Expansion

**Date:** 2026-08-23  
**Status:** Approved for specification review

## Objective

Fix four presentation and coverage gaps in the Alpha Nova Chart Analyser, Option Chain, Market Signals, and Sector Rotation screens. Preserve the existing calculations and provider boundaries except where Sector Rotation explicitly needs broader index coverage and top-stock data.

## Chart Analyser

The first analytical content after the page header, ticker controls, loading state, and error state must be the chart.

Desktop order:

1. Chart and Stock Pro Dash in one responsive row, with the chart on the left.
2. Price, day high, day low, and volume summary cards beneath that row.
3. Gemini technical analysis last.

Mobile order:

1. Chart at full available width.
2. Stock Pro Dash, including the technical signal, VCP Rating, Alpha Score, and fundamental comparisons.
3. Price, day high, day low, and volume in a compact two-column grid.
4. Gemini technical analysis.

The chart fetch, latest-request guard, indicators, signal calculations, watchlist control, sharing, and AI behavior remain unchanged.

## Option Chain

Build-up presentation must be option-side aware:

- Put Selling, derived from a put-side Short Buildup, is green.
- Call Selling remains red.
- All other existing labels and colors remain unchanged.

The color rule will be isolated in a small presentation helper so it can be tested without rendering the full option-chain table.

## Market Signals

Actionable Setups must be the first data section after the Market Signals page header and refresh controls. The remaining order is:

1. Actionable Setups and its sizing/disclaimer footnote.
2. Regime Context.
3. Volatility Forecast when available for India.
4. Options Intelligence and build-up buckets.
5. Index Option Structures when present.
6. Signals portfolio and track record.

No setup scoring, level calculation, risk sizing, market routing, refresh cadence, or portfolio behavior changes.

## Sector Rotation Coverage

Retain all 12 current India indices and add these eight groups:

- Nifty Midcap 100
- Nifty Smallcap 100
- Nifty Healthcare
- Nifty Consumer Durables
- Nifty India Consumption
- Nifty Oil & Gas
- Nifty Commodities
- Nifty Services Sector

Midcap 100 and Smallcap 100 are market-cap groups, but they participate in the same relative-rotation ranking requested by the user. Labels must remain explicit so they are not mistaken for industry sectors.

Each added index must have a validated historical ticker and NSE live-index name. The frontend chart-link map must remain synchronized with the backend index map. Existing US sector coverage remains unchanged.

An index with insufficient provider history must not crash the page. The API must report incomplete coverage, and the frontend must state that some groups are unavailable rather than silently implying complete coverage.

## Top Stocks in Top Sectors

After the Sector Strength Ranking and before the AI Rotation Brief, show a section titled **Top Stocks in Top Sectors**.

- Select the first three ranked India groups from the existing sector-rotation score.
- Fetch current constituents from the official NSE equity-index constituent endpoint for each selected group.
- Exclude the index summary row and invalid/non-equity symbols.
- Fetch approximately three months of adjusted daily price history for the combined constituent set in one batched provider call.
- Calculate each stock's 21-session return and subtract the Nifty 50's 21-session return.
- Rank descending by this one-month relative momentum and show the first three valid stocks per group.
- Display symbol, one-month return, one-month return versus Nifty 50, and a link to Chart Analyser.
- Duplicate stocks may appear in different groups when they are legitimate constituents of both.

The API response will include the results and an explicit status for each selected group. If NSE membership or price history is unavailable, the corresponding card remains visible with a provider-limited message. Partial results remain usable and are never presented as complete.

For US market routing, the existing rotation remains available, but this new stock section shows an honest India-only availability note until a similarly authoritative US constituent source is implemented.

## Data Flow and Caching

The sector endpoint continues to calculate and cache India and US rotation separately. For India, top-stock calculation runs only after sectors have been ranked and only for the selected three groups. Membership and price work is bounded to those groups and uses a single batched historical download.

The sector response cache continues to cover the complete immutable snapshot for its existing 30-minute lifetime. Refreshing the screen revalidates the snapshot through the existing endpoint. No new persistent user data is introduced.

## Error Handling

- Chart, Option Chain, and Signals changes are presentation-only and retain existing error states.
- Sector index history failures produce explicit incomplete-coverage metadata.
- Constituent failures are isolated per group.
- Batched price failures show provider-limited top-stock cards while preserving the sector ranking.
- Invalid or short stock histories are excluded from ranking and counted in the group's incomplete status.

## Testing

Test-first regression coverage will verify:

1. Chart markup places the chart before summary metrics and preserves the responsive desktop/mobile sequence.
2. Put Selling resolves to green while Call Selling remains red.
3. Actionable Setups appears before Regime Context in rendered source order.
4. The India index map contains the 12 existing and eight new entries, including Midcap 100 and Smallcap 100.
5. Sector ranking remains stable with the expanded map.
6. Top-sector selection uses the first three ranked groups.
7. Stock ranking uses 21-session return relative to Nifty 50 and returns three valid stocks per group.
8. Partial NSE/provider failures retain sector results and expose explicit incomplete states.
9. The frontend renders top-stock cards, Chart Analyser links, and provider-limited messages.
10. Desktop and 390x844 browser checks confirm correct ordering and no horizontal overflow.

Verification will include focused frontend and backend tests, the full relevant test suites, lint, production build, diff checks, and local route/API smoke checks. Deployment is not included unless separately requested.

## Out of Scope

- Changing trading signals, option-chain calculations, RRG scoring weights, or AI prompts.
- Replacing the existing India/US market-routing schedule.
- Building US top-sector constituent rankings.
- Adding persistent portfolios, alerts, or new navigation routes.
