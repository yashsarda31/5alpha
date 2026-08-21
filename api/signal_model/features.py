import math
from datetime import date
from typing import Mapping

import pandas as pd

FEATURE_SCHEMA_V1 = (
    "side_return_atr",
    "oi_change_percentile",
    "volume_percentile",
    "close_location",
    "rsi14_side",
    "distance_sma20_atr",
    "relative_strength_index",
    "relative_strength_sector",
    "delivery_side",
    "breadth_side",
    "vix_percentile",
    "regime_alignment",
)

REQUIRED_HISTORY_COLUMNS = ("open", "high", "low", "close", "volume", "oi")


def _percentile_last(series: pd.Series) -> float:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if clean.empty:
        return float("nan")
    return float((clean <= clean.iloc[-1]).mean())


def _wilder_atr(frame: pd.DataFrame, periods: int = 14) -> pd.Series:
    previous = frame.close.shift(1)
    true_range = pd.concat(
        [
            frame.high - frame.low,
            (frame.high - previous).abs(),
            (frame.low - previous).abs(),
        ],
        axis=1,
    ).max(axis=1)
    return true_range.ewm(alpha=1 / periods, adjust=False).mean()


def _rsi(close: pd.Series, periods: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / periods, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / periods, adjust=False).mean()
    relative_strength = gain / loss.replace(0, 1e-12)
    return 100 - 100 / (1 + relative_strength)


def _feature_values(
    candidate: Mapping[str, float | str],
    frame: pd.DataFrame,
    context: Mapping[str, float],
    direction: float,
) -> dict[str, float]:
    atr = float(_wilder_atr(frame).iloc[-1])
    close = float(frame.close.iloc[-1])
    if not math.isfinite(atr) or atr <= 0 or not math.isfinite(close) or close <= 0:
        raise ValueError("invalid_history")

    atr_pct = atr / close * 100.0
    oi_change = frame.oi.pct_change().replace([float("inf"), float("-inf")], pd.NA)
    current_oi_change = float(candidate["oi_change_pct"]) / 100.0
    oi_history = pd.concat(
        [oi_change.tail(59).reset_index(drop=True), pd.Series([current_oi_change])],
        ignore_index=True,
    )
    volume_history = pd.concat(
        [frame.volume.tail(59).reset_index(drop=True), pd.Series([float(candidate["volume"])])],
        ignore_index=True,
    )

    day_range = max(float(frame.high.iloc[-1] - frame.low.iloc[-1]), 1e-12)
    location = float((frame.close.iloc[-1] - frame.low.iloc[-1]) / day_range)
    rsi = float(_rsi(frame.close).iloc[-1])
    sma20 = float(frame.close.tail(20).mean())
    price_change_pct = float(candidate["price_change_pct"])

    return {
        "side_return_atr": direction * price_change_pct / atr_pct,
        "oi_change_percentile": _percentile_last(oi_history),
        "volume_percentile": _percentile_last(volume_history),
        "close_location": location if direction > 0 else 1.0 - location,
        "rsi14_side": direction * (rsi - 50.0) / 50.0,
        "distance_sma20_atr": direction * (close - sma20) / atr,
        "relative_strength_index": direction
        * (price_change_pct - float(context["index_return_pct"])),
        "relative_strength_sector": direction
        * (price_change_pct - float(context["sector_return_pct"])),
        "delivery_side": direction * float(candidate["delivery_change_pct"]),
        "breadth_side": direction * (float(context["breadth_pct"]) - 50.0) / 50.0,
        "vix_percentile": float(context["vix_percentile"]),
        "regime_alignment": direction * float(context["regime"]),
    }


def build_feature_row(
    candidate_row: Mapping[str, float | str],
    history: pd.DataFrame,
    context: Mapping[str, float],
    session_date: date,
) -> dict[str, float]:
    """Build the frozen feature vector from information known by session close."""
    missing_columns = [name for name in REQUIRED_HISTORY_COLUMNS if name not in history]
    if missing_columns:
        raise ValueError("missing_history_columns")
    if candidate_row.get("side") not in ("LONG", "SHORT"):
        raise ValueError("invalid_side")

    frame = history.copy()
    frame.index = pd.to_datetime(frame.index)
    frame = frame.sort_index()
    eligible = frame.loc[frame.index.date <= session_date].copy()
    if len(eligible) < 30:
        raise ValueError("insufficient_history")
    eligible.loc[:, REQUIRED_HISTORY_COLUMNS] = eligible.loc[:, REQUIRED_HISTORY_COLUMNS].apply(
        pd.to_numeric, errors="coerce"
    )
    if eligible.loc[:, REQUIRED_HISTORY_COLUMNS].iloc[-30:].isna().any().any():
        raise ValueError("invalid_history")

    direction = 1.0 if candidate_row["side"] == "LONG" else -1.0
    values = _feature_values(candidate_row, eligible, context, direction)
    result = {name: float(values[name]) for name in FEATURE_SCHEMA_V1}
    ok, reasons = validate_feature_row(result)
    if not ok:
        raise ValueError(reasons[0])
    return result


def validate_feature_row(features: Mapping[str, float]) -> tuple[bool, list[str]]:
    reasons: list[str] = []
    if tuple(features) != FEATURE_SCHEMA_V1:
        reasons.append("feature_schema_mismatch")
    try:
        finite = all(math.isfinite(float(value)) for value in features.values())
    except (TypeError, ValueError):
        finite = False
    if not finite:
        reasons.append("non_finite_feature")
    return not reasons, reasons
