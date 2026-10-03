from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from api.stock_forecast import build_forecast

NOW = datetime(2026, 9, 25, 8, tzinfo=timezone.utc)


def history(drift=0.001, n=504):
    dates = pd.bdate_range(end="2026-09-24", periods=n)
    close = 100 * np.exp(np.arange(n) * drift + 0.018 * np.sin(np.arange(n) / 4))
    return pd.DataFrame({"Open": close, "High": close * 1.01,
                         "Low": close * 0.99, "Close": close}, index=dates)


def fundamentals(**overrides):
    return {"ticker": "TEST.NS", "returnOnEquity": 18, "trailingPE": 22,
            "earningsGrowth": 15, "trailingEps": 10, "forwardEps": 12,
            "dataQuality": {"provider": "fixture", "retrievedAt": NOW.isoformat(),
                            "currency": "INR", "statementPeriod": "2026-06-30"}, **overrides}


def report(frame=None, facts=None, news=None):
    return build_forecast("TEST.NS", history() if frame is None else frame,
                          fundamentals() if facts is None else facts, news, now=NOW)


def test_prediction_matches_historical_distribution_and_atr():
    frame = history()
    result = report(frame)
    sample = np.log(frame.Close.values[-273:][21:] / frame.Close.values[-273:][:-21])
    expected = frame.Close.iloc[-1] * np.exp(np.quantile(sample, [0.1, 0.5, 0.9]))
    assert result["status"] == "ready"
    assert result["prediction"] == round(expected[1], 2)
    assert result["range"] == {"low": round(expected[0], 2), "high": round(expected[2], 2)}
    assert result["direction"] == "bullish"
    assert result["risk_level"] < result["current_price"] < result["prediction"]
    assert result["risk_level"] == round(frame.Close.iloc[-1] - 2 * result["technicals"]["atr14"], 2)
    assert result["validation"]["windows"] >= 5
    assert result["fundamentals"]["forward_eps_change_pct"] == 20


def test_bearish_invalidation_is_above_price():
    result = report(history(-0.002))
    assert result["direction"] == "bearish"
    assert result["prediction"] < result["current_price"] < result["risk_level"]


def test_neutral_has_no_directional_risk():
    result = report(history(0))
    assert result["direction"] == "neutral"
    assert result["risk_level"] is None


@pytest.mark.parametrize("kind", ["short", "stale", "future", "nan", "zero", "duplicate", "reversed", "ohlc", "jump", "gap", "flat"])
def test_bad_prices_withhold_target(kind):
    frame = history()
    if kind == "short": frame = frame.tail(100)
    if kind == "stale": frame.index -= pd.Timedelta(days=14)
    if kind == "future": frame.index += pd.Timedelta(days=5)
    if kind == "nan": frame.iloc[-1, 3] = np.nan
    if kind == "zero": frame.iloc[-1, 3] = 0
    if kind == "duplicate": frame.index = [frame.index[0]] * len(frame)
    if kind == "reversed": frame = frame.iloc[::-1]
    if kind == "ohlc": frame.iloc[-1, 1] = 1
    if kind == "jump": frame.iloc[-1] *= 2
    if kind == "gap": frame = frame.drop(frame.index[-50:-30])
    if kind == "flat": frame.loc[:, :] = 100
    result = report(frame)
    assert result["status"] == "insufficient_data"
    assert result["prediction"] is None and result["risk_level"] is None
    assert result["warnings"]


@pytest.mark.parametrize("field,value", [("returnOnEquity", None), ("earningsGrowth", float("nan")), ("trailingPE", None), ("trailingPE", 0)])
def test_missing_core_fundamentals_withhold_prediction(field, value):
    result = report(facts=fundamentals(**{field: value}))
    assert result["status"] == "insufficient_data"
    assert result["prediction"] is None


def test_zero_and_negative_fundamentals_are_not_missing():
    result = report(facts=fundamentals(returnOnEquity=0, earningsGrowth=-10, trailingPE=-2))
    assert result["status"] == "ready"
    assert result["fundamentals"]["roe_pct"] == 0
    assert result["fundamentals"]["earnings_growth_pct"] == -10
    assert "not meaningful" in result["fundamentals"]["valuation_note"]


def test_foreign_ticker_and_stale_snapshot_are_rejected():
    for facts in [fundamentals(ticker="OTHER.NS"), fundamentals(dataQuality={"retrievedAt": "2025-01-01"})]:
        assert report(facts=facts)["prediction"] is None


