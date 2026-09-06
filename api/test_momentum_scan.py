import json

import numpy as np
import pandas as pd
import pytest

from api.momentum_scan import scan_momentum


def history(values, end="2026-09-04"):
    c = np.array(values, dtype=float)
    return pd.DataFrame({"Open": c, "High": c + 1, "Low": c - 1, "Close": c,
                         "Volume": 1000.0}, index=pd.bdate_range(end=end, periods=len(c)))


def scan(**histories):
    return scan_momentum(pd.concat(histories, axis=1), list(histories), "in")


def test_breakdown_uses_prior_low_excludes_current_low_and_uses_widest_full_window():
    h = history([100] * 252 + [90])
    result = scan(DOWN=h)
    row = result["breakdowns"][0]
    assert row["type"] == "52W LOW"
    assert row["level"] == 99
    assert row["margin"] == 9.09
    assert row["chg_today"] == -10
    assert result["breakouts"] == []


@pytest.mark.parametrize("count,label", [(21, "20D LOW"), (63, "20D LOW"), (64, "3M LOW"), (252, "3M LOW"), (253, "52W LOW")])
def test_full_lookback_required(count, label):
    row = scan(DOWN=history([100] * (count - 1) + [90]))["breakdowns"][0]
    assert row["type"] == label


def test_touching_support_or_intraday_wick_does_not_count_as_breakdown():
    h = history([100] * 252 + [99])
    h.iloc[-1, h.columns.get_loc("Low")] = 80
    assert scan(TOUCH=h)["breakdowns"] == []


def test_return_windows_and_relative_ranking_include_weak_names():
    result = scan(UP=history(np.linspace(100, 200, 253)),
                  FLAT=history([100] * 253), DOWN=history(np.linspace(200, 100, 253)))
    rows = {r["ticker"]: r for r in result["ranked"]}
    assert rows["UP"]["mom_12m"] == 100
    assert rows["DOWN"]["mom_12m"] == -50
    assert rows["UP"]["rs_percentile"] == 100
    assert rows["FLAT"]["rs_percentile"] == 50
    assert rows["DOWN"]["rs_percentile"] == 0
    assert [r["ticker"] for r in result["low_rs"]] == ["DOWN"]


def test_ties_have_identical_rs_and_single_stock_has_no_relative_rank():
    result = scan(A=history([100] * 253), B=history([100] * 253))
    assert [r["rs_percentile"] for r in result["ranked"]] == [50, 50]
    assert result["low_rs"] == []
    assert scan(A=history([100] * 253))["ranked"][0]["rs_percentile"] is None


def test_old_histories_do_not_enter_session_moves_or_rs_comparison():
    result = scan(OLD=history([100] * 252 + [80], end="2026-09-03"),
                  NEW=history([100] * 253))
    assert result["session_date"] == "2026-09-04"
    assert result["scanned"] == 1
    assert result["excluded_count"] == 1
    assert result["breakdowns"] == []
    assert [r["ticker"] for r in result["ranked"]] == ["NEW"]


def test_short_histories_can_break_but_cannot_get_full_year_rs():
    result = scan(NEW=history([100] * 30 + [110]))
    assert result["ranked"] == []
    assert result["breakouts"][0]["type"] == "20D HIGH"
    assert result["breakouts"][0]["rs_percentile"] is None


def test_invalid_prices_excluded_and_missing_volume_stays_missing():
    bad = history([100] * 253)
    bad.iloc[-1, bad.columns.get_loc("Close")] = np.nan
    good = history([100] * 252 + [90])
    good.iloc[-1, good.columns.get_loc("Volume")] = np.nan
    result = scan(BAD=bad, GOOD=good)
    assert result["scanned"] == 1
    assert result["breakdowns"][0]["vol_ratio"] is None
    json.dumps(result, allow_nan=False)


def test_volume_baseline_excludes_current_session():
    h = history([100] * 252 + [90])
    h.iloc[-1, h.columns.get_loc("Volume")] = 2000
    assert scan(DOWN=h)["breakdowns"][0]["vol_ratio"] == 2


def test_empty_provider_result_reports_no_coverage():
    result = scan_momentum(pd.DataFrame(), ["MISSING"], "in")
    assert result["scanned"] == 0
    assert result["session_date"] is None
    assert result["excluded_count"] == 1
