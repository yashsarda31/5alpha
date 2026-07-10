# Alpha Cockpit V3 — Product and System Design

**Date:** 2026-07-10
**App:** Alpha Nova / 5 Alpha (FastAPI backend, React/Vite frontend)
**Status:** Approved design, awaiting written-spec review

## Goal

Transform the existing 5 Alpha application into **Alpha Cockpit V3**, a premium
decision-support product for return-oriented investors aged 20–35 who deploy
approximately ₹1 crore into 2–20 trading-day swing opportunities.

V3 must preserve the strongest working capabilities from V2—watchlists, market
signals, signal track record, sector rotation, momentum, options intelligence,
fundamentals, forecasts, news, and position sizing—while replacing its collection
of disconnected modules with a clear daily process:

> Scan → validate → size → monitor → review.

V3 remains decision support. It does not place orders, connect brokerage accounts,
or present itself as personalized investment advice.

## Success Criteria

- A user can understand the current regime and the best 3–7 opportunities within
  the first viewport.
- Every opportunity provides an entry zone, invalidation stop, targets, expected
  holding period, risk/reward, confidence, and portfolio-aware allocation.
- The user can understand why a setup qualified and what would invalidate it
  without opening a separate research module.
- Prices, scores, position sizes, and signal states agree on every screen because
  they originate from one normalized opportunity contract.
- Missing or stale source data reduces signal confidence visibly; it never silently
  becomes a valid zero or a high-conviction signal.
- Forward signal outcomes remain visible and include estimated costs and slippage.
- The primary workflows work at mobile and desktop sizes and meet WCAG 2.1 AA.

## Product Direction

The selected direction is **Alpha Cockpit**, rather than a research terminal or a
tip-like signal feed. The Cockpit makes the decision workflow primary and keeps
specialized research as contextual drill-down.

The experience should feel Apple-like through restraint, hierarchy, typography,
progressive disclosure, consistent interaction, and careful motion. It must not
copy Apple trademarks or sacrifice financial clarity for decorative effects.

## Information Architecture

The primary navigation is reduced to five destinations:

1. **Cockpit** — current regime, ranked opportunities, allocation guidance, active
   idea attention, and data freshness.
2. **Opportunities** — complete ranked universe with filters, saved views, lifecycle
   states, and expandable setup details.
3. **Portfolio Lab** — manual planning for a ₹1 crore model portfolio, including
   position size, sector and correlation exposure, risk budget, and planned ideas.
4. **Research** — existing Chart, Screener, Momentum, Sector Rotation, Fundamentals,
   Options, FII/DII, Deals, Forecast, FLCL, News, and learning tools.
5. **Track Record** — active and closed signals, model portfolio, hit rate, expectancy,
   drawdown, and historical setup analogues.

Mobile uses a five-item bottom navigation. Desktop uses a slim translucent sidebar.
Global command search locates a stock, feature, or common action from anywhere.

## Cockpit Experience

The Cockpit answers five questions in a fixed sequence:

1. **What is the market regime?** A concise sentence summarizes trend, breadth,
   volatility, liquidity, and institutional flow, with the underlying metrics
   available on expansion.
2. **Where is the opportunity?** Three hero opportunity cards lead a ranked list of
   no more than seven confirmed setups.
3. **Why now?** Each setup explains its trend, participation, quality, catalyst, and
   risk evidence.
4. **How much should be deployed?** The app proposes an allocation, entry zone,
   structure-based stop, two targets, and total portfolio risk based on ₹1 crore.
5. **What needs attention?** Active ideas nearing stops or targets, weakening
   evidence, watchlist changes, and source freshness appear as a prioritized list.

The headline may use direct language such as “Constructive trend. Favor selective
longs; keep 18% cash.” It must distinguish measured facts from model interpretation.

## Opportunity Presentation

Opportunity detail is progressively disclosed:

- **Collapsed card:** symbol, company, side, Alpha Score, expected holding period,
  entry zone, upside to first target, and defined risk.
- **Expanded card:** five sub-scores, compact price chart, thesis, catalysts,
  invalidation conditions, freshness, confidence, and recommended position size.
