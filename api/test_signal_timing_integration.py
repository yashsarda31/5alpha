"""Timing -> publication -> paper book boundary regression tests."""
import json
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from api import main
from api.test_signal_timing import candidate


@pytest.fixture
def isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "AUTH_DB_PATH", str(tmp_path / "timing.db"))
    monkeypatch.setattr(main, "_blob_token", lambda: "")
    monkeypatch.setattr(main, "_blob_pull_db", lambda **kw: True)
    monkeypatch.setattr(main, "_blob_push_db", lambda: True)
    monkeypatch.setattr(main, "_market_today", lambda market: "2026-09-04")
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "")
    return main


def process(plans, minute=0, status="fresh", market_open=True):
    stamp = f"2026-09-04T04:{minute:02d}:00+00:00"
    return main._process_india_timing(plans, {"status": status, "required_inputs_complete": True},
                                     stamp, stamp, market_open, 100000, 1, 1)


def test_forming_does_not_enter_but_later_trigger_does(isolated):
    result = process([candidate()])
    assert result["plans"] == []
    assert result["watchlist"][0]["lifecycle"] == "forming"
    conn = main._auth_db()
    assert conn.execute("SELECT count(*) FROM signal_positions").fetchone()[0] == 0
    conn.close()
    result = process([candidate(price=100.1)], 1)
    assert result["plans"][0]["lifecycle"] == "triggered"
    conn = main._auth_db()
    assert conn.execute("SELECT count(*) FROM signal_positions").fetchone()[0] == 1
    features = [json.loads(row[0]) for row in conn.execute("SELECT features_json FROM signal_events")]
    assert {f["lifecycle"] for f in features} == {"forming", "triggered"}
    assert features[-1]["baseline_first_entry"] == 99.9
    conn.close()


def test_extended_cannot_enter_and_open_levels_are_preserved(isolated):
    process([candidate()])
    result = process([candidate(price=101)], 1)
    assert not result["plans"]
    assert result["watchlist"][0]["lifecycle"] == "extended"
    conn = main._auth_db()
    assert main._enter_signal_positions(conn, result["watchlist"], "IN") == 0
    conn.close()


def test_first_triggered_timed_batch_sends_to_existing_subscriber(isolated, monkeypatch):
    monkeypatch.setattr(main, "VAPID_PUBLIC_KEY", "pub")
    monkeypatch.setattr(main, "VAPID_PRIVATE_KEY", "priv")
    sent = []
    monkeypatch.setattr(main, "_push_send_one", lambda sub, payload: sent.append(json.loads(payload)))
    conn = main._auth_db()
    conn.execute("INSERT INTO push_subs VALUES ('https://push.example/test',1,'key','auth','2026-09-01')")
    conn.commit()
    conn.close()
    process([candidate()])
    assert sent == []
    process([candidate(price=100.1)], 1)
    assert len(sent) == 1
    result = process([candidate(price=101)], 2)
    assert len(sent) == 1
    assert result["plans"][0]["levels_locked"]
    assert result["plans"][0]["entry"] == 100.1
    assert result["plans"][0]["detected_at"] is None
    assert result["watchlist"] == []


def test_failed_persistence_prevents_publication_and_push(isolated, monkeypatch):
    process([candidate()])
    monkeypatch.setattr(main, "_blob_push_db", lambda: False)
    with pytest.raises(RuntimeError, match="persisted"):
        process([candidate(price=100.1)], 1)


def test_closed_snapshot_never_creates_an_anchor_or_trade(isolated):
    result = process([candidate()], market_open=False)
    assert result["plans"] == []
    conn = main._auth_db()
    assert conn.execute("SELECT count(*) FROM signal_timing_state").fetchone()[0] == 0
    conn.close()


def test_signal_responses_never_use_stale_edge_cache(monkeypatch):
    async def response(**kwargs):
        return {"market_open": False}
    # Use a separate small FastAPI route to exercise the actual middleware.
    app = main.FastAPI()
    app.middleware("http")(main._edge_cache_headers)
    app.get("/api/signals")(response)
    res = TestClient(app).get("/api/signals?kwargs=test")
    assert res.headers["cache-control"] == "private, no-store"
    assert main.SIGNALS_CACHE_TTL == 30


