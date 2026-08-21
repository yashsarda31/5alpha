from datetime import date

import pytest

from api.signal_model.costs import round_trip_cost_pct


def test_india_futures_stt_change_is_date_correct():
    before = round_trip_cost_pct("IN", date(2026, 3, 31))
    after = round_trip_cost_pct("IN", date(2026, 4, 1))
    assert round(after - before, 6) == 0.03


def test_cost_envelope_is_conservative_and_market_specific():
    assert round_trip_cost_pct("IN", date(2026, 8, 22)) >= 0.17
    assert round_trip_cost_pct("US", date(2026, 8, 22)) == 0.10


def test_unknown_market_is_rejected():
    with pytest.raises(ValueError, match="unsupported_market"):
        round_trip_cost_pct("XX", date(2026, 8, 22))
