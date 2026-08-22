from __future__ import annotations

import itertools
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

from .features import FEATURE_SCHEMA_V1
from .training import (
    fit_calibrated_logistic,
    predict_calibrated_probability,
    purged_walk_forward_splits,
    split_locked_holdout,
)

RELEASE_LIMITS = {
    "min_trades": 100,
    "min_win_rate": 0.40,
    "min_rr": 2.0,
    "min_probability": 0.40,
    "max_symbol_share": 0.15,
    "max_sector_share": 0.35,
    "max_calibration_error": 0.10,
}


def _wilson_interval(wins: int, trades: int, z: float = 1.95996398454) -> list[float]:
    if trades == 0:
        return [0.0, 0.0]
    probability = wins / trades
    denominator = 1 + z * z / trades
    center = (probability + z * z / (2 * trades)) / denominator
    margin = (
        z
        * math.sqrt(
            probability * (1 - probability) / trades + z * z / (4 * trades * trades)
        )
        / denominator
    )
    return [round(max(0.0, center - margin), 8), round(min(1.0, center + margin), 8)]


def _share(frame: pd.DataFrame, column: str) -> float:
    if frame.empty or column not in frame:
        return 0.0
    values = frame[column].fillna("UNCLASSIFIED").astype(str)
    return float(values.value_counts(normalize=True).max())


def compute_metrics(published: pd.DataFrame) -> dict[str, Any]:
    metric_columns = ["label", "probability", "net_return_pct", "rr_net"]
    if any(column not in published for column in metric_columns):
        complete = pd.DataFrame(columns=metric_columns)
    else:
        complete = published.dropna(subset=metric_columns).copy()
    trades = len(complete)
    wins = int(complete["label"].sum()) if trades else 0
    win_rate = wins / trades if trades else 0.0
    probabilities = complete["probability"].clip(1e-12, 1 - 1e-12)
    labels = complete["label"].astype(float)
    per_period: list[dict[str, Any]] = []
    if "period" in complete:
        for period, group in complete.groupby("period", sort=True):
            period_trades = len(group)
            period_wins = int(group["label"].sum())
            per_period.append(
                {
                    "period": str(period),
                    "trades": period_trades,
                    "wins": period_wins,
                    "win_rate": round(period_wins / period_trades, 8),
                    "eligible": period_trades >= 10,
                }
            )
    eligible_periods = [period for period in per_period if period["eligible"]]
    above_minimum = [
        period
        for period in eligible_periods
        if period["win_rate"] >= RELEASE_LIMITS["min_win_rate"]
    ]
    return {
        "trades": trades,
        "wins": wins,
        "losses": trades - wins,
        "win_rate": round(win_rate, 8),
        "wilson_95": _wilson_interval(wins, trades),
        "average_net_return": round(float(complete["net_return_pct"].mean()), 8)
        if trades
        else 0.0,
        "expectancy": round(float(complete["net_return_pct"].mean()), 8)
        if trades
        else 0.0,
        "brier_score": round(float(np.mean((probabilities - labels) ** 2)), 8)
        if trades
        else None,
        "log_loss": round(
            float(
                -np.mean(
                    labels * np.log(probabilities)
                    + (1 - labels) * np.log(1 - probabilities)
                )
            ),
            8,
        )
        if trades
        else None,
        "calibration_error": round(
            abs(float(probabilities.mean()) - float(labels.mean())), 8
        )
        if trades
        else 1.0,
        "minimum_rr_net": round(float(complete["rr_net"].min()), 8)
        if trades
        else None,
        "max_symbol_share": round(_share(complete, "symbol"), 8),
        "max_sector_share": round(_share(complete, "sector"), 8),
        "eligible_periods": len(eligible_periods),
        "eligible_periods_above_min_win_rate": len(above_minimum),
        "per_period": per_period,
    }


def concentration_failures(published: pd.DataFrame) -> list[str]:
    failures: list[str] = []
    if _share(published, "symbol") > RELEASE_LIMITS["max_symbol_share"]:
        failures.append("symbol_concentration_above_15pct")
    if _share(published, "sector") > RELEASE_LIMITS["max_sector_share"]:
        failures.append("sector_concentration_above_35pct")
    return failures