def test_provider_limited_cannot_publish_even_when_coverage_flag_true():
    p = candidate()
    p.update(lifecycle="triggered", actionable=True)
    published, _, _ = main._apply_signal_quality_gate([p], data_status={
        "required_inputs_complete": True, "status": "provider_limited"})
    assert published == []


def test_india_endpoint_uses_oldest_required_source_and_rejects_delayed_price(isolated, monkeypatch):
    now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    current = now.strftime("%d-%b-%Y %H:%M:%S")
    old = (now - timedelta(minutes=10)).strftime("%d-%b-%Y %H:%M:%S")
    main.API_CACHE.clear()
    monkeypatch.setattr(main, "_signals_market_open", lambda: (True, "live"))
    monkeypatch.setattr(main, "_signals_live", lambda mkt: True)
    monkeypatch.setattr(main, "_expected_signal_session", lambda *args: now.date().isoformat())
    monkeypatch.setattr(main, "_yf_daily_closes", lambda *args: [100 + i for i in range(260)])
    monkeypatch.setattr(main, "fetch_signal_chain_summary", lambda *args: None)
    monkeypatch.setattr(main, "fetch_signal_buildups", lambda: ({}, current))
    monkeypatch.setattr(main, "_ensure_delivery_fresh", lambda *args: None)
    monkeypatch.setattr(main, "_delivery_signals", lambda: {})
    monkeypatch.setattr(main, "score_signal_plans", lambda *args, **kwargs: ([candidate()], "bull"))
    def provider(path, **kwargs):
        if "liveEquity" in path:
            return {"data": [], "timestamp": old}
        if "underlyings" in path:
            return {"data": [], "timestamp": current}
        return {"data": []}
    monkeypatch.setattr(main, "nse_get", provider)
    response = asyncio.run(main.get_market_signals(market="IN"))
    assert response["data_status"]["status"] == "stale"
    assert "intraday_source_delayed" in response["data_status"]["warnings"]
    assert response["setups"]["plans"] == []
    assert response["timing"]["source_age_seconds"] >= 600
    main.API_CACHE.clear()


def test_production_schedule_runs_each_minute_and_cron_rejects_wrong_secret(monkeypatch):
    config = json.loads((Path(__file__).resolve().parents[1] / "vercel.json").read_text())
    assert {"path": "/api/signals/run/IN", "schedule": "* 3-10 * * 1-5"} in config["crons"]
    monkeypatch.setenv("CRON_SECRET", "test-only-secret")
    with pytest.raises(main.HTTPException) as error:
        asyncio.run(main.run_signal_generation(market="IN", authorization="Bearer wrong"))
    assert error.value.status_code == 403


def test_portfolio_does_not_cache_unpersisted_resolution(isolated, monkeypatch):
    main.API_CACHE.clear()
    main._pf_healed = False
    main._last_pf_resolve = 0
    conn = main._auth_db()
    conn.execute("INSERT INTO signal_positions (market,symbol,side,entry,stop,target,entry_date,status) "
                 "VALUES ('IN','ABC','LONG',100,99,102,'2026-09-01','open')")
    conn.commit()
    conn.close()
    monkeypatch.setattr(main, "_heal_intraday_closures", lambda conn: 0)
    monkeypatch.setattr(main, "_resolve_signal_positions",
                        lambda conn: conn.execute("UPDATE signal_positions SET status='win'").rowcount)
    monkeypatch.setattr(main, "_blob_push_db",
                        lambda: (_ for _ in ()).throw(main.HTTPException(503, "conflict")))
    with pytest.raises(main.HTTPException):
        asyncio.run(main.get_signal_portfolio("IN"))
    assert "signal_portfolio_IN" not in main.API_CACHE
    assert main._pf_healed is False
    assert main._last_pf_resolve == 0


def test_throttled_portfolio_read_does_not_postpone_next_resolution(isolated, monkeypatch):
    main.API_CACHE.clear()
    main._pf_healed = True
    main._last_pf_resolve = main.time.time() - 100
    prior = main._last_pf_resolve
    calls = []
    monkeypatch.setattr(main, "_resolve_signal_positions", lambda conn: calls.append(1) or 0)
    asyncio.run(main.get_signal_portfolio("IN"))
    assert calls == []
    assert main._last_pf_resolve == prior
