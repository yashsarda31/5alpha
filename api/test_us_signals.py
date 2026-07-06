"""US signals engine unit tests (no network): plan scorer + buildup buckets
+ session-window selection wiring in /api/signals."""
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import score_us_signal_plans, _us_buildup_buckets


def _radar_row(**kw):
    row = {"symbol": "NVDA", "ltp": 200.0, "px": 3.0, "dpos": 0.9,
           "vol": 100e6, "vol_ratio": 220.0, "dollar_vol": 200.0 * 100e6,
           "sma20": 190.0, "hi": 201.0, "lo": 193.0, "kind": "long_buildup"}
    row.update(kw)
    return row


OC_BULL = {"pcr_band": 1.2, "pcr_doi": 0.8}   # put writers + call-heavy flow
REGIME_BULL = {"dir": "bull", "vol_scale": 1.0}


def test_strong_long_scores_high():
    plans, bias = score_us_signal_plans([_radar_row()], OC_BULL, OC_BULL, REGIME_BULL, 1_000_000, 1.0)
    assert bias == "bull"
    assert len(plans) == 1
    p = plans[0]
    assert p["side"] == "LONG"
    assert p["score"] >= 70
    assert p["currency"] == "$"
    assert p["stop"] < p["entry"] < p["target"]
    # 1.5R symmetry
    assert abs((p["target"] - p["entry"]) - 1.5 * (p["entry"] - p["stop"])) < 0.05


def test_small_move_is_filtered():
    plans, _ = score_us_signal_plans([_radar_row(px=0.4)], OC_BULL, OC_BULL, REGIME_BULL, 1_000_000, 1.0)
    assert plans == []


def test_short_side_levels():
    row = _radar_row(px=-3.5, dpos=0.05, kind="short_buildup", sma20=210.0)
    plans, _ = score_us_signal_plans([row], OC_BULL, OC_BULL, {"dir": "bear", "vol_scale": 1.0}, 1_000_000, 1.0)
    assert plans and plans[0]["side"] == "SHORT"
    p = plans[0]
    assert p["target"] < p["entry"] < p["stop"]


def test_qty_respects_risk_and_vol_scale():
    plans, _ = score_us_signal_plans([_radar_row()], OC_BULL, OC_BULL,
                                     {"dir": "bull", "vol_scale": 0.5}, 1_000_000, 1.0)
    p = plans[0]
    # risk budget = 1% of 1M × 0.5 scale = 5000; qty = 5000 // per-share risk
    assert p["qty"] == int(5000 / p["risk"])


def test_buckets_classify_and_shape():
    radar = [
        _radar_row(symbol="AAPL", px=2.0, kind="long_buildup", vol_ratio=180),
        _radar_row(symbol="TSLA", px=-2.0, kind="short_buildup", vol_ratio=150),
        _radar_row(symbol="DIS", px=1.0, kind="short_covering", vol_ratio=70),
        _radar_row(symbol="MU", px=-1.0, kind="long_unwinding", vol_ratio=60),
        _radar_row(symbol="FLAT", px=0.2, kind="neutral"),
    ]
    b = _us_buildup_buckets(radar)
    assert [c["symbol"] for c in b["long_buildup"]] == ["AAPL"]
    assert [c["symbol"] for c in b["short_buildup"]] == ["TSLA"]
    assert [c["symbol"] for c in b["short_covering"]] == ["DIS"]
    assert [c["symbol"] for c in b["long_unwinding"]] == ["MU"]
    row = b["long_buildup"][0]
    assert row["contract"] == "EQ"
    assert row["oiChangePct"] == 80  # vol_ratio 180 → +80% vs avg
