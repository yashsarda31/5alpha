import os
import tempfile
import uuid

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
