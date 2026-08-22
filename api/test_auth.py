import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

# Isolate the auth DB before main is imported (no-op if another test imported it first;
# unique emails keep the tests correct either way)
os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def _unique_email():
    return f"user_{uuid.uuid4().hex[:10]}@test.local"


def test_signup_login_me_logout_cycle():
    email = _unique_email()

    # Signup returns a token and public user (no hash/salt leakage)
    r = client.post("/api/auth/signup", json={"email": email, "password": "secret123", "displayName": "Test User"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == email
    assert body["user"]["displayName"] == "Test User"
    assert "password" not in str(body["user"]).lower() or "hash" not in str(body["user"]).lower()
    token = body["token"]

    # Session restores via /me
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == email

    # Fresh login issues a new working token
    r = client.post("/api/auth/login", json={"email": email, "password": "secret123"})
    assert r.status_code == 200
    token2 = r.json()["token"]
    assert token2 != token

    # Logout revokes only the token that was presented
    r = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token2}"})
    assert r.status_code == 200
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token2}"})
    assert r.status_code == 401
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200


def test_duplicate_signup_rejected():
    email = _unique_email()
    r = client.post("/api/auth/signup", json={"email": email, "password": "secret123"})
    assert r.status_code == 200
    r = client.post("/api/auth/signup", json={"email": email, "password": "other456"})
    assert r.status_code == 400


def test_wrong_password_rejected():
    email = _unique_email()
    client.post("/api/auth/signup", json={"email": email, "password": "secret123"})
    r = client.post("/api/auth/login", json={"email": email, "password": "wrongpass"})
    assert r.status_code == 401


def test_unknown_email_rejected():
    r = client.post("/api/auth/login", json={"email": _unique_email(), "password": "whatever1"})
    assert r.status_code == 401


def test_validation_rules():
    r = client.post("/api/auth/signup", json={"email": "not-an-email", "password": "secret123"})
    assert r.status_code == 400
    r = client.post("/api/auth/signup", json={"email": _unique_email(), "password": "abc"})
    assert r.status_code == 400


def test_me_without_token():
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_production_cleanup_keeps_fresh_test_account(monkeypatch, tmp_path):
    import main

    monkeypatch.setattr(main, "AUTH_DB_PATH", str(tmp_path / "alphanova.db"))
    monkeypatch.setattr(main, "_purge_done", True)
    conn = main._auth_db()
    fresh = main._utc_now()
    stale = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    conn.executemany(
        "INSERT INTO users (email, password_hash, salt, display_name, created_at, last_login_at) VALUES (?, 'hash', 'salt', 'QA', ?, ?)",
        [("fresh@example.com", fresh, fresh), ("stale@example.com", stale, stale)],
    )
    conn.commit()
    monkeypatch.setattr(main, "_purge_done", False)
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(main, "_blob_push_db", lambda: True)

    main._purge_test_accounts(conn)

    assert {row[0] for row in conn.execute("SELECT email FROM users")} == {"fresh@example.com"}
    conn.close()


def test_input_length_limits():
    # Oversized password and email are rejected outright
    r = client.post("/api/auth/signup", json={"email": _unique_email(), "password": "x" * 129})
    assert r.status_code == 400
    r = client.post("/api/auth/signup", json={"email": "a" * 250 + "@test.local", "password": "secret123"})
    assert r.status_code == 400
    # Oversized display name is truncated, not stored verbatim
    r = client.post("/api/auth/signup", json={"email": _unique_email(), "password": "secret123", "displayName": "D" * 5000})
    assert r.status_code == 200
    assert len(r.json()["user"]["displayName"]) <= 80


def test_rate_limit_login(monkeypatch):
    """With the limiter forced on, repeated failed logins from one IP hit 429."""
    import main
    monkeypatch.setattr(main, "_RL_ENABLED", True)
    monkeypatch.setattr(main, "_RL_BUCKETS", {})
    email = _unique_email()
    got_429 = False
    for _ in range(25):  # limit is 20/5min
        r = client.post("/api/auth/login", json={"email": email, "password": "wrong-pass"})
        if r.status_code == 429:
            got_429 = True
            break
        assert r.status_code == 401
    assert got_429


def test_rate_limit_off_by_default():
    """Locally (no VERCEL env) the limiter must not interfere."""
    import main
    assert not main._RL_ENABLED
    email = _unique_email()
    for _ in range(25):
        r = client.post("/api/auth/login", json={"email": email, "password": "wrong-pass"})
        assert r.status_code == 401


def test_symbol_validation():
    """Ticker path params reject URL-structural junk, accept real listings."""
    for bad in ["FOO?x=y", "A/B", "a%2Fb", "<script>", "X" * 30]:
        r = client.get(f"/api/chart/{bad}")
        assert r.status_code in (400, 404), bad  # 404 = path didn't match ("/")
    import main
    for good in ["RELIANCE.NS", "^NSEI", "INR=X", "M&M.NS", "BRK-B", "NIFTY_FIN_SERVICE.NS"]:
        assert main._validate_symbol(good) == good


def test_cron_secret_guard(monkeypatch):
    """With CRON_SECRET set, cron endpoints demand the matching Bearer header."""
    monkeypatch.setenv("CRON_SECRET", "s3cret")
    r = client.get("/api/predict/resolve")
    assert r.status_code == 403
    r = client.get("/api/delivery/refresh", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 403
