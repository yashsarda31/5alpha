import math

import pandas as pd
import pytest

from api.signal_model.features import FEATURE_SCHEMA_V1, build_feature_row, validate_feature_row


def history():
    idx = pd.bdate_range("2026-06-01", periods=45)
    close = pd.Series(range(100, 145), index=idx, dtype=float)
    return pd.DataFrame(
        {
            "open": close - 1,
            "high": close + 2,
            "low": close - 2,
            "close": close,
            "volume": range(1000, 1045),
            "oi": range(2000, 2045),
        }
    )


def context(**overrides):
    values = {
        "index_return_pct": 0.4,
        "sector_return_pct": 0.2,
        "breadth_pct": 58.0,
        "vix_percentile": 0.45,
        "regime": 1.0,
    }
    values.update(overrides)
    return values


def test_future_rows_do_not_change_point_in_time_features():
    bars = history()
    cutoff = bars.index[34].date()
    row = {
        "side": "LONG",
        "price_change_pct": 1.2,
        "oi_change_pct": 8.0,
        "volume": 1034,
        "delivery_change_pct": 3.0,
    }
    before = build_feature_row(row, bars.iloc[:35], context(), cutoff)
    mutated = pd.concat([bars.iloc[:35], bars.iloc[35:].assign(close=9999)])
    after = build_feature_row(row, mutated, context(), cutoff)
    assert before == after
    assert tuple(before) == FEATURE_SCHEMA_V1


def test_features_are_side_aligned_and_scale_free():
    bars = history()
    cutoff = bars.index[-1].date()
    long = build_feature_row(
        {
            "side": "LONG",
            "price_change_pct": 2,
            "oi_change_pct": 10,
            "volume": 1044,
            "delivery_change_pct": 2,
        },
        bars,
        context(index_return_pct=1, sector_return_pct=0.5, breadth_pct=60, regime=1),
        cutoff,
    )
    short = build_feature_row(
        {
            "side": "SHORT",
            "price_change_pct": -2,
            "oi_change_pct": 10,
            "volume": 1044,
            "delivery_change_pct": -2,
        },
        bars,
        context(index_return_pct=-1, sector_return_pct=-0.5, breadth_pct=40, regime=-1),
        cutoff,
    )
    assert long["side_return_atr"] > 0
    assert short["side_return_atr"] > 0
    assert long["breadth_side"] > 0
    assert short["breadth_side"] > 0
    assert all(math.isfinite(value) for value in long.values())


def test_less_than_thirty_completed_sessions_is_rejected():
    bars = history().iloc[:29]
    with pytest.raises(ValueError, match="insufficient_history"):
        build_feature_row(
            {
                "side": "LONG",
                "price_change_pct": 1,
                "oi_change_pct": 2,
                "volume": 1000,
                "delivery_change_pct": 1,
            },
            bars,
            context(),
            bars.index[-1].date(),
        )


def test_validation_rejects_wrong_order_and_non_finite_values():
    valid = {name: 0.0 for name in FEATURE_SCHEMA_V1}
    assert validate_feature_row(valid) == (True, [])

    reordered = dict(reversed(list(valid.items())))
    reordered[FEATURE_SCHEMA_V1[-1]] = float("nan")
    ok, reasons = validate_feature_row(reordered)
    assert ok is False
    assert reasons == ["feature_schema_mismatch", "non_finite_feature"]
