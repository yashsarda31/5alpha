"""Dashboard top-movers market selection: US megacaps during the US cash
session window (20:00-02:00 IST), NSE names the rest of the day."""
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import _dashboard_movers_market

IST = timezone(timedelta(hours=5, minutes=30))


def _at(hour, minute=0):
    return datetime(2026, 7, 6, hour, minute, tzinfo=IST)


def test_us_window():
    assert _dashboard_movers_market(_at(20, 0)) == "US"
    assert _dashboard_movers_market(_at(23, 30)) == "US"
    assert _dashboard_movers_market(_at(0, 45)) == "US"
    assert _dashboard_movers_market(_at(1, 59)) == "US"


def test_indian_window():
    assert _dashboard_movers_market(_at(2, 0)) == "IN"
    assert _dashboard_movers_market(_at(9, 30)) == "IN"
    assert _dashboard_movers_market(_at(15, 15)) == "IN"
    assert _dashboard_movers_market(_at(19, 59)) == "IN"


def test_dashboard_sparklines_attached(monkeypatch):
    """/api/dashboard movers and indices carry optional spark arrays from one
    batched download (offline: all primitives stubbed)."""
    import main
    from fastapi.testclient import TestClient

    mkt = main._dashboard_movers_market()
    main.API_CACHE.pop(f"dashboard_{mkt}", None)
    universe = main.US_DASHBOARD_MOVERS if mkt == "US" else main.DASHBOARD_MOVERS
    suffix = "" if mkt == "US" else ".NS"

    monkeypatch.setattr(main, "nse_get", lambda *a, **k: None)
    monkeypatch.setattr(main, "_yf_quote_change", lambda t: {"last": 100.0, "change_pct": 1.0})
    spark = {t: [10.0, 11.0, 12.0] for t in universe}
    spark.update({v: [5.0, 6.0] for v in main._INDEX_SPARK_SYMBOLS.values()})
    monkeypatch.setattr(main, "_spark_closes",
                        lambda syms, points=30: {s: spark[s] for s in syms if s in spark})

    client = TestClient(main.app)
    body = client.get("/api/dashboard").json()
    main.API_CACHE.pop(f"dashboard_{mkt}", None)  # don't leak stubbed data

    assert body["movers"], "stubbed quotes should produce movers"
    assert all(m["spark"] == [10.0, 11.0, 12.0] for m in body["movers"])
    assert body["indices"], "yfinance fallback should produce indices"
    assert all(i.get("spark") == [5.0, 6.0] for i in body["indices"])
    # Back-compat keys intact
    assert {"ticker", "last", "change_pct"} <= set(body["movers"][0].keys())
