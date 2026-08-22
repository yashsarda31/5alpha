import pandas as pd
import pytest

from api.signal_model.features import FEATURE_SCHEMA_V1
from api.signal_model.validation import (
    estimate_probability_of_backtest_overfit,
    evaluate_release_gate,
    run_locked_validation,
)


def predictions(wins=40, total=100):
    labels = [0] * total
    for index in range(wins):
        position = (index % 5) * 20 + index // 5
        labels[position] = 1
    return pd.DataFrame(
        {
            "probability": [0.40] * total,
            "label": labels,
            "net_return_pct": [2.0 if value else -1.0 for value in labels],
            "rr_net": [2.0] * total,
            "period": [f"p{i // 20}" for i in range(total)],
            "symbol": [f"S{i % 25}" for i in range(total)],
            "sector": [f"SEC{i % 5}" for i in range(total)],
        }
    )


def test_gate_accepts_exact_minimum_when_stability_and_baseline_pass():
    report = evaluate_release_gate(predictions(), baseline_win_rate=0.35, threshold=0.40)
    assert report["approved"] is True
    assert report["metrics"]["trades"] == 100
    assert report["metrics"]["win_rate"] == 0.40


def test_gate_rejects_39_percent_wins():
    report = evaluate_release_gate(predictions(wins=39), baseline_win_rate=0.35, threshold=0.40)
    assert report["approved"] is False
    assert "win_rate_below_40pct" in report["failures"]


def test_gate_rejects_fewer_than_100_or_sub_one_rr():
    assert evaluate_release_gate(predictions(total=99, wins=60), 0.35, threshold=0.40)["approved"] is False
    frame = predictions()
    frame.loc[0, "rr_net"] = 1.99
    assert "rr_below_two" in evaluate_release_gate(frame, 0.35, threshold=0.40)["failures"]


def test_gate_rejects_probability_calibration_error_above_ten_points():
    frame = predictions()
    frame["probability"] = 0.55
    assert "calibration_error_above_10pct" in evaluate_release_gate(frame, 0.35, threshold=0.40)[
        "failures"
    ]


def test_gate_rejects_non_positive_expectancy_and_weak_baseline_delta():
    frame = predictions()
    frame["net_return_pct"] = [0.1 if value else -10 for value in frame.label]
    failures = evaluate_release_gate(frame, baseline_win_rate=0.41, threshold=0.40)["failures"]
    assert "non_positive_expectancy" in failures
    assert "did_not_beat_baseline" in failures


def test_gate_rejects_unstable_periods():
    frame = predictions()
    frame["label"] = [1] * 20 + [1] * 20 + [0] * 60
    frame["net_return_pct"] = frame.label.map({1: 2.0, 0: -1.0})
    assert "unstable_period_win_rate" in evaluate_release_gate(frame, 0.35, threshold=0.40)["failures"]


def test_gate_rejects_symbol_and_sector_concentration():
    frame = predictions()
    frame.loc[:15, "symbol"] = "CROWDED"
    frame.loc[:35, "sector"] = "CROWDED_SECTOR"
    failures = evaluate_release_gate(frame, 0.35, threshold=0.40)["failures"]
    assert "symbol_concentration_above_15pct" in failures
    assert "sector_concentration_above_35pct" in failures


def test_threshold_below_forty_percent_is_forbidden():
    with pytest.raises(ValueError, match="threshold_below_0.40"):
        evaluate_release_gate(predictions(), 0.35, threshold=0.39)


def test_pbo_diagnostic_is_bounded():
    configurations = pd.DataFrame(
        {
            "cfg_a": [1, -1, 1, -1, 1, -1, 1, -1],
            "cfg_b": [1, 1, -1, -1, 1, 1, -1, -1],
            "cfg_c": [-1, 1, -1, 1, -1, 1, -1, 1],
        }
    )
    value = estimate_probability_of_backtest_overfit(configurations)
    assert 0.0 <= value <= 1.0


def test_short_dataset_returns_a_failed_report_without_an_artifact():
    frame = pd.DataFrame(
        {
            "candidate_id": ["IN|2026-08-01|ABC|LONG"],
            "session_date": ["2026-08-01"],
            "eligible": [1],
            "label": [1],
            "net_return_pct": [1.0],
            "rr_net": [2.0],
            "symbol": ["ABC"],
            **{name: [0.0] for name in FEATURE_SCHEMA_V1},
        }
    )
    result = run_locked_validation(frame, "IN", "signals-v3-test")
    assert result.report["release"]["approved"] is False
    assert "coverage_below_36_months" in result.report["release"]["failures"]
    assert result.artifact is None
