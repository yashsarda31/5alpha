import asyncio

import pytest
from mcp.server.auth.provider import RegistrationError
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl

from api.mcp_oauth import AlphaNovaOAuthProvider


def test_configured_oauth_client_is_available_without_database_access(monkeypatch):
    provider = AlphaNovaOAuthProvider(
        client_id="known-client",
        client_secret="known-secret",
    )

    def unexpected_connect(*_args, **_kwargs):
        raise AssertionError("configured client must not touch SQLite or Blob")

    monkeypatch.setattr(provider, "_connect", unexpected_connect)

    client = asyncio.run(provider.get_client("known-client"))
    assert client is not None
    assert client.client_id == "known-client"


def test_unknown_oauth_client_is_rejected_without_database_access(monkeypatch):
    provider = AlphaNovaOAuthProvider(
        client_id="known-client",
        client_secret="known-secret",
    )

    def unexpected_connect(*_args, **_kwargs):
        raise AssertionError("unknown clients must not touch SQLite or Blob")

    monkeypatch.setattr(provider, "_connect", unexpected_connect)

    assert asyncio.run(provider.get_client("unknown-client")) is None


def test_dynamic_oauth_registration_is_disabled_without_database_access(monkeypatch):
    provider = AlphaNovaOAuthProvider(
        client_id="known-client",
        client_secret="known-secret",
    )
    client = OAuthClientInformationFull(
        client_id="dynamic-client",
        client_name="Untrusted dynamic client",
        redirect_uris=[AnyUrl("https://example.org/callback")],
        token_endpoint_auth_method="none",
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
        scope="market:read",
    )

    def unexpected_connect(*_args, **_kwargs):
        raise AssertionError("disabled registration must not touch SQLite or Blob")

    monkeypatch.setattr(provider, "_connect", unexpected_connect)

    with pytest.raises(RegistrationError):
        asyncio.run(provider.register_client(client))
