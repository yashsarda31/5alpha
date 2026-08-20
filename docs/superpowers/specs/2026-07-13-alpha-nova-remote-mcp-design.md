# Alpha Nova Remote MCP Design

**Date:** 2026-07-13
**Status:** Architecture approved; awaiting written specification review

## Goal

Expose Alpha Nova's existing research capabilities to Claude through a hosted, read-only Model Context Protocol server. Claude should be able to discover, analyze, compare, and structure Indian equity swing-trade candidates without using the Signals tab or any signal-ledger data.

The connector remains decision support. It does not place orders, change a watchlist, create predictions, subscribe to alerts, or mutate an Alpha Nova account.

## Product Intent

- Primary user: the Alpha Nova owner using Claude as a research agent.
- Market: Indian listed equities.
- Typical holding period: 2–20 trading days.
- Default capital: ₹1 crore.
- Default maximum risk: 0.75% of capital per trade.
- Output: a small ranked set of evidence-backed opportunities, including an explicit `No qualifying trade` result when appropriate.

## Protocol and Hosting

- Public endpoint: `https://alphanova48.in/mcp`.
- Transport: MCP Streamable HTTP over HTTPS.
- Runtime: the existing FastAPI/Vercel application.
- Protocol behavior: support MCP initialization, tool discovery, tool calls, ping, and clean JSON-RPC errors.
- Deployment mode: stateless requests where possible so the server remains compatible with Vercel's serverless execution model. No long-lived in-memory session may be required for correctness.
- Supported client: Claude custom connectors across Claude.ai, Claude Desktop, Cowork, and mobile.

The implementation should use the official MCP Python SDK if its dependency impact remains within Vercel's function-size limit. If the release build exceeds the limit, the MCP surface will be isolated into a separate small Vercel function rather than hand-implementing the protocol.

## Authentication

The remote connector will use OAuth authorization-code flow with PKCE. API-key-in-URL and unauthenticated public access are rejected because they are difficult to revoke safely and would expose paid/upstream market-data capacity.

### OAuth behavior

- Claude connects to the MCP protected resource and discovers the OAuth metadata.
- The authorization screen uses the existing Alpha Nova email/password identity store.
- Only the email configured in `MCP_ALLOWED_EMAIL` may authorize the connector in version one.
- Version one uses a pre-registered Claude OAuth client configured through `MCP_OAUTH_CLIENT_ID` and `MCP_OAUTH_CLIENT_SECRET`; unknown clients are rejected.
- The redirect URI is allowlisted exactly; arbitrary redirect URIs are rejected.
- Authorization codes are short-lived, single-use, bound to the client and PKCE challenge, and stored in persistent auth storage.
- Access tokens are opaque, revocable, scoped to `market:read`, and never accepted by normal account mutation endpoints.
- Tokens, passwords, authorization codes, and full tool payloads are excluded from logs.
- OAuth and MCP endpoints receive dedicated rate limits.

Required discovery and flow endpoints will follow the current MCP authorization specification. Exact well-known paths will be confirmed against the SDK used during implementation.

## Hard Read-Only Boundary

The MCP server may read market and company data, but it must never call or expose:

- `/api/signals`
- `/api/signals/portfolio`
- signal-ledger helpers or `signal_positions`
- watchlist POST operations
- prediction POST/hide/resolve operations
- push subscription operations
- signup, login-state mutation, or logout tools
- any trade-execution or broker API

Every MCP tool will carry read-only/destructive annotations where supported. The tool registry itself is allowlisted; it cannot dynamically expose arbitrary FastAPI routes.

## Tool Set

### `get_market_pulse`

Purpose: establish whether the environment supports new swing positions.

Inputs:

- `market`: fixed to `IN` in version one
- `include_institutional_flow`: boolean, default `true`

Uses only the dashboard, sector rotation, FII/DII, and block/bulk/insider-deal data paths.

Returns:

- benchmark state and breadth
- leading and lagging sectors
- institutional-flow summary with source-quality warning where history is modeled
- significant deal activity
- `as_of`, freshness, source list, and warnings

### `discover_trade_candidates`

Purpose: produce a diversified shortlist without Signals.

Inputs:

- `universe`: `nifty100`, `nifty200`, or a bounded custom symbol list
- `holding_days`: integer from 2 to 20
- `max_candidates`: integer from 3 to 20, default 10
- optional minimum momentum, ROE, EPS growth, and Alpha Nova score filters

Uses the quantitative screener, momentum leaders, sector rotation, and deal activity. The existing Focus List is excluded because its backend is derived from the Signals engine.

Returns normalized candidates with discovery reasons, liquidity indicators, sector context, raw factor values, data timestamps, and warnings.

### `analyze_stock`

Purpose: create a complete evidence packet for one shortlisted symbol.

Inputs:

- `symbol`
- `include_options`: boolean, default `false`
- `holding_days`: integer from 2 to 20

Uses chart history/technicals, fundamentals, news, FLCL regime, DCF data, and optionally option-chain context. It does not call the existing `/api/ai/*` routes; Claude performs the reasoning from structured Alpha Nova data.

Returns:

- trend, momentum, support/resistance, volume, and volatility evidence
- FLCL regime and invalidation context
- valuation, profitability, growth, leverage, and quality evidence
- current news risks
- optional options positioning
- freshness and missing-data fields

