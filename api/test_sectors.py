"""/api/sectors market routing: US during US hours, India otherwise, ?market override."""
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def _stub_compute(monkeypatch):
    # Echo the market arg instead of hitting yfinance/NSE.
    monkeypatch.setattr(main, "_compute_sector_rotation",
                        lambda market="IN": {"market": market, "sectors": [], "benchmark": {"name": market}})
    for k in list(main.API_CACHE):
        if k.startswith("sector_rotation_"):
            main.API_CACHE.pop(k, None)


def test_us_sector_map_defined():
    assert len(main.US_SECTOR_INDICES) == 11
    assert main.US_SECTOR_BENCHMARK[0] == "SPY"
    # every entry is (yahoo_ticker, live_key) like the India map
    assert all(isinstance(v, tuple) and len(v) == 2 for v in main.US_SECTOR_INDICES.values())


def test_explicit_market_override(monkeypatch):
    _stub_compute(monkeypatch)
    assert client.get("/api/sectors?market=US").json()["market"] == "US"
    assert client.get("/api/sectors?market=IN").json()["market"] == "IN"


def test_auto_market_follows_clock(monkeypatch):
    _stub_compute(monkeypatch)
    # Pin the clock-based selector both ways and confirm the endpoint follows it
    monkeypatch.setattr(main, "_dashboard_movers_market", lambda: "US")
    for k in list(main.API_CACHE):
        if k.startswith("sector_rotation_"):
            main.API_CACHE.pop(k, None)
    assert client.get("/api/sectors").json()["market"] == "US"

    monkeypatch.setattr(main, "_dashboard_movers_market", lambda: "IN")
    for k in list(main.API_CACHE):
        if k.startswith("sector_rotation_"):
            main.API_CACHE.pop(k, None)
    assert client.get("/api/sectors").json()["market"] == "IN"
