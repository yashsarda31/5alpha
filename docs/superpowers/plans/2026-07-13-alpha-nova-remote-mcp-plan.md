# Alpha Nova Remote MCP Implementation Plan

## Objective

Build and deploy an OAuth-protected, read-only MCP server at `https://alphanova48.in/mcp` that lets Claude discover and analyze Indian swing-trade candidates without calling Signals, the signal ledger, or any mutation endpoint.

## Implementation Sequence

1. Pin `mcp==1.28.1` and add a stateless JSON FastMCP server mounted into the existing FastAPI app with a composed lifespan.
2. Route `/mcp` and the required OAuth/discovery paths to the Python function in Vercel before the SPA fallback.
3. Extend the existing SQLite/blob auth database with OAuth clients, pending authorizations, single-use codes, access tokens, refresh tokens, and revocation state.
4. Implement an `OAuthAuthorizationServerProvider` using the existing Alpha Nova password verifier, an `MCP_ALLOWED_EMAIL` owner allowlist, PKCE, exact redirect validation, `market:read` scope, hashed opaque tokens, and dedicated rate limits.
5. Add the human OAuth authorization/consent page as a normal MCP web route. Do not expose passwords or tokens to MCP tools or logs.
6. Build a focused `mcp_research.py` service layer that normalizes existing non-Signals analytics into stable, timestamped, JSON-safe contracts.
7. Register six read-only tools: `get_market_pulse`, `discover_trade_candidates`, `analyze_stock`, `get_options_context`, `compare_candidates`, and `build_trade_plan`, plus the composite `find_best_trades` orchestrator.
8. Enforce strict symbol/count/risk bounds, upstream timeouts, freshness labels, partial-data warnings, deterministic scoring, and `No qualifying trade` behavior.
9. Add tests for OAuth discovery and PKCE, authorization allowlisting, code replay, expiry/revocation, bearer scope, protocol initialization/list/call, tool schemas, data quality, position sizing, and hard Signals/mutation exclusions.
10. Run Python compilation, focused tests after each backend slice, the full API suite, frontend lint/build, MCP Inspector/client integration, Vercel build/function-size checks, and preview smoke tests.
11. Generate production OAuth client credentials, configure Vercel secrets, deploy, connect Claude to the custom connector, and run the approved research prompt end to end.

## File Boundaries

- `api/main.py`: app lifespan, OAuth persistence integration, mount wiring, and reuse adapters only.
- `api/mcp_oauth.py`: OAuth provider and authorization page.
- `api/mcp_research.py`: read-only normalized research functions; must not import or call Signals helpers.
- `api/mcp_server.py`: FastMCP instance, tool schemas, and tool registration.
- `api/test_mcp_oauth.py`: OAuth and authorization security tests.
- `api/test_mcp_tools.py`: tool contracts, calculations, and exclusion tests.
- `api/requirements.txt`: pinned MCP SDK.
- `vercel.json`: MCP and OAuth route forwarding.

## Release Gates

- No MCP code path references `/api/signals`, `/api/signals/portfolio`, `signal_positions`, `_build_signals_data`, or `_signal_portfolio_snapshot`.
- No MCP tool performs writes outside OAuth persistence.
- All tool results contain `as_of`, sources, freshness, data quality, and warnings.
- Invalid or stale data cannot silently become a trade recommendation.
- OAuth secrets are configured through Vercel and never committed.
- Production deployment occurs only after tests, frontend build, protocol integration, and function-size checks pass.
