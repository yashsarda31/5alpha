"""Block/bulk deals + insider-trade normalization and the /api/deals endpoint.

The insider direction logic is the load-bearing part: NSE's acqMode is mislabeled
on a meaningful fraction of rows, so BUY/SELL is derived from the actual change in
the person's shareholding, not the declared type/mode.
"""
import os
import tempfile

os.environ.setdefault("ALPHANOVA_DB_DIR", tempfile.mkdtemp(prefix="alphanova_test_"))

import main
from fastapi.testclient import TestClient

client = TestClient(main.app)


def test_large_deal_normalization():
    row = {"symbol": "BAYERCROP", "name": "Bayer Cropscience Ltd", "clientName": "BAYER AG",
           "buySell": "buy", "qty": "5,354,030", "watp": "4122.30", "date": "08-Jul-2026"}
    n = main._norm_large_deal(row)
    assert n["symbol"] == "BAYERCROP"
    assert n["side"] == "BUY"
    assert n["qty"] == 5354030
    assert n["price"] == 4122.30
    assert n["value"] == round(5354030 * 4122.30, 2)
    # missing client falls back to a dash, never blank
    assert main._norm_large_deal({"symbol": "X"})["client"] == "—"


def _insider_row(**kw):
    base = {"symbol": "TEST", "acqName": "A Person", "personCategory": "Promoters",
            "acqMode": "Market Purchase", "tdpTransactionType": "Buy",
            "secAcq": "1000", "secVal": "500000",
            "befAcqSharesNo": "1000", "afterAcqSharesNo": "2000", "date": "30-Apr-2026 19:23"}
    base.update(kw)
    return base


def test_insider_direction_from_holding_change():
    # Holding rose → BUY even when NSE mislabels acqMode as 'Market Sale'
    assert main._insider_direction(
        _insider_row(acqMode="Market Sale", tdpTransactionType="Buy",
                     befAcqSharesNo="1199766406", afterAcqSharesNo="1199950079")) == "BUY"
    # Holding fell → SELL
    assert main._insider_direction(
        _insider_row(befAcqSharesNo="2090050", afterAcqSharesNo="Nil")) == "SELL"
    # New acquisition from nothing → BUY
    assert main._insider_direction(
        _insider_row(befAcqSharesNo="Nil", afterAcqSharesNo="7400000")) == "BUY"


def test_insider_direction_pledges_are_not_buysell():
    assert main._insider_direction(_insider_row(
        tdpTransactionType="Pledge", acqMode="Pledge Creation",
        befAcqSharesNo="6042800", afterAcqSharesNo="1530500")) == "PLEDGE"
    assert main._insider_direction(_insider_row(
        tdpTransactionType="Pledge Revoke", acqMode="Revokation of Pledge",
        befAcqSharesNo="24650000", afterAcqSharesNo="24650000")) == "PLEDGE REVOKE"


def test_insider_direction_falls_back_to_type_when_holding_flat():
    # No net holding change and not a pledge → use declared type
    assert main._insider_direction(_insider_row(
        tdpTransactionType="Sell", befAcqSharesNo="100", afterAcqSharesNo="100")) == "SELL"


def test_deals_endpoint_shape(monkeypatch):
    large = {"as_on": "08-Jul-2026",
             "bulk": [main._norm_large_deal({"symbol": "AAA", "buySell": "BUY", "qty": "100", "watp": "10"})],
             "block": []}
    insider = [main._norm_insider(_insider_row(symbol="BBB"))]
    monkeypatch.setattr(main, "fetch_large_deals", lambda: large)
    monkeypatch.setattr(main, "fetch_insider_trades", lambda *a, **k: insider)
    main.API_CACHE.pop("deals_all", None)

    r = client.get("/api/deals")
    assert r.status_code == 200
    j = r.json()
    assert j["as_on"] == "08-Jul-2026"
    assert j["bulk"][0]["symbol"] == "AAA" and j["bulk"][0]["value"] == 1000.0
    assert j["insider"][0]["symbol"] == "BBB" and j["insider"][0]["type"] == "BUY"


def test_deals_endpoint_survives_source_failure(monkeypatch):
    # Both sources down → empty payload, not a 500
    monkeypatch.setattr(main, "fetch_large_deals", lambda: None)
    monkeypatch.setattr(main, "fetch_insider_trades", lambda *a, **k: None)
    main.API_CACHE.pop("deals_all", None)
    r = client.get("/api/deals")
    assert r.status_code == 200
    j = r.json()
    assert j["bulk"] == [] and j["block"] == [] and j["insider"] == []
