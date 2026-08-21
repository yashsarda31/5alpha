import json
import sqlite3
from datetime import datetime, timezone
from typing import Any

from .contracts import CandidateSnapshot

SCHEMA = """
CREATE TABLE IF NOT EXISTS signal_candidates_v3 (
  candidate_id TEXT PRIMARY KEY,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  kind TEXT NOT NULL,
  session_date TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  state TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  features_json TEXT NOT NULL,
  data_as_of_json TEXT NOT NULL,
  reference_entry REAL NOT NULL,
  atr14 REAL NOT NULL,
  session_low REAL NOT NULL,
  session_high REAL NOT NULL,
  barrier_price REAL,
  probability REAL,
  threshold REAL,
  model_version TEXT,
  feature_schema TEXT NOT NULL,
  rejection_reasons TEXT NOT NULL DEFAULT '[]',
  entry REAL,
  stop REAL,
  target REAL,
  rr_net REAL,
  activation_date TEXT,
  expiry_date TEXT,
  exit REAL,
  exit_date TEXT,
  net_return_pct REAL,
  outcome TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sigv3_market_state
ON signal_candidates_v3(market, state, session_date);
CREATE INDEX IF NOT EXISTS idx_sigv3_model
ON signal_candidates_v3(market, model_version, session_date);

CREATE TABLE IF NOT EXISTS signal_model_state (
  market TEXT PRIMARY KEY,
  model_version TEXT,
  mode TEXT NOT NULL DEFAULT 'off',
  paused INTEGER NOT NULL DEFAULT 0,
  pause_reason TEXT,
  updated_at TEXT NOT NULL
);
"""

FEATURE_SCHEMA_VERSION = "features-v1"

_TRANSITION_COLUMNS = {
    "rejection_reasons",
    "probability",
    "threshold",
    "model_version",
    "entry",
    "stop",
    "target",
    "rr_net",
    "activation_date",
    "expiry_date",
    "exit",
    "exit_date",
    "net_return_pct",
    "outcome",
}


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def append_candidate(
    conn: sqlite3.Connection,
    candidate: CandidateSnapshot,
    raw_inputs: dict[str, Any],
    state: str = "candidate",
    source: str = "historical_replay",
) -> bool:
    """Insert once; later observations with the same ID cannot rewrite evidence."""
    now = datetime.now(timezone.utc).isoformat()
    values = (
        candidate.candidate_id,
        candidate.market,
        candidate.symbol,
        candidate.side,
        candidate.kind,
        candidate.session_date.isoformat(),
        candidate.observed_at,
        state,
        _json(raw_inputs),
        _json(candidate.features),
        _json(candidate.data_as_of),
        candidate.reference_entry,
        candidate.atr14,
        candidate.session_low,
        candidate.session_high,
        candidate.barrier_price,
        FEATURE_SCHEMA_VERSION,
        source,
        now,
        now,
    )
    sql = """INSERT OR IGNORE INTO signal_candidates_v3
      (candidate_id,market,symbol,side,kind,session_date,observed_at,state,
       raw_json,features_json,data_as_of_json,reference_entry,atr14,session_low,
       session_high,barrier_price,feature_schema,source,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"""
    return conn.execute(sql, values).rowcount == 1


def transition_candidate(
    conn: sqlite3.Connection,
    candidate_id: str,
    from_state: str,
    to_state: str,
    **fields: Any,
) -> bool:
    """Update lifecycle fields only when the caller has the expected state."""
    unknown = set(fields) - _TRANSITION_COLUMNS
    if unknown:
        raise ValueError(f"unsupported_transition_fields:{sorted(unknown)}")
    normalized = {
        key: (_json(value) if key == "rejection_reasons" else value)
        for key, value in fields.items()
    }
    normalized["state"] = to_state
    normalized["updated_at"] = datetime.now(timezone.utc).isoformat()
    assignments = ",".join(f"{key}=?" for key in normalized)
    values = [*normalized.values(), candidate_id, from_state]
    sql = (
        f"UPDATE signal_candidates_v3 SET {assignments} "
        "WHERE candidate_id=? AND state=?"
    )
    return conn.execute(sql, values).rowcount == 1


def list_current_model_rows(
    conn: sqlite3.Connection, market: str, model_version: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT * FROM signal_candidates_v3
           WHERE market=? AND model_version=?
           ORDER BY session_date, candidate_id""",
        (market, model_version),
    ).fetchall()
    result: list[dict[str, Any]] = []
    for raw_row in rows:
        row = dict(raw_row)
        row["raw_inputs"] = json.loads(row["raw_json"])
        row["features"] = json.loads(row["features_json"])
        row["data_as_of"] = json.loads(row["data_as_of_json"])
        row["rejection_reasons"] = json.loads(row["rejection_reasons"])
        result.append(row)
    return result
