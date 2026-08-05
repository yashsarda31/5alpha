# Signals Current Model Portfolio Design

## Goal

Show the current model portfolio inside Market Signals without making the page text-heavy. The section should add proof and context while preserving signup value for guests.

## Scope

- Add a compact `Current model portfolio` section below Actionable Setups and before the existing Signals signup card.
- Follow the market shown by Signals: `IN` for NSE and `US` for the US book.
- Reuse the existing public `/api/signals/portfolio?market=IN|US` endpoint.
- Link to `/track-record` for closed trades, statistics, and methodology.
- Do not change portfolio construction, signal generation, position resolution, or LONG/SHORT support.

## Component Design

Create a focused `SignalsPortfolio` component owned by the Signals page. It receives the active market and independently loads the matching portfolio snapshot through the existing SWR cache.

The component renders a responsive data table with these authenticated columns:

- Symbol
- Side
- Entry
- Current
- Unrealized P&L
- Stop
- Target
- Held
- Weight

Guests see:

- Symbol
- Side
- Unrealized P&L
- Held
- A single `Unlock active levels` signup link in place of entry, current, stop, target, and weight

The section includes one secondary `View full track record` link. It adds no explanatory paragraph.

## Data Flow

1. `MarketSignals` determines the active market from its existing Signals payload.
2. `SignalsPortfolio` requests `/api/signals/portfolio?market=<market>` using the cache key `signal_portfolio_<market>`.
3. The existing endpoint returns `open`, `stats`, and `as_of`; this section uses only `open` and `as_of`.
4. Authentication state selects the full or guest column set without changing the API response.
5. Changing the Signals market changes the cache key and portfolio request.

## States

- Loading: show a short table skeleton inside the section.
- Error: show `Portfolio unavailable` with a Retry action; the rest of Signals remains usable.
- Empty: show `No open positions` and `The model book is all cash.`
- Loaded: render the current open positions and the portfolio timestamp.

## Conversion Behavior

Guests can verify the active symbols, direction, live return, and holding period. Active trade levels and position weights remain the signup benefit. The signup link preserves the current Signals route as the return destination.

## Testing

- Add a failing frontend contract test before implementation.
- Verify that Market Signals renders the new component with the active market.
- Verify that the component uses the portfolio endpoint and existing SWR key convention.
- Verify authenticated and guest column sets.
- Verify the signup return path, full track-record link, all-cash state, and non-blocking error state.
- Run the focused test, complete frontend Node suite, ESLint, production build, and `git diff --check`.

## Out of Scope

- Backend or database changes
- Closed-trade history inside Signals
- Portfolio performance charts or summary tiles
- Changes to the standalone Track Record page
- Automatic deployment without a separate user request
