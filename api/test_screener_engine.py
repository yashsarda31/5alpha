from datetime import datetime, timezone
from types import SimpleNamespace
import time

import numpy as np
import pandas as pd
import pytest

from api.screener_engine import completed_history, evaluate_history, run_scan


def history(values, end="2026-09-04", volume=None):
    values = np.asarray(values, dtype=float)
    return pd.DataFrame({"Close": values, "High": values + 1,
                         "Volume": np.ones(len(values)) * 100 if volume is None else volume},
                        index=pd.bdate_range(end=end, periods=len(values)))


def test_below_and_cross_use_each_sessions_own_average():
    h = history([100] * 200 + [90])
    row = evaluate_history(h, None, {"price_trend": "crossed_below_200"})
    assert row["status"] == "match"
    assert row["metrics"]["sma200"] == pytest.approx(99.95)
    assert evaluate_history(history([100] * 201), None, {"price_trend": "below_200"})["status"] == "no_match"
    assert evaluate_history(history([100] * 199), None, {"price_trend": "below_200"})["status"] == "incomplete"


def test_rs_strict_new_high_and_leading_price():
    h = history([100] * 252 + [99])
    b = history([100] * 252 + [90])
    row = evaluate_history(h, b, {"rs_screen": "leading_price", "rs_lookback": 252})
    assert row["status"] == "match"
    assert row["metrics"]["rsNewHigh"] is True
    assert evaluate_history(history([100] * 253), history([100] * 253), {"rs_screen": "new_high"})["status"] == "no_match"


def test_rs_does_not_hide_missing_or_stale_sessions():
    h = history(np.linspace(100, 200, 253))
    b = history([100] * 253)
    assert evaluate_history(h.iloc[:-1], b, {"rs_screen": "new_high"})["status"] == "incomplete"
    assert evaluate_history(h.drop(h.index[-10]), b, {"rs_screen": "new_high"})["status"] == "incomplete"
    assert evaluate_history(h, None, {"rs_screen": "new_high"})["status"] == "incomplete"


def test_breakout_excludes_current_high_and_volume_from_baseline():
    h = history([100] * 20 + [103], volume=[100] * 20 + [151])
    assert evaluate_history(h, None, {"volume_breakout": True})["status"] == "match"
    h.iloc[-1, h.columns.get_loc("Volume")] = 150
    assert evaluate_history(h, None, {"volume_breakout": True})["status"] == "no_match"


def test_strong_trend_and_invalid_required_values():
    h = history(np.linspace(50, 200, 253))
    assert evaluate_history(h, None, {"price_trend": "strong_trend"})["status"] == "match"
    h.iloc[-20, h.columns.get_loc("Close")] = np.nan
    assert evaluate_history(h, None, {"price_trend": "strong_trend"})["status"] == "incomplete"


def test_completed_session_cutoffs_respect_exchange_timezone():
    h = history([100, 120], end="2026-09-04")
    early = datetime(2026, 9, 4, 9, 0, tzinfo=timezone.utc)
    assert len(completed_history(h, "TCS.NS", early)) == 1
    late = datetime(2026, 9, 4, 11, 0, tzinfo=timezone.utc)
    assert len(completed_history(h, "TCS.NS", late)) == 2
    assert len(completed_history(h, "AAPL", late)) == 1


def request(**changes):
    return SimpleNamespace(**{"price_trend": None, "rs_screen": None, "rs_lookback": 252,
                              "benchmark": "^NSEI", "volume_breakout": False,
                              "max_pe": None, "min_pe": None, "min_div_yield": None,
                              "min_roe": None, "min_eps_growth": None,
                              "min_momentum": None, "min_alpha_score": None, **changes})


NOW = datetime(2026, 9, 5, tzinfo=timezone.utc)


def test_coverage_distinguishes_missing_fundamentals_from_non_matches():
    def loader(ticker, fundamentals):
        pe = {"GOOD.NS": 10, "EXPENSIVE.NS": 50, "MISSING.NS": None}[ticker]
        return history([100] * 253), {"trailingPE": pe}
    result = run_scan(request(max_pe=20), ["GOOD.NS", "EXPENSIVE.NS", "MISSING.NS"],
                      lambda *a, **kw: 60, loader=loader, now=NOW)
    assert [x["ticker"] for x in result["data"]] == ["GOOD.NS"]
    assert result["matched"] == result["non_matches"] == result["incomplete_count"] == 1
    assert result["scanned"] == 2
    assert result["requested"] == 3


def test_scan_deadline_does_not_wait_for_slow_workers():
    def loader(ticker, fundamentals):
        time.sleep(0.3)
        return history([100] * 253), {}
    start = time.monotonic()
    result = run_scan(request(price_trend="below_200"), ["TCS.NS"], lambda *a, **kw: 60,
                      loader=loader, now=NOW, time_budget=0.02)
    assert time.monotonic() - start < 0.2
    assert result["incomplete_count"] == 1
    assert result["truncated"] is True


def test_stale_and_provider_errors_are_incomplete():
    def loader(ticker, fundamentals):
        if ticker == "ERROR.NS":
            raise RuntimeError("provider error")
        return history([100] * 253, end="2026-08-01"), {}
    result = run_scan(request(price_trend="below_200"), ["OLD.NS", "ERROR.NS"],
                      lambda *a, **kw: 60, loader=loader, now=NOW)
    assert result["incomplete_count"] == 2
    assert result["non_matches"] == 0
