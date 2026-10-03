from api import main
from datetime import datetime, timedelta, timezone


PLAN = {
    "symbol": "TEST",
    "side": "LONG",
    "score": 80,
    "coverage_pct": 100,
}


def test_holiday_weekend_expects_thursday_session():
    now = datetime(2026, 10, 3, 12, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    assert main._expected_signal_session(False, "weekend", now) == "2026-10-01"


def test_preopen_after_holiday_weekend_expects_thursday_session():
    now = datetime(2026, 10, 5, 8, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    assert main._expected_signal_session(False, "pre-open", now) == "2026-10-01"


def test_india_holiday_is_closed_and_preserves_last_session():
    now = datetime(2026, 10, 2, 12, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    assert main._is_indian_market_open(now) is False
    assert main._expected_signal_session(False, "holiday", now) == "2026-10-01"


def test_delivery_publish_date_skips_the_holiday_weekend():
    now = datetime(2026, 10, 3, 12, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    assert main._delivery_expected_day(now).isoformat() == "2026-10-01"


def test_signal_market_clock_holiday_and_close_boundary():
    zone = timezone(timedelta(hours=5, minutes=30))
    assert main._signals_market_open(datetime(2026, 10, 2, 12, tzinfo=zone)) == (False, "holiday")
    assert main._signals_market_open(datetime(2026, 10, 5, 15, 30, tzinfo=zone)) == (False, "after-hours")


def test_us_session_does_not_use_indian_holidays(monkeypatch):
    monkeypatch.setattr(main, "_ny_now", lambda: datetime(2026, 10, 3, 12))
    assert main._signal_expected_session("US", False, "US weekend") == "2026-10-02"


def test_regular_session_still_rejects_older_evidence():
    now = datetime(2026, 10, 5, 12, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    expected = main._expected_signal_session(True, "live", now)
    assert expected == "2026-10-05"
    status = main.build_signal_data_status(True, "live", "2026-10-01T15:40:00+05:30",
        ["NSE"], {"price": True, "open_interest": True}, "2026-10-01", expected)
    assert status["status"] == "stale"


def test_weekend_latest_session_is_valid_last_session():
    status = main.build_signal_data_status(
        market_open=False,
        market_note="weekend",
        observed_at="2026-08-28T15:40:07+05:30",
        sources=["NSE"],
        required={"price": True, "open_interest": True},
        latest_completed_session="2026-08-28",
        expected_latest_session="2026-08-28",
    )
    assert status["status"] == "last_session"
    assert status["required_inputs_complete"] is True


def test_missing_required_input_rejects_every_plan():
    status = {
        "status": "provider_limited",
        "required_inputs_complete": False,
        "warnings": ["open_interest_unavailable"],
    }
    published, rejected, quality = main._apply_signal_quality_gate(
        [PLAN], data_status=status
    )
    assert published == []
    assert rejected[0]["rejection_reasons"] == ["inputs_incomplete"]
    assert quality["rejection_counts"] == {"inputs_incomplete": 1}


def test_stale_session_rejects_every_plan():
    status = {
        "status": "stale",
        "required_inputs_complete": True,
        "warnings": ["latest_completed_session_missing"],
    }
    published, rejected, quality = main._apply_signal_quality_gate(
        [PLAN], data_status=status
    )
    assert published == []
    assert rejected[0]["rejection_reasons"] == ["stale_inputs"]
    assert quality["rejection_counts"] == {"stale_inputs": 1}


def test_missing_observation_timestamp_is_provider_limited():
    status = main.build_signal_data_status(
        market_open=True,
        market_note="live",
        observed_at=None,
        sources=["NSE"],
        required={"price": True, "open_interest": True},
        latest_completed_session="2026-08-29",
        expected_latest_session="2026-08-29",
    )
    assert status["status"] == "provider_limited"
    assert status["warnings"] == ["observation_timestamp_unavailable"]
