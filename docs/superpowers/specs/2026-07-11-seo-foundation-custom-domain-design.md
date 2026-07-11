# Alpha Nova SEO Foundation and Custom Domain Design

**Date:** 2026-07-11  
**Canonical domain:** `https://alphanova48.in`

## Objective

Make Alpha Nova crawlable and understandable to search engines, establish a distinct branded homepage, and serve the existing application securely from the new custom domain without disrupting its tools or routes.

## Architecture

- Add a public SEO landing page at `/` with a single descriptive H1, substantial visible product copy, feature links, and calls to action into `/dashboard`.
- Keep the existing terminal and all current functionality under their existing paths, including `/dashboard`, `/signals`, `/screener`, `/option-chain`, `/chart`, `/dcf`, and `/learn`.
- Use `https://alphanova48.in` as the canonical origin in metadata, sitemap entries, structured data, and social sharing tags.
- Attach both `alphanova48.in` and `www.alphanova48.in` to the existing Vercel project. The apex is canonical; `www` redirects to it.

## Search Surfaces

### Homepage

The homepage positions Alpha Nova as an Indian stock-market analytics platform. Visible copy covers market signals, quantitative screening, options intelligence, chart analysis, valuation, and risk tools. It links to the corresponding application routes with descriptive anchor text.

### Route Metadata

Public product routes receive unique titles, meta descriptions, canonical URLs, and Open Graph/Twitter metadata. The shared page header uses a semantic H1 so every rendered product page has a primary heading.

### Crawl Controls

- `robots.txt` allows public pages and blocks `/api/` and `/login`.
- `sitemap.xml` lists only stable public pages intended for search results.
- The sitemap is declared in `robots.txt`.

### Structured Data

The homepage includes JSON-LD for:

- `WebSite`, with name `Alpha Nova` and alternate name `Alpha Nova Analytics`.
- `Organization`, with the canonical URL and logo.
- `SoftwareApplication`, describing the browser-based financial analytics product without unsupported ratings or pricing claims.

## User Experience

- Existing dashboard users can enter the terminal through prominent “Open Terminal” actions.
- No authentication, market-data, signal, or analytics behavior changes.
- The landing page follows the existing dark terminal visual system and remains responsive and accessible.

## Domain and Redirects

- Vercel provides TLS for the apex and `www` host after DNS validation.
- Requests to the legacy `5alphav2.vercel.app` host redirect to the canonical custom domain once the custom domain is active.
- Namecheap DNS changes are limited to the exact records requested by Vercel.

## Validation

- Run targeted lint checks on changed React files.
- Run the production build.
- Verify the deployed homepage, dashboard, robots file, XML sitemap, canonical metadata, structured data, HTTPS, and host redirects.
- Confirm the custom domain resolves before declaring the rollout complete.

## Out of Scope

- Google Search Console ownership verification, because it requires access to the user's Google account.
- Ongoing content publishing and backlink acquisition.
- Guarantees about Google ranking or indexing time.
