"""Historical backfill: buildup classification, 1.5R levels, walk-forward sim.

All offline — F&O bhavcopy rows are synthesised, subsequent-day resolution uses
those same synthetic bars, so no network is touched.
"""
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main


def _row(sym, close, prev, hi, lo, oi, doi, trades=5000, exp="2026-07-28"):
    return {"FinInstrmTp": "STF", "TckrSymb": sym, "XpryDt": exp,
            "OpnPric": prev, "HghPric": hi, "LwPric": lo, "ClsPric": close,
            "PrvsClsgPric": prev, "OpnIntrst": oi, "ChngInOpnIntrst": doi,
            "TtlTradgVol": trades * 100, "TtlNbOfTxsExctd": trades}


def test_buildup_classification_and_levels():
    by = {
        # price up + OI up → long buildup → LONG
        "LB": _row("LB", close=110, prev=100, hi=111, lo=104, oi=1200, doi=200),
        # price down + OI up → short buildup → SHORT
        "SB": _row("SB", close=90, prev=100, hi=98, lo=89, oi=1200, doi=200),
        # price up + OI down → short covering → LONG
        "SC": _row("SC", close=105, prev=100, hi=106, lo=101, oi=800, doi=-200),
        # price down + OI down → long unwinding → NOT traded
        "LU": _row("LU", close=95, prev=100, hi=99, lo=94, oi=800, doi=-200),
        # too quiet (|px|<1) → skipped
        "Q": _row("Q", close=100.2, prev=100, hi=100.5, lo=99.8, oi=1200, doi=200),
        # illiquid → skipped
        "IL": _row("IL", close=110, prev=100, hi=111, lo=104, oi=1200, doi=200, trades=500),
    }
    plans = {p["symbol"]: p for p in main._reconstruct_signals_for_day(by)}
    assert set(plans) == {"LB", "SB", "SC"}
    assert plans["LB"]["side"] == "LONG" and plans["SB"]["side"] == "SHORT" and plans["SC"]["side"] == "LONG"
    # LONG 1.5R: stop below entry, target = entry + 1.5*(entry-stop)
    lb = plans["LB"]
    assert lb["stop"] < lb["entry"] < lb["target"]
    assert abs((lb["target"] - lb["entry"]) - 1.5 * (lb["entry"] - lb["stop"])) < 0.05
    # SHORT: target below entry < stop
    sb = plans["SB"]
    assert sb["target"] < sb["entry"] < sb["stop"]


def test_walk_forward_backfill(monkeypatch):
    # Day 1: ACE fires LONG (px+10, OI+). Day 2: ACE gaps up through its target
    # → a real WIN closed on day 2. Day 3 exists so the book can carry/close.
    d1 = {"ACE": _row("ACE", close=110, prev=100, hi=112, lo=104, oi=1200, doi=300)}
    # day2/day3 bars only need OHLC for resolution; reuse row shape
    d2 = {"ACE": _row("ACE", close=130, prev=110, hi=131, lo=125, oi=1500, doi=300)}
    d3 = {"ACE": _row("ACE", close=132, prev=130, hi=133, lo=129, oi=1500, doi=0)}

    # The fetch loop walks back from yesterday; sandbox "today" is 2026-07-09,
    # so it requests 20260708/07/06 — exactly our synthetic window.
    ymd_to_day = {"20260706": d1, "20260707": d2, "20260708": d3}
    monkeypatch.setattr(main, "_fetch_fo_bhavcopy", lambda ymd: ymd_to_day.get(ymd))

    conn = main._auth_db()
    conn.execute("DELETE FROM signal_positions")
    conn.commit()
    closed, opened = main._backfill_model_portfolio(conn, days_back=3, min_score=0)
    conn.commit()
    rows = [dict(r) for r in conn.execute("SELECT * FROM signal_positions")]
    conn.close()
    # ACE entered day1, target 130 (110 + 1.5*(110-104=6 → 9) = 123.5); day2 high 131
    # ≥ target → win. entry-day is skipped so it can't resolve on day1.
    ace = [r for r in rows if r["symbol"] == "ACE"]
    assert ace, "ACE should have been entered and resolved"
    assert ace[0]["status"] == "win" and ace[0]["ret_pct"] > 0
