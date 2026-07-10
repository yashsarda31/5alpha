from fastapi.testclient import TestClient

import main
from cockpit_engine import build_cockpit, score_opportunity


client = TestClient(main.app)


def _signals(plans=None, market_open=True):
    return {
        "as_of": "2026-07-10T11:30:00",
        "market_open": market_open,
        "market_note": "live" if market_open else "after-hours",
        "signals_market": "IN",
        "regime": {
            "overall": "RISK-ON",
            "dir": "bull",
            "vol_scale": 0.9,
            "vix": 13.2,
            "nifty": {"label": "UPTREND"},
            "vol": {"label": "NORMAL"},
            "iv": {"label": "FAIR"},
            "breadth": {"adv": 1320, "dec": 710},
        },
        "setups": {"plans": plans or [_plan()]},
    }


def _plan(symbol="RELIANCE", score=82):
    return {
        "symbol": symbol,
        "side": "LONG",
        "kind": "long_buildup",
        "score": score,
        "entry": 3000,
        "stop": 2940,
        "target": 3090,
        "risk": 60,
        "qty": 100,
        "why": "px+2.1 oi+14.0 opt✓ rng82✓ dlv✓",
    }


def _dashboard():
    return {
        "market_open": True,
        "movers_market": "IN",
        "indices": [{"name": "NIFTY 50", "last": 25000, "change_pct": 0.7}],
    }


def test_score_is_explainable_and_does_not_invent_missing_pillars():
    score = score_opportunity(_plan(), _signals()["regime"], True)
    assert 0 <= score["score"] <= 100
    assert score["version"] == "2.0.0"
    assert score["confidence"]["label"] == "MEDIUM"
    quality = next(c for c in score["components"] if c["name"] == "Quality")
    catalyst = next(c for c in score["components"] if c["name"] == "Catalyst")
    assert quality["available"] is False and quality["value"] is None
    assert catalyst["available"] is False and catalyst["value"] is None
    assert "point-in-time company quality feed" in score["missing_inputs"]


def test_cockpit_builds_levels_and_caps_portfolio_allocation():
    plans = [_plan(f"STOCK{i}", 90 - i) for i in range(7)]
    data = build_cockpit(_signals(plans), _dashboard(), capital=10_000_000, risk_pct=0.75)
    assert data["contract_version"] == "3.0.0"
    assert len(data["opportunities"]) == 7
    assert data["allocation"]["deployed_pct"] <= 82
    assert data["allocation"]["cash_pct"] >= 18
    for opportunity in data["opportunities"]:
        assert opportunity["levels"]["entry_zone"][0] < opportunity["levels"]["entry_zone"][1]
        assert opportunity["levels"]["stop"] < opportunity["levels"]["entry"]
        assert opportunity["levels"]["targets"][0] > opportunity["levels"]["entry"]
        assert opportunity["allocation"]["risk_pct"] <= 0.75


def test_bad_trade_levels_are_excluded_instead_of_sized():
    bad = _plan()
    bad["stop"] = 3050
    data = build_cockpit(_signals([bad]), _dashboard())
    assert data["opportunities"] == []
    assert data["allocation"]["deployed"] == 0
    assert "No setup currently clears" in data["attention"][0]["message"]


def test_provider_failure_degrades_response_without_fabricating_data():
    data = build_cockpit(None, _dashboard(), signal_error="signals timed out")
    assert data["opportunities"] == []
    signals_source = next(s for s in data["sources"] if s["source"] == "Market signals")
    assert signals_source["state"] == "unavailable"
    assert signals_source["warning"] == "signals timed out"


def test_cockpit_endpoint_uses_existing_engines(monkeypatch):
    async def fake_signals(capital, risk_pct, market):
        assert capital == 10_000_000
        assert risk_pct == 0.75
        return _signals()

    async def fake_dashboard():
        return _dashboard()

    monkeypatch.setattr(main, "get_market_signals", fake_signals)
    monkeypatch.setattr(main, "get_dashboard", fake_dashboard)
    response = client.get("/api/cockpit")
    assert response.status_code == 200
    payload = response.json()
    assert payload["regime"]["label"] == "RISK-ON"
    assert payload["opportunities"][0]["symbol"] == "RELIANCE"
    assert payload["opportunities"][0]["score"]["version"] == "2.0.0"


def test_cockpit_endpoint_validates_reference_portfolio():
    assert client.get("/api/cockpit?capital=100").status_code == 400
    assert client.get("/api/cockpit?risk_pct=4").status_code == 400
