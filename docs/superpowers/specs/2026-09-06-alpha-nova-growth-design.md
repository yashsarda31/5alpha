# Alpha Nova: delivery intelligence, sharing, and search

Status: proposed design for review. Application changes and deployment have not started.

## Positioning

**Alpha Nova turns NSE delivery data into a daily, shareable shortlist for Indian swing traders.**

Own delivery intelligence first: what changed relative to a stock's usual activity, whether price confirmed it, and how complete the evidence is. Do not describe delivery as proof of institutional buying or a buy recommendation. Keep Today → Signals → Analyse → Watchlist and the existing visual language.

Alternatives considered:

| Wedge | Advantage | Trade-off |
| --- | --- | --- |
| Delivery intelligence — recommended | Existing NSE ingestion and daily workflow; supports stock-specific history and repeat visits | Requires delivered quantity, coverage checks, and stronger refresh handling |
| Options OI/PCR | Existing index and stock option-chain integrations | Requires careful expiry, timestamp, strike-universe, and provider consistency; more frequent refresh |
| FII/DII flows | Existing snapshot endpoint; a useful market context page | Broad market totals offer less stock-specific differentiation |

The defensible product is the historical comparison, data lineage, and repeatable shortlist. No claim that Alpha Nova is the only or best provider is substantiated by this review.

## Current checkout findings

- `web/public/robots.txt` allows the root and disallows everything else.
- `web/index.html` has a generic title and no route-specific social metadata. The current Vite build does not generate SEO pages; the Vercel fallback serves one HTML shell.
- Existing ShareButton captures a PNG. It does not persist a report or share a URL that restores its inputs/results. Its image footer still uses `5alphav2.vercel.app`.
- Screener saves configurations in browser storage. Chart supports a symbol query parameter, but this is not a complete analysis snapshot.
- Delivery ingestion uses official NSE daily CSVs, keeps 45 calendar days, and covers the configured Nifty 200 plus available stock-futures symbols. It stores delivery percentage, close, and close-location value, not delivered quantity or total traded quantity.
- Delivery comparisons currently permit 10 observations for a baseline of up to 20 prior sessions. The new public product must disclose sample size; a strict 20-session scanner requires all 20 prior observations.
- The delivery refresh schedule exists. Expected-date logic skips weekends but does not resolve exchange holidays. Failed gaps can be overtaken by later successful dates because freshness is based on maximum stored date.
- FII/DII has a cached snapshot endpoint with stale status. This does not prove all underlying rows are current.
- Existing technical screening uses adjusted completed-session prices. Relative-strength new highs must not be relabelled as price 52-week highs.
- There are extensive existing uncommitted changes. Implementation must preserve them, including pre-existing generated build changes.
- Live HTML/robots checks could not connect through the configured local proxy. These findings describe local source, not confirmed live production behavior.

## Delivery product and free hook

Add a Delivery Radar entry under existing discovery navigation and a compact entry card on Today. Lead with actual last available trading date, universe coverage, and an explanation of the metric.

The free preset uses a fixed supported universe, end-of-day data, delivery percentage, delivered quantity versus the prior 20-session average, traded value, and price change. Expose editable filters without burying the preset. Missing baselines produce an explicit incomplete state, never zero or a qualifying match. Default presentation ranks unusual activity; it does not manufacture BUY/SELL calls.

Free-forever commitment: the daily preset, latest published shortlist, and public stock delivery pages remain free without sign-in. Initial bounded access: 100 rows per result, three concurrent requests per client, and a server-enforced request rate budget; cache reads rather than rerun ingestion on each visit. Final infrastructure limits should not imply a paid entitlement that does not exist.

Kaizen remains the separate tradebook-analysis hook. Use contextual links from Kaizen review → Alpha Nova next-session research and Alpha Nova → Kaizen trade review. The Kaizen URL was not found in the reviewed app files; configure it only from a verified destination. Do not rebuild its analyzer or imply a shared login. Alpha Nova work does not require changing Kaizen's separate deployment.

## Data contract and refresh

Extend delivery storage to preserve total traded quantity, delivered quantity, traded value when supplied, source URL, ingestion time, actual trade date, series, and validation status. Preserve existing signal calculations and audit gates. Separate ingestion success from publication readiness.

Use one validated published dataset for public HTML, API responses, shortlist results, and preview images. Store session-level ingestion coverage and missing dates so partial success cannot skip gaps. Resolve the expected session against an exchange calendar and publication status. Retry bounded failures, retain the last good snapshot, and label stale or incomplete data visibly. Never replace its trade date with the fetch date.

Keep at least 120 calendar days for delivery comparisons, with a documented retention policy. Backfill official files before enabling historical comparisons. Publication requires validated symbols, finite/range-checked quantities, internally consistent percentages, and adequate coverage. A delivery percentage above 100, negative quantity, or delivered quantity greater than traded quantity is invalid.

Existing daily refresh should update the public dataset after validation. Schedule bounded retries after expected publication, not a claim that a file always arrives at a fixed time. SEO sitemap lastmod changes when published content changes, not every time it is requested.

## Public sharing

Every public research screen gets a canonical route, route-specific title/description, and a 1200 × 630 PNG preview. Every shareable scan, completed backtest, and generated report additionally gets a versioned saved result at `/s/{id}`.

