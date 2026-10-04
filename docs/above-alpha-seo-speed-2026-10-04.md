# Above Alpha Solutions: SEO and startup improvements

Prepared locally on 4 October 2026. Deployment and Google indexing are not yet verified.

## Findings

- The live homepage's title named only Alpha Nova, with an empty application root in the delivered HTML.
- `/signals` returned the homepage title in raw HTML. The static service's catch-all rewrite bypassed the generated route documents.
- The sitemap listed both the bare origin and the trailing-slash homepage.
- The baseline mobile build downloaded 849,226 bytes of JavaScript, including the 469,688-byte decorative Three.js chunk and 68,822-byte GSAP chunk.

## Changes

- A visible Above Alpha Solutions introduction and research links are included in the initial HTML and the rendered application. The homepage stays at `/` and preserves campaign parameters.
- The homepage title and description, site name, Organization/WebSite structured data, navigation branding and footer consistently connect Above Alpha Solutions to Alpha Nova.
- Canonicals normalize trailing slashes. The sitemap contains one homepage. Client navigation updates page schema and social metadata and removes page schema on private routes.
- Explicit Render rewrites serve each generated route document before the SPA fallback, including trailing-slash variants. These rules must be applied to the actual static service during release; committing a YAML file alone does not prove live settings changed.
- Mobile, reduced-motion and data-saving visits do not download the decorative Three.js bundle. Desktop defers it until after the initial screen. Page transitions use the browser animation API. The first dashboard module is preloaded on home/dashboard only.

## Verification

- Production build and TypeScript check passed.
- Existing frontend suite: 42 tests passed.
- SEO suite: 7 tests passed, including raw brand HTML, schema, canonical/sitemap normalization and Render rule coverage.
- Built-app browser checks passed at 320, 390 and 1440 pixels, including reduced-motion and data-saving settings, no-JavaScript content, SPA metadata changes, private-page noindex, trailing-slash URLs and overflow checks. No uncaught browser errors were observed.
- Initial JavaScript: **313,085 bytes**, down **63.1%** from the baseline. This measures decoded JavaScript in fresh browser contexts with deterministic API fixtures, not a claim of 63% faster live API responses or field Core Web Vitals.
- Browser evidence and the task-only patch/manifest are in `.tmp/brand-seo-qa/`. Unrelated existing working changes were preserved. The current workspace build includes those existing changes; use the task-only patch to prepare a scoped release.

## Release and indexing

Publish to Render service `alphanova-web` for `https://abovealphasolutions.com`, applying the corresponding route configuration. Verify homepage content without JavaScript, `/signals` metadata, private-route noindex, sitemap, mobile resource budget, and real data flows on the live domain after publishing.

In Google Search Console, verify the domain if needed, submit `https://abovealphasolutions.com/sitemap.xml`, and request indexing for the homepage. Search Console access and submission have not been performed. Google decides indexing and ranking; appearance is not immediate or guaranteed.

References: [Google site names](https://developers.google.com/search/docs/appearance/site-names), [Google recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [Render rewrite rules](https://render.com/docs/redirects-rewrites).
