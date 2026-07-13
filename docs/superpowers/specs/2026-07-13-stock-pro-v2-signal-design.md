# Stock Pro V2 Signal Design

**Date:** 2026-07-13
**Status:** Approved for implementation planning

## Goal

Replace the rudimentary RSI/SMA20 label in Chart Analyser with an explainable,
VCP-led signal for 2–20-session swing decisions. Reuse the options-flow and
market-regime evidence already produced by the Signals engine while preserving
the existing Stock Pro Dash UI and interaction model.

## Current Problem

The current frontend-only rule mixes incompatible ideas:

- RSI above 70 or price 5% below SMA20 produces SELL.
- RSI below 30 or price 5% above SMA20 produces BUY.
- Price above SMA20 otherwise produces BULLISH.
- All other cases produce HOLD.

This allows RSI alone to create an action, treats trend extension as a BUY, has
no bearish setup-quality model, and ignores volume, volatility, market regime,
options flow, risk/reward, data freshness, and conflicting evidence. The result
is a label rather than an auditable swing-trade decision aid.

## Product Decisions

- The model is regime-aware and intended for 2–20-session holds.
- VCP Rating is the primary setup-quality input and works in both directions.
- The same five VCP concepts are evaluated symmetrically for bullish and bearish
  structures; there is no separately branded inverse-VCP model.
- Options flow is confirmation, not a mandatory gate. Missing flow is visible
  and reduces data coverage, but non-F&O and unsupported US stocks still receive
  a technical result.
- Headline labels are exactly: `BUY`, `SELL`, `HOLD`, `BULLISH`, `BEARISH`, and
  `NEUTRAL`.
- `HOLD` means a directional structure remains intact but no attractive fresh
  entry exists. `NEUTRAL` means direction is mixed, setup quality is weak, or
  required price data is insufficient.
- Alpha Score remains business-quality context and does not determine signal
  direction.
- The original Stock Pro Dash layout and UX remain intact. Only the Technical
  Signal box gains a compact confidence value and one short reason/options-flow
  line.
- Deterministic backend code owns the signal. React only renders the returned
  contract.

## Non-Goals

- No broker integration or order placement.
- No machine-learned weights in this iteration.
- No broad Chart Analyser redesign.
- No changes to the existing Signal ledger or Track Record semantics.
- No retroactive claim that Chart Analyser labels are published portfolio
  signals.

## Data Requirements

The price model uses up to 252 daily sessions and requires at least 200 valid
sessions for a fully covered result. It derives:

- SMA20, SMA50, SMA150, and SMA200;
- 20-session SMA200 slope;
- ATR14 using true range;
- 5-session and 21-session momentum;
- RSI14 as confirmation only;
- 10-session and 50-session normalized range/volatility;
- 20-session and 50-session average volume;
- 20-session breakout high and breakdown low, excluding the current bar;
- 10-session swing high and swing low; and
- 52-week high, low, and range position.

NaN, infinity, zero prices, malformed timestamps, and non-positive volume are
treated as unavailable inputs rather than zero evidence.

## Symmetric VCP Rating

The backend evaluates the same five concepts for both directions and selects the
higher qualifying side as `vcp.direction`. A tie is unresolved until price
structure breaks it.

Each passing concept contributes one star:

1. **Trend alignment**
   - Bullish: close > SMA50 > SMA150 > SMA200.
   - Bearish: close < SMA50 < SMA150 < SMA200.
2. **Long-term trend slope**
   - Bullish: SMA200 is above its value 20 sessions ago.
   - Bearish: SMA200 is below its value 20 sessions ago.
3. **Distance from the adverse 52-week extreme**
   - Bullish: close is at least 30% above the 52-week low.
   - Bearish: the 52-week high is at least 30% above the close.
4. **Proximity to the directional resolution level**
   - Bullish: close is within 25% of the 52-week high.
   - Bearish: close is within 25% of the 52-week low.
5. **Contraction quality**
   - Recent normalized true range is lower than its 50-session baseline, and
     20-session average volume does not exceed the 50-session average.

The response includes both directional check sets so the result is auditable.
The visible VCP Rating remains a zero-to-five-star value.

## Confluence Score

Confidence is bounded to 0–100 and measures evidence aligned with the selected
direction. Direction is determined by VCP and price structure, never by options
flow or RSI alone.

| Component | Maximum | Rules |
|---|---:|---|
| VCP quality | 40 | Eight points per passed VCP concept. |
| Price structure | 20 | SMA20/50 alignment, 20-session resolution, and acceptable extension. |
| Momentum | 10 | 5/21-session momentum and RSI confirm the selected direction. |
| Participation | 10 | Resolution volume, contraction dry-up, and delivery evidence. |
| Options flow | 15 | Futures OI and stock-options flow aligned, mixed, conflicting, or unavailable. |
| Market regime | 5 | Index direction and volatility regime aligned, flat, or conflicting. |

Options-flow scoring is `15` when aligned, `7` when mixed, and `0` when
conflicting or unavailable. Unavailable flow also reduces `data_coverage`; it is
never displayed as neutral confirmation. Market-regime conflict can reduce
confidence but cannot reverse the stock direction.

`data_coverage` is the percentage of weighted inputs with valid, fresh evidence.
Stale optional data contributes reduced weight and carries a visible stale flag.

## Label Precedence

Labels are evaluated in this order so cases do not overlap:

1. **BUY / SELL**
   - VCP Rating is at least four stars.
   - Price closes through the prior 20-session high/low in the selected direction.
   - Confidence is at least 75.
   - Data coverage is at least 70%.
   - The entry plan offers at least 1.5R.