- Screen links restore allowlisted public inputs such as symbol, market, expiry, benchmark, and filters. They show latest available data and say so.
- Saved results preserve inputs, result tables, data dates, source status, methodology/model version, and creation time. A recipient sees the same dated result without login; changing rules creates a new run.
- Backtests include date range, universe, costs, assumptions, and model version. The share system wraps existing completed results; this scope does not invent a new backtest engine.
- Generated reports store the reviewed report content, not a request that reruns an AI model when a recipient opens a link.
- The UI offers Copy link, native sharing where supported, and Download image. Existing screenshots remain available. Preview and page must agree on the result and date.
- Use durable object storage for snapshots and previews; do not rely on server memory or browser storage. Validate payload schemas and size, escape rendered content, and enforce creation quotas.
- Private account screens remain private and noindex. They may expose a separate explicit sanitized share action; never publish a whole account screen automatically. Exclude credentials, cookies, user identifiers, holdings, tradebooks, and private notes by default.
- Publicly created snapshots use unguessable IDs, disclose that anyone with the link can read them, and offer owner deletion/revocation. Search indexing is reserved for curated useful pages; arbitrary saved results default to noindex. Revoked results return 410 and delete the corresponding stored preview, although external social caches cannot be recalled.

Growth path: useful result → share link → dated preview → public result → rerun preset → save a watchlist after sign-in. Measure share creation, shared-result visits, reruns, and watchlist activation through existing privacy-conscious analytics. Do not attach private query values or report bodies to analytics events.

## Search page inventory

Launch supporting pages in this order, with data readiness as an acceptance condition rather than publishing empty templates:

| Public URL | Content and required evidence |
| --- | --- |
| `/high-delivery-volume-stocks-today` | Delivered quantity, delivery %, comparison baseline, liquidity, price change, date, coverage; requires extended ingestion |
| `/stocks/RELIANCE/delivery-percentage` | Latest verified session, history, 20-session comparison, quantities, methodology, related stocks, open-in-Analyse action |
| `/fii-dii-data-today` | Cash-market gross buys/sells/net where available, history, date, source, provisional label |
| `/nifty-pcr-today` | NIFTY OI put/call ratio; selected expiry, full included strike universe, timestamp, denominator checks; distinguish volume PCR |
| `/bank-nifty-oi-analysis` | BANKNIFTY expiry-specific OI, changes, strike distribution, source and timestamp; no guaranteed support/resistance claims |
| `/stocks-at-52-week-high-today` | Proper price-high computation with sufficient history, declared session window and adjustment basis; distinct from RS highs |
| `/bulk-block-deals-today` | Separate bulk/block tables, exchange date, source, quantities and disclosed parties; deduplicate records |
| `/stocks/RELIANCE/option-chain-analysis` | Only eligible symbols with verified expiry/chain data; canonical symbol handling |
| `/stocks/RELIANCE/fii-holding-trend` | Validated quarterly shareholding percentages and filing/period dates, original and revised filing treatment; requires historical ownership data |

Start delivery stock pages with covered symbols that have sufficient history. Expand from actual records, not an invented full-market universe. Corporate aliases redirect to canonical symbols. Unsupported symbols return 404; known symbols with a temporarily unavailable source show an honest availability state. Never relabel quarterly ownership as daily data or equate market-wide FII flows with a stock's FII ownership.

Stock pages need useful stock-specific tables and comparisons before becoming indexable. No mass generation of near-identical filler, artificial daily articles, speculative search-volume claims, or ranking guarantees.

## Serving and SEO architecture

Retain React/Vite and FastAPI. Add focused public-research and sharing modules rather than further expanding the main API file. Serve data-page HTML and social metadata from validated cached snapshots in FastAPI, with equivalent content for users and crawlers. Keep frontend research actions linked to the existing app. Static app routes can use generated route HTML during the Vite build.

Route public data pages, `/s/{id}`, preview images, and the XML sitemap explicitly before the SPA fallback. Centralize route definitions to prevent client/server metadata drift. Use `https://alphanova48.in` as canonical origin.

Replace blanket crawler blocking with explicit public access and appropriate private-page noindex. Provide canonical tags, unique titles/descriptions, Open Graph/Twitter images, accessible HTML tables, breadcrumbs, source links, and accurate structured data. Include only canonical indexable pages with usable published content in sitemap(s). Exclude arbitrary filter permutations and shared result IDs.

Raw HTML must contain substantive data and metadata without JavaScript. Google recommends server rendering or prerendering because not every bot executes JavaScript: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics

NSE describes FII/DII trading activity as provisional: https://www.nseindia.com/reports/fii-dii

## Implementation order and acceptance

1. Add positioning copy and data-contract migrations; validate ingestion, missing-session repair, coverage, baseline calculations, stale states, and unchanged signal behavior.
2. Implement Delivery Radar and stock delivery history with dated public HTML. Add cached refresh publication and availability handling.
3. Add durable versioned sharing and PNG previews; integrate every research route and existing scan/report/backtest output. Verify all public inputs round-trip and private inputs do not.
4. Add supporting daily and stock page families as their data gates pass. Restore crawl access, canonicals, sitemap, structured data, and internal links. Add verified Kaizen integration link when its destination is available.
5. Test raw route HTML, source dates, invalid symbols, partial/provider failures, social image responses, snapshot immutability/revocation, request limits, privacy, and full React/API regressions. Check desktop and narrow mobile flows. Build into an isolated output folder to preserve existing dirty `web/dist` files.
6. Deployment is a separate release step after tests pass and release authorization exists. Verify the canonical live host, robots, sitemap, direct data HTML, APIs, PNG images, shared-link restoration, and responsive UI. A successful build or Vercel Ready status alone is insufficient.

Success measures: pages eligible for indexing, data freshness and coverage, share-to-visit rate, shared-visit-to-rerun rate, research-to-watchlist activation, and weekly returning researchers. Establish baselines before setting targets.

## Review decision

Approve the delivery-intelligence wedge and phased implementation above. The remaining external detail is Kaizen's verified public URL; it does not block the delivery/sharing implementation. No paid data subscription, production deployment, or external publishing is assumed by this design.