- **Deep research:** full chart, fundamentals, news, options or derivatives context,
  source data, and similar historical setups.

Each opportunity includes:

- An entry zone rather than a misleading single entry price.
- A structure- and ATR-aware invalidation stop.
- Two profit targets and the resulting risk/reward.
- An expected holding range within the 2–20 session mandate.
- A calibrated probability band, only when sufficient evaluation data exists.
- Recommended allocation and rupee risk for the ₹1 crore reference portfolio.
- “Why it qualifies” and “What would change our mind” explanations.
- Source timestamps, freshness state, and overall confidence.
- Comparable historical setups and their forward outcomes when available.

The **Add to plan** action sends an opportunity to Portfolio Lab. It never executes
or implies that a trade was executed.

## Alpha Score 2.0

The existing conviction logic evolves into an explainable, regime-adjusted composite
for 2–20 day opportunities. It contains five bounded sub-scores:

### Trend

Relative strength, breakout quality, moving-average structure, volatility-adjusted
momentum, trend persistence, and distance from invalidation.

### Participation

Delivery percentage, volume expansion, futures open interest where available,
accumulation/distribution behavior, and liquidity quality.

### Quality

Earnings and revenue growth, profitability, leverage, cash conversion, and valuation
sanity checks. Quality prevents technically attractive but structurally weak names
from dominating the ranking.

### Catalyst

Results, material news, upgrades or downgrades, block and insider activity, sector
rotation, and other timestamped events. Untimestamped narrative does not count as a
catalyst.

### Risk

Realized and implied volatility, gap behavior, liquidity, nearby support, event risk,
market-regime compatibility, and portfolio correlation.

No single sub-score can create a top-ranked opportunity by itself. Required inputs,
minimum liquidity, and freshness gates run before scoring. The final weights change
within documented bounds by market regime: momentum and participation can receive
more weight in constructive markets, while quality and risk receive more weight in
unstable regimes.

The API returns the raw components, normalized components, active weight set, missing
features, score version, and calculation timestamp. This makes every score auditable.

## Signal Lifecycle

Signals use an explicit state machine:

- **Emerging:** promising but confirmation, liquidity, or freshness requirements are
  incomplete.
- **Confirmed:** all gates pass and the entry zone is actionable.
- **Active:** price has entered the zone according to the documented activation rule.
- **Weakening:** the setup remains open but important evidence has deteriorated.
- **Closed:** stop, target, expiry, or explicit invalidation rule ended the signal.

Transitions are deterministic and stored. A daily snapshot preserves exactly what
the user could see at the time. Later revisions may create a new score snapshot but
cannot rewrite the historical recommendation.

## Portfolio-Aware Ranking and Sizing

Ranking operates on both opportunity quality and portfolio usefulness:

- Highly correlated duplicates are suppressed or grouped.
- Sector and theme concentration limits prevent a list of near-identical trades.
- A liquidity gate ensures the modeled allocation is practical.
- Position sizing starts from allowed rupee risk, entry zone, and invalidation stop,
  then applies volatility, liquidity, confidence, and portfolio-correlation limits.
- Portfolio Lab shows gross exposure, total risk at stops, sector exposure,
  correlation clusters, and residual cash.
- Invalid or stale price, stop, volatility, or liquidity inputs disable sizing and
  explain why.

The reference portfolio defaults to ₹1 crore but remains user-configurable. V3 does
not infer actual holdings or executed prices.

## Data Strategy

V3 initially reuses the working NSE, yfinance, delivery, derivatives, FII/DII,
fundamentals, deals, and news pipelines. Each is placed behind a provider adapter
with a normalized result containing:

- Payload and source name.
- Market timestamp and retrieval timestamp.
- Fresh, stale, partial, unavailable, or fallback state.
- Validation warnings and provider-specific metadata.

Adapters allow paid or higher-reliability sources to be introduced later without
changing opportunity or UI contracts. Independent caches and timeouts prevent one
slow source from blocking the entire Cockpit. A failed provider falls back to the
last valid snapshot only when its age is visible and compatible with the affected
feature. Missing values remain missing.