2. **HOLD**
   - Directional confidence is at least 55 and structure is intact, but price is
     more than two ATR from the fresh entry zone, the available reward is below
     1.5R, or the resolution has already moved beyond the permitted entry zone.
3. **BULLISH / BEARISH**
   - Directional confidence is at least 55 or VCP Rating is at least three, but
     resolution, confirmation, or risk/reward is incomplete.
4. **NEUTRAL**
   - Direction is tied/conflicting, VCP quality is below three, price history is
     insufficient, or data coverage is below 50%.

RSI overbought/oversold conditions can only confirm or conflict with an existing
direction. They cannot create `BUY` or `SELL`.

## Trade Plan

Actionable labels include a deterministic plan:

- **Entry zone:** the prior 20-session resolution level through 0.5 ATR beyond
  that level in the trade direction.
- **Structural stop:** the nearest valid SMA20 or 10-session swing structure,
  buffered by 0.5 ATR beyond invalidation and guaranteed to remain on the
  adverse side of entry.
- **Target:** 2R from the entry-zone midpoint.
- **Minimum acceptance:** at least 1.5R must remain from the current price to the
  target; otherwise the label follows the HOLD rule.
- **Expected holding period:** 2–20 sessions.

`BULLISH` and `BEARISH` return the resolution condition required to upgrade.
`HOLD` returns the current structural invalidation. `NEUTRAL` returns the main
conflict or missing requirement.

## Options and Market Context

The Signals engine remains the source of truth for:

- futures price/OI buildup classification;
- stock-option buildup agreement;
- delivery confirmation;
- index options bias;
- India VIX and volatility regime; and
- source timestamps.

Before the Signals response truncates buildup rows for display, the complete
symbol-level context is retained in the existing in-process cache. Chart
Analyser reads this shared context through a bounded helper. On a cold cache it
may perform one bounded refresh in parallel with chart history. Timeout, NSE
blocking, non-F&O status, and unsupported US flow produce an explicit
`unavailable` result instead of delaying or failing the chart.

Aligned flow raises confidence. Conflicting flow lowers confidence and appears
in the reason line. It never independently changes bullish structure to bearish
structure or vice versa.

## Backend Architecture

Create a focused module, `api/stock_pro.py`, containing pure calculations:

- feature preparation and validation;
- symmetric VCP checks;
- confluence component scoring;
- label precedence;
- ATR trade-plan construction; and
- JSON-safe contract assembly.

Network and cache access remain in `api/main.py`. The chart endpoint gathers
history and bounded flow/regime context, calls the pure scorer, and adds
`pro_signal` to the existing response. Existing response fields remain backward
compatible.

The response contract is:

```text
pro_signal
  version, calculated_at, label, direction
  confidence, data_coverage, summary
  vcp: rating, direction, bullish_checks, bearish_checks
  factors: vcp, structure, momentum, participation, options, regime
  flow: status, alignment, evidence, as_of, stale
  plan: entry_low, entry_high, stop, target, risk_reward, holding_period
  invalidation, upgrade_condition
```

The initial version identifier is `stock-pro-v2.0`.

## Frontend Presentation

Preserve the original Stock Pro Dash structure, dimensions, spacing, score grid,
fundamentals table, loading behavior, and mobile stacking.

Inside the existing Technical Signal box only:

- render the backend `label` using the existing state color treatment;
- add `Confidence NN/100` in small secondary text; and
- add one truncated summary line, prioritizing options evidence when it is
  aligned, conflicting, stale, or unavailable.

VCP Rating and Alpha Score stay in their current cards. The frontend removes the
local RSI/SMA20 `getTechnicalSignal` function and does not recalculate labels.

## Error and Freshness Handling

- Insufficient valid price history returns `NEUTRAL`, not a server error, when a
  chart can otherwise be displayed.
- Missing options context lowers coverage but does not block a technical result.
- Stale options/regime evidence is marked and receives reduced influence.
- A flow timeout cannot delay the chart by more than its bounded deadline.
- All numeric response fields are finite numbers or `null`.
- `calculated_at`, factor timestamps, and the model version are always present.
- Existing chart and fundamentals error states remain unchanged.

## Testing

### Backend unit tests

- All six labels and every threshold boundary.
- Symmetric bullish and bearish VCP fixtures using the same five concepts.
- Tied direction and insufficient-history cases.
- RSI-only overbought/oversold cases cannot create BUY/SELL.
- Aligned, mixed, conflicting, missing, and stale options flow.
- Regime conflict cannot reverse direction.
- ATR entry, stop, target, extension, and minimum-1.5R rules.
- Confidence and coverage remain within 0–100.
- NaN/infinity inputs become unavailable and output remains JSON-safe.

### API tests

- Existing chart response fields remain intact.
- `pro_signal` matches the versioned response contract.
- Flow timeout returns a successful chart with unavailable flow.
- NSE and US/non-F&O examples follow their coverage rules.

### Frontend and browser tests

- The original Stock Pro Dash layout remains intact.
- The Technical Signal box displays label, confidence, and summary.
- VCP Rating, Alpha Score, and fundamentals remain in their existing positions.
- Desktop and mobile layouts have no overflow or interaction regressions.
- Run the complete backend suite, frontend unit tests, lint, production build,
  and local browser smoke checks before deployment.

## Success Criteria

- The Chart Analyser never uses the old RSI/SMA20-only signal.
- Every headline label is reproducible from the returned factors.
- VCP is the largest contributor and is evaluated consistently in both
  directions.
- Options flow visibly confirms, conflicts with, or is unavailable; it never
  silently becomes neutral evidence.
- BUY/SELL always includes a valid, non-extended plan with at least 1.5R.
- Existing Stock Pro Dash UI/UX remains recognizably unchanged.
