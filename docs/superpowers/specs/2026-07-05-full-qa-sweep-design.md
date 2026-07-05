# Alpha Nova Full QA Sweep + Quick-Win Polish — Design

**Date:** 2026-07-05
**Status:** Approved

## Goal

Test the whole Alpha Nova app (all 17 frontend routes + every `/api/*` endpoint), fix the
bugs found, land quick-win UX polish, finish the in-flight Alpha Score work, and deploy the
result to Vercel production (https://5alphav2.vercel.app).

## Decisions (user-confirmed)

- **WIP changes:** the uncommitted Alpha Nova Score additions (`api/main.py` fundamentals
  endpoint, `Chart.jsx`, `Fundamentals.jsx`) are part of this pass — verify, finish, commit.
- **Improvement scope:** quick-win polish only — error states, loading indicators, empty
  states, small UX friction, formatting. No refactors, no new features.
- **Delivery:** commit in logical chunks and deploy to Vercel prod at the end.
- **Approach:** full systematic sweep (option A), reusing existing pytest files for
  regression checks rather than writing a new suite.

## Test Environment

- Backend: local uvicorn running latest `api/main.py` (kill stale WSL uvicorn holding
  port 8000 first — known gotcha).
- Frontend: built `web/dist` served via vite preview with `/api` proxied to the local
  backend, so WIP + fixes are exercised end-to-end before deploy.
- Post-deploy: same preview with `/api` proxied to https://5alphav2.vercel.app for a prod
  smoke pass (established path in `.claude/launch.json`).
- Auth: local test login `yash@local.test` for gated pages.

## Bug Hunt Protocol

Two tracks, findings collected into a single triage list:

1. **UI walk** — visit every route (Dashboard, Screener, Momentum, Focus List, Market
   Signals, Option Chain, FII/DII, News, DCF, Fundamentals, Chart, ARIMA, Position Sizing,
   Druck/Minervini, Trading Game, Learn, Login). Per page: console errors, failed network
   requests, broken rendering, loading/empty/error state coverage, formatting (currency,
   decimals, dates), and a mobile-viewport spot check on key pages.
2. **API sweep** — every `/api/*` endpoint with valid input, bad ticker, and missing
   params; verify status codes and response shape. Run existing pytest files:
   `test_auth`, `test_delivery`, `test_sentiment`, `test_alpha_score`, `test_admin_metrics`.

### Triage

- **P0** — broken functionality (page crash, endpoint 500, feature unusable): always fix.
- **P1** — wrong data or degraded behavior (bad numbers, silent failures, dead fallbacks): fix.
- **P2** — polish (missing error/loading/empty states, UX friction, formatting): fix quick
  wins, defer anything invasive; deferred items listed in the final report.

## WIP Completion

Verify the Alpha Score renders on Fundamentals and Chart, including the N/A path when
yfinance lacks inputs; fix issues; include in commits.

## Delivery

1. Each fix re-verified in the browser and/or by rerunning the relevant test.
2. Commits in logical chunks: WIP finish → bug fixes → polish.
3. Rebuild `web/dist`, deploy with `npx vercel --prod --yes`, smoke-test prod.
4. Final report: bugs found/fixed, improvements made, deferred items.

## Out of Scope

- Refactors, new features, dependency upgrades.
- The stray untracked test scripts and `*.json` capture files in the repo root (left as-is).
