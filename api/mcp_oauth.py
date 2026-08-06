"""OAuth provider for Alpha Nova's account-authenticated remote MCP connector."""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import secrets
import time
from typing import Any
from urllib.parse import urlsplit

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    OAuthAuthorizationServerProvider,
    RegistrationError,
    RefreshToken,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl
from starlette.requests import Request
from starlette.responses import HTMLResponse, RedirectResponse, Response


MCP_SCOPE = "market:read"
ACCESS_TTL_SECONDS = 3600
REFRESH_TTL_SECONDS = 30 * 86400
CODE_TTL_SECONDS = 300
PENDING_TTL_SECONDS = 600
CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback"
MAX_REDIRECT_URIS = 10
MAX_REDIRECT_URI_LENGTH = 2048
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _main():
    try:
        import main
        return main
    except ImportError:
        from api import main
        return main


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _valid_redirect_uri(uri: str) -> bool:
    """Accept MCP-compliant HTTPS or local loopback callbacks."""
    if not uri or len(uri) > MAX_REDIRECT_URI_LENGTH:
        return False
    try:
        parsed = urlsplit(uri)
        hostname = (parsed.hostname or "").casefold()
        _ = parsed.port  # Reject malformed ports.
    except ValueError:
        return False
    if not hostname or parsed.fragment or parsed.username or parsed.password:
        return False
    if parsed.scheme.casefold() == "https":
        return True
    return parsed.scheme.casefold() == "http" and hostname in LOOPBACK_HOSTS