def evaluate_release_gate(
    predictions: pd.DataFrame, baseline_win_rate: float, threshold: float = 0.40
) -> dict[str, Any]:
    if threshold < RELEASE_LIMITS["min_probability"]:
        raise ValueError("threshold_below_0.40")
    required = {"probability", "label", "net_return_pct", "rr_net"}
    missing = sorted(required - set(predictions.columns))
    if missing:
        raise ValueError(f"missing_prediction_columns:{missing}")
    published = predictions.loc[
        (predictions.probability >= threshold) & predictions.label.notna()
    ].copy()
    metrics = compute_metrics(published)
    failures: list[str] = []
    if metrics["trades"] < RELEASE_LIMITS["min_trades"]:
        failures.append("fewer_than_100_trades")
    if metrics["win_rate"] < RELEASE_LIMITS["min_win_rate"]:
        failures.append("win_rate_below_40pct")
    if published.empty or float(published.rr_net.min()) < RELEASE_LIMITS["min_rr"]:
        failures.append("rr_below_two")
    if metrics["expectancy"] <= 0:
        failures.append("non_positive_expectancy")
    if (
        metrics["eligible_periods"] == 0
        or metrics["eligible_periods_above_min_win_rate"]
        <= metrics["eligible_periods"] / 2
    ):
        failures.append("unstable_period_win_rate")
    if metrics["win_rate"] <= baseline_win_rate:
        failures.append("did_not_beat_baseline")
    if metrics["calibration_error"] > RELEASE_LIMITS["max_calibration_error"]:
        failures.append("calibration_error_above_10pct")
    failures.extend(concentration_failures(published))
    return {
        "approved": not failures,
        "threshold": threshold,
        "baseline_win_rate": round(float(baseline_win_rate), 8),
        "metrics": metrics,
        "failures": failures,
    }


def estimate_probability_of_backtest_overfit(
    configuration_returns: pd.DataFrame,
) -> float:
    """Estimate CSCV PBO as the share of IS winners below OOS median."""
    clean = configuration_returns.apply(pd.to_numeric, errors="coerce").dropna()
    observations, configurations = clean.shape
    if observations < 4 or configurations < 2:
        return 0.0
    half = observations // 2
    outcomes: list[bool] = []
    indexes = range(observations)
    for in_sample in itertools.combinations(indexes, half):
        if 0 not in in_sample:
            continue
        out_sample = sorted(set(indexes) - set(in_sample))
        if not out_sample:
            continue
        in_performance = clean.iloc[list(in_sample)].mean(axis=0)
        best = in_performance.idxmax()
        out_performance = clean.iloc[out_sample].mean(axis=0)
        outcomes.append(float(out_performance[best]) <= float(out_performance.median()))
    return round(sum(outcomes) / len(outcomes), 8) if outcomes else 0.0


@dataclass(frozen=True)
class LockedValidationResult:
    report: dict[str, Any]
    artifact: dict[str, Any] | None


