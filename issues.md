# 5Alpha V2 - Known Issues & Debugging Logs

## Issue: Option Chain Not Working

### Status: FIXED
**Date:** 2026-07-02

### Root Cause
1. The NSE direct fallback used the retired `/api/option-chain-indices` endpoint, which now returns 404. NSE moved to `/api/option-chain-v3` (used by the standalone F&O terminal).
2. Expiries and chain data could come from different sources (niftytrader expiries vs NSE chain), so a chain request for an expiry the other source didn't know about returned an empty `opDatas`.
3. A stale dev server from WSL was still bound to port 8000 serving old code, masking local fixes.

### Resolution
- Rewrote `/api/option-chain/expiries/{symbol}` and `/api/option-chain/data/{symbol}` around NSE's v3 API (`option-chain-contract-info` + `option-chain-v3`, with cookie warm-up on `/option-chain`, XHR headers, and re-warm on 401/403), matching the fno_terminal3 approach. Supports both indices (`type=Indices`) and stocks (`type=Equity`).
- India VIX and index spot change now come from NSE `/api/allIndices` in the same pass.
- niftytrader and yfinance remain as ordered fallbacks; all sources are fetched in parallel and bounded with hard timeouts (`asyncio.wait_for`) so a blocked source can't stall the serverless function.
- Added `opTotals` aggregates to preserve the previous response contract.

### Other fixes in the same pass
- Gemini model set to `gemini-3.1-flash-lite` for all AI endpoints.
- Screener `divYield` was inflated 100x (yfinance >= 0.2.50 already returns `dividendYield` as a percentage).
- Added `requests` explicitly to requirements (was only a transitive dependency).
- Lint fixes: TradingGame daily reset moved from a mount effect into the lazy state initializer; empty/unused catch bindings cleaned up.
- Page title set to "Alpha Nova — Institutional Analytics" (was "web").

## Fixes on 2026-07-02 (second pass)
- **Dashboard showed hardcoded mock data** (static NIFTY 23,649, fake movers, permanent "MKT OPEN"). Added a live `/api/dashboard` endpoint (NSE `allIndices` for NIFTY/BANKNIFTY/VIX with yfinance fallback, `INR=X` for USD/INR, top movers among NIFTY heavyweights, IST market-hours check) and rewired `Dashboard.jsx` to consume it with loading/error states. Cached 5 min server-side, auto-refreshes every 2 min client-side.
- **Momentum Leaders included laggards** (TCS/INFY with negative momentum) because the universe was a fixed 15-ticker list returned in full. Universe expanded to ~50 large caps per market (Nifty 50 constituents / S&P mega caps); only the top 15 by score are returned. Also fixed ₹ vs $ price prefix in `Momentum.jsx`.
- **Fundamentals Debt-to-Equity** now displays with a `%` suffix (yfinance reports `debtToEquity` in percent units, e.g. AAPL ≈ 79.55%).

## Mobile optimization (2026-07-02)
- Previously at ≤850px the full sidebar (13 nav links + account box + API key input) stacked above the content, pushing everything below the fold. Replaced with a sticky mobile top bar (hamburger + brand) and a slide-in drawer sidebar with backdrop; the drawer closes on nav clicks (`App.jsx` + `index.css`).
- Dashboard panels stack full-width on mobile (`!important` needed to beat inline `gridColumn` spans); header wraps; heatmap/nav-card sizes reduced.
- Option chain: presets share one row, ticker+GO on the next; controls stack; table font/padding compressed and scrolls horizontally inside its wrapper without page overflow.
- DCF: `primary-btn`/`search-input` no longer fight the global `button { width: 100% }` rule; panel inline `min-width: 400px` overridden on mobile.
- Inputs/selects are 16px on mobile to prevent iOS focus-zoom. All routes verified at 375×812 with no horizontal viewport overflow (Plotly charts already had `responsive`/`autosize`).

