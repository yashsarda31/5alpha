# Watchlist Premium Market Sheet Design

## Objective

Redesign the Alpha Nova Watchlist tab using the supplied compact market-sheet reference while preserving every existing feature. The result must feel premium, scan quickly on desktop and mobile, retain Alpha Nova's black/graphite/gold visual language, and avoid additional loading cost.

## Selected Direction

The approved direction is **Premium Market Sheet**.

The page will retain a full market table on desktop and use purpose-built compact market rows on mobile. It will not become a grid of large stock cards. Chart, Fundamentals, News, and Remove actions will remain visible rather than hiding behind row expansion, hover, or an overflow menu.

## Preserved Features

- Signed-in and guest states
- NSE and US stocks
- Symbol/company search
- NSE/US market selection when adding
- Add and remove actions
- Live quote polling
- Last traded price and percentage change
- Day-range indicator
- 30-day sparkline
- Live setup badge
- Average move, breadth, best, and worst summary
- Sorting by Symbol, LTP, and Change
- Mixed NSE/US grouping
- Links to Chart Analyser, Fundamentals, News, and Market Signals
- Cached data and stale-data behavior

No backend endpoint or quote methodology changes are included.

## Information Hierarchy

### Header

The title, subtitle, and market status will read as one compact header group. The status remains immediately visible and uses the existing open/closed semantics.

### Add toolbar

The ticker search, market selector, and Add action will be grouped in a single premium toolbar.

- Search occupies the flexible primary width.
- NSE and US become a gold-accented segmented control.
- Add uses a compact gold action treatment.
- Validation errors appear below the toolbar without shifting unrelated content.
- Controls wrap cleanly at narrow widths while preserving 44-pixel touch targets.

### Summary strip

Average Move, Breadth, Best, and Worst will sit inside a highlighted intelligence strip inspired by the supplied reference.

- The strip uses a restrained gold border and ambient glow.
- Labels are small uppercase text.
- Values are larger tabular numerals.
- Gain/loss colors remain the strongest signal.
- Desktop uses four evenly distributed cells.
- Mobile uses four compact cells in one row when space permits and a two-by-two grid at very narrow widths.

### Stock list

NSE and US group labels remain when both markets are present.

#### Desktop

Desktop uses a refined full-width market table with these columns:

1. Symbol, market badge, and live setup badge
2. LTP
3. Change
4. Day Range
5. 30D Trend
6. Always-visible actions

Rows use subtle separators, stronger price typography, adequate whitespace, and a restrained hover lift. Sorting stays in the visible column headers.

#### Mobile

Mobile does not render the desktop table or require horizontal scrolling. Each compact stock row contains:

- top/main line: symbol and badges on the left, LTP and Change in the middle, sparkline on the right;
- context line: day-range indicator and low/high context;
- action line: always-visible Chart, Fundamentals, News, and Remove controls.

The action line uses compact labeled icon buttons. It remains subordinate to price information but does not require expansion or hover.

## Visual System

- Page background: existing Alpha Nova black.
- Primary surfaces: graphite glass with subtle vertical gradients.
- Highlight: restrained metallic gold; no broad yellow fills outside primary actions.
- Summary: soft gold border, small ambient shadow, and an inset highlight.
- Separators: low-contrast hairlines rather than thick card outlines.
- Type: existing Alpha Nova display and interface fonts.
- Prices and percentages: tabular numerals.
- Gains: existing green token.
- Losses: existing red token.
- Neutral text: existing secondary text token.
- Sparklines: existing gain/loss color logic with a restrained area fill.
- Live setup badge: existing green semantics, visually tightened to fit compact rows.

## Interaction Design

- Entire symbol remains a direct Chart Analyser link.
- Desktop rows gain a subtle background and one-pixel visual lift on hover/focus-within.
- Mobile controls provide visible pressed/focus states without motion-heavy effects.
- Sorting remains controlled by desktop headers.
- Mobile receives compact sort controls for Symbol, LTP, and Change so sorting functionality is not lost when the table header is removed.
- Add, remove, and navigation actions retain existing handlers and destinations.
- Motion respects `prefers-reduced-motion`.

## Component Boundaries

The Watchlist page will be divided into small presentational units within the page module or focused adjacent components:

- `WatchlistToolbar`: search, market selection, add state, and validation.
- `WatchlistSummary`: derived aggregate metrics.
- `DesktopWatchlistTable`: existing table data mapped to desktop presentation.
- `MobileWatchlistList`: compact mobile rows and sort controls.
- `WatchlistActions`: shared visible Chart, Fundamentals, News, and Remove controls.
- `DayRange`: shared price-position visualization.

All units receive data and callbacks through props. Quote fetching, market grouping, sorting, and watchlist context remain owned by the page container.

## Loading and Failure Behavior

- Initial loading uses row-shaped skeletons matching the final desktop/mobile silhouette.
- Cached or previously loaded quotes remain visible during background refresh.
- A quote failure does not clear the list.
- Missing quote fields display an em dash while symbol and actions remain usable.
- Add/remove errors use the existing watchlist context and remain local to the relevant control.
- The empty signed-in state and guest conversion state retain their current functionality and receive matching visual polish.

## Responsive Requirements

- No horizontal page overflow at 320, 360, 390, 768, 1024, 1440, or 1920 CSS pixels.
- The desktop table switches to the mobile list at a single documented breakpoint near 760 pixels.
- Bottom navigation remains unobstructed on mobile.
- Action targets are at least 44 CSS pixels high on touch layouts.
- Summary content does not truncate critical values.
- Sparklines scale without distortion.

## Accessibility

- Preserve semantic table markup on desktop.
- Mobile rows use list/article semantics with an accessible stock label.
- Market selection exposes pressed/selected state.
- Sorting controls expose active key and direction.
- Every icon action includes a visible label and accessible name.
- Gain/loss meaning is conveyed by signed values, not color alone.
- Focus indicators remain visible against dark surfaces.

## Performance Constraints

- Reuse the existing Sparkline component.
- Add no heavy visualization or animation dependency.
- Avoid per-row observers and continuous animation.
- Preserve the existing two-minute quote polling interval.
- Memoize derived sorted/grouped rows only where it removes repeated work without complicating state.
- The redesign must not reduce the current Watchlist Lighthouse performance score.

## Testing and Deployment Gates

### Automated

- Frontend lint passes.
- Existing frontend tests pass.
- Production build passes.
- Add focused tests for summary derivation and row sorting if those calculations move into pure helpers.

### Browser verification

- Signed-in watchlist with NSE-only, US-only, and mixed-market rows.
- Guest state.
- Empty signed-in state.
- Add NSE stock and Add US stock.
- Remove stock.
- Sort by Symbol, LTP, and Change in both desktop and mobile presentations.
- Navigate using Symbol, Chart, Fundamentals, News, and live setup links.
- Verify day range and sparkline fallbacks.
- Verify no horizontal overflow at required widths.
- Capture desktop and mobile screenshots for visual review.

### Deployment

Deploy only after lint, tests, production build, responsive browser checks, and action-link smoke tests pass. After deployment, repeat mobile and desktop live checks on `https://alphanova48.in/watchlist`.

## Out of Scope

- Watchlist backend changes
- New quote fields or data providers
- Drag-and-drop reordering
- Alerts configuration changes
- Hidden row expansion or overflow action menus
- Changes to other application tabs
