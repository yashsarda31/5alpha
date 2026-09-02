"""Privacy-safe, first-party product activation events."""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Mapping


ALLOWED_EVENTS = {
    "today_viewed",
    "analyse_loaded",
    "position_sizing_completed",
    "watchlist_intent_started",
    "watchlist_saved",
    "alerts_enabled",
    "return_visit",
    "site_visit",
}
ALLOWED_FIELDS = {"event", "device_id", "occurred_at", "route", "market"}
ALLOWED_ROUTES = {"/", "/dashboard", "/chart", "/position-sizing", "/watchlist", "/signals"}
ALLOWED_MARKETS = {"IN", "US", ""}
RETENTION_DAYS = 90
IST = timezone(timedelta(hours=5, minutes=30))


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event TEXT NOT NULL,
            device_id TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            route TEXT NOT NULL,
            market TEXT NOT NULL,
            created_at TEXT NOT NULL
        )"""
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS analytics_event_time_idx ON analytics_events(event, occurred_at)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS analytics_device_time_idx ON analytics_events(device_id, occurred_at)"
    )
    conn.commit()


def _utc(value: datetime | str) -> datetime:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (TypeError, ValueError) as exc:
            raise ValueError("occurred_at must be an ISO timestamp") from exc
    if not isinstance(value, datetime):
        raise ValueError("timestamp must be a datetime")
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _device_id(value: str) -> str:
    try:
        parsed = uuid.UUID(str(value))
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("device_id must be a UUID") from exc
    return str(parsed)


def _validate_payload(payload: Mapping) -> dict:
    if not isinstance(payload, Mapping):
        raise ValueError("payload must be an object")
    unknown = set(payload) - ALLOWED_FIELDS
    missing = ALLOWED_FIELDS - set(payload)
    if unknown:
        raise ValueError(f"unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        raise ValueError(f"missing fields: {', '.join(sorted(missing))}")
    event = payload["event"]
    route = payload["route"]
    market = payload["market"]
    if event not in ALLOWED_EVENTS:
        raise ValueError("event is not allowlisted")
    if route not in ALLOWED_ROUTES:
        raise ValueError("route is not allowlisted")
    if market not in ALLOWED_MARKETS:
        raise ValueError("market is not allowlisted")
    _utc(payload["occurred_at"])
    return {
        "event": event,
        "device_id": _device_id(payload["device_id"]),
        "occurred_at": payload["occurred_at"],
        "route": route,
        "market": market,
    }


def record_event(conn: sqlite3.Connection, payload: Mapping, now: datetime) -> int:
    ensure_schema(conn)
    clean = _validate_payload(payload)
    current = _utc(now)
    cutoff = (current - timedelta(days=RETENTION_DAYS)).isoformat()
    conn.execute("DELETE FROM analytics_events WHERE occurred_at < ?", (cutoff,))
    cursor = conn.execute(
        """INSERT INTO analytics_events
           (event, device_id, occurred_at, route, market, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            clean["event"],
            clean["device_id"],
            clean["occurred_at"],
            clean["route"],
            clean["market"],
            current.isoformat(),
        ),
    )
    conn.commit()
    return int(cursor.lastrowid)


def delete_device(conn: sqlite3.Connection, device_id: str) -> int:
    ensure_schema(conn)
    cursor = conn.execute(
        "DELETE FROM analytics_events WHERE device_id = ?", (_device_id(device_id),)
    )
    conn.commit()
    return int(cursor.rowcount)


def _cohort(events: dict[str, list[datetime]], now: datetime, days: int) -> dict:
    eligible = returned = 0
    horizon = timedelta(days=days)
    for device_events in events.values():
        ordered = sorted(device_events)
        first = ordered[0]
        if now - first < horizon:
            continue
        eligible += 1
        if any(event_time - first >= horizon for event_time in ordered[1:]):
            returned += 1
    return {
        "eligible": eligible,
        "returned": returned,
        "rate_pct": round(returned / eligible * 100, 1) if eligible else None,
    }


def aggregate_activation(conn: sqlite3.Connection, now: datetime) -> dict:
    ensure_schema(conn)
    current = _utc(now)
    rows = conn.execute(
        "SELECT event, device_id, occurred_at FROM analytics_events"
    ).fetchall()
    funnel = {event: 0 for event in sorted(ALLOWED_EVENTS)}
    devices_by_event = {event: set() for event in ALLOWED_EVENTS}
    device_events: dict[str, list[datetime]] = {}
    for row in rows:
        event, device, occurred_at = row[0], row[1], row[2]
        if event not in ALLOWED_EVENTS:
            continue
        devices_by_event[event].add(device)
        try:
            device_events.setdefault(device, []).append(_utc(occurred_at))
        except ValueError:
            continue
    for event in ALLOWED_EVENTS:
        funnel[event] = len(devices_by_event[event])
    return {
        "funnel": funnel,
        "return_cohorts": {
            "day_1": _cohort(device_events, current, 1),
            "day_7": _cohort(device_events, current, 7),
        },
        "retention_days": RETENTION_DAYS,
    }


def aggregate_visitors(conn: sqlite3.Connection, now: datetime) -> dict:
    ensure_schema(conn)
    current = _utc(now)
    today = current.astimezone(IST).date()
    days = [today - timedelta(days=offset) for offset in range(7)]
    devices_by_day = {day: set() for day in days}
    tracked_since = None

    rows = conn.execute(
        "SELECT device_id, occurred_at FROM analytics_events WHERE event = ?",
        ("site_visit",),
    ).fetchall()
    for row in rows:
        device_id, occurred_at = row[0], row[1]
        try:
            occurred = _utc(occurred_at)
        except ValueError:
            continue
        if occurred > current:
            continue
        if tracked_since is None or occurred < tracked_since:
            tracked_since = occurred
        day = occurred.astimezone(IST).date()
        if day in devices_by_day:
            devices_by_day[day].add(device_id)

    counts = {day: len(devices) for day, devices in devices_by_day.items()}
    return {
        "timezone": "Asia/Kolkata",
        "today": counts[today],
        "yesterday": counts[today - timedelta(days=1)],
        "average_7d": round(sum(counts.values()) / 7, 1),
        "tracked_since": tracked_since.isoformat() if tracked_since else None,
    }
