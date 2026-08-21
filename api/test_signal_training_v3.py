import json

import numpy as np
import pandas as pd
import pytest

from api.signal_model.training import (
    fit_calibrated_logistic,
    predict_calibrated_probability,
    purged_walk_forward_splits,
    split_locked_holdout,
)


def synthetic_frame():
    rng = np.random.default_rng(48)
    x1 = rng.normal(size=400)
    x2 = rng.normal(size=400)
    probability = 1 / (1 + np.exp(-(0.8 * x1 - 0.4 * x2)))
    return pd.DataFrame(
        {
            "x1": x1,
            "x2": x2,
            "label": (rng.random(400) < probability).astype(int),
            "session_date": pd.bdate_range("2024-01-02", periods=400),
        }
    )


def test_splits_have_five_session_purge_and_embargo():
    dates = pd.bdate_range("2022-01-03", "2025-12-31")
    splits = list(purged_walk_forward_splits(dates))
    assert splits
    for train, validation, test in splits:
        assert dates[validation[0]] - dates[train[-1]] >= pd.Timedelta(days=7)
        assert dates[test[0]] - dates[validation[-1]] >= pd.Timedelta(days=7)
        assert max(train) < min(validation) < min(test)


def test_final_six_months_are_locked_out_of_development():
    frame = pd.DataFrame(
        {"session_date": pd.bdate_range("2023-01-02", "2025-12-31")}
    )
    development, holdout = split_locked_holdout(frame, months=6)
    assert development.session_date.max() < holdout.session_date.min()
    assert holdout.session_date.min() >= pd.Timestamp("2025-07-01")


def test_exported_artifact_is_json_only_deterministic_and_scoreable():
    frame = synthetic_frame()
    artifact_a = fit_calibrated_logistic(
        frame.iloc[:300], frame.iloc[300:400], ("x1", "x2")
    )
    artifact_b = fit_calibrated_logistic(
        frame.iloc[:300], frame.iloc[300:400], ("x1", "x2")
    )
    assert artifact_a == artifact_b
    assert set(artifact_a["model"]) == {
        "means",
        "scales",
        "coefficients",
        "intercept",
    }
    assert set(artifact_a["calibration"]) == {"coefficient", "intercept", "method"}
    encoded = json.dumps(artifact_a, sort_keys=True)
    assert "pickle" not in encoded.lower()
    assert len(artifact_a["checksum"]) == 64

    probabilities = predict_calibrated_probability(artifact_a, frame.iloc[300:305])
    assert len(probabilities) == 5
    assert np.all((probabilities >= 0) & (probabilities <= 1))


def test_single_class_training_or_calibration_is_rejected():
    frame = synthetic_frame()
    one_class = frame.iloc[:50].assign(label=1)
    with pytest.raises(ValueError, match="single_class_train"):
        fit_calibrated_logistic(one_class, frame.iloc[300:], ("x1", "x2"))
    with pytest.raises(ValueError, match="single_class_validation"):
        fit_calibrated_logistic(frame.iloc[:300], one_class, ("x1", "x2"))