## DCF, Screener, and second mobile pass (2026-07-02)
- **DCF bugs fixed**: stepper buttons accumulated float noise (`6.88 - 0.1 → 6.7799…94` shown raw in inputs) — now rounded via `round1()`; steppers were unbounded (discount rate could go negative and blow up the math) — now clamped (discount 1–50, years 1–30, growth −50–100, terminal −10–20); every value displayed `$` even for NSE/BSE tickers — now `₹` via `currencyFor()`; Alpha Nova Score was pinned at 10/100 because the unbounded margin-of-safety term dominated — MoS contribution now clamped to ±25.
- **Screener improvements**: `error` state was never cleared after a failure, permanently sticking the error panel — fixed; invalid `MM.NS` preset ticker corrected to `M&M.NS`; columns are click-to-sort with direction indicators (default: market cap desc, nulls always last); prices/market caps show ₹ or $ per ticker; result header shows "N of M tickers passed"; dedicated empty state when filters exclude everything; form uses `.screener-form` CSS grid that collapses to 2 columns on mobile with a full-width submit button.
- **Mobile pass 2**: compact disclaimer, tighter `.card`/`.ai-insight` padding on small screens, `theme-color`/`viewport-fit=cover`/apple-web-app meta tags for mobile browser chrome.
- Note: the local preview browser can cache a stale `index.html` after rebuilds — hard-reload with a query param when verifying; Vercel serves HTML with revalidation so production is unaffected.

