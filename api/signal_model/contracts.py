from dataclasses import dataclass
from datetime import date
from typing import Literal

Side = Literal["LONG", "SHORT"]


@dataclass(frozen=True)
class CandidateSnapshot:
    candidate_id: str
    market: str
    symbol: str
    side: Side
    kind: str
    session_date: date
    observed_at: str
    reference_entry: float
    atr14: float
    session_low: float
    session_high: float
    barrier_price: float | None
    features: dict[str, float]
    data_as_of: dict[str, str]


@dataclass(frozen=True)
class ExecutionPolicy:
    atr_multiple: float = 0.5
    target_rr_net: float = 2.0
    max_chase_r: float = 0.25
    max_hold_sessions: int = 5
    tick_size: float = 0.05


@dataclass(frozen=True)
class ExecutionPlan:
    candidate_id: str
    status: Literal["active", "expired"]
    side: Side
    entry: float | None
    stop: float | None
    target: float | None
    risk: float | None
    rr_net: float | None
    max_hold_sessions: int
    reason: str


@dataclass(frozen=True)
class SessionBar:
    session_date: date
    open: float
    high: float
    low: float
    close: float


@dataclass(frozen=True)
class Outcome:
    status: Literal["win", "loss"]
    reason: Literal["target", "stop", "time_exit"]
    exit_price: float
    exit_date: date
    gross_return_pct: float
    net_return_pct: float
