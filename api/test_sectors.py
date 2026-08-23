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


def test_india_sector_map_has_20_groups():
    assert len(main.SECTOR_INDICES) == 20
    assert "Nifty Midcap 100" in main.SECTOR_INDICES
    assert "Nifty Smallcap 100" in main.SECTOR_INDICES
    assert "Nifty Healthcare" in main.SECTOR_INDICES
    assert "Nifty Services Sector" in main.SECTOR_INDICES


def test_compute_india_rotation_keeps_partial_coverage(monkeypatch):
    import numpy as np
    import pandas as pd

    dates = pd.date_range("2026-01-09", periods=32, freq="W-FRI")
    benchmark = pd.Series(25000 + np.arange(32) * 40, index=dates, dtype="float64")
    missing_display = "Nifty Services Sector"
    missing_nse_name = main.SECTOR_INDICES[missing_display][1]
    history = {main.SECTOR_BENCHMARK[1]: benchmark}
    for offset, (_display, (_ticker, nse_name)) in enumerate(main.SECTOR_INDICES.items(), start=1):
        if nse_name == missing_nse_name:
            continue
        phase = np.arange(32) / 3 + offset
        relative_path = 1 + 0.015 * np.sin(phase) + 0.0004 * offset * np.arange(32)
        history[nse_name] = pd.Series(benchmark.to_numpy() * relative_path, index=dates)

    monkeypatch.setattr(
        main,
        "fetch_weekly_index_closes",
        lambda *_args, **_kwargs: (history, [missing_nse_name]),
    )
    monkeypatch.setattr(
        main,
        "nse_get",
        lambda _path: {
            "data": [
                {"index": nse_name, "percentChange": 0.5}
                for _display, (_ticker, nse_name) in main.SECTOR_INDICES.items()
            ]
        },
    )

    result = main._compute_sector_rotation("IN")

    assert result["coverage"]["expected"] == 20
    assert result["coverage"]["available"] == 19
    assert result["coverage"]["missing"] == [missing_display]
    assert result["trend_label"] == "vs 10W avg"
    assert [row["score"] for row in result["sectors"]] == sorted(
        [row["score"] for row in result["sectors"]], reverse=True
    )


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
