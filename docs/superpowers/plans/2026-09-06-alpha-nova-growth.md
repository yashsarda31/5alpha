# Alpha Nova Growth Wedge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Alpha Nova's NSE delivery-intelligence wedge with daily and stock public pages, restorable share links and preview images, plus crawler-visible SEO foundations.

**Architecture:** Extend the existing official-NSE delivery ingestion with auditable quantities and publish a compact read-only delivery API. Add focused React pages for interactive research, while build-generated HTML supplies route metadata and FastAPI supplies substantive dated public HTML for delivery search routes. Upgrade the existing screenshot-sharing utility to include canonical restorable URLs on every public research page.

**Tech Stack:** FastAPI, SQLite/Vercel Blob persistence, React 19, React Router, Vite, Node test runner, Pytest.

## Global Constraints

- Preserve unrelated uncommitted work and generated `web/dist` changes.
- Keep the existing Today → Signals → Analyse → Watchlist journey and current visual language.
- Use official NSE delivery files, actual trade dates, source status, and incomplete states.
- Do not describe delivery as institutional buying or investment advice.
- Keep arbitrary shared/private result URLs out of the sitemap and search index.
- Use `https://alphanova48.in` as the canonical origin.
- Test locally before any production deployment; production release requires separate explicit deployment authorization.

---

### Task 1: Delivery data contract and calculations

**Files:**
- Create: `api/delivery_research.py`
- Create: `api/test_delivery_research.py`
- Modify: `api/main.py`

**Interfaces:**
- Consumes: NSE `sec_bhavdata_full` rows and the existing SQLite database.
- Produces: `ensure_delivery_columns(conn)`, `parse_delivery_rows(text, universe, day)`, `delivery_radar_rows(conn, limit)`, and `stock_delivery_history(conn, symbol, limit)`.

- [ ] Write failing tests for NSE quantity parsing, invalid rows, 20-session baselines, latest-date ranking, stock history, and incomplete baselines.
- [ ] Run `rtk python -m pytest api/test_delivery_research.py -q` and verify failures identify missing interfaces.
- [ ] Implement the focused delivery module and additive SQLite migration.
- [ ] Wire existing ingestion through the parser while preserving `deliv_per`, `close`, and `clv` behavior.
- [ ] Run focused delivery tests and the existing `api/test_delivery.py` suite.

### Task 2: Read-only delivery research API

**Files:**
- Modify: `api/main.py`
- Create: `api/test_delivery_research_api.py`

**Interfaces:**
- Consumes: Task 1 query functions.
- Produces: `GET /api/delivery/radar` and `GET /api/delivery/stock/{symbol}` with `trade_date`, `generated_at`, `source_status`, `coverage`, and typed data arrays.

- [ ] Write failing endpoint tests for valid results, invalid symbols, no data, limits, stale dates, and source fields.
- [ ] Run the endpoint tests and verify they fail for missing routes.
- [ ] Add endpoints with cache-control, symbol allowlisting, bounded limits, and explicit availability states.
- [ ] Run the endpoint tests and delivery regression suite.

### Task 3: Delivery Radar and stock delivery UI

