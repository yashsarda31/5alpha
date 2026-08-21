# Alpha Nova Calibrated Signals Design

**Date:** 2026-08-22  
**Status:** Approved design, pending implementation plan  
**Product:** Alpha Nova 48 Market Signals  
**Markets:** India and United States, validated and released independently

## Objective

Replace the current hand-weighted conviction gate with a probability-gated signal system that targets:

- at least a 55% raw forward win rate;
- planned net reward-to-risk of at least 1:1;
- a two-to-five trading-session holding period;
- no fixed daily signal quota; and
- publication of every setup that clears the approved probability and execution-quality gates.

The system is decision support and paper tracking. It does not place orders or promise returns.

## Current-state diagnosis

The live result shown on 2026-08-22 is not one clean evaluation of one model:

- India showed 18 closed positions and a 16.7% headline win rate.
- Fifteen of those positions were reconstructed EOD backfills scored between 41 and 50, below the live publishing threshold of 65.
- Only three closed India positions came from the live engine, and all three lost. This is a genuine warning but an inadequate sample for model selection.
- The US forward sample contained eight closed positions, with four wins.
- The live endpoint reported `signals-v2.1-quality`. The previously deployed RSI-enhanced `signals-v2.2-rsi-entry` version was no longer active.

The existing 0-100 score is a sum of manually assigned points for OI, price movement, liquidity, options flow, index bias, intraday position, regime and delivery. It has not been calibrated to mean probability of a profitable trade. The current tracking page also combines reconstructed and forward observations in its headline result.

## Scope

This design covers:

- point-in-time candidate collection;
- reproducible historical candidate reconstruction;
- feature creation and outcome labels;
- separate India and US probability models;
- leakage-resistant validation;
- live probability gating;
- model versioning and drift controls;
- forward-only track-record reporting; and
- Signals-page explanations and data-quality states.

It does not cover automated execution, broker integration, options-strategy recommendations, portfolio optimization or redesign of unrelated Alpha Nova pages.

## Definitions

### Candidate

Any directional setup emitted by the existing OI/price/volume scanner before predictive or rank filtering. Every candidate is stored, including candidates that are later rejected.

### Published signal

A candidate that passes data quality, execution quality and the approved calibrated-probability threshold.

### Trade outcome

A published signal closes at the first of:

1. its stop;
2. its target; or
3. the fifth trading-session close.

Gaps fill at the first executable price rather than the theoretical stop or target. If both barriers are touched within a daily bar and their order cannot be established, the result is resolved stop-first. A position is a win only when its final return is positive after modeled costs. Flat or negative net results are losses for the raw win-rate calculation.

### Net reward-to-risk

Estimated target profit after round-trip costs divided by estimated stop loss including round-trip costs. Every published plan must have net reward-to-risk greater than or equal to 1.0.

## Proposed architecture

### 1. Candidate ledger

The ledger records every candidate at the time the engine observes it. Each row includes:

- market, symbol, side and candidate type;
- signal timestamp and market session date;
- raw scanner inputs and component scores;
- all model features with individual source timestamps;
- intended entry method, stop, target and maximum holding date;
- data coverage and rejection reasons;
- model version, feature-schema version and threshold; and
- eventual fill and outcome fields.

Rows are append-only except for explicit lifecycle fields such as activation, exit and outcome. Recomputed signals never overwrite the original feature snapshot or trade levels.

This ledger is separate from the current mixed `signal_positions` presentation so historical, shadow and forward results cannot silently merge.

### 2. Feature builder

The feature builder produces the same schema in historical replay and live scoring. Initial features are limited to values that can be reconstructed point-in-time:

- price return normalized by ATR;
- OI change and OI-change percentile relative to the symbol's own history;
- volume and liquidity percentiles;
- close location within the session range;
- RSI and distance from moving averages;
- relative strength versus the market and sector;
- delivery change when date-aligned official data is available;
- market trend, breadth and volatility regime;
- side/regime agreement; and
- calendar and session context.

Raw prices, raw OI and absolute volume are not used without cross-sectional or historical normalization. India and US feature schemas may differ because US equities do not have the same freely available OI inputs.

Intraday PCR, options flow and other inputs that cannot be reconstructed honestly are excluded from the first production model. They are captured prospectively in the ledger and may enter a later challenger after sufficient forward history exists.

### 3. Execution-quality gate

Before probability scoring, a candidate must pass non-predictive safety checks:

- all required fields are fresh and from the intended session;
- symbol and contract mapping are unambiguous;
- liquidity exceeds the predeclared market-specific floor;
- planned stop and target are coherent;
- the price is not already more than 0.25R beyond the modeled entry;
- nearby support or resistance does not leave less than 1R of target room; and
- the candidate is not a duplicate of an already-active symbol and side.

