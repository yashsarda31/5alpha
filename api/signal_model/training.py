from __future__ import annotations

import hashlib
import json
from typing import Iterable, Iterator, Sequence

import numpy as np
import pandas as pd
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


def _session_positions(dates: pd.DatetimeIndex, sessions: pd.DatetimeIndex) -> np.ndarray:
    return np.flatnonzero(dates.isin(sessions))


def purged_walk_forward_splits(
    dates: Iterable[object],
    train_months: int = 18,
    validation_months: int = 3,
    test_months: int = 3,
    embargo_sessions: int = 5,
) -> Iterator[tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Yield chronological row indexes with a five-session outcome purge."""
    if min(train_months, validation_months, test_months) <= 0 or embargo_sessions < 0:
        raise ValueError("invalid_split_policy")
    normalized = pd.DatetimeIndex(pd.to_datetime(list(dates))).tz_localize(None)
    if len(normalized) == 0:
        return
    if not normalized.is_monotonic_increasing:
        raise ValueError("dates_not_sorted")
    sessions = pd.DatetimeIndex(normalized.unique()).sort_values()
    validation_start = sessions[0] + pd.DateOffset(months=train_months)

    while validation_start <= sessions[-1]:
        validation_end = validation_start + pd.DateOffset(months=validation_months)
        test_end = validation_end + pd.DateOffset(months=test_months)
        train_start = validation_start - pd.DateOffset(months=train_months)

        train_sessions = sessions[(sessions >= train_start) & (sessions < validation_start)]
        validation_sessions = sessions[
            (sessions >= validation_start) & (sessions < validation_end)
        ]
        test_sessions = sessions[(sessions >= validation_end) & (sessions < test_end)]
        if len(test_sessions) == 0:
            break
        if embargo_sessions:
            train_sessions = train_sessions[:-embargo_sessions]
            validation_sessions = validation_sessions[:-embargo_sessions]
        if len(train_sessions) and len(validation_sessions) and len(test_sessions):
            yield (
                _session_positions(normalized, train_sessions),
                _session_positions(normalized, validation_sessions),
                _session_positions(normalized, test_sessions),
            )
        validation_start = test_end


def split_locked_holdout(
    frame: pd.DataFrame, months: int = 6
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if months <= 0 or "session_date" not in frame:
        raise ValueError("invalid_holdout_policy")
    dates = pd.to_datetime(frame["session_date"])
    if dates.empty or dates.isna().any():
        raise ValueError("invalid_session_dates")
    final_month = dates.max().to_period("M").start_time
    holdout_start = final_month - pd.DateOffset(months=months - 1)
    development = frame.loc[dates < holdout_start].copy()
    holdout = frame.loc[dates >= holdout_start].copy()
    if development.empty or holdout.empty:
        raise ValueError("insufficient_holdout_history")
    return development, holdout


def _rounded(value: float, digits: int = 12) -> float:
    result = round(float(value), digits)
    return 0.0 if result == 0 else result


def _date_range(frame: pd.DataFrame) -> dict[str, str | None]:
    if "session_date" not in frame or frame.empty:
        return {"start": None, "end": None}
    dates = pd.to_datetime(frame["session_date"])
    return {
        "start": dates.min().date().isoformat(),
        "end": dates.max().date().isoformat(),
    }


def _validate_binary_labels(frame: pd.DataFrame, split_name: str) -> None:
    if "label" not in frame:
        raise ValueError(f"missing_label_{split_name}")
    labels = pd.to_numeric(frame["label"], errors="coerce")
    if labels.isna().any() or set(labels.unique()) - {0, 1}:
        raise ValueError(f"invalid_labels_{split_name}")
    if labels.nunique() < 2:
        raise ValueError(f"single_class_{split_name}")


def fit_calibrated_logistic(
    train: pd.DataFrame,
    validation: pd.DataFrame,
    feature_names: Sequence[str],
    regularization_c: float = 0.25,
    threshold: float = 0.40,
) -> dict:
    """Fit a deterministic logistic model and export only plain JSON values."""
    names = tuple(feature_names)
    if not names or regularization_c <= 0 or not 0 < threshold < 1:
        raise ValueError("invalid_training_policy")
    _validate_binary_labels(train, "train")
    _validate_binary_labels(validation, "validation")
    for split_name, split in (("train", train), ("validation", validation)):
        missing = [name for name in names if name not in split]
        if missing:
            raise ValueError(f"missing_features_{split_name}:{missing}")
        values = split.loc[:, list(names)].apply(pd.to_numeric, errors="coerce")
        if not np.isfinite(values.to_numpy(dtype=float)).all():
            raise ValueError(f"non_finite_features_{split_name}")

    scaler = StandardScaler().fit(train.loc[:, list(names)])
    model = LogisticRegression(
        C=regularization_c,
        l1_ratio=0,
        solver="lbfgs",
        max_iter=2000,
        random_state=48,
    )
    model.fit(scaler.transform(train.loc[:, list(names)]), train["label"])
    validation_scores = model.decision_function(
        scaler.transform(validation.loc[:, list(names)])
    )
    platt = LogisticRegression(C=1e6, solver="lbfgs", max_iter=2000, random_state=48)
    platt.fit(validation_scores.reshape(-1, 1), validation["label"])

    artifact = {
        "artifact_format": 1,
        "model_version": "signals-v3-calibrated",
        "feature_schema": list(names),
        "threshold": _rounded(threshold),
        "regularization_c": _rounded(regularization_c),
        "model": {
            "means": [_rounded(value) for value in scaler.mean_],
            "scales": [_rounded(value) for value in scaler.scale_],
            "coefficients": [_rounded(value) for value in model.coef_[0]],
            "intercept": _rounded(model.intercept_[0]),
        },
        "calibration": {
            "method": "platt",
            "coefficient": _rounded(platt.coef_[0][0]),
            "intercept": _rounded(platt.intercept_[0]),
        },
        "date_ranges": {
            "train": _date_range(train),
            "validation": _date_range(validation),
        },
        "training_library": {"scikit_learn": sklearn.__version__},
    }
    canonical = json.dumps(artifact, sort_keys=True, separators=(",", ":"))
    artifact["checksum"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return artifact


def predict_calibrated_probability(
    artifact: dict, frame: pd.DataFrame
) -> np.ndarray:
    """Score an exported artifact without deserializing estimator objects."""
    names = artifact["feature_schema"]
    values = frame.loc[:, names].to_numpy(dtype=float)
    model = artifact["model"]
    means = np.asarray(model["means"], dtype=float)
    scales = np.asarray(model["scales"], dtype=float)
    coefficients = np.asarray(model["coefficients"], dtype=float)
    standardized = (values - means) / scales
    raw_score = standardized @ coefficients + float(model["intercept"])
    calibration = artifact["calibration"]
    calibrated_score = (
        raw_score * float(calibration["coefficient"])
        + float(calibration["intercept"])
    )
    calibrated_score = np.clip(calibrated_score, -709, 709)
    return 1.0 / (1.0 + np.exp(-calibrated_score))