## AI Boundary

Deterministic code owns prices, technical features, scores, rankings, sizing, signal
states, outcomes, and performance statistics. AI may summarize structured evidence
into plain language, define unfamiliar metrics, or compare already-calculated facts.
It cannot invent or alter numeric inputs, signal rules, stops, targets, confidence,
or track-record results. AI failure must not prevent the core Cockpit from loading.

## Visual and Interaction System

### Character

The default appearance is graphite black with an optional warm-white mode. Large,
editorial headlines establish hierarchy. Secondary content uses softly layered
panels, restrained translucency, thin neutral borders, and generous spacing.

### Color

- One restrained cobalt blue is used for selection, focus, and primary actions.
- Green and red are reserved for financial gain/loss, favorable/adverse movement,
  and explicit directional semantics.
- Neutral states use graphite, warm white, and accessible gray roles.
- Neon glow, decorative gradients behind data, and excessive glass effects are
  excluded.

### Typography and Data

- Use the native system sans-serif stack for an SF-like feel and platform quality.
- Use tabular numerals for prices, percentages, dates, and aligned financial values.
- Important values are never communicated by color alone.
- Acronyms and model-specific metrics receive concise contextual definitions.

### Motion and Input

- Standard transitions use approximately 160–240 ms and consistent easing.
- Reduced-motion preferences remove nonessential animation.
- Touch targets are at least 44×44 CSS pixels.
- Keyboard focus is always visible, and primary flows are keyboard operable.
- Mobile replaces wide tables with sortable, expandable cards.

### Application States

Loading, empty, market-closed, stale, partial-data, offline, and provider-error states
have deliberate copy and layouts. The interface states what remains trustworthy and
what action the user can take. It never presents an empty chart or zero value that
could be mistaken for valid market data.

## Frontend Architecture

V3 evolves the current React/Vite application and preserves its routing, auth,
watchlist, lazy loading, caching, and proven research pages where suitable.

New domain-focused modules include:

- `CockpitPage` for orchestration and layout only.
- `RegimeSummary` for market state and evidence.
- `OpportunityCard` and `OpportunityDetail` for shared setup presentation.
- `ScoreBreakdown` for components, weights, missing inputs, and confidence.
- `AllocationPanel` for position and portfolio impact.
- `AttentionList` for active-signal changes and data warnings.
- `FreshnessIndicator` for source age and degradation.
- `PortfolioLab` for planned positions and aggregate risk.

Components consume a shared opportunity contract rather than reconstructing scores
or sizing in the browser. Existing research routes are regrouped beneath Research
and linked contextually from each opportunity.

## Backend Architecture

A consolidated `GET /api/cockpit` contract returns:

- Market and session status.
- Regime summary and its components.
- Ranked opportunities and score metadata.
- Reference portfolio guidance.
- Active-signal attention items.
- Per-source freshness and degradation state.

The backend separates:

1. Provider acquisition and normalization.
2. Feature calculation.
3. Eligibility and freshness gates.
4. Regime classification.
5. Score calculation.
6. Portfolio-aware ranking and sizing.
7. Lifecycle transitions and immutable snapshots.
8. API serialization.

These units communicate with typed or explicitly validated data structures. The
feature engine and scoring logic do not depend on HTTP handlers, UI terminology, or
provider-specific payloads.

## Persistence

Signal snapshots store the score version, calculation time, source timestamps,
features, sub-scores, active weights, entry zone, stop, targets, lifecycle state,
and later outcome. The system retains failed and expired signals. Outcome resolution
uses data from sessions after activation and must never use same-day future values.

Portfolio Lab stores plans, not broker positions. A plan records the setup snapshot,
the user's intended quantity or allocation, and optional notes. Execution status is
manual and clearly labeled as user-entered.

## Error Handling