def test_news_filters_unsafe_undated_future_and_old_links():
    articles = [{"title": "Results", "url": "https://example.com/results", "publishedAt": "2026-09-24T10:00:00Z", "provider": "fixture"},
                {"title": "Bad", "url": "javascript:alert(1)", "publishedAt": "2026-09-24"},
                {"title": "Old", "url": "https://example.com/old", "publishedAt": "2025-01-01"},
                {"title": "Future", "url": "https://example.com/future", "publishedAt": "2027-01-01"},
                {"title": "Undated", "url": "https://example.com/undated"}]
    result = report(news={"articles": articles})
    assert len(result["news"]) == 1
    assert result["news"][0]["title"] == "Results"


def test_roe_potential_does_not_invent_a_forecast():
    result = report()
    assert result["fundamentals"]["roe_forecast_pct"] is None
    assert "cannot be established" in result["fundamentals"]["roe_outlook"]
    assert result["sources"]["price_as_of"] == "2026-09-24"


def test_input_data_is_not_mutated():
    frame, facts = history(), fundamentals()
    original = frame.copy(deep=True)
    report(frame, facts)
    pd.testing.assert_frame_equal(frame, original)
    assert "forward_eps_change_pct" not in facts


def test_provider_labels_hide_pipeline_jargon():
    assert report()["sources"]["fundamentals"] == "fixture"
    fallback = fundamentals(
        dataQuality={"provider": "yfinance direct fallback", "retrievedAt": NOW.isoformat(),
                     "currency": "INR", "statementPeriod": "2026-06-30"})
    assert report(facts=fallback)["sources"]["fundamentals"] == "Yahoo Finance"
    aggregated = fundamentals(
        dataQuality={"provider": "OpenBB / yfinance", "retrievedAt": NOW.isoformat(),
                     "currency": "INR", "statementPeriod": "2026-06-30"})
    assert report(facts=aggregated)["sources"]["fundamentals"] == "OpenBB"
    assert report(facts=fundamentals(dataQuality={}))["sources"]["fundamentals"] == "Unavailable"


def test_dated_annual_roe_suppresses_blanket_freshness_warning():
    facts = fundamentals(
        dataQuality={"provider": "fixture", "retrievedAt": NOW.isoformat(), "currency": "INR"},
        roeEvidence={"history": [{"period": "2024-03-31", "roe_pct": 8.0},
                                 {"period": "2025-03-31", "roe_pct": 9.0}],
                     "source": "Annual statements", "method": "Annual method",
                     "used_as_snapshot": True})
    result = report(facts=facts)
    assert result["status"] == "ready"
    assert not any("reporting period unavailable" in warning for warning in result["warnings"])
    assert result["fundamentals"]["roe_basis"] == "Annual · 2025-03-31"


def test_snapshot_without_dated_evidence_keeps_freshness_warning():
    result = report(facts=fundamentals(
        dataQuality={"provider": "fixture", "retrievedAt": NOW.isoformat(), "currency": "INR"}))
    assert result["status"] == "ready"
    assert any("reporting period unavailable" in warning for warning in result["warnings"])


def test_unknown_ticker_gives_single_clear_warning():
    result = build_forecast("DEAD.NS", None, None, None, now=NOW, ticker_unknown=True)
    assert result["status"] == "insufficient_data"
    assert result["prediction"] is None
    assert result["warnings"] == [
        "Ticker 'DEAD.NS' was not found on the provider. Check the symbol and market, then retry."]


@pytest.mark.parametrize("ticker,currency,delayed", [("TEST.NS", "INR", False), ("TEST", "USD", True)])
def test_october_holiday_freshness_is_market_specific(ticker, currency, delayed):
    now = datetime(2026, 10, 3, 12, tzinfo=timezone.utc)
    frame = history()
    frame.index += pd.Timedelta(days=7)  # Last completed close: 1 October.
    facts = fundamentals(ticker=ticker, dataQuality={
        "provider": "fixture", "retrievedAt": now.isoformat(),
        "currency": currency, "statementPeriod": "2026-06-30"})
    result = build_forecast(ticker, frame, facts, now=now)
    assert result["status"] == "ready"
    assert any("provider data may be delayed" in warning for warning in result["warnings"]) is delayed