**Files:**
- Create: `web/src/pages/DeliveryRadar.jsx`
- Create: `web/src/pages/DeliveryRadar.css`
- Create: `web/src/lib/deliveryView.js`
- Create: `web/src/lib/deliveryView.test.js`
- Modify: `web/src/App.jsx`
- Modify: `web/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: Task 2 endpoints.
- Produces: `/delivery-radar`, `/high-delivery-volume-stocks-today`, and `/stocks/:symbol/delivery-percentage` React routes.

- [ ] Write failing view-contract tests for date labels, finite values, stale/incomplete notices, canonical stock symbols, and API paths.
- [ ] Run the focused Node tests and verify failure.
- [ ] Build the ranked radar, stock-history view, Today entry card, and research navigation entry with accessible tables and source dates.
- [ ] Run the focused test, frontend tests, and lint.

### Task 4: Restorable public links and preview images

**Files:**
- Modify: `web/src/components/ShareButton.jsx`
- Modify: `web/src/lib/shareCard.js`
- Create: `web/src/lib/shareLink.js`
- Create: `web/src/lib/shareLink.test.js`
- Modify: public research pages that hold non-URL state.

**Interfaces:**
- Consumes: current route and allowlisted screen parameters.
- Produces: `canonicalShareUrl(location, params)`, native share payload with URL plus PNG, explicit Copy link action, and branded images using `alphanova48.in`.

- [ ] Write failing tests for canonical origin, stable parameter order, allowlisting, secret removal, and hash removal.
- [ ] Run the tests and verify failure.
- [ ] Implement link building, include the canonical URL in native text/share payload, add Copy link, and update the PNG footer domain.
- [ ] Add URL hydration for Delivery Radar, Option Chain, Screener presets/filters, and existing symbol-driven research screens where required.
- [ ] Add a compact global share action for remaining public routes while excluding login, account, watchlist, and trading-game state.
- [ ] Run focused and complete frontend tests.

### Task 5: Crawler-visible metadata and index controls

**Files:**
- Create: `web/src/seoConfig.js`
- Create: `web/src/components/SeoMeta.jsx`
- Create: `web/scripts/generate-seo-pages.mjs`
- Create: `web/scripts/generate-seo-pages.test.mjs`
- Modify: `web/package.json`
- Modify: `web/src/App.jsx`
- Modify: `web/index.html`
- Modify: `web/public/robots.txt`
- Create: `web/public/sitemap.xml`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: centralized public route definitions.
- Produces: unique title, description, canonical, robots, Open Graph/Twitter image metadata, JSON-LD, direct-route HTML, sitemap entries, and private-route noindex rules.

- [ ] Write failing generation tests for delivery pages, existing research pages, private noindex pages, canonical URLs, structured data, sitemap, and preview image dimensions.
- [ ] Run the test and verify failure.
- [ ] Implement centralized metadata and build-time HTML generation.
- [ ] Replace blanket crawler blocking with public-route allow rules and private/API exclusions.
- [ ] Add explicit Vercel routes for generated HTML before the SPA fallback.
- [ ] Run SEO tests and an isolated production build; inspect raw generated HTML.

### Task 6: Substantive delivery search HTML and social preview endpoint

**Files:**
- Create: `api/public_delivery_pages.py`
- Create: `api/test_public_delivery_pages.py`
- Modify: `api/main.py`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: Tasks 1–2 delivery results.
- Produces: HTML responses for `/high-delivery-volume-stocks-today` and `/stocks/{symbol}/delivery-percentage`, plus SVG social preview responses carrying the same date/status values.

- [ ] Write failing tests for substantive table content, canonical/meta fields, escaping, stale/no-data handling, valid preview images, and 404 symbols.
- [ ] Run focused tests and verify failure.
- [ ] Implement semantic server HTML with source/methodology text and app research links.
- [ ] Implement deterministic preview image SVG and route it ahead of the SPA fallback.
- [ ] Run focused backend tests and raw-response assertions.

### Task 7: Supporting search-page entry routes

**Files:**
- Modify: `web/src/seoConfig.js`
- Modify: `web/src/App.jsx`
- Modify: `web/public/sitemap.xml`
- Create: `web/src/pages/DataPageDirectory.jsx`
- Create: `web/src/lib/dataPageReadiness.test.js`

**Interfaces:**
- Consumes: existing FII/DII and Option Chain views plus declared data-readiness registry.
- Produces: useful public aliases for `/fii-dii-data-today`, `/nifty-pcr-today`, `/bank-nifty-oi-analysis`, `/stocks-at-52-week-high-today`, and `/bulk-block-deals-today`; stock-level option-chain and FII-holding templates remain excluded until their evidence contracts exist.

- [x] Write failing tests that enabled routes map to real data views and unavailable stock-option and holding-trend templates are not indexed.
- [ ] Run the readiness test and verify failure.
- [ ] Add the three supported routes with query defaults and methodology/source copy.
- [ ] Add a compact data-page directory and related links from delivery pages.
- [ ] Regenerate the sitemap and verify only useful enabled routes appear.

### Task 8: Integrated verification and release readiness

**Files:**
- Modify only files required to resolve failures introduced by Tasks 1–7.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a locally verified, deployment-ready change set with no production mutation.

- [ ] Run focused backend tests, then `rtk python -m pytest api -q --ignore=api/test_live.py`.
- [ ] Run frontend tests, SEO tests, lint, and an isolated production build.
- [ ] Run `rtk git diff --check` and inspect the scoped diff against the dirty-worktree baseline.
- [ ] Start the local API/app and verify desktop plus narrow-mobile Delivery Radar, stock history, FII/DII alias, options aliases, link restoration, and preview rendering.
- [ ] Verify crawler HTML with raw direct requests and confirm private routes remain noindex.
- [ ] Report deployment readiness and request production release authorization if deployment was not already explicitly requested.
