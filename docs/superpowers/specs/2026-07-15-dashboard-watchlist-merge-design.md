# Dashboard Watchlist Merge Design

## Goal

Remove navigation confusion by making Dashboard the single watchlist destination. The Dashboard will contain the complete existing watchlist experience, and the mobile tray position currently used by Watchlist will become Chart Analyser.

## User Experience

- Replace the compact `My Watchlist` Dashboard tiles with the complete watchlist experience.
- Keep the watchlist visible by default rather than collapsed.
- Preserve add/search, India/US selection, summary metrics, sorting, market grouping, sparklines, setup badges, and responsive desktop/mobile layouts.
- Keep direct actions visible for Chart Analyser, Fundamentals, News, and removal.
- Remove the standalone Watchlist item from the desktop sidebar.
- Replace the mobile bottom-tray Watchlist item with `Chart Analyser` using the existing chart icon.
- Redirect `/watchlist` to `/dashboard#watchlist` so bookmarks and old links remain useful.
- Give the merged section an anchor target so redirected users land at the watchlist.

## Architecture

Extract the reusable watchlist UI and data behavior from the standalone page into a focused `WatchlistPanel`. Dashboard will render this panel in place of its compact `MyWatchlist` implementation. The standalone route will become a redirect and will not maintain a second UI implementation.

The panel will support an embedded presentation that omits the standalone page header while retaining the toolbar, summary, tables/cards, actions, loading states, and errors. Existing watchlist context remains the single source of truth for symbols and mutations.

## Data Flow and Performance

- Remove the compact Dashboard quote request so Dashboard does not request watchlist quotes twice.
- Load the watchlist panel independently from the critical Dashboard market summary. Its skeleton must not block the Dashboard shell, pulse, or other sections.
- Retain the existing quote refresh interval and signal-cache reuse.
- Use the existing watchlist context rather than introducing another symbol fetch or store.
- Keep chart-heavy routes out of the Dashboard bundle; the action buttons remain links and do not import those pages.
- Preserve route prefetch behavior for navigation without eagerly loading heavy chart dependencies during Dashboard startup.

## Error Handling

- If quotes fail, continue showing saved symbols and existing degraded states.
- Watchlist mutation errors remain inline and dismissible.
- The legacy route redirect must work for guests and authenticated users.
- Empty watchlists retain the existing setup guidance and add controls.

## Testing

- Verify Dashboard renders the complete watchlist controls and action links.
- Verify the compact watchlist request path is removed and quotes are fetched once per refresh cycle.
- Verify `/watchlist` redirects to `/dashboard#watchlist`.
- Verify desktop navigation no longer includes Watchlist.
- Verify the mobile tray contains Chart Analyser instead of Watchlist.
- Run frontend unit tests, lint, and production build.
- Run relevant backend watchlist/dashboard tests because the merged UI depends on those APIs.
- Validate desktop and mobile Dashboard behavior, including no horizontal overflow and usable action buttons.
- Measure or inspect initial Dashboard loading to confirm the watchlist panel does not block critical content.

## Non-Goals

- No visual redesign of the Dashboard or watchlist.
- No watchlist API contract changes.
- No changes to Chart Analyser, Fundamentals, or News behavior.
- No new polling intervals or real-time streaming.
