"""India signal-level policy tests (no network)."""
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from main import _apply_signal_quality_gate, _tight_two_r_levels


def test_long_levels_tighten_the_old_stop_and_keep_gross_two_to_one():
    levels = _tight_two_r_levels(100.0, 104.0, 98.0, "LONG")

    old_risk = 100.0 - min(98.0, 100.0 * 0.996)
    assert levels["risk"] <= old_risk * 0.75
    assert levels["stop"] < 100.0 < levels["target"]
    assert round((levels["target"] - 100.0) / levels["risk"], 8) == 2.0


def test_short_levels_tighten_the_old_stop_and_keep_gross_two_to_one():
    levels = _tight_two_r_levels(100.0, 104.0, 98.0, "SHORT")

    old_risk = max(104.0, 100.0 * 1.004) - 100.0
    assert levels["risk"] <= old_risk * 0.75
    assert levels["target"] < 100.0 < levels["stop"]
    assert round((100.0 - levels["target"]) / levels["risk"], 8) == 2.0


def test_india_quality_gate_can_publish_every_qualified_plan():
    candidates = [
        {"symbol": f"S{i}", "score": 70, "coverage_pct": 100}
        for i in range(12)
    ]

    published, rejected, quality = _apply_signal_quality_gate(candidates, limit=None)

    assert len(published) == 12
    assert rejected == []
    assert quality["published"] == 12
    assert "rank_limit" not in quality["rejection_counts"]
