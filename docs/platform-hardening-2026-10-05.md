# Platform hardening release

Plan: start from production c9e7596 in an isolated checkout. Share identical public research requests and briefly reuse successful snapshots, without persisting account data or altering provider timestamps. Recover on reconnect, explain slow requests, fix search cancellation when switching markets, and prevent failed asset caching from breaking an otherwise successful page load.

Verification: exercise request sharing, expiration, forced refresh, cancellation, errors and identity isolation; service-worker cache failures; stock search market changes; frontend tests, SEO tests, production build; local desktop/mobile flows and live release checks. Deploy only this reviewed release to the existing Render production branch.

## Pre-release evidence

- 51 frontend tests and 8 SEO tests pass; TypeScript and production build pass. Existing large optional Plot chunk warning remains.
- Browser fixture: two mounted readers received the same request number, and unmount/remount reused it without a network call within the cache lifetime. US switching returned US-only data; HTTP 503 rendered explicit errors and switching back recovered.
- Offline emulation immediately displayed the warning and marked retained research as unvalidated. Reconnect removed the warning and both readers recovered through one new shared request.
- Search suggestions disappeared when switching India to US. Production preview loaded real dashboard data, and the offline banner fit a 320px viewport with document width exactly 320px.
- Public API currently omits NSE index quote timestamps and has no movers. Those limitations remain explicit; this release does not manufacture dates or data. Free-host cold starts and provider delays can still occur.
- Request snapshots are memory-only, capped at 40 entries, scoped by URL and account identity, expire after 15 seconds, preserve source timestamps, and exclude account endpoints and intraday data. Retry bypasses completed snapshots. The network deadline remains 90 seconds.
