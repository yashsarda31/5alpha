# Dashboard Session Indices Design

## Goal

Make the Dashboard pulse match the market selected by the app's existing session switch. During the current fixed US window, users see S&P 500 and NASDAQ 100 instead of NIFTY 50 and BANKNIFTY.

## Session Rules

- Preserve the existing `20:00–02:00 IST` US window.
- During that window, the active market is `US` and the primary indices are `S&P 500` and `NASDAQ 100`.
- Outside that window, the active market is `IN` and the primary indices are `NIFTY 50` and `BANKNIFTY`.
- Do not introduce New York-time or daylight-saving calculations.

## API Contract

`GET /api/dashboard` will continue returning `indices`, `movers`, `movers_market`, and `market_open`. It will add:

```json
"pulse_names": ["S&P 500", "NASDAQ 100"]
```

The value follows the active market. This keeps session selection in the backend and prevents the frontend from maintaining a second clock or market-hours rule.

During the US window, the backend will:

- Fetch S&P 500 from `^GSPC` and NASDAQ 100 from `^NDX`.
- Skip the NSE all-indices request and NIFTY/BANKNIFTY fallbacks.
- Continue returning INDIA VIX, USD/INR, Gold, and Silver as macro rows when available.
- Report `market_open` from the same existing fixed session selection, so the Dashboard does not show the Indian market's closed state while presenting the US session.

During the India window, existing NIFTY 50, BANKNIFTY, INDIA VIX, and macro behavior remains unchanged.

The existing `dashboard_US` and `dashboard_IN` cache separation remains in place. Cached responses will still have their current session status refreshed before returning.

## Frontend

The Dashboard pulse will use `pulse_names` from the API. It will fall back to the India pair for compatibility with older or partial responses. Macro rows will exclude whichever two names are active in the pulse, avoiding duplicate S&P 500 display during US hours.

No layout or styling changes are required.

## Performance

- US requests avoid the NSE call and two Indian-index fallback quotes.
- S&P 500 and NASDAQ 100 quotes run in the existing bounded parallel quote pool.
- No new frontend request, timer, or dependency is added.

## Error Handling

- A missing primary quote does not fail the Dashboard; any available primary index still renders.
- Macro rows remain independently optional.
- Existing cached data and JSON-safe behavior remain unchanged.

## Testing

- Verify the existing time switch still selects US from `20:00–02:00 IST` and India otherwise.
- Force the US branch and assert `pulse_names`, S&P 500, and NASDAQ 100 are returned without an NSE call.
- Force the India branch and assert NIFTY 50 and BANKNIFTY remain the primary pair.
- Verify cached responses refresh `market_open` consistently with the selected session.
- Add a frontend contract test for API-driven pulse selection and fallback behavior.
- Run relevant API tests, frontend tests, lint, and production build.

## Non-Goals

- No daylight-saving or exchange-holiday calendar.
- No changes to movers, signals, sector rotation, or watchlist behavior.
- No Dashboard redesign.