- Source timeouts return partial Cockpit data with explicit degradation metadata.
- Missing required features fail eligibility before ranking.
- Partial optional features reduce confidence according to documented rules.
- Cached fallbacks display their age and never masquerade as live data.
- Invalid price, stop, target, volatility, or liquidity inputs disable sizing.
- Conflicting provider values trigger validation warnings and exclude dependent
  features until resolved.
- AI explanation errors fall back to deterministic evidence labels.
- API errors preserve the last successfully rendered Cockpit snapshot where safe and
  offer a clear refresh action.

## Accessibility and Responsive Requirements

- WCAG 2.1 AA contrast for text and interactive elements.
- Keyboard access for navigation, cards, expansion, filters, and plan actions.
- Programmatic names for scores, icons, charts, direction, and freshness.
- Non-color indicators for gain/loss and signal state.
- No horizontal viewport overflow at 375 CSS pixels.
- Charts provide concise textual summaries of their decision-relevant information.
- Screen-reader announcements are reserved for meaningful refresh or error changes.

## Testing and Evaluation

### Signal correctness

- Unit tests for every feature, gate, regime rule, score bound, weighting set,
  position-sizing constraint, correlation rule, and lifecycle transition.
- Fixture tests for missing, stale, inconsistent, and partial source data.
- Contract tests proving that Cockpit, Opportunity, Portfolio Lab, and Track Record
  display identical stored values for the same signal snapshot.

### Historical evaluation

- Walk-forward evaluation only; no look-ahead features or revised future inputs.
- Entry and exit rules match production lifecycle rules.
- Include estimated costs, slippage, missed entries, gaps through stops, and delisted
  or unavailable names where the source universe permits.
- Report sample size, hit rate, expectancy, profit factor, drawdown, calibration,
  and results by regime. Do not promote a probability band without adequate samples.

### Application quality

- Preserve and run the existing backend test suite.
- Add API tests for the consolidated Cockpit contract and degradation behavior.
- Test loading, empty, market-closed, stale, partial, and provider-failure states.
- Verify primary workflows on desktop and 375-pixel mobile layouts.
- Validate keyboard operation, reduced motion, contrast, and visible focus.
- Run the production frontend build and relevant backend tests before handoff.

## Delivery Sequence

1. **Shared contracts and foundations:** normalized provider results, opportunity
   contract, score metadata, and V3 design tokens/components.
2. **Cockpit vertical slice:** regime summary, ranked opportunity cards, attention
   list, freshness, and the consolidated endpoint using existing data sources.
3. **Alpha Score 2.0:** independent features, gates, regime weights, ranking,
   auditable explanations, and tests.
4. **Portfolio Lab and lifecycle:** planning, portfolio constraints, signal states,
   immutable snapshots, and outcome resolution.
5. **Research and navigation consolidation:** regroup existing tools beneath Research,
   add contextual drill-down, command search, and responsive navigation.
6. **Track record and polish:** walk-forward reporting, forward results, degraded
   states, accessibility, performance, and cross-device verification.

Each sequence step is independently testable. The Cockpit vertical slice is the
first user-visible milestone; subsequent steps deepen signal quality without forcing
a second UI redesign.

## Explicit Non-Goals

- Broker connection, automated execution, or order placement.
- Claims of guaranteed returns or personalized fiduciary advice.
- Social trading, public portfolios, chat, or copy trading.
- Intraday scalping or multi-year portfolio management.
- Rewriting stable research features solely to change their implementation language.
- Hiding failed signals, retroactively changing historical scores, or presenting
  backtests as live performance.

## Key Risks and Mitigations

- **Data reliability:** normalize providers, show freshness, isolate caches, and
  degrade confidence instead of fabricating completeness.
- **Overfitting:** use bounded features, walk-forward evaluation, versioned rules,
  and regime-by-regime reporting.
- **False precision:** use entry zones, probability bands, explicit assumptions, and
  disable unsupported outputs.
- **Interface complexity:** make the Cockpit decisive, progressively disclose detail,
  and keep specialized modules inside Research.
- **Portfolio concentration:** rank for marginal portfolio value and enforce sector,
  liquidity, risk, and correlation limits.
- **Historical rewriting:** store immutable signal snapshots and visible outcomes.
