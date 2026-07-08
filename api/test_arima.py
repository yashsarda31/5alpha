"""SARIMAX forecaster: response shape, business-day dates, honest-metric fields.

Runs fully offline — price history is a synthetic random walk injected through
_yf_resolve_history, so only statsmodels does real work.
"""
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import numpy as np
import pandas as pd
import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def _fake_history(n=400, drift=0.0005, seed=7):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(end="2026-07-08", periods=n)
    logp = np.cumsum(rng.normal(drift, 0.015, n)) + np.log(100)
    close = np.exp(logp)
    return pd.DataFrame({"Close": close, "Open": close, "High": close * 1.01,
                         "Low": close * 0.99, "Volume": 1e6}, index=idx)


def _patch(monkeypatch, df):
    monkeypatch.setattr(main, "_yf_resolve_history", lambda t, p="2y": ("TEST.NS", df))


def test_forecast_shape_and_metrics(monkeypatch):
    _patch(monkeypatch, _fake_history())
    r = client.post("/api/arima", json={"ticker": "TEST", "days": 10})
    assert r.status_code == 200, r.text
    j = r.json()
    assert len(j["forecast"]["dates"]) == 10
    assert len(j["forecast"]["prices"]) == 10
    assert len(j["forecast"]["lower"]) == 10 and len(j["forecast"]["upper"]) == 10
    # CI must bracket the point forecast
    assert all(lo <= p <= hi for lo, p, hi in
               zip(j["forecast"]["lower"], j["forecast"]["prices"], j["forecast"]["upper"]))
    # summary consistency
    s = j["summary"]
    assert s["horizon_days"] == 10
    assert abs(s["exp_change_pct"] - (s["end_price"] / s["last_price"] - 1) * 100) < 0.05
    # model metadata present (selection may legitimately pick the drift baseline)
    m = j["model"]
    assert isinstance(m["order"], list) and len(m["order"]) == 3
    assert m["holdout_days"] >= 5


def test_forecast_dates_are_business_days(monkeypatch):
    _patch(monkeypatch, _fake_history())
    j = client.post("/api/arima", json={"ticker": "TEST", "days": 12}).json()
    for d in j["forecast"]["dates"]:
        assert pd.Timestamp(d).dayofweek < 5, f"{d} is a weekend"


def test_days_clamped(monkeypatch):
    _patch(monkeypatch, _fake_history())
    j = client.post("/api/arima", json={"ticker": "TEST", "days": 500}).json()
    assert len(j["forecast"]["dates"]) == 60  # hard cap
    j2 = client.post("/api/arima", json={"ticker": "TEST", "days": 0}).json()
    assert len(j2["forecast"]["dates"]) == 10  # 0/absent falls back to the default horizon


def test_too_little_history_is_400(monkeypatch):
    _patch(monkeypatch, _fake_history(n=30))
    r = client.post("/api/arima", json={"ticker": "TEST", "days": 10})
    assert r.status_code == 400


def test_empty_history_is_404(monkeypatch):
    _patch(monkeypatch, pd.DataFrame())
    r = client.post("/api/arima", json={"ticker": "NOPE", "days": 10})
    assert r.status_code == 404
