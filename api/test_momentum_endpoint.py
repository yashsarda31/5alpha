import asyncio

import pandas as pd
import pytest
from fastapi import HTTPException

from api import main
from api.test_momentum_scan import history


@pytest.fixture(autouse=True)
def cache(monkeypatch):
    monkeypatch.setattr(main, "API_CACHE", {})


def test_endpoint_returns_weakness_and_preserves_legacy_focus_list_fields(monkeypatch):
    frame = pd.concat({"RELIANCE.NS": history([100] * 252 + [90]),
                       "TCS.NS": history([100] * 252 + [110])}, axis=1)
    calls = []
    monkeypatch.setattr(main.yf, "download", lambda *a, **kw: calls.append(a) or frame)
    result = asyncio.run(main.get_momentum("IN"))
    assert result["market"] == "in"
    assert result["breakdowns"][0]["ticker"] == "RELIANCE.NS"
    assert result["low_rs"][0]["ticker"] == "RELIANCE.NS"
    assert {"score", "spark", "mom_1m", "price"} <= result["data"][0].keys()
    assert result["universe"] > result["scanned"] == 2
    assert asyncio.run(main.get_momentum("in")) == result
    assert len(calls) == 1


def test_provider_failure_is_an_error_not_an_empty_success(monkeypatch):
    monkeypatch.setattr(main.yf, "download", lambda *a, **kw: pd.DataFrame())
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.get_momentum("us"))
    assert error.value.status_code == 502


def test_invalid_market_is_rejected():
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.get_momentum("wrong"))
    assert error.value.status_code == 400