Failure produces a recorded rejection. Missing or stale inputs produce `SCAN_INCOMPLETE`, not a fallback signal.

### 4. Entry and exits

The initial validated model is an end-of-day confirmed swing model because the reliable historical inputs are completed-session data.

- A candidate is finalized from a completed session.
- Its modeled fill is the next session's official open plus conservative market-specific slippage.
- ATR means Wilder's 14-session ATR calculated only from completed daily bars.
- For a long, gross stop distance is the greater of one ATR and the distance from entry to one tick below the signal-session low. For a short, it is the greater of one ATR and the distance to one tick above the signal-session high.
- Gross target distance must satisfy `target distance - round-trip costs >= stop distance + round-trip costs`, which keeps net reward-to-risk at or above 1.0.
- A long is rejected when the prior completed 20-session high remains above entry but lies inside the target distance. A short uses the equivalent prior 20-session low. This avoids publishing into an immediately visible barrier without enough 1R room.
- If the actual next-session gap makes the plan incoherent or places price more than 0.25R beyond the modeled entry, the candidate expires instead of being chased.
- Levels are immutable after activation.

The live app may show the next-session candidate before activation, but it must label it as pending. It becomes a published signal only after the opening-price and gap checks pass.

### 5. Probability model

India and US use independent models and thresholds.

The champion starts as a regularized logistic classifier because its behavior and factor direction are inspectable. Its output is calibrated on validation-only data. Platt scaling is the default; isotonic calibration is allowed only when the calibration sample is large enough and improves held-out Brier score.

The modeled event is the approved trade policy's final net outcome: target, stop or fifth-session close, after costs. Its probability therefore corresponds to the same win/loss definition shown in the forward track record.

A gradient-boosted tree model may be evaluated as a challenger. It can replace the logistic champion only when it:

- improves out-of-sample published-signal win rate by at least two percentage points or reduces Brier score by at least 10%;
- still passes every release gate;
- does not rely on unstable or unavailable features; and
- produces usable per-signal explanations.

The initial publishing threshold is 0.60. Validation may raise it, but the first release does not lower it. Every candidate above the threshold is published; the model does not target a fixed signal count.

### 6. Live scorer and model registry

The live scorer loads only a manually approved model artifact. Each artifact includes:

- market and semantic model version;
- serialized model and calibration layer;
- ordered feature schema and transformations;
- training and validation date ranges;
- threshold and execution assumptions;
- validation metrics and sample counts; and
- checksum.

A schema mismatch, missing artifact, failed checksum or stale required feature fails closed with `NO SIGNAL` or `SCAN INCOMPLETE`. The service must never silently revert to v2.1.

## Historical data and replay

The initial study uses at least three years of data where available.

For India, the historical universe is defined by the contracts present in each session's official F&O files, not today's surviving symbols. Near-month futures, cash prices, OI, volume, delivery, index breadth and volatility inputs are joined using only data available at that time. Corporate actions and symbol changes are normalized before feature calculation.

For the US model, the historical universe and daily price/volume inputs are point-in-time to the practical extent supported by the selected source. The US model does not inherit India-only OI features.

The replay generates all candidates before applying the probability threshold. It uses the same entry, gap, stop, target, cost and five-session resolution rules as live scoring.

## Validation protocol

### Leakage controls

- Preserve chronological order.
- Use at least 18 months before the first test window.
- Use rolling train, validation and test windows.
- Purge observations whose five-session outcome overlaps a later split.
- Apply a five-session embargo around validation and test boundaries.
- Fit scalers, feature selection, calibration and thresholds inside the applicable training/validation data only.
- Keep the final six months untouched until the feature set and model family are frozen.

Combinatorial purged cross-validation and probability-of-backtest-overfitting diagnostics are robustness checks, not substitutes for the final chronological holdout.

### Cost model

Results include date-correct:

- brokerage assumptions;
- bid/ask or conservative slippage;
- exchange transaction charges;
- STT or applicable market taxes;
- GST and stamp duty where applicable; and
- gap fills.

The assumptions and their effective dates are stored in each validation report.

### Release gates

Each market passes or fails independently. A model is eligible for shadow release only if it has:

- at least 100 out-of-sample published trades;
- at least a 55% net win rate;
- net planned reward-to-risk of at least 1.0 for every published trade;
- positive average net return and positive expectancy;
- at least a 50% win rate in most eligible validation periods;
- no result dependent on one symbol, sector or isolated regime;
- acceptable probability calibration; and
- better results than both the current engine and a simple trend baseline under identical execution assumptions.

