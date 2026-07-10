"""FLCL floor/ceiling regime engine: shape, regime direction, causality, clamps.

Runs fully offline — price history is synthetic (trend + swing cycles) injected
through _yf_resolve_history, so no network is touched.
"""
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import numpy as np
import pandas as pd
import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def _fake_history(n=500, drift=0.001, cycle=18, amp=0.05, seed=11):
    """Trending series with real pullback swings so the engine has structure
    to work with (a pure random walk rarely produces clean confirmed swings)."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(end="2026-07-09", periods=n)
    t = np.arange(n)
    logp = np.log(100) + drift * t + amp * np.sin(2 * np.pi * t / cycle) \
        + np.cumsum(rng.normal(0, 0.006, n))
    close = np.exp(logp)
    spread = close * 0.008
    high = close + np.abs(rng.normal(0, spread))
    low = close - np.abs(rng.normal(0, spread))
    openp = np.clip(close * (1 + rng.normal(0, 0.004, n)), low, high)
    return pd.DataFrame({"Open": openp, "High": high, "Low": low,
                         "Close": close, "Volume": 1e6}, index=idx)


def _patch(monkeypatch, df):
    monkeypatch.setattr(main, "_yf_resolve_history", lambda t, p="2y": ("TEST.NS", df))


def _run(monkeypatch, df, **body):
    _patch(monkeypatch, df)
    main.API_CACHE.clear()
    payload = {"ticker": "TEST", **body}
    return client.post("/api/flcl", json=payload)


def test_response_shape(monkeypatch):
    r = _run(monkeypatch, _fake_history(), days=252)
    assert r.status_code == 200, r.text
    j = r.json()
    m = len(j["candles"]["dates"])
    assert m == 252
    for k in ("open", "high", "low", "close", "volume"):
        assert len(j["candles"][k]) == m
    for k in ("floor", "ceiling", "regime", "range_pos"):
        assert len(j["levels"][k]) == m
    assert set(j["levels"]["regime"]) <= {"Bullish", "Bearish", "Neutral"}
    assert j["ticker"] == "TEST.NS"
    assert j["current"]["regime"] in ("Bullish", "Bearish", "Neutral")
    assert j["signals"]["bias"] in ("LONG", "SHORT / CASH", "NEUTRAL")
    assert isinstance(j["segments"], list) and len(j["segments"]) >= 1
    # segments tile the window exactly
    assert sum(s["days"] for s in j["segments"]) == m
    sc = j["scorecard"]
    assert sc["flips"] >= 0 and sc["exposure_pct"] is not None
    # time shares add to ~100
    assert abs(sc["time_bull_pct"] + sc["time_bear_pct"] + sc["time_neutral_pct"] - 100) < 0.2


def test_uptrend_is_bullish(monkeypatch):
    j = _run(monkeypatch, _fake_history(drift=0.0025, seed=3), days=252).json()
    reg = j["levels"]["regime"]
    bull_share = reg.count("Bullish") / len(reg)
    assert bull_share > 0.5, f"uptrend classified bull only {bull_share:.0%}"
    assert j["levels"]["regime"][-1] == "Bullish"


def test_downtrend_is_bearish(monkeypatch):
    j = _run(monkeypatch, _fake_history(drift=-0.0025, seed=3), days=252).json()
    reg = j["levels"]["regime"]
    bear_share = reg.count("Bearish") / len(reg)
    assert bear_share > 0.5, f"downtrend classified bear only {bear_share:.0%}"


def test_engine_is_causal(monkeypatch):
    """No look-ahead: running on a prefix must give the same regimes as the
    prefix of the full run (this is the notebook's central defect, fixed)."""
    df = _fake_history(n=500, seed=5)
    full = main._flcl_engine(df, swing_window=5, atr_mult=1.5)
    for cut in (300, 400):
        part = main._flcl_engine(df.iloc[:cut], swing_window=5, atr_mult=1.5)
        assert list(part["regime"]) == list(full["regime"][:cut]), f"regime diverges before bar {cut}"
        np.testing.assert_allclose(part["floor"], full["floor"][:cut], equal_nan=True)
        np.testing.assert_allclose(part["ceiling"], full["ceiling"][:cut], equal_nan=True)


def test_floor_below_ceiling_and_ratchet(monkeypatch):
    j = _run(monkeypatch, _fake_history(seed=9), days=252).json()
    lv = j["levels"]
    for f, c, r in zip(lv["floor"], lv["ceiling"], lv["regime"]):
        if f is not None and c is not None:
            assert f <= c, "floor must sit below ceiling"
    # in a bullish stretch the floor must never step DOWN
    prev_f, prev_r = None, None
    for f, r in zip(lv["floor"], lv["regime"]):
        if r == "Bullish" and prev_r == "Bullish" and f is not None and prev_f is not None:
            assert f >= prev_f - 1e-9, "bull floor loosened"
        prev_f, prev_r = f, r


def test_params_clamped(monkeypatch):
    j = _run(monkeypatch, _fake_history(), days=5000, swing_window=99, atr_mult=99).json()
    assert j["params"]["days"] == 756
    assert j["params"]["swing_window"] == 15
    assert j["params"]["atr_mult"] == 4.0
    j2 = _run(monkeypatch, _fake_history(), days=None).json()
    assert j2["params"]["days"] == 252


def test_empty_history_is_404(monkeypatch):
    r = _run(monkeypatch, pd.DataFrame())
    assert r.status_code == 404


def test_short_history_is_400(monkeypatch):
    r = _run(monkeypatch, _fake_history(n=40))
    assert r.status_code == 400


def test_nan_rows_survive(monkeypatch):
    df = _fake_history()
    df.iloc[50, df.columns.get_loc("Volume")] = np.nan
    r = _run(monkeypatch, df, days=252)
    assert r.status_code == 200
    # response must be JSON-clean (no NaN leaked)
    import json
    json.dumps(r.json(), allow_nan=False)
