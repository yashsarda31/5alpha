from fastapi.testclient import TestClient
from api import main, screener_engine
from api.test_screener_engine import history
import pandas as pd

client = TestClient(main.app)


def test_invalid_technical_rules_are_rejected():
    for payload in ({"price_trend": "garbage"}, {"rs_lookback": 10}, {"benchmark": "FAKE"},
                    {"min_alpha_score": 101}, {"universe": "unknown"}, {"tickers": ""}):
        assert client.post("/api/screener", json=payload).status_code == 422


def test_technical_request_and_legacy_response(monkeypatch):
    def loader(ticker, fundamentals):
        end = (pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=1)).date().isoformat()
        return history([100] * 252 + [90], end=end), {"trailingPE": 12, "returnOnEquity": 0.25}
    monkeypatch.setattr(screener_engine, "_load", loader)
    result = client.post("/api/screener", json={"tickers": " tcs.ns, TCS.NS ", "price_trend": "below_200"}).json()
    assert result["requested"] == 1
    assert result["data"][0]["ticker"] == "TCS.NS"
    assert result["data"][0]["dist200"] < 0
    result = client.post("/api/screener", json={"tickers": "TCS.NS", "max_pe": 20, "min_roe": 20}).json()
    assert result["data"][0]["peRatio"] == 12
    assert result["data"][0]["roe"] == 25
    assert result["scanned"] == 1


def test_named_universe_uses_official_membership_and_reports_source(monkeypatch):
    from api.screener_universe import _CACHE
    _CACHE.clear()
    monkeypatch.setattr(main, 'fetch_index_constituents', lambda _: [f'STOCK{i}' for i in range(100)])
    captured = []
    def scan(req, tickers, score_fn, **kwargs):
        captured.extend(tickers)
        return {'data': [], 'requested': len(tickers)}
    monkeypatch.setattr(main, 'run_screener_scan', scan)
    response = client.post('/api/screener', json={'universe': 'nifty100', 'price_trend': 'below_200'})
    assert response.status_code == 200
    assert response.json()['universe_fallback'] is False
    assert response.json()['requested'] == 100
    assert captured[0] == 'STOCK0.NS'
    _CACHE.clear()