def _canonical_checksum(payload: dict[str, Any]) -> str:
    import hashlib
    import json

    clean = {key: value for key, value in payload.items() if key != "checksum"}
    encoded = json.dumps(
        clean, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _coverage_months(dates: pd.Series) -> int:
    periods = pd.to_datetime(dates).dt.to_period("M")
    if periods.empty:
        return 0
    return (periods.max().year - periods.min().year) * 12 + periods.max().month - periods.min().month + 1


def _final_train_validation_split(
    development: pd.DataFrame, calibration_months: int = 3, purge_sessions: int = 5
) -> tuple[pd.DataFrame, pd.DataFrame]:
    dates = pd.to_datetime(development["session_date"])
    final_month = dates.max().to_period("M").start_time
    validation_start = final_month - pd.DateOffset(months=calibration_months - 1)
    train = development.loc[dates < validation_start].copy()
    validation = development.loc[dates >= validation_start].copy()
    train_dates = pd.DatetimeIndex(pd.to_datetime(train["session_date"]).unique()).sort_values()
    if len(train_dates) <= purge_sessions:
        raise ValueError("insufficient_training_sessions")
    train = train.loc[~pd.to_datetime(train["session_date"]).isin(train_dates[-purge_sessions:])]
    if train.empty or validation.empty:
        raise ValueError("insufficient_train_validation_split")
    return train, validation


def _configuration_returns(development: pd.DataFrame) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    configurations = [(c_value, threshold) for c_value in (0.10, 0.25, 1.00) for threshold in (0.40, 0.45, 0.50)]
    returns: list[dict[str, float]] = []
    boundaries: list[dict[str, Any]] = []
    dates = pd.to_datetime(development["session_date"])
    for fold, (train_indexes, validation_indexes, test_indexes) in enumerate(
        purged_walk_forward_splits(dates)
    ):
        train = development.iloc[train_indexes]
        calibration = development.iloc[validation_indexes]
        test = development.iloc[test_indexes].copy()
        boundary = {
            "fold": fold,
            "train": [str(train.session_date.min()), str(train.session_date.max())],
            "validation": [
                str(calibration.session_date.min()),
                str(calibration.session_date.max()),
            ],
            "test": [str(test.session_date.min()), str(test.session_date.max())],
        }
        boundaries.append(boundary)
        fold_values: dict[str, float] = {}
        for c_value, threshold in configurations:
            name = f"C={c_value:.2f}|p={threshold:.2f}"
            try:
                artifact = fit_calibrated_logistic(
                    train,
                    calibration,
                    FEATURE_SCHEMA_V1,
                    regularization_c=c_value,
                    threshold=threshold,
                )
                probabilities = predict_calibrated_probability(artifact, test)
                selected = test.loc[probabilities >= threshold, "net_return_pct"]
                fold_values[name] = float(selected.mean()) if len(selected) else 0.0
            except ValueError:
                fold_values[name] = 0.0
        returns.append(fold_values)
    return pd.DataFrame(returns), boundaries


def _failed_result(
    market: str,
    model_version: str,
    failures: list[str],
    metadata: dict[str, Any],
) -> LockedValidationResult:
    release = {
        "approved": False,
        "threshold": RELEASE_LIMITS["min_probability"],
        "baseline_win_rate": None,
        "metrics": compute_metrics(pd.DataFrame()),
        "failures": list(dict.fromkeys(failures)),
    }
    report = {
        "report_format": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "market": market,
        "model_version": model_version,
        **metadata,
        "release": release,
    }
    return LockedValidationResult(report=report, artifact=None)


def build_input_failure_report(
    market: str,
    model_version: str,
    reason: str,
    *,
    code_commit: str | None = None,
) -> dict[str, Any]:
    return _failed_result(
        market,
        model_version,
        [f"point_in_time_inputs_unavailable:{reason}"],
        {
            "dataset": {"sha256": None, "manifest_sha256": None},
            "code_commit": code_commit,
            "feature_schema": list(FEATURE_SCHEMA_V1),
            "input_quality": {
                "rows": 0,
                "labeled_eligible_rows": 0,
                "coverage_months": 0,
                "duplicate_candidate_ids": 0,
                "sector_available": False,
            },
        },
    ).report


def run_locked_validation(
    frame: pd.DataFrame,
    market: str,
    model_version: str,
    *,
    dataset_hash: str | None = None,
    dataset_manifest_hash: str | None = None,
    code_commit: str | None = None,
) -> LockedValidationResult:
    """Fit on development data and evaluate the final six months exactly once."""
    metadata: dict[str, Any] = {
        "dataset": {
            "sha256": dataset_hash,
            "manifest_sha256": dataset_manifest_hash,
        },
        "code_commit": code_commit,
        "feature_schema": list(FEATURE_SCHEMA_V1),
    }
    required = {
        "candidate_id",
        "session_date",
        "eligible",
        "label",
        "net_return_pct",
        "rr_net",
        "symbol",
        *FEATURE_SCHEMA_V1,
    }
    missing = sorted(required - set(frame.columns))
    if missing:
        return _failed_result(
            market, model_version, [f"missing_dataset_columns:{missing}"], metadata
        )
    eligible = frame.loc[(frame.eligible == 1) & frame.label.notna()].copy()
    eligible["session_date"] = pd.to_datetime(eligible["session_date"])
    eligible = eligible.sort_values(["session_date", "candidate_id"]).reset_index(drop=True)
    input_failures: list[str] = []
    if eligible.empty:
        input_failures.append("no_labeled_candidates")
    if frame.candidate_id.duplicated().any():
        input_failures.append("duplicate_candidate_ids")
    coverage = _coverage_months(eligible.session_date) if not eligible.empty else 0
    if coverage < 36:
        input_failures.append("coverage_below_36_months")
    non_finite = not np.isfinite(
        eligible.loc[:, list(FEATURE_SCHEMA_V1)].to_numpy(dtype=float)
    ).all() if not eligible.empty else False
    if non_finite:
        input_failures.append("non_finite_features")
    sector_available = "sector" in eligible and eligible["sector"].notna().all()
    if not sector_available:
        input_failures.append("sector_data_missing")
        eligible["sector"] = "UNCLASSIFIED"
    metadata["input_quality"] = {
        "rows": int(len(frame)),
        "labeled_eligible_rows": int(len(eligible)),
        "coverage_months": coverage,
        "duplicate_candidate_ids": int(frame.candidate_id.duplicated().sum()),
        "sector_available": bool(sector_available),
    }
    if eligible.empty or non_finite:
        return _failed_result(market, model_version, input_failures, metadata)

    try:
        development, holdout = split_locked_holdout(eligible, months=6)
        train, calibration = _final_train_validation_split(development)
        artifact = fit_calibrated_logistic(
            train,
            calibration,
            FEATURE_SCHEMA_V1,
            regularization_c=0.25,
            threshold=0.40,
        )
    except ValueError as exc:
        return _failed_result(
            market, model_version, [*input_failures, f"training_failed:{exc}"], metadata
        )

    artifact["market"] = market
    artifact["model_version"] = model_version
    artifact["locked_holdout"] = {
        "start": holdout.session_date.min().date().isoformat(),
        "end": holdout.session_date.max().date().isoformat(),
    }
    artifact["checksum"] = _canonical_checksum(artifact)

    scored = holdout.copy()
    scored["probability"] = predict_calibrated_probability(artifact, scored)
    scored["period"] = scored.session_date.dt.to_period("M").astype(str)
    baseline_win_rate = float(holdout.label.mean())
    release = evaluate_release_gate(scored, baseline_win_rate, threshold=0.40)
    release["failures"] = list(dict.fromkeys([*input_failures, *release["failures"]]))
    release["approved"] = not release["failures"]

    configuration_returns, fold_boundaries = _configuration_returns(development)
    pbo = estimate_probability_of_backtest_overfit(configuration_returns)
    probabilities = scored["probability"]
    probability_distribution = {
        "min": round(float(probabilities.min()), 8),
        "p50": round(float(probabilities.quantile(0.50)), 8),
        "p90": round(float(probabilities.quantile(0.90)), 8),
        "p99": round(float(probabilities.quantile(0.99)), 8),
        "max": round(float(probabilities.max()), 8),
        "at_or_above_0_40": int((probabilities >= 0.40).sum()),
    }
    report = {
        "report_format": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "market": market,
        "model_version": model_version,
        **metadata,
        "date_ranges": {
            "development": [
                development.session_date.min().date().isoformat(),
                development.session_date.max().date().isoformat(),
            ],
            "train": [
                train.session_date.min().date().isoformat(),
                train.session_date.max().date().isoformat(),
            ],
            "calibration": [
                calibration.session_date.min().date().isoformat(),
                calibration.session_date.max().date().isoformat(),
            ],
            "locked_holdout": [
                holdout.session_date.min().date().isoformat(),
                holdout.session_date.max().date().isoformat(),
            ],
        },
        "fold_boundaries": fold_boundaries,
        "diagnostics": {
            "configuration_grid": list(configuration_returns.columns),
            "configuration_returns": configuration_returns.to_dict(orient="records"),
            "probability_of_backtest_overfit": pbo,
            "locked_holdout_probability_distribution": probability_distribution,
        },
        "artifact_checksum": artifact["checksum"],
        "release": release,
    }
    return LockedValidationResult(
        report=report, artifact=artifact if release["approved"] else None
    )
