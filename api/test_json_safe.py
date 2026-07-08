"""_json_safe guards the signals/focus responses against non-finite floats.

A single NaN/Inf (from a yfinance missing bar or a 0/0 ratio) otherwise makes the
stdlib JSON encoder raise 'Out of range float values are not JSON compliant' and
500s the whole /api/signals endpoint — which also powers the app-wide alert poll.
"""
import json
import math
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main


def test_replaces_non_finite_floats():
    src = {
        "a": float("nan"),
        "b": float("inf"),
        "c": float("-inf"),
        "ok": 12.5,
        "nested": [1.0, float("nan"), {"x": float("inf"), "y": "str"}],
        "tuple": (float("nan"), 3),
    }
    out = main._json_safe(src)
    assert out["a"] is None and out["b"] is None and out["c"] is None
    assert out["ok"] == 12.5
    assert out["nested"][1] is None
    assert out["nested"][2]["x"] is None and out["nested"][2]["y"] == "str"
    assert out["tuple"] == [None, 3]  # tuples become lists


def test_result_is_strict_json_serializable():
    # allow_nan=False mirrors what a strict encoder does; must not raise
    payload = main._json_safe({"vals": [float("nan"), float("inf"), 1.0], "ok": True})
    json.dumps(payload, allow_nan=False)


def test_leaves_clean_data_untouched():
    src = {"n": 1, "f": 2.5, "s": "x", "b": True, "none": None, "list": [1, 2, 3]}
    assert main._json_safe(src) == src