class AlphaNovaOAuthProvider(OAuthAuthorizationServerProvider):
    """Persisted OAuth authorization server backed by Alpha Nova's auth DB."""

    def __init__(
        self,
        issuer_url: str | None = None,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_uris: list[str] | None = None,
    ):
        self.issuer_url = (issuer_url or os.environ.get("MCP_ISSUER_URL") or "https://alphanova48.in").rstrip("/")
        self.resource_url = f"{self.issuer_url}/mcp"
        self.client_id = client_id or os.environ.get("MCP_OAUTH_CLIENT_ID") or "alphanova-claude"
        self.client_secret = client_secret if client_secret is not None else os.environ.get("MCP_OAUTH_CLIENT_SECRET")
        configured_redirects = os.environ.get("MCP_OAUTH_REDIRECT_URIS")
        self.redirect_uris = redirect_uris or (
            [item.strip() for item in configured_redirects.split(",") if item.strip()]
            if configured_redirects
            else [CLAUDE_CALLBACK]
        )

    def _connect(self, force: bool = False):
        main = _main()
        if force:
            main._blob_pull_db(force=True)
        conn = main._auth_db()
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS mcp_pending_authorizations (
                request_id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                scopes_json TEXT NOT NULL,
                code_challenge TEXT NOT NULL,
                redirect_uri TEXT NOT NULL,
                redirect_uri_explicit INTEGER NOT NULL,
                resource TEXT,
                state TEXT,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
                client_id TEXT PRIMARY KEY,
                client_info_json TEXT NOT NULL,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mcp_authorization_codes (
                code_hash TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                scopes_json TEXT NOT NULL,
                code_challenge TEXT NOT NULL,
                redirect_uri TEXT NOT NULL,
                redirect_uri_explicit INTEGER NOT NULL,
                resource TEXT,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mcp_access_tokens (
                token_hash TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                scopes_json TEXT NOT NULL,
                resource TEXT,
                expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS mcp_refresh_tokens (
                token_hash TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                scopes_json TEXT NOT NULL,
                expires_at REAL NOT NULL
            );
            """
        )
        conn.commit()
        return conn

    def _push(self) -> None:
        _main()._blob_push_db()

    def _static_client(self) -> OAuthClientInformationFull | None:
        if not self.client_secret:
            return None
        return OAuthClientInformationFull(
            client_id=self.client_id,
            client_secret=self.client_secret,
            client_name="Claude for Alpha Nova",
            redirect_uris=[AnyUrl(uri) for uri in self.redirect_uris],
            token_endpoint_auth_method="client_secret_post",
            grant_types=["authorization_code", "refresh_token"],
            response_types=["code"],
            scope=MCP_SCOPE,
        )

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        client = self._static_client()
        if client and hmac.compare_digest(client_id, self.client_id):
            return client
        conn = self._connect(force=True)
        try:
            row = conn.execute(
                "SELECT client_info_json FROM mcp_oauth_clients WHERE client_id = ?",
                (client_id,),
            ).fetchone()
            return OAuthClientInformationFull.model_validate_json(row["client_info_json"]) if row else None
        finally:
            conn.close()

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        redirect_uris = {str(uri) for uri in client_info.redirect_uris}
        if (
            not redirect_uris
            or len(redirect_uris) > MAX_REDIRECT_URIS
            or any(not _valid_redirect_uri(uri) for uri in redirect_uris)
        ):
            raise RegistrationError(
                error="invalid_redirect_uri",
                error_description="Redirect URIs must use HTTPS or an HTTP loopback host without fragments or credentials.",
            )
        if set(client_info.grant_types) != {"authorization_code", "refresh_token"}:
            raise RegistrationError(
                error="invalid_client_metadata",
                error_description="Only authorization_code and refresh_token grants are allowed.",
            )
        if set(client_info.response_types) != {"code"}:
            raise RegistrationError(
                error="invalid_client_metadata",
                error_description="Only the code response type is allowed.",
            )

        conn = self._connect(force=True)
        try:
            conn.execute(
                "INSERT OR REPLACE INTO mcp_oauth_clients (client_id, client_info_json, created_at) VALUES (?, ?, ?)",
                (client_info.client_id, client_info.model_dump_json(), time.time()),
            )
            conn.commit()
            self._push()
        finally:
            conn.close()

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        scopes = params.scopes or [MCP_SCOPE]
        if set(scopes) != {MCP_SCOPE}:
            raise ValueError("Only the market:read scope is allowed.")
        redirect_uri = str(params.redirect_uri)
        if redirect_uri not in {str(uri) for uri in client.redirect_uris}:
            raise ValueError("Redirect URI is not allowlisted.")
        if params.resource and str(params.resource).rstrip("/") != self.resource_url:
            raise ValueError("Invalid MCP resource.")

        request_id = secrets.token_urlsafe(24)
        conn = self._connect(force=True)
        try:
            conn.execute("DELETE FROM mcp_pending_authorizations WHERE expires_at <= ?", (time.time(),))
            conn.execute(
                """INSERT INTO mcp_pending_authorizations
                   (request_id, client_id, scopes_json, code_challenge, redirect_uri,
                    redirect_uri_explicit, resource, state, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    request_id,
                    client.client_id,
                    json.dumps(scopes),
                    params.code_challenge,
                    redirect_uri,
                    int(params.redirect_uri_provided_explicitly),
                    str(params.resource) if params.resource else self.resource_url,
                    params.state,
                    time.time() + PENDING_TTL_SECONDS,
                ),
            )
            conn.commit()
            self._push()
        finally:
            conn.close()
        return f"{self.issuer_url}/mcp-login?request_id={request_id}"

    def pending_authorization(self, request_id: str):
        conn = self._connect()
        try:
            return conn.execute(
                "SELECT * FROM mcp_pending_authorizations WHERE request_id = ? AND expires_at > ?",
                (request_id, time.time()),
            ).fetchone()
        finally:
            conn.close()

    def complete_authorization(self, request_id: str, email: str, password: str) -> str:
        main = _main()
        email = (email or "").strip().lower()

        conn = self._connect(force=True)
        try:
            pending = conn.execute(
                "SELECT * FROM mcp_pending_authorizations WHERE request_id = ? AND expires_at > ?",
                (request_id, time.time()),
            ).fetchone()
            if not pending:
                raise ValueError("Authorization request is invalid or expired.")
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            valid = bool(user) and hmac.compare_digest(
                main._hash_password(password or "", user["salt"]), user["password_hash"]
            )
            if not valid:
                if not user:
                    main._hash_password(password or "", "00" * 16)
                raise PermissionError("Invalid email or password.")

            code = secrets.token_urlsafe(32)
            conn.execute(
                """INSERT INTO mcp_authorization_codes
                   (code_hash, client_id, user_id, subject, scopes_json, code_challenge,
                    redirect_uri, redirect_uri_explicit, resource, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    _token_hash(code),
                    pending["client_id"],
                    user["id"],
                    user["email"],
                    pending["scopes_json"],
                    pending["code_challenge"],
                    pending["redirect_uri"],
                    pending["redirect_uri_explicit"],
                    pending["resource"],
                    time.time() + CODE_TTL_SECONDS,
                ),
            )
            conn.execute("DELETE FROM mcp_pending_authorizations WHERE request_id = ?", (request_id,))
            conn.commit()
            self._push()
            return construct_redirect_uri(pending["redirect_uri"], code=code, state=pending["state"])
        finally:
            conn.close()

    def _lookup_with_retry(self, table: str, hash_column: str, token: str, client_id: str | None = None):
        query = f"SELECT * FROM {table} WHERE {hash_column} = ?"
        args: list[Any] = [_token_hash(token)]
        if client_id is not None:
            query += " AND client_id = ?"
            args.append(client_id)
        for force in (False, True):
            conn = self._connect(force=force)
            try:
                row = conn.execute(query, args).fetchone()
                if row:
                    return row
            finally:
                conn.close()
            if not _main()._blob_token():
                break
        return None

    async def load_authorization_code(self, client, authorization_code: str) -> AuthorizationCode | None:
        row = self._lookup_with_retry(
            "mcp_authorization_codes", "code_hash", authorization_code, client.client_id
        )
        if not row or row["expires_at"] <= time.time():
            return None
        return AuthorizationCode(
            code=authorization_code,
            client_id=row["client_id"],
            scopes=json.loads(row["scopes_json"]),
            expires_at=row["expires_at"],
            code_challenge=row["code_challenge"],
            redirect_uri=AnyUrl(row["redirect_uri"]),
            redirect_uri_provided_explicitly=bool(row["redirect_uri_explicit"]),
            resource=row["resource"],
            subject=row["subject"],
        )

    def _issue_tokens(self, conn, client_id: str, user_id: int, subject: str, scopes: list[str], resource: str | None):
        access_token = secrets.token_urlsafe(32)
        refresh_token = secrets.token_urlsafe(32)
        now = time.time()
        conn.execute(
            """INSERT INTO mcp_access_tokens
               (token_hash, client_id, user_id, subject, scopes_json, resource, expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (_token_hash(access_token), client_id, user_id, subject, json.dumps(scopes), resource, now + ACCESS_TTL_SECONDS),
        )
        conn.execute(
            """INSERT INTO mcp_refresh_tokens
               (token_hash, client_id, user_id, subject, scopes_json, expires_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (_token_hash(refresh_token), client_id, user_id, subject, json.dumps(scopes), now + REFRESH_TTL_SECONDS),
        )
        return access_token, refresh_token

    async def exchange_authorization_code(self, client, authorization_code: AuthorizationCode) -> OAuthToken:
        conn = self._connect(force=True)
        try:
            row = conn.execute(
                "SELECT * FROM mcp_authorization_codes WHERE code_hash = ? AND client_id = ? AND expires_at > ?",
                (_token_hash(authorization_code.code), client.client_id, time.time()),
            ).fetchone()
            if not row:
                raise ValueError("Authorization code is invalid, expired, or already used.")
            conn.execute("DELETE FROM mcp_authorization_codes WHERE code_hash = ?", (_token_hash(authorization_code.code),))
            access, refresh = self._issue_tokens(
                conn, row["client_id"], row["user_id"], row["subject"], json.loads(row["scopes_json"]), row["resource"]
            )
            conn.commit()
            self._push()
            return OAuthToken(
                access_token=access,
                refresh_token=refresh,
                token_type="Bearer",
                expires_in=ACCESS_TTL_SECONDS,
                scope=" ".join(json.loads(row["scopes_json"])),
            )
        finally:
            conn.close()

    async def load_refresh_token(self, client, refresh_token: str) -> RefreshToken | None:
        row = self._lookup_with_retry("mcp_refresh_tokens", "token_hash", refresh_token, client.client_id)
        if not row or row["expires_at"] <= time.time():
            return None
        return RefreshToken(
            token=refresh_token,
            client_id=row["client_id"],
            scopes=json.loads(row["scopes_json"]),
            expires_at=int(row["expires_at"]),
            subject=row["subject"],
        )

    async def exchange_refresh_token(self, client, refresh_token: RefreshToken, scopes: list[str]) -> OAuthToken:
        requested = scopes or refresh_token.scopes
        if not set(requested).issubset(set(refresh_token.scopes)):
            raise ValueError("Refresh token cannot expand scopes.")
        conn = self._connect(force=True)
        try:
            row = conn.execute(
                "SELECT * FROM mcp_refresh_tokens WHERE token_hash = ? AND client_id = ? AND expires_at > ?",
                (_token_hash(refresh_token.token), client.client_id, time.time()),
            ).fetchone()
            if not row:
                raise ValueError("Refresh token is invalid or expired.")
            conn.execute("DELETE FROM mcp_refresh_tokens WHERE token_hash = ?", (_token_hash(refresh_token.token),))
            access, refresh = self._issue_tokens(
                conn, row["client_id"], row["user_id"], row["subject"], requested, self.resource_url
            )
            conn.commit()
            self._push()
            return OAuthToken(
                access_token=access,
                refresh_token=refresh,
                token_type="Bearer",
                expires_in=ACCESS_TTL_SECONDS,
                scope=" ".join(requested),
            )
        finally:
            conn.close()

    async def load_access_token(self, token: str) -> AccessToken | None:
        row = self._lookup_with_retry("mcp_access_tokens", "token_hash", token)
        if not row or row["expires_at"] <= time.time():
            return None
        scopes = json.loads(row["scopes_json"])
        if MCP_SCOPE not in scopes:
            return None
        return AccessToken(
            token=token,
            client_id=row["client_id"],
            scopes=scopes,
            expires_at=int(row["expires_at"]),
            resource=row["resource"],
            subject=row["subject"],
        )

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        digest = _token_hash(token.token)
        conn = self._connect(force=True)
        try:
            conn.execute("DELETE FROM mcp_access_tokens WHERE token_hash = ?", (digest,))
            conn.execute("DELETE FROM mcp_refresh_tokens WHERE token_hash = ?", (digest,))
            conn.commit()
            self._push()
        finally:
            conn.close()


LOGIN_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Alpha Nova</title><style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#08090b;color:#f5f3ed}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 20% 0,rgba(229,192,120,.12),transparent 45%),#08090b}
main{width:min(440px,100%);padding:30px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#14161a;box-shadow:0 24px 70px rgba(0,0,0,.35)}
.mark{width:44px;height:44px;display:grid;place-items:center;border-radius:13px;background:#e5c078;color:#17130c;font-weight:900}h1{font-size:22px;margin:18px 0 8px}p{color:#9b9da2;font-size:14px;line-height:1.55}label{display:block;margin:16px 0 7px;color:#b7b8bb;font-size:12px;font-weight:700}input{width:100%;padding:12px 13px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:#0b0c0e;color:#fff}button{width:100%;margin-top:22px;padding:13px;border:0;border-radius:11px;background:#e5c078;color:#17130c;font-weight:800;cursor:pointer}.error{padding:10px 12px;border-radius:10px;color:#ffc0bb;background:rgba(255,123,114,.1)}small{display:block;margin-top:14px;color:#67696e;line-height:1.45}
</style></head><body><main><div class="mark">AN</div><h1>Connect Alpha Nova to Claude</h1><p>Authorize read-only access to market research tools. Claude cannot change your account, watchlist, predictions, alerts, or trades.</p>{error}<form method="post"><input type="hidden" name="request_id" value="{request_id}"><label>Email</label><input name="email" type="email" required autocomplete="username"><label>Password</label><input name="password" type="password" required autocomplete="current-password"><button type="submit">Authorize read-only access</button></form><small>Scope: market:read · Signals and trade execution are excluded.</small></main></body></html>"""


def register_oauth_routes(mcp, provider: AlphaNovaOAuthProvider) -> None:
    def render_login(request_id: str, error: str = "") -> str:
        return LOGIN_HTML.replace("{request_id}", html.escape(request_id)).replace("{error}", error)

    @mcp.custom_route("/mcp-login", methods=["GET", "POST"])
    async def mcp_login(request: Request) -> Response:
        request_id = request.query_params.get("request_id", "")
        if request.method == "POST":
            form = await request.form()
            request_id = str(form.get("request_id", ""))
        pending = provider.pending_authorization(request_id) if request_id else None
        if not pending:
            return HTMLResponse("<h1>Invalid or expired authorization request.</h1>", status_code=400)
        if request.method == "GET":
            return HTMLResponse(
                render_login(request_id),
                headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"},
            )

        main = _main()
        main._rate_limit(request, "mcp_oauth_login", limit=10, window_s=300)
        try:
            redirect = provider.complete_authorization(
                request_id, str(form.get("email", "")), str(form.get("password", ""))
            )
            return RedirectResponse(redirect, status_code=302, headers={"Cache-Control": "no-store"})
        except PermissionError as exc:
            safe_error = f'<p class="error">{html.escape(str(exc))}</p>'
            return HTMLResponse(
                render_login(request_id, safe_error),
                status_code=401,
                headers={"Cache-Control": "no-store", "X-Frame-Options": "DENY"},
            )
        except ValueError as exc:
            return HTMLResponse(html.escape(str(exc)), status_code=400, headers={"Cache-Control": "no-store"})
