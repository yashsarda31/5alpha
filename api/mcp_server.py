"""FastMCP surface for Alpha Nova's read-only research connector."""

from __future__ import annotations

from typing import Any

from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl

try:
    from api import mcp_research as research
    from api.mcp_oauth import AlphaNovaOAuthProvider, MCP_SCOPE, register_oauth_routes
except ImportError:  # local `api/` module path used by the existing test suite
    import mcp_research as research
    from mcp_oauth import AlphaNovaOAuthProvider, MCP_SCOPE, register_oauth_routes


INSTRUCTIONS = """Alpha Nova provides read-only Indian equity research for 2-20 day swing-trade decision support.
Use market pulse before candidate discovery, then analyze and compare candidates before building a trade plan.
Signals, signal-ledger data, account writes, watchlist changes, alerts, predictions, broker execution, and autonomous
trading are not available. Treat missing or stale data as a reason to reduce confidence or return no qualifying trade."""

READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=True,
)


def build_mcp_server(provider: AlphaNovaOAuthProvider | None = None) -> FastMCP:
    provider = provider or AlphaNovaOAuthProvider()
    server = FastMCP(
        name="Alpha Nova",
        instructions=INSTRUCTIONS,
        website_url=provider.issuer_url,
        auth_server_provider=provider,
        auth=AuthSettings(
            issuer_url=AnyHttpUrl(provider.issuer_url),
            service_documentation_url=AnyHttpUrl(f"{provider.issuer_url}/"),
            client_registration_options=ClientRegistrationOptions(
                enabled=True,
                valid_scopes=[MCP_SCOPE],
                default_scopes=[MCP_SCOPE],
            ),
            revocation_options=RevocationOptions(enabled=True),
            required_scopes=[MCP_SCOPE],
            resource_server_url=AnyHttpUrl(provider.resource_url),
        ),
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        log_level="WARNING",
        transport_security=TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=["alphanova48.in", "www.alphanova48.in", "testserver", "localhost:*", "127.0.0.1:*"],
            allowed_origins=["https://claude.ai", "https://alphanova48.in", "http://localhost:*", "http://127.0.0.1:*"],
        ),
    )
    register_oauth_routes(server, provider)

    @server.tool(
        title="Get Indian Market Pulse",
        description="Read Indian market breadth, movers, sector rotation, FII/DII context and disclosed deals before looking for trades. Does not use Signals.",
        annotations=READ_ONLY,
        structured_output=True,
    )
    async def get_market_pulse(include_institutional_flow: bool = True) -> dict[str, Any]:
        return await research.get_market_pulse(include_institutional_flow)

    @server.tool(
        title="Discover Trade Candidates",
        description="Find and rank Indian swing-trade candidates using Momentum, Screener, Sector Rotation and Deals only. Signals and the signal-backed Focus List are excluded.",
        annotations=READ_ONLY,
        structured_output=True,
    )
    async def discover_trade_candidates(
        universe: str = "nifty100",
        custom_symbols: list[str] | None = None,
        holding_days: int = 10,
        max_candidates: int = 10,
        min_momentum: float | None = None,
        min_roe: float | None = None,
        min_eps_growth: float | None = None,
        min_alpha_score: float | None = None,
    ) -> dict[str, Any]:
        return await research.discover_trade_candidates(
            universe,
            custom_symbols,
            holding_days,
            max_candidates,
            min_momentum,
            min_roe,
            min_eps_growth,
            min_alpha_score,
        )

    @server.tool(
        title="Analyze One Stock",
        description="Build a structured evidence packet for one Indian stock using charts, fundamentals, news, FLCL, DCF inputs and optional options context. Does not use Signals.",
        annotations=READ_ONLY,
        structured_output=True,
    )
    async def analyze_stock(symbol: str, include_options: bool = False, holding_days: int = 10) -> dict[str, Any]:
        return await research.analyze_stock(symbol, include_options, holding_days)

    @server.tool(
        title="Get Options Context",
        description="Read expiries and option-chain positioning for an Indian equity candidate. Options context is evidence, not a standalone recommendation.",
        annotations=READ_ONLY,
        structured_output=True,
    )
    async def get_options_context(symbol: str, expiry: str | None = None) -> dict[str, Any]:
        return await research.get_options_context(symbol, expiry)

    @server.tool(
        title="Compare Trade Candidates",
        description="Analyze and compare two to ten Indian stocks on a common, explainable scale without hidden Signals data.",
        annotations=READ_ONLY,
        structured_output=True,
    )
    async def compare_candidates(symbols: list[str], holding_days: int = 10) -> dict[str, Any]:
        return await research.compare_candidates(symbols, holding_days)

    @server.tool(
        title="Build Risk-Bounded Trade Plan",
        description="Create a decision-support plan with entry zone, invalidation, stop, targets, reward-to-risk and position size. It never places an order and does not publish a Signal.",
        annotations=READ_ONLY,
        structured_output=True,
    )
    async def build_trade_plan(
        symbol: str,
        capital: float = 10_000_000,
        risk_pct: float = 0.75,
        holding_days: int = 10,
    ) -> dict[str, Any]:
        return await research.build_trade_plan(symbol, capital, risk_pct, holding_days)

    @server.tool(
        title="Find Best Swing Trades",
        description="Run the full non-Signals Alpha Nova workflow: market pulse, discovery, analysis, comparison and risk-bounded plans. Returns no qualifying trade when evidence is weak.",
        annotations=READ_ONLY,
        structured_output=True,
    )
    async def find_best_trades(
        universe: str = "nifty100",
        custom_symbols: list[str] | None = None,
        capital: float = 10_000_000,
        risk_pct: float = 0.75,
        holding_days: int = 10,
        max_results: int = 3,
    ) -> dict[str, Any]:
        return await research.find_best_trades(
            universe,
            custom_symbols,
            capital,
            risk_pct,
            holding_days,
            max_results,
        )

    return server
