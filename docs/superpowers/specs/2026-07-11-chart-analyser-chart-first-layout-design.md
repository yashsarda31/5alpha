# Chart Analyser Chart-First Responsive Layout

**Date:** 2026-07-11  
**Status:** Approved

## Objective

Make the chart the first analytical content users see after the page header and ticker controls, then show price, day high, day low, and volume beneath it. Keep VCP Rating and Alpha Score beside the chart on desktop and optimize the sequence for mobile.

## Desktop Layout

1. Page title, ticker search, search action, and share action.
2. Main analysis row:
   - Candlestick/volume/RSI chart in the wider left column.
   - Stock Pro Dash in the narrower right column.
3. The Stock Pro Dash contains:
   - Technical signal.
   - VCP Rating.
   - Alpha Score.
   - Existing fundamental metric comparison table.
4. A four-card summary strip below the chart row:
   - Price and daily change.
   - Day High.
   - Day Low.
   - Volume.
5. Gemini AI technical analysis remains last.

## Mobile Layout

- Header controls wrap without horizontal overflow; ticker input remains usable at full available width.
- The chart is the first content after errors/loading state and occupies the full viewport width inside the analysis card.
- Chart height is reduced from the desktop size while retaining candlesticks, volume, RSI, and responsive Plotly sizing.
- Stock Pro Dash stacks immediately below the chart. VCP Rating and Alpha Score appear in a compact two-column row near the technical signal.
- Price, Day High, Day Low, and Volume follow in a two-column grid.
- AI analysis remains last.
- Tap targets and readable numeric sizes are preserved.

## Data and Behavior

- No data fetching, calculations, chart traces, technical-signal logic, watchlist behavior, sharing behavior, or AI analysis logic changes.
- Only component hierarchy and responsive presentation change.
- The share capture continues wrapping the complete analysis card.

## Testing

- Verify the chart appears before the four price metrics in rendered source order.
- Verify VCP Rating and Alpha Score appear inside Stock Pro Dash.
- Verify desktop keeps the chart and Stock Pro Dash side by side.
- Verify mobile stacks chart, dash, metrics, and AI analysis without horizontal overflow.
- Run targeted linting, the production build, and live route/API smoke tests.

## Out of Scope

- Changing chart indicators, styling, default ticker, data range, or AI prompts.
- Redesigning other analytics pages.
