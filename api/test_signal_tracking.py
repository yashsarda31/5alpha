"""Model portfolio: FCFS entry, target/stop resolution, and track-record stats."""
import os
import tempfile
from datetime import datetime, timedelta

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import pandas as pd
import main
from fastapi.testclient import TestClient

client = TestClient(main.app)
IST = main._IST


def _reset():
    conn = main._auth_db()
    conn.execute("DELETE FROM signal_positions")
    conn.commit()
    return conn


def _plan(sym, side="LONG", entry=100.0, stop=95.0, target=110.0, score=70, kind="futures"):
    return {"symbol": sym, "side": side, "entry": entry, "stop": stop,
            "target": target, "score": score, "kind": kind}


# ---- entry / FCFS -----------------------------------------------------------

def test_entry_fcfs_caps_at_ten_slots():
    conn = _reset()
    plans = [_plan(f"S{i}", score=i) for i in range(15)]  # 15 candidates
    added = main._enter_signal_positions(conn, plans, "IN")
    conn.commit()
    assert added == 10  # only 10 slots
    openc = conn.execute("SELECT COUNT(*) FROM signal_positions WHERE status='open'").fetchone()[0]
    assert openc == 10
    # highest scores win the scarce slots
    syms = {r["symbol"] for r in conn.execute("SELECT symbol FROM signal_positions")}
    assert "S14" in syms and "S5" in syms and "S4" not in syms
    conn.close()


def test_entry_dedupes_open_symbol():
    conn = _reset()
    main._enter_signal_positions(conn, [_plan("AAA")], "IN")
    conn.commit()
    added = main._enter_signal_positions(conn, [_plan("AAA", entry=200)], "IN")
    conn.commit()
    assert added == 0
    assert conn.execute("SELECT COUNT(*) FROM signal_positions").fetchone()[0] == 1
    conn.close()


def test_entry_rejects_incoherent_levels():
    conn = _reset()
    # LONG needs stop < entry < target; this one has stop above entry
    bad = _plan("BAD", side="LONG", entry=100, stop=105, target=110)
    assert main._enter_signal_positions(conn, [bad], "IN") == 0
    # SHORT needs target < entry < stop
    good_short = _plan("SHT", side="SHORT", entry=100, stop=105, target=90)
    assert main._enter_signal_positions(conn, [good_short], "IN") == 1
    conn.close()


# ---- resolution -------------------------------------------------------------

def _fake_hist(rows):
    # rows: list of (date_str, high, low, close)
    idx = pd.to_datetime([r[0] for r in rows])
    return pd.DataFrame({"High": [r[1] for r in rows], "Low": [r[2] for r in rows],
                         "Close": [r[3] for r in rows]}, index=idx)


def _patch_yf(monkeypatch, hist):
    class _T:
        def __init__(self, *a, **k): pass
        def history(self, *a, **k): return hist
    monkeypatch.setattr(main.yf, "Ticker", lambda *a, **k: _T())


def _insert(conn, **kw):
    base = dict(market="IN", symbol="X", side="LONG", kind="futures", score=70,
                entry=100.0, stop=95.0, target=110.0,
                entry_date=(datetime.now(IST).date() - timedelta(days=2)).strftime("%Y-%m-%d"),
                status="open", last_price=100.0, updated_at=main._utc_now())
    base.update(kw)
    cols = ",".join(base)
    conn.execute(f"INSERT INTO signal_positions ({cols}) VALUES ({','.join(['?']*len(base))})",
                 tuple(base.values()))
    conn.commit()


def test_resolve_long_hits_target_is_win(monkeypatch):
    conn = _reset()
    d = (datetime.now(IST).date() - timedelta(days=1)).strftime("%Y-%m-%d")
    _insert(conn, symbol="WIN", side="LONG", entry=100, stop=95, target=110)
    _patch_yf(monkeypatch, _fake_hist([(d, 112, 99, 111)]))  # high 112 >= target 110
    assert main._resolve_signal_positions(conn) == 1
    r = conn.execute("SELECT * FROM signal_positions WHERE symbol='WIN'").fetchone()
    assert r["status"] == "win" and abs(r["ret_pct"] - 10.0) < 1e-6
    conn.close()


def test_resolve_long_hits_stop_is_loss(monkeypatch):
    conn = _reset()
    d = (datetime.now(IST).date() - timedelta(days=1)).strftime("%Y-%m-%d")
    _insert(conn, symbol="LOSS", side="LONG", entry=100, stop=95, target=110)
    _patch_yf(monkeypatch, _fake_hist([(d, 101, 94, 96)]))  # low 94 <= stop 95
    main._resolve_signal_positions(conn)
    r = conn.execute("SELECT * FROM signal_positions WHERE symbol='LOSS'").fetchone()
    assert r["status"] == "loss" and abs(r["ret_pct"] - (-5.0)) < 1e-6
    conn.close()