## Real authentication (2026-07-02)
- **Root cause of broken Sign Out**: `AuthContext` hardcoded `currentUser` to a fake tester account and never subscribed to `onAuthStateChanged`, so `signOut()` ran but the UI state never changed. Also `firebase.js` contained placeholder config (`YOUR_API_KEY`), meaning no real sign-in could ever succeed.
- **New implementation**: `AuthContext` subscribes to `onAuthStateChanged` (with a loading gate so logged-in users don't flash the login page); providers: Google, Facebook (`signInWithPopup`), and email/password (login + signup). On every login, a minimal profile (email, displayName, photoURL, provider, lastLoginAt) is upserted to Firestore `users/{uid}`.
- **Security**: Firebase config comes only from `VITE_FIREBASE_*` env vars (`web/.env.example` documents them; `.gitignore` blocks `.env.local`); `firestore.rules` (repo root) restricts each `users/{uid}` doc to its owner and denies everything else; passwords are handled entirely by Firebase Auth; friendly error mapping avoids leaking raw auth codes.
- **Demo mode**: until Firebase env vars are set, the login page offers "Continue in Demo Mode" (local-only session in localStorage); provider buttons explain what's missing. Sign Out works in both modes.
- **To activate real auth**: create a Firebase project → enable Email/Password, Google, and Facebook providers → copy web config into `web/.env.local` and Vercel env vars → create Firestore and publish `firestore.rules` → redeploy.

## Replaced Firebase with local SQLite auth (2026-07-02)
- The user preferred zero-setup local auth over configuring Firebase, so Firebase was removed entirely (files deleted, `firebase` npm dependency uninstalled — bundle shrank ~275 KB).
- **Backend** (`api/main.py`): `/api/auth/signup`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` backed by SQLite at `data/alphanova.db` (override dir with `ALPHANOVA_DB_DIR`; uses `/tmp` on Vercel).
- **Security**: passwords hashed with PBKDF2-HMAC-SHA256 (300k iterations, per-user random salt), constant-time comparison, uniform hashing cost for unknown emails (timing-attack resistance); session tokens are random 256-bit values stored only as SHA-256 hashes, 30-day expiry, revoked on logout; API responses never include hashes/salts; `data/` is git-ignored.
- **Frontend**: `AuthContext` restores sessions via `GET /api/auth/me` with the Bearer token from localStorage; Login page is email/password + signup (with optional display name).
- **Tests**: `api/test_auth.py` — 6 tests covering the full cycle, duplicate signup, wrong password, unknown email, validation, and missing token.
- **Caveat**: on Vercel the SQLite file lives in `/tmp`, which is ephemeral — cloud accounts reset on redeploy/cold start. ~~Durable accounts on the deployed site would need a hosted DB~~ → RESOLVED below.

## Durable cloud accounts + DCF AI 422 (2026-07-02)
- **Durable accounts**: created a PRIVATE Vercel Blob store (`alphanova-db`, provisioned via `vercel blob create-store --access private`, auto-linked to the project which injects `BLOB_READ_WRITE_TOKEN`). The SQLite auth DB is mirrored there: pulled on cold start (`_blob_pull_db`, validates the `SQLite format 3` header before accepting), pushed after every signup/login/logout (`_blob_push_db`). `/api/auth/me` re-pulls once on a session miss so warm instances catch logins made on other instances. **Verified: an account created on prod survived a full redeployment.** Locally (no token env) it stays pure local SQLite.
- Blob REST protocol (not officially documented for raw HTTP; extracted from @vercel/blob SDK): base `https://vercel.com/api/blob`, upload `PUT /?pathname=<p>` with headers `x-api-version: 12`, `x-vercel-blob-access: private`, `x-add-random-suffix: 0`, `x-allow-overwrite: 1`; list `GET ?prefix=<p>`; download = GET the blob URL with the Bearer token.
- **DCF AI button 422**: frontend sent `dcf_data` as a JSON *string* while `AIDCFRequest.dcf_data` is typed `dict` — pydantic rejected the request before the handler ran. Fix: send the object directly.
- **Dashboard 500**: NaN from a yfinance quote (off-hours `INR=X`) made the JSON response non-compliant. `_yf_quote_change` now drops NaN closes and validates with `np.isfinite`.

## Retheme + UX polish + full test pass (2026-07-03)
- **Theme**: Electric Ice Blue (`#3EE6FF`, `--primary-accent`) × Light Golden (`#F5DC8C`, `--primary-gold`) across the app. All hardcoded accent hexes replaced with CSS vars: old Apple blue (`#0A84FF`), option-chain blue (`#409cff`), old gold (`#D4AF37`/`#ffd700`), Bloomberg amber/blue in Dashboard.css (`#ff9900`/`#00aaff`), and the DCF AI button's green — all now themed. Semantic red/green market colors kept.
- **UX polish**: themed scrollbars and text selection, `:focus-visible` ice-blue outlines for keyboard accessibility, golden glow on button hover, active nav link gets an ice-blue tint + inset indicator bar, input focus rings use the accent glow. Fixed a latent bug where `--primary-gold-hover` was referenced but never defined (button hover had no valid background).
- **Layout fix**: at ~850–950px the option-chain expiry `<select>` collapsed to 34px (flex shrink) — added `min-width: 140px` and let `.controls-row` wrap.
- **Momentum 500**: same NaN class as the dashboard bug — `fetch_momentum` now drops NaN closes and validates all computed values with `np.isfinite` before returning.
- **Test pass**: all 13 routes verified in-browser (desktop + mobile, zero console errors), theme confirmed via computed styles, 27 backend tests pass, production endpoints healthy after deploy.

## Market Signals tab (2026-07-03)
- New `/api/signals` endpoint + `⚡ Market Signals` page (`/signals`), porting the fno_terminal3 engine into the app. All NSE fetches run in parallel with `_bounded` timeouts; 120s cache.
- **Options intelligence**: condensed chain summaries for NIFTY/BANKNIFTY (PCR full + ±5% band, ΔOI PCR, max pain + drift, support/resistance OI walls, ATM IV CE/PE, straddle price); the 4 OI-spurt buildup buckets (long/short buildup, short covering, long unwinding) ranked by |ΔOI%|·√turnover; per-index option-structure ideas (range/bull/bear/neutral).
- **Regime context**: NIFTY/BANKNIFTY trend labels from 50/200-SMA structure (yfinance 1y closes), VIX percentile vol regime with position-sizing scale, market breadth (advances/declines), ATM-IV-vs-VIX richness, composite RISK-ON/RISK-OFF/MIXED badge.
- **Actionable setups**: futures radar (OI-spurt underlyings × most-active futures) scored 0–100 (OI intensity 25, momentum 20, liquidity 10, options-flow agreement 15, index bias 10, intraday alignment 10, regime 5); plans include entry at fut LTP, stop at day's adverse extreme (min 0.4%), 1.5R target, vol-scaled qty; threshold 45, top 8.
- Porting bug caught during browser verification: `build_index_ideas` used a bare `else` where the terminal had `elif bias == "BEARISH"`, mislabeling NEUTRAL readings as BEARISH — fixed with an explicit NEUTRAL idea.
- Covered by `test_market_signals` in api/test_main.py (28 tests total). Verified live in-browser (desktop + mobile) and on prod (~2.8s response).

## Screener universe expansion + first git commit (2026-07-03)
- Screener now covers named universes resolved server-side: Nifty 100, Nifty 200, S&P 100, Nasdaq 100 (lists in `SCREENER_UNIVERSES` in api/main.py). Frontend sends a `universe` key (not a 200-ticker string); the preset shows a summary chip instead of dumping tickers into the textbox. Custom tickers still supported.
- Backend scales workers to universe size (cap 32) and uses a 45s `as_completed` time budget, returning partial results with `{requested, scanned, truncated}` rather than hanging. Unknown/delisted symbols filter out gracefully. Prod Nifty 200 scan = all 200 in ~28s.
- First real git commit made (d911b83 on main) capturing the whole overhaul. Staged explicitly to exclude secrets (`.env.local`, `data/alphanova.db`) and scratch artifacts; untracked the previously-committed `.pyc` files; `.gitignore` extended for debug dumps.

## Issue: "Failed to Fetch" in Momentum Leaders Tab

### Status: Identified
**Date:** 2026-05-13

### Description
Users report a "Failed to fetch" error when opening the Momentum Leaders tab.

### Root Cause Analysis
1. **Hardcoded API URLs in Frontend:**
   The `web/src/pages/Momentum.jsx` file contains a hardcoded absolute URL for the API call:
   ```javascript
   const response = await fetch(`http://localhost:8000/api/momentum?market=${market}`);
   ```
   This causes several problems:
   - **Production Failure:** When the app is deployed (e.g., on Vercel), the browser tries to fetch data from the user's local machine (`localhost:8000`) instead of the production API.
   - **Environment Inconsistency:** If the backend is running on a different port (e.g., 5000 or 8080), the request will fail even in development.
   - **Bypassing Vite Proxy:** The project has a Vite proxy configured in `web/vite.config.js` to route `/api` to the backend, but using an absolute URL bypasses this proxy.

2. **Inconsistent Implementation:**
   Other pages like `Screener.jsx` correctly use relative paths with `axios` (e.g., `/api/screener`), which works across both development and production environments. However, `Fundamentals.jsx` and `News.jsx` also suffer from the same hardcoded URL issue.

### Recommended Fixes
- [x] **Standardize API Calls:** Update `Momentum.jsx`, `Fundamentals.jsx`, and `News.jsx` to use relative paths (e.g., `/api/momentum?market=...`) instead of `http://localhost:8000/...`.
- [x] **Use Axios or centralize Fetch:** Ideally, use a central API utility or standardize on `axios` as seen in other components to handle base URLs and error states consistently.

### Evidence
- `web/src/pages/Momentum.jsx:14`: `await fetch("http://localhost:8000/api/momentum...")`
- `web/src/pages/Fundamentals.jsx:16`: `await fetch("http://localhost:8000/api/fundamentals/...")`
- `web/src/pages/News.jsx:17`: `await fetch("http://localhost:8000/api/news/...")`
- `web/vite.config.js`: Proxy is correctly configured for `/api` but ignored by these components.

---

## Other Potential Issues Found During Investigation

### 1. Hardcoded NewsAPI Key
- **File:** `api/main.py:602`
- **Status:** **FIXED** (Moved to `os.environ.get("NEWS_API_KEY")` with a fallback)
- **Finding:** The NewsAPI key is hardcoded in the function signature. This should be moved to an environment variable for security.

### 2. Suppressed Errors in Momentum Endpoint
- **File:** `api/main.py:547`
- **Status:** **FIXED** (Now raises HTTP 400 if no data could be fetched)
- **Finding:** The `fetch_momentum` function uses a generic `except Exception: return None`. If `yfinance` fails for a specific ticker, it fails silently. If it fails for all tickers, the API returns an empty list `{"data": []}` without indicating an error.

### 3. Screener Endpoint Failing in Pytest
- **File:** `api/test_main.py:6` and `api/test_live.py:5`
- **Status:** **FIXED**
- **Finding:** The backend `test_screener_endpoint` tests were using `client.get("/api/screener")` while the actual FastAPI endpoint is defined as `@app.post("/api/screener")`. This caused a `404 Not Found` error when running `pytest api/`. The tests were updated to use `client.post` with the required payload.

### 4. General Frontend Code Quality (ESLint)
- **Files:** `web/src/**/*.jsx`
- **Status:** **FIXED**
- **Finding:** A full pass of `npm run lint` revealed 17 issues, primarily unused imports (`useEffect`, `db`, `Link`, etc.) and `react-hooks/set-state-in-effect` errors (where lazy state initialization is preferable). The components were refactored to cleanly resolve all warnings and errors without disabling standard rules unnecessarily.

### 5. Brittle SARIMAX Forecaster Implementation
- **File:** `api/main.py:402`
- **Status:** **FIXED**
- **Finding:** The `/api/arima` endpoint previously hardcoded complex ARIMA order `(1, 1, 1)` and seasonal components `(1, 0, 1, 5)`. This caused unhandled `LinAlgError` and `ValueError` on volatile or low-liquidity tickers that failed strict stationarity checks. Furthermore, projecting future exogenous variables was unbounded and unstable.
- **Resolution:** Added `enforce_stationarity=False` and `enforce_invertibility=False` to force models to converge when possible. Implemented a fallback cascading try-catch to attempt simpler models like `(1, 1, 0)` and `(0, 1, 0)` if the primary fit fails. Added exponential mean-reversion bounding to the projection of future exogenous variables. Added test coverage in `api/test_sarimax.py`.