The report includes confidence intervals and makes clear that 100 trades are an initial operating threshold, not proof of permanent alpha.

## Shadow and production rollout

1. Backfill the candidate ledger and run the locked validation protocol.
2. Reject the release if either market fails; do not weaken gates to force a launch.
3. Run each passing market model in shadow for at least 20 live candidates to verify feature parity, timestamps, fills and lifecycle resolution.
4. Manually approve the version after shadow-data checks pass.
5. Activate the probability gate for that market.
6. Preserve the prior track record in an explicitly labeled archive.
7. Start the new model's forward headline record at zero.

India may launch without the US model, or vice versa. A failing market retains `NO SIGNAL` rather than borrowing the other market's parameters.

## Product behaviour

Each published signal shows:

- symbol, side and activation time;
- calibrated probability band;
- entry, stop, target and net reward-to-risk;
- entry-expiry and maximum holding date;
- model version and data freshness;
- strongest supporting factors; and
- strongest contradictory factor or risk warning.

Pending next-session candidates are visually distinct from active signals. Expired or chased entries are not relabeled as live opportunities.

The Track Record page separates:

- historical out-of-sample validation;
- shadow results;
- current-model forward results;
- archived legacy live results; and
- reconstructed backfill.

Only current-model forward results appear in the headline live win rate. Every segment shows sample size, market, model version, date range, wins, losses, win rate, average net return and expectancy.

There is no signal quota. Correlated qualifying signals may all be displayed, but the app shows sector and correlation concentration warnings rather than implying they are independent bets.

## Monitoring and retraining

- Evaluate outcome and calibration metrics after every resolution.
- Pause new publications for a market if its rolling 30-trade forward win rate falls below 45%.
- Continue resolving existing positions while publishing is paused.
- Review feature drift, missingness, data-source changes and execution slippage before resuming.
- Retrain no more frequently than monthly unless a confirmed data defect requires a corrected build.
- Treat retrained models as challengers; never auto-promote them.
- Require the complete validation and shadow gates for every promoted version.

## Error handling

- Stale or incomplete required data: `SCAN_INCOMPLETE` with the failing source and timestamp.
- No candidate above the threshold: `NO SIGNAL`.
- Model or schema failure: stop scoring for that market and alert operations.
- Provider disagreement: exclude the affected feature or candidate according to the stored data-quality rule; do not choose the favorable value.
- Outcome ambiguity inside a daily bar: resolve stop-first.
- Holiday or missing session: advance by actual market sessions, never calendar-day assumptions.

## Test strategy

### Unit tests

- Historical/live feature parity.
- No future timestamps in any feature row.
- Symbol, contract and corporate-action normalization.
- Gap-aware entry and exit math.
- Stop-first ambiguous-bar resolution.
- Five-session holiday-aware expiry.
- Net reward-to-risk after costs.
- Probability calibration and threshold behavior.
- Artifact checksum and schema rejection.

### Integration tests

- Deterministic replay from source data to candidates, labels and metrics.
- Independent India and US models.
- Candidate, rejection, activation and resolution lifecycle.
- Fail-closed handling for stale providers and invalid artifacts.
- Track-record separation by source and model version.

### Acceptance tests

- Locked out-of-sample validation report satisfies every release gate.
- Re-running the same model and data produces identical candidate IDs and metrics.
- Shadow candidates match live feature snapshots and modeled entries.
- Signals UI clearly distinguishes pending, active, expired, no-signal and incomplete states.
- Desktop and mobile pages display probability, levels, freshness and sample provenance without overflow or console errors.

## Suggested code boundaries

The signal-quality work should be extracted from the large API module into focused units:

- `signals/ledger.py` for persistence and lifecycle;
- `signals/features.py` for historical/live feature parity;
- `signals/outcomes.py` for execution and labels;
- `signals/training.py` for splits, calibration and reports;
- `signals/registry.py` for approved artifacts;
- `signals/service.py` for live scoring and fail-closed behavior; and
- a small API adapter that preserves the existing `/api/signals` and `/api/signals/portfolio` routes.

Existing routes and unrelated product behavior remain unchanged.

## Success criteria

The work is successful when at least one market has an approved model that passes all historical and shadow gates, the app publishes every and only qualifying setup, each published plan has net reward-to-risk of at least 1:1, and the new forward track record is isolated and transparent.

The 55% objective is evaluated on the current model's forward results after 100 resolved trades. If the forward result misses the target, Alpha Nova pauses or tightens the model through a newly validated version; it does not rewrite history or blend in backfill.
