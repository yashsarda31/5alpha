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
    # Avoid network: stub the quote + spark primitives
    monkeypatch.setattr(main, "_yf_quote_change", lambda t: {"last": 100.0, "change_pct": 1.5})
    monkeypatch.setattr(main, "_spark_closes", lambda syms, points=30: {})
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


# --- US-market support (2026-07-06) ---

def test_add_us_symbol():
    h = _new_user()
    r = client.post("/api/watchlist", json={"symbol": "AAPL", "market": "US"}, headers=h)
    assert r.status_code == 200
    assert r.json()["market"] == "US"
    rows = client.get("/api/watchlist", headers=h).json()["symbols"]
    assert rows == [{"symbol": "AAPL", "market": "US",
                     "added_at": rows[0]["added_at"], "sort_order": None}]


def test_market_defaults_to_in():
    h = _new_user()
    client.post("/api/watchlist", json={"symbol": "RELIANCE"}, headers=h)
    rows = client.get("/api/watchlist", headers=h).json()["symbols"]
    assert rows[0]["market"] == "IN"


def test_ns_suffix_forces_in_market():
    h = _new_user()
    # A .NS suffix means NSE no matter what market flag the client sent.
    client.post("/api/watchlist", json={"symbol": "TCS.NS", "market": "US"}, headers=h)
    rows = client.get("/api/watchlist", headers=h).json()["symbols"]
    assert rows[0] == {"symbol": "TCS", "market": "IN",
                       "added_at": rows[0]["added_at"], "sort_order": None}


def test_bogus_market_falls_back_to_in():
    h = _new_user()
    client.post("/api/watchlist", json={"symbol": "INFY", "market": "MARS"}, headers=h)
    rows = client.get("/api/watchlist", headers=h).json()["symbols"]
    assert rows[0]["market"] == "IN"


def test_quotes_use_market_for_yahoo_symbol(monkeypatch):
    h = _new_user()
    client.post("/api/watchlist", json={"symbol": "RELIANCE"}, headers=h)
    client.post("/api/watchlist", json={"symbol": "NVDA", "market": "US"}, headers=h)
    asked = []
    monkeypatch.setattr(main, "_yf_quote_change",
                        lambda t: asked.append(t) or {"last": 1.0, "change_pct": 0.5})
    monkeypatch.setattr(main, "_spark_closes", lambda syms, points=30: {})
    r = client.get("/api/watchlist/quotes", headers=h)
    assert r.status_code == 200
    # NSE gets .NS appended; US goes to Yahoo bare.
    assert set(asked) == {"RELIANCE.NS", "NVDA"}
    by_sym = {q["symbol"]: q for q in r.json()["quotes"]}
    assert by_sym["NVDA"]["market"] == "US"
    assert by_sym["RELIANCE"]["market"] == "IN"


# --- Quote enrichment: spark + day range (2026-07-10) ---

def test_quotes_enriched_fields(monkeypatch):
    h = _new_user()
    client.post("/api/watchlist", json={"symbol": "HDFCBANK"}, headers=h)
    client.post("/api/watchlist", json={"symbol": "AMD", "market": "US"}, headers=h)
    monkeypatch.setattr(main, "_yf_quote_change",
                        lambda t: {"last": 200.0, "change_pct": -0.8, "day_low": 195.0, "day_high": 204.0})
    monkeypatch.setattr(main, "_spark_closes",
                        lambda syms, points=30: {s: [1.0, 2.0, 3.0] for s in syms})
    r = client.get("/api/watchlist/quotes", headers=h)
    assert r.status_code == 200
    by_sym = {q["symbol"]: q for q in r.json()["quotes"]}
    for sym in ("HDFCBANK", "AMD"):
        q = by_sym[sym]
        assert q["day_low"] == 195.0 and q["day_high"] == 204.0
        assert q["spark"] == [1.0, 2.0, 3.0]


def test_quotes_enrichment_is_optional(monkeypatch):
    """Old-shape quote stubs (no day range) and an empty spark batch must not
    break the response — enrichment fields just come back None."""
    h = _new_user()
    client.post("/api/watchlist", json={"symbol": "WIPRO"}, headers=h)
    monkeypatch.setattr(main, "_yf_quote_change", lambda t: {"last": 50.0, "change_pct": 0.1})
    monkeypatch.setattr(main, "_spark_closes", lambda syms, points=30: {})
    r = client.get("/api/watchlist/quotes", headers=h)
    assert r.status_code == 200
    q = r.json()["quotes"][0]
    assert q["last"] == 50.0
    assert q["day_low"] is None and q["day_high"] is None and q["spark"] is None
