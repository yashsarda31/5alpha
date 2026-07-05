import os
import tempfile
import uuid

# Isolate the DB before main is imported (shares the auth DB/tables).
os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def _new_user():
    email = f"user_{uuid.uuid4().hex[:10]}@test.local"
    r = client.post("/api/auth/signup", json={"email": email, "password": "secret123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_add_list_remove_cycle():
    h = _new_user()

    # Empty to start
    assert client.get("/api/watchlist", headers=h).json()["symbols"] == []

    # Add two, newest-first-by-insert order preserved (added_at)
    assert client.post("/api/watchlist", json={"symbol": "RELIANCE"}, headers=h).status_code == 200
    assert client.post("/api/watchlist", json={"symbol": "TCS"}, headers=h).status_code == 200
    syms = [s["symbol"] for s in client.get("/api/watchlist", headers=h).json()["symbols"]]
    assert syms == ["RELIANCE", "TCS"]

    # Remove one
    assert client.delete("/api/watchlist/RELIANCE", headers=h).status_code == 200
    syms = [s["symbol"] for s in client.get("/api/watchlist", headers=h).json()["symbols"]]
    assert syms == ["TCS"]


def test_add_is_idempotent():
    h = _new_user()
    client.post("/api/watchlist", json={"symbol": "INFY"}, headers=h)
    client.post("/api/watchlist", json={"symbol": "INFY"}, headers=h)
    syms = [s["symbol"] for s in client.get("/api/watchlist", headers=h).json()["symbols"]]
    assert syms == ["INFY"]


def test_remove_missing_is_ok():
    h = _new_user()
    assert client.delete("/api/watchlist/NOTONLIST", headers=h).status_code == 200


def test_symbol_normalization():
    h = _new_user()
    # lowercase + ".NS" suffix collapse to canonical bare uppercase
    client.post("/api/watchlist", json={"symbol": "reliance.ns"}, headers=h)
    syms = [s["symbol"] for s in client.get("/api/watchlist", headers=h).json()["symbols"]]
    assert syms == ["RELIANCE"]
    # Adding the canonical form again is a no-op, not a duplicate row
    client.post("/api/watchlist", json={"symbol": "RELIANCE"}, headers=h)
    assert len(client.get("/api/watchlist", headers=h).json()["symbols"]) == 1


def test_invalid_symbol_rejected():
    h = _new_user()
    assert client.post("/api/watchlist", json={"symbol": ""}, headers=h).status_code == 400
    assert client.post("/api/watchlist", json={"symbol": "bad symbol!"}, headers=h).status_code == 400


def test_reorder():
    h = _new_user()
    for s in ["A", "B", "C"]:
        client.post("/api/watchlist", json={"symbol": s}, headers=h)
    r = client.put("/api/watchlist/order", json={"symbols": ["C", "A", "B"]}, headers=h)
    assert r.status_code == 200
    syms = [s["symbol"] for s in r.json()["symbols"]]
    assert syms == ["C", "A", "B"]
    # Order persists on a fresh read
    syms = [s["symbol"] for s in client.get("/api/watchlist", headers=h).json()["symbols"]]
    assert syms == ["C", "A", "B"]


def test_cap_enforced():
    h = _new_user()
    for i in range(main.WATCHLIST_MAX):
        assert client.post("/api/watchlist", json={"symbol": f"SYM{i}"}, headers=h).status_code == 200
    # One over the cap is rejected
    r = client.post("/api/watchlist", json={"symbol": "OVERCAP"}, headers=h)
    assert r.status_code == 400


def test_auth_required():
    assert client.get("/api/watchlist").status_code == 401
    assert client.post("/api/watchlist", json={"symbol": "RELIANCE"}).status_code == 401
    assert client.delete("/api/watchlist/RELIANCE").status_code == 401
    assert client.get("/api/watchlist/quotes").status_code == 401


def test_quotes_shape(monkeypatch):
    h = _new_user()
    for s in ["RELIANCE", "TCS"]:
        client.post("/api/watchlist", json={"symbol": s}, headers=h)
    # Avoid network: stub the quote primitive
    monkeypatch.setattr(main, "_yf_quote_change", lambda t: {"last": 100.0, "change_pct": 1.5})
    r = client.get("/api/watchlist/quotes", headers=h)
    assert r.status_code == 200
    quotes = r.json()["quotes"]
    assert {q["symbol"] for q in quotes} == {"RELIANCE", "TCS"}
    assert all(q["last"] == 100.0 for q in quotes)


def test_quotes_empty_watchlist():
    h = _new_user()
    r = client.get("/api/watchlist/quotes", headers=h)
    assert r.status_code == 200
    assert r.json()["quotes"] == []
