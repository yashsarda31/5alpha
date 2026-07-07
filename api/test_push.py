import os
import tempfile
import uuid

# Isolate the DB before main is imported (shares the auth DB/tables).
os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)

SUB = {
    "endpoint": "https://fcm.googleapis.com/fcm/send/test-endpoint-1",
    "keys": {"p256dh": "BFakeP256dhKey", "auth": "FakeAuth"},
}


def _new_user():
    email = f"user_{uuid.uuid4().hex[:10]}@test.local"
    r = client.post("/api/auth/signup", json={"email": email, "password": "secret123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_vapid_endpoint_503_when_unconfigured(monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "")
    assert client.get("/api/push/vapid").status_code == 503


def test_vapid_endpoint_returns_key(monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "BTestPublicKey")
    r = client.get("/api/push/vapid")
    assert r.status_code == 200
    assert r.json()["key"] == "BTestPublicKey"


def test_subscribe_requires_auth():
    assert client.post("/api/push/subscribe", json=SUB).status_code == 401


def test_subscribe_validates_shape():
    h = _new_user()
    bad = {"endpoint": "notaurl", "keys": {"p256dh": "x", "auth": "y"}}
    assert client.post("/api/push/subscribe", json=bad, headers=h).status_code == 400
    bad2 = {"endpoint": "https://x.example/e", "keys": {}}
    assert client.post("/api/push/subscribe", json=bad2, headers=h).status_code == 400


def test_subscribe_unsubscribe_roundtrip():
    h = _new_user()
    ep = f"https://fcm.googleapis.com/fcm/send/{uuid.uuid4().hex}"
    sub = {"endpoint": ep, "keys": {"p256dh": "BKey", "auth": "AKey"}}
    assert client.post("/api/push/subscribe", json=sub, headers=h).status_code == 200
    # idempotent upsert
    assert client.post("/api/push/subscribe", json=sub, headers=h).status_code == 200
    conn = main._auth_db()
    rows = conn.execute("SELECT * FROM push_subs WHERE endpoint = ?", (ep,)).fetchall()
    conn.close()
    assert len(rows) == 1

    assert client.post("/api/push/unsubscribe", json={"endpoint": ep}, headers=h).status_code == 200
    conn = main._auth_db()
    rows = conn.execute("SELECT * FROM push_subs WHERE endpoint = ?", (ep,)).fetchall()
    conn.close()
    assert rows == []


def _plan(sym, side="LONG", score=70, kind="long_buildup"):
    return {"symbol": sym, "side": side, "score": score, "kind": kind,
            "entry": 100.0, "stop": 95.0, "target": 107.5}


def test_broadcast_seeds_first_call_then_sends(monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setattr(main, "VAPID_PRIVATE_KEY", "priv")

    sent = []
    monkeypatch.setattr(main, "_push_send_one", lambda s, payload: sent.append(payload) or None)

    # a subscriber must exist for sends to happen
    h = _new_user()
    ep = f"https://push.example/{uuid.uuid4().hex}"
    client.post("/api/push/subscribe",
                json={"endpoint": ep, "keys": {"p256dh": "BKey", "auth": "AKey"}}, headers=h)

    mkt = f"T{uuid.uuid4().hex[:6]}"  # unique market key isolates this test's claims

    # First compute of the day: seeds silently — no blast of the whole list
    main._broadcast_new_plans([_plan("AAA"), _plan("BBB")], mkt, "₹")
    assert sent == []

    # Same plans again: already claimed, nothing new
    main._broadcast_new_plans([_plan("AAA"), _plan("BBB")], mkt, "₹")
    assert sent == []

    # A genuinely fresh plan appears: THIS one is pushed
    main._broadcast_new_plans([_plan("AAA"), _plan("BBB"), _plan("CCC", score=88)], mkt, "₹")
    assert len(sent) == 1
    assert "CCC" in sent[0] and "88/100" in sent[0]


def test_push_test_requires_auth(monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setattr(main, "VAPID_PRIVATE_KEY", "priv")
    assert client.post("/api/push/test").status_code == 401


def test_push_test_own_devices(monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setattr(main, "VAPID_PRIVATE_KEY", "priv")
    h = _new_user()

    # no devices yet → informative zero response, no send attempted
    r = client.post("/api/push/test", headers=h)
    assert r.status_code == 200
    assert r.json()["subs"] == 0

    ep = f"https://push.example/{uuid.uuid4().hex}"
    client.post("/api/push/subscribe",
                json={"endpoint": ep, "keys": {"p256dh": "BKey", "auth": "AKey"}}, headers=h)
    sent = []
    monkeypatch.setattr(main, "_push_send_status", lambda s, p: sent.append(p) or "ok")
    r = client.post("/api/push/test", headers=h)
    assert r.status_code == 200
    assert r.json()["subs"] == 1 and r.json()["sent"] == 1
    assert len(sent) == 1 and "test notification" in sent[0]
    client.post("/api/push/unsubscribe", json={"endpoint": ep}, headers=h)


def test_push_test_all_requires_admin_key(monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setattr(main, "VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setattr(main, "ADMIN_METRICS_KEY", "sekrit")
    assert client.post("/api/push/test?all=1&key=wrong").status_code == 403
    monkeypatch.setattr(main, "_push_send_status", lambda s, p: "ok")
    r = client.post("/api/push/test?all=1&key=sekrit")
    assert r.status_code == 200


def test_broadcast_noop_without_keys(monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "")
    monkeypatch.setattr(main, "VAPID_PRIVATE_KEY", "")
    called = []
    monkeypatch.setattr(main, "_push_send_one", lambda s, p: called.append(1))
    main._broadcast_new_plans([_plan("ZZZ")], "TNOKEYS", "₹")
    assert called == []
