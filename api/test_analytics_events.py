import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from api.analytics_events import (
    ALLOWED_EVENTS,
    aggregate_activation,
    aggregate_visitors,
    delete_device,
    ensure_schema,
    record_event,
)


ACCEPTED = {
    "event": "analyse_loaded",
    "device_id": "7d1c74ef-8da5-4a78-9eab-8f35145d172f",
    "occurred_at": "2026-08-29T04:30:00Z",
    "route": "/chart",
    "market": "IN",
}


@pytest.fixture
def conn():
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    ensure_schema(connection)
    yield connection
    connection.close()


def test_event_and_field_allowlists_are_exact(conn):
    assert ALLOWED_EVENTS == {
        "today_viewed", "analyse_loaded", "position_sizing_completed",
        "watchlist_intent_started", "watchlist_saved", "alerts_enabled",
        "return_visit", "site_visit",
    }

    record_event(conn, ACCEPTED, datetime(2026, 8, 29, 4, 30, tzinfo=timezone.utc))
    stored = dict(conn.execute("SELECT * FROM analytics_events").fetchone())
    assert set(stored) == {
        "id", "event", "device_id", "occurred_at", "route", "market", "created_at",
    }
    assert stored["event"] == "analyse_loaded"
    assert stored["route"] == "/chart"


@pytest.mark.parametrize("field", ["symbol", "query", "email", "token"])
def test_privacy_sensitive_or_unknown_fields_are_rejected(conn, field):
    with pytest.raises(ValueError, match="unknown fields"):
        record_event(conn, {**ACCEPTED, field: "private"}, datetime.now(timezone.utc))


def test_write_removes_events_older_than_ninety_days(conn):
    now = datetime(2026, 8, 29, 4, 30, tzinfo=timezone.utc)
    conn.execute(
        "INSERT INTO analytics_events(event, device_id, occurred_at, route, market, created_at) VALUES(?,?,?,?,?,?)",
        ("today_viewed", ACCEPTED["device_id"], (now - timedelta(days=91)).isoformat(), "/dashboard", "IN", now.isoformat()),
    )
    record_event(conn, ACCEPTED, now)
    rows = conn.execute("SELECT occurred_at FROM analytics_events ORDER BY id").fetchall()
    assert [row[0] for row in rows] == ["2026-08-29T04:30:00Z"]


def test_reset_deletes_only_the_requested_device(conn):
    now = datetime(2026, 8, 29, 4, 30, tzinfo=timezone.utc)
    other = "0e1334ee-e1b1-4e55-b262-9420bb550251"
    record_event(conn, ACCEPTED, now)
    record_event(conn, {**ACCEPTED, "device_id": other}, now)

    assert delete_device(conn, ACCEPTED["device_id"]) == 1
    assert [row[0] for row in conn.execute("SELECT device_id FROM analytics_events")] == [other]


def test_aggregation_reports_funnel_and_return_cohorts(conn):
    now = datetime(2026, 8, 29, 12, tzinfo=timezone.utc)
    returning = ACCEPTED["device_id"]
    same_day = "0e1334ee-e1b1-4e55-b262-9420bb550251"
    recent = "9d708c18-8202-437a-9a2a-106454a80bb9"

    def add(device, event, days_ago, route="/dashboard"):
        occurred = now - timedelta(days=days_ago)
        record_event(conn, {
            "event": event,
            "device_id": device,
            "occurred_at": occurred.isoformat(),
            "route": route,
            "market": "IN",
        }, now)

    add(returning, "today_viewed", 10)
    add(returning, "analyse_loaded", 9, "/chart")
    add(returning, "return_visit", 2)
    add(same_day, "today_viewed", 10)
    add(same_day, "analyse_loaded", 10, "/chart")
    add(recent, "today_viewed", 0)

    result = aggregate_activation(conn, now)
    assert result["funnel"]["today_viewed"] == 3
    assert result["funnel"]["analyse_loaded"] == 2
    assert result["return_cohorts"]["day_1"] == {"eligible": 2, "returned": 1, "rate_pct": 50.0}
    assert result["return_cohorts"]["day_7"] == {"eligible": 2, "returned": 1, "rate_pct": 50.0}
    assert "device_id" not in str(result)


def test_site_visit_aggregation_counts_distinct_browsers_by_ist_day(conn):
    now = datetime(2026, 9, 2, 18, 45, tzinfo=timezone.utc)  # 3 Sep, 00:15 IST
    first = "7d1c74ef-8da5-4a78-9eab-8f35145d172f"
    second = "0e1334ee-e1b1-4e55-b262-9420bb550251"
    yesterday = "9d708c18-8202-437a-9a2a-106454a80bb9"
    sixth_day = "ef06d730-4053-4c69-9297-2f91d95c46e5"

    def visit(device, occurred_at):
        record_event(conn, {
            "event": "site_visit",
            "device_id": device,
            "occurred_at": occurred_at,
            "route": "/",
            "market": "",
        }, now)

    visit(first, "2026-09-02T18:35:00Z")       # today in IST
    visit(first, "2026-09-02T18:40:00Z")       # duplicate browser/day
    visit(second, "2026-09-02T18:41:00Z")      # second browser today
    visit(yesterday, "2026-09-02T18:20:00Z")   # yesterday in IST
    visit(sixth_day, "2026-08-28T04:30:00Z")   # within trailing seven IST days
    conn.execute(
        "INSERT INTO analytics_events(event, device_id, occurred_at, route, market, created_at) VALUES(?,?,?,?,?,?)",
        ("site_visit", "27557797-d00d-4690-a5cc-d1c1bbfac012", "not-a-date", "/", "", now.isoformat()),
    )
    visit("e48322bb-3881-44c4-9d81-1c79609c702f", "2026-09-02T19:00:00Z")  # future

    result = aggregate_visitors(conn, now)

    assert result == {
        "timezone": "Asia/Kolkata",
        "today": 2,
        "yesterday": 1,
        "average_7d": 0.6,
        "unique_30d": 4,
        "tracked_since": "2026-08-28T04:30:00+00:00",
    }


def test_site_visit_aggregation_deduplicates_the_latest_thirty_ist_days(conn):
    now = datetime(2026, 9, 2, 18, 45, tzinfo=timezone.utc)  # 3 Sep, 00:15 IST
    repeat = "7d1c74ef-8da5-4a78-9eab-8f35145d172f"

    def add(device, occurred_at, event="site_visit", route="/"):
        record_event(conn, {
            "event": event,
            "device_id": device,
            "occurred_at": occurred_at,
            "route": route,
            "market": "" if event == "site_visit" else "IN",
        }, now)

    add(repeat, "2026-09-02T18:35:00Z")
    add(repeat, "2026-08-14T12:00:00Z")
    add("0e1334ee-e1b1-4e55-b262-9420bb550251", "2026-08-04T18:30:00Z")
    add("9d708c18-8202-437a-9a2a-106454a80bb9", "2026-08-04T18:29:59Z")
    add("ef06d730-4053-4c69-9297-2f91d95c46e5", "2026-09-02T18:40:00Z",
        event="analyse_loaded", route="/chart")
    add("27557797-d00d-4690-a5cc-d1c1bbfac012", "2026-09-02T19:00:00Z")

    assert aggregate_visitors(conn, now)["unique_30d"] == 2