def test_resolve_short_hits_target_is_win(monkeypatch):
    conn = _reset()
    d = (datetime.now(IST).date() - timedelta(days=1)).strftime("%Y-%m-%d")
    _insert(conn, symbol="SW", side="SHORT", entry=100, stop=105, target=90)
    _patch_yf(monkeypatch, _fake_hist([(d, 101, 89, 91)]))  # low 89 <= target 90
    main._resolve_signal_positions(conn)
    r = conn.execute("SELECT * FROM signal_positions WHERE symbol='SW'").fetchone()
    assert r["status"] == "win" and abs(r["ret_pct"] - 10.0) < 1e-6  # short win = +10%
    conn.close()


def test_resolve_stop_first_when_bar_spans_both(monkeypatch):
    conn = _reset()
    d = (datetime.now(IST).date() - timedelta(days=1)).strftime("%Y-%m-%d")
    _insert(conn, symbol="AMB", side="LONG", entry=100, stop=95, target=110)
    _patch_yf(monkeypatch, _fake_hist([(d, 112, 94, 105)]))  # both touched → conservative loss
    main._resolve_signal_positions(conn)
    r = conn.execute("SELECT * FROM signal_positions WHERE symbol='AMB'").fetchone()
    assert r["status"] == "loss"
    conn.close()


def test_resolve_time_stop_closes_stale(monkeypatch):
    conn = _reset()
    old = (datetime.now(IST).date() - timedelta(days=40)).strftime("%Y-%m-%d")
    _insert(conn, symbol="OLD", side="LONG", entry=100, stop=95, target=110, entry_date=old)
    # never hits target/stop; last close 103 → time-stopped at +3%
    d = (datetime.now(IST).date() - timedelta(days=1)).strftime("%Y-%m-%d")
    _patch_yf(monkeypatch, _fake_hist([(d, 104, 99, 103)]))
    main._resolve_signal_positions(conn)
    r = conn.execute("SELECT * FROM signal_positions WHERE symbol='OLD'").fetchone()
    assert r["status"] == "closed" and abs(r["ret_pct"] - 3.0) < 1e-6
    conn.close()


# ---- snapshot / stats -------------------------------------------------------

def test_snapshot_stats(monkeypatch):
    _reset()
    monkeypatch.setattr(main, "_yf_quote_change", lambda s: {"last": 108.0, "change_pct": 1.0})
    rows = [
        {"market": "IN", "symbol": "W1", "side": "LONG", "kind": "f", "score": 80,
         "entry": 100, "stop": 95, "target": 110, "entry_date": "2026-06-01",
         "status": "win", "exit": 110, "exit_date": "2026-06-05", "ret_pct": 10.0, "last_price": 110},
        {"market": "IN", "symbol": "L1", "side": "LONG", "kind": "f", "score": 60,
         "entry": 100, "stop": 95, "target": 110, "entry_date": "2026-06-02",
         "status": "loss", "exit": 95, "exit_date": "2026-06-06", "ret_pct": -5.0, "last_price": 95},
        {"market": "IN", "symbol": "O1", "side": "LONG", "kind": "f", "score": 70,
         "entry": 100, "stop": 95, "target": 110, "entry_date": "2026-06-10",
         "status": "open", "exit": None, "exit_date": None, "ret_pct": None, "last_price": 100},
    ]
    snap = main._signal_portfolio_snapshot(rows)
    st = snap["stats"]
    assert st["closed"] == 2 and st["wins"] == 1 and st["losses"] == 1
    assert st["win_rate"] == 50.0
    assert abs(st["realized_pct"] - 0.5) < 1e-6      # 0.10*(10-5)
    assert st["open"] == 1
    assert abs(st["unrealized_pct"] - 0.8) < 1e-6    # open O1 marked 100->108 = +8%, *0.10
    assert len(snap["equity_curve"]) == 2
    assert snap["equity_curve"][-1]["cum_pct"] == 0.5


def test_portfolio_endpoint_shape(monkeypatch):
    _reset()
    monkeypatch.setattr(main, "_resolve_signal_positions", lambda conn: 0)
    monkeypatch.setattr(main, "_yf_quote_change", lambda s: {"last": 100.0, "change_pct": 0.0})
    main.API_CACHE.pop("signal_portfolio", None)
    r = client.get("/api/signals/portfolio")
    assert r.status_code == 200
    j = r.json()
    assert "stats" in j and "open" in j and "closed" in j and "equity_curve" in j
