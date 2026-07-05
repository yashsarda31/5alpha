import os
import tempfile
import uuid
from datetime import date, timedelta

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def _new_user():
    email = f"user_{uuid.uuid4().hex[:10]}@test.local"
    r = client.post("/api/auth/signup", json={"email": email, "password": "secret123", "displayName": f"U{email[:6]}"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}, r.json()["user"]["uid"]


def _unlock(monkeypatch, qdate=None):
    """Force a fixed, unlocked question date so submit is always allowed."""
    qdate = qdate or "2026-07-06"  # a Monday
    monkeypatch.setattr(main, "_active_question_date", lambda now=None: (qdate, False))
    return qdate


def _lock(monkeypatch, qdate="2026-07-06"):
    monkeypatch.setattr(main, "_active_question_date", lambda now=None: (qdate, True))
    return qdate


def test_today_shape_and_auth():
    assert client.get("/api/predict/today").status_code == 401
    h, _ = _new_user()
    body = client.get("/api/predict/today", headers=h).json()
    assert body["symbol"] == "NIFTY 50"
    assert "locked" in body and body["your_choice"] is None


def test_submit_and_readback(monkeypatch):
    qdate = _unlock(monkeypatch)
    h, _ = _new_user()
    r = client.post("/api/predict", json={"choice": "up"}, headers=h)
    assert r.status_code == 200 and r.json()["choice"] == "UP"
    # upsert overwrites
    client.post("/api/predict", json={"choice": "DOWN"}, headers=h)
    assert client.get("/api/predict/today", headers=h).json()["your_choice"] == "DOWN"


def test_invalid_choice_and_lock(monkeypatch):
    _unlock(monkeypatch)
    h, _ = _new_user()
    assert client.post("/api/predict", json={"choice": "MAYBE"}, headers=h).status_code == 400
    _lock(monkeypatch)
    assert client.post("/api/predict", json={"choice": "UP"}, headers=h).status_code == 423


def test_resolve_correct_increments_streak(monkeypatch):
    qdate = _unlock(monkeypatch, "2026-06-01")
    h, _ = _new_user()
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    # stub the market outcome and resolve that specific day
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("UP", 0.5) if qd == qdate else None)
    conn = main._auth_db()
    try:
        assert main._resolve_day(conn, qdate) == "resolved"
        conn.commit()
    finally:
        conn.close()
    me = client.get("/api/predict/me", headers=h).json()
    assert me["current_streak"] == 1 and me["correct_calls"] == 1 and me["total_calls"] == 1


def test_wrong_call_resets_streak(monkeypatch):
    d1, d2 = "2026-06-03", "2026-06-04"
    h, _ = _new_user()
    # day 1 correct
    _unlock(monkeypatch, d1)
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("UP", 0.5))
    conn = main._auth_db(); main._resolve_day(conn, d1); conn.commit(); conn.close()
    # day 2 wrong
    _unlock(monkeypatch, d2)
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("DOWN", -0.5))
    conn = main._auth_db(); main._resolve_day(conn, d2); conn.commit(); conn.close()
    me = client.get("/api/predict/me", headers=h).json()
    assert me["current_streak"] == 0 and me["longest_streak"] == 1 and me["total_calls"] == 2


def test_missed_day_resets_nonparticipant(monkeypatch):
    d1, d2 = "2026-06-08", "2026-06-09"
    h, _ = _new_user()
    _unlock(monkeypatch, d1)
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("UP", 0.5))
    conn = main._auth_db(); main._resolve_day(conn, d1); conn.commit(); conn.close()
    assert client.get("/api/predict/me", headers=h).json()["current_streak"] == 1
    # day 2: user does NOT predict; resolving day 2 must reset their streak
    conn = main._auth_db()
    conn.execute("INSERT OR IGNORE INTO daily_questions (qdate, symbol) VALUES (?, 'NIFTY 50')", (d2,))
    conn.commit()
    main._resolve_day(conn, d2); conn.commit(); conn.close()
    assert client.get("/api/predict/me", headers=h).json()["current_streak"] == 0


def test_holiday_no_data_leaves_streak(monkeypatch):
    d1, hol = "2026-06-15", "2026-06-16"
    h, _ = _new_user()
    _unlock(monkeypatch, d1)
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("UP", 0.5) if qd == d1 else None)
    conn = main._auth_db(); main._resolve_day(conn, d1); conn.commit(); conn.close()
    # holiday day has no data -> resolve is a no-op, streak intact
    conn = main._auth_db()
    conn.execute("INSERT OR IGNORE INTO daily_questions (qdate, symbol) VALUES (?, 'NIFTY 50')", (hol,))
    conn.commit()
    assert main._resolve_day(conn, hol) == "no-data"
    conn.commit(); conn.close()
    assert client.get("/api/predict/me", headers=h).json()["current_streak"] == 1


def test_resolve_idempotent(monkeypatch):
    d1 = "2026-06-22"
    h, _ = _new_user()
    _unlock(monkeypatch, d1)
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("UP", 0.5))
    conn = main._auth_db()
    assert main._resolve_day(conn, d1) == "resolved"
    assert main._resolve_day(conn, d1) == "already"  # second run is a no-op
    conn.commit(); conn.close()
    assert client.get("/api/predict/me", headers=h).json()["total_calls"] == 1


def test_leaderboard_streak_and_hide(monkeypatch):
    d1 = "2026-06-29"
    h, uid = _new_user()
    _unlock(monkeypatch, d1)
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("UP", 0.5))
    conn = main._auth_db(); main._resolve_day(conn, d1); conn.commit(); conn.close()
    board = client.get("/api/leaderboard?board=streak", headers=h).json()
    assert any(e["is_you"] and e["current_streak"] >= 1 for e in board["top"])
    # opt out -> removed from board
    client.post("/api/predict/hide", json={"hidden": True}, headers=h)
    board2 = client.get("/api/leaderboard?board=streak", headers=h).json()
    assert not any(e["is_you"] for e in board2["top"])
    assert board2["you"] is None


def test_accuracy_min_sample(monkeypatch):
    h, _ = _new_user()
    # 1 correct call: below the 20-call gate -> not on the accuracy board
    d1 = "2026-05-04"
    _unlock(monkeypatch, d1)
    client.post("/api/predict", json={"choice": "UP"}, headers=h)
    monkeypatch.setattr(main, "_nifty_outcome_for_date", lambda qd: ("UP", 0.5))
    conn = main._auth_db(); main._resolve_day(conn, d1); conn.commit(); conn.close()
    board = client.get("/api/leaderboard?board=accuracy", headers=h).json()
    assert not any(e["is_you"] for e in board["top"])
    assert board["you"] is None  # below min sample -> no own-rank either