### `get_options_context`

Purpose: inspect derivatives positioning for a candidate without turning options activity into a standalone recommendation.

Inputs:

- `symbol`
- optional expiry

Returns available expiries, put/call context, relevant open-interest concentrations, implied-volatility context when available, timestamps, and limitations.

### `compare_candidates`

Purpose: compare two to ten already-discovered symbols on the same scale.

Inputs:

- `symbols`: unique list of 2–10 symbols
- `holding_days`: integer from 2 to 20

Returns a factor matrix, ranking, major strengths, disqualifiers, missing fields, and the exact evidence used. Rankings must remain explainable; no hidden synthetic score is treated as fact.

### `build_trade_plan`

Purpose: convert one analyzed setup into a risk-bounded decision-support plan.

Inputs:

- `symbol`
- `capital`: positive number, default `10000000`
- `risk_pct`: number from 0.1 to 1.0, default `0.75`
- `holding_days`: integer from 2 to 20

Returns an entry zone, technical invalidation, stop, targets, reward-to-risk, maximum rupee risk, estimated position size, thesis, risks, and a `not_actionable` reason when minimum evidence or 2:1 reward-to-risk is absent.

Levels are derived from current research data and are not published Signals. The result must label the data timestamp and must not imply order placement.

### `find_best_trades`

Purpose: orchestrate the full owner workflow in one reliable call.

Inputs:

- universe and optional filters
- capital, risk percentage, holding days
- `max_results`: 1–3, default 3

Flow:

1. Read market pulse.
2. Discover candidates outside Signals.
3. Analyze no more than ten candidates.
4. Compare survivors.
5. Build plans only for the strongest actionable candidates.

Returns the market regime, ranked plans, rejected finalists with reasons, source timestamps, warnings, and tool-stage diagnostics. It returns `No qualifying trade` rather than weakening thresholds.

## Common Response Contract

Every tool response includes:

- `as_of`
- `sources`
- `freshness`: `live`, `recent`, `stale`, or `unknown`
- `data_quality`: `complete`, `partial`, or `insufficient`
- `warnings`
- structured result fields rather than long prewritten prose

Ticker symbols are normalized and validated. NaN, infinity, malformed timestamps, and upstream HTML/error payloads are converted into explicit missing-data fields. A partial upstream failure must not silently become a bullish or bearish signal.

## Agent Prompt

The handoff will include a copy-paste Claude prompt that instructs Claude to:

- use Alpha Nova as the primary research source
- explicitly exclude Signals
- call market pulse before screening
- shortlist, analyze, compare, and plan in that order
- use live timestamps and never invent missing values
- require liquidity, clear invalidation, and at least 2:1 reward-to-risk
- return market regime, ranked trade table, risks, rejected finalists, and tools used
- return `No qualifying trade` when the evidence does not support a position

## Performance and Cost Controls

- Cache shared market reads using the app's existing cache policy.
- Bound custom universes, candidate counts, concurrent upstream calls, and output size.
- Use strict per-upstream timeouts and return partial results with warnings.
- Avoid duplicate requests within an orchestrated call.
- Rate-limit by OAuth subject and tool name.
- Do not accept user-supplied Gemini, Anthropic, or other model API keys.

## Observability

Log only request ID, OAuth subject hash, tool name, duration, cache status, result status, and error class. Provide a protected health/readiness check that confirms protocol availability without executing expensive market queries.

## Error Handling

- Authentication failures use standards-compliant HTTP/OAuth responses.
- Invalid symbols or parameters return actionable MCP tool errors.
- Upstream timeouts return partial-data warnings when safe.
- Complete discovery failure returns no candidates, never fabricated fallbacks.
- Unsupported methods and tools return JSON-RPC method errors.
- Stale data is clearly labeled and may disqualify a trade plan.

## Validation

Before production deployment:

1. Unit-test schemas, symbol normalization, ranking math, position sizing, freshness, and missing-data behavior.
2. Prove every exposed tool is read-only and that Signals/ledger helpers cannot be reached.
3. Test OAuth discovery, PKCE, exact redirect matching, code replay prevention, expiry, revocation, scopes, and rate limits.
4. Run MCP protocol initialize, tools/list, tools/call, malformed request, and unsupported-method tests.
5. Test each tool with successful, partial, empty, stale, and upstream-error data.
6. Run Claude/MCP Inspector integration against the deployed preview endpoint.
7. Run the complete API test suite, frontend lint, frontend production build, and Vercel function-size check.
8. Deploy to production only after all gates pass, then smoke-test `/mcp` through Claude's custom connector flow.

## Connection Handoff

After deployment, the user will add a custom connector in Claude under `Customize → Connectors → Add custom connector`, name it `Alpha Nova`, and use `https://alphanova48.in/mcp`. The generated `MCP_OAUTH_CLIENT_ID` and `MCP_OAUTH_CLIENT_SECRET` will be entered once under Claude's advanced settings. Claude will then open the Alpha Nova authorization screen for the allowlisted owner login.

## Out of Scope

- Signals and signal-ledger access
- Watchlist or account mutations
- Alerts, predictions, and trade execution
- US-market discovery in version one
- Autonomous scheduled trading
- A public MCP Registry listing
- Multi-tenant administration beyond the single allowed owner
