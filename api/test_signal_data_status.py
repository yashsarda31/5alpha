from api import main


PLAN = {
    "symbol": "TEST",
    "side": "LONG",
    "score": 80,
    "coverage_pct": 100,
}


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
