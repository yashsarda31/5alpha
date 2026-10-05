import asyncio
from datetime import datetime, timezone
import pandas as pd
import pytest

from api.fundamentals_cache import FundamentalsCache
from api.fundamentals_gateway import supplement_annual_statements

NOW = datetime(2026, 10, 5, tzinfo=timezone.utc)

def statements():
    dates = pd.to_datetime(['2025-03-31', '2026-03-31'])
    income = pd.DataFrame([[10, 30], [20, 40]], index=['NetIncomeCommonStockholders', 'NetIncome'], columns=dates)
    balance = pd.DataFrame([[100, 140], [200, 300], [60, 80], [30, 40]], index=['CommonStockEquity', 'TotalAssets', 'CurrentAssets', 'CurrentLiabilities'], columns=dates)
    cash = pd.DataFrame([[10, -20]], index=['FreeCashFlow'], columns=dates)
    return income, balance, cash

def test_missing_fields_recover_from_comparable_annual_statements_with_provenance():
    source = {'ticker':'TEST.NS', 'returnOnEquity':None, 'dataQuality':{}}
    result = supplement_annual_statements(source, *statements(), now=NOW)
    assert result['returnOnEquity'] == 25
    assert result['returnOnAssets'] == 16
    assert result['currentRatio'] == 2
    assert result['freeCashflow'] == -20
    assert result['dataQuality']['fieldPeriods']['returnOnEquity'] == '2026-03-31'
    assert 'returnOnEquity' not in result['dataQuality']['missingFields']
    assert source['returnOnEquity'] is None

@pytest.mark.parametrize('kind', ['stale', 'future', 'quarterly', 'negative_equity', 'mismatched_income', 'duplicate'])
def test_no_roe_when_statements_are_incomparable(kind):
    income, balance, cash = statements()
    if kind == 'stale':
        income.columns = balance.columns = cash.columns = pd.to_datetime(['2021-03-31', '2022-03-31'])
    if kind == 'future':
        income.columns = balance.columns = cash.columns = pd.to_datetime(['2027-03-31', '2028-03-31'])
    if kind == 'quarterly':
        income.columns = balance.columns = cash.columns = pd.to_datetime(['2026-03-31', '2026-06-30'])
    if kind == 'negative_equity': balance.loc['CommonStockEquity'] = -100
    if kind == 'mismatched_income': income.columns += pd.Timedelta(days=1)
    if kind == 'duplicate': balance.columns = [balance.columns[-1]] * 2
    result = supplement_annual_statements({'returnOnEquity':None}, income, balance, cash, now=NOW)
    assert result.get('returnOnEquity') is None

def test_existing_provider_zero_and_negative_values_are_preserved():
    payload = {'returnOnEquity':0, 'returnOnAssets':-2, 'currentRatio':0, 'freeCashflow':0}
    result = supplement_annual_statements(payload, *statements(), now=NOW)
    assert all(result[field] == value for field, value in payload.items())
    assert not result['dataQuality'].get('derivedFields')

def test_cache_combines_requests_and_returns_independent_snapshots():
    async def run():
        cache = FundamentalsCache()
        calls = []
        async def loader():
            calls.append(1)
            await asyncio.sleep(.01)
            return {'ticker':'TEST.NS', 'dataQuality':{'missingFields':['pegRatio']}}
        rows = await asyncio.gather(*(cache.get('TEST.NS', loader) for _ in range(6)))
        rows[0]['dataQuality']['missingFields'].clear()
        assert len(calls) == 1
        assert (await cache.get('TEST.NS', loader))['dataQuality']['missingFields'] == ['pegRatio']
        cache.values['TEST.NS'] = (0, {})
        await cache.get('TEST.NS', loader)
        assert len(calls) == 2
    asyncio.run(run())

def test_failures_and_timeouts_are_not_cached():
    async def run():
        cache = FundamentalsCache(timeout=.02)
        async def fail(): raise ValueError('provider failed')
        with pytest.raises(ValueError): await cache.get('BAD', fail)
        async def slow(): await asyncio.sleep(1)
        with pytest.raises(asyncio.TimeoutError): await cache.get('SLOW', slow)
        assert not cache.values and not cache.pending
        async def good(): return {'ticker':'BAD'}
        assert await cache.get('BAD', good) == {'ticker':'BAD'}
    asyncio.run(run())

def test_disconnected_waiter_does_not_cancel_shared_work_and_cache_is_bounded():
    async def run():
        cache = FundamentalsCache(limit=1)
        async def loader():
            await asyncio.sleep(.02)
            return {'ticker':'A'}
        waiter = asyncio.create_task(cache.get('A', loader))
        await asyncio.sleep(.001)
        waiter.cancel()
        with pytest.raises(asyncio.CancelledError): await waiter
        assert await cache.get('A', loader) == {'ticker':'A'}
        await cache.get('B', loader)
        assert list(cache.values) == ['B']
    asyncio.run(run())

def test_endpoint_fallback_recovers_missing_fields_and_caches_normalized_symbol(monkeypatch):
    from api import main
    income, balance, cash = statements()
    class Stock:
        def get_income_stmt(self, pretty=False): return income
        def get_balance_sheet(self, pretty=False): return balance
        def get_cashflow(self, pretty=False): return cash
    calls = []
    def missing_openbb(_): raise ModuleNotFoundError('openbb absent')
    def resolve(symbol):
        calls.append(symbol)
        return symbol, Stock(), {'currentPrice':100, 'marketCap':1000, 'currency':'INR'}
    monkeypatch.setattr(main, 'fetch_openbb_fundamentals', missing_openbb)
    monkeypatch.setattr(main, '_yf_resolve_info', resolve)
    monkeypatch.setattr(main, '_FUNDAMENTALS_CACHE', FundamentalsCache())
    async def run():
        first = await main.get_fundamentals('test.ns')
        second = await main.get_fundamentals('TEST.NS')
        assert first == second
        assert first['currentRatio'] == 2
        assert first['dataQuality']['fieldPeriods']['returnOnEquity'] == '2026-03-31'
        assert calls == ['TEST.NS']
    asyncio.run(run())

def test_provider_failure_returns_retryable_status_and_invalid_symbol_is_rejected(monkeypatch):
    from api import main
    from fastapi import HTTPException
    def missing_openbb(_): raise ModuleNotFoundError('not installed')
    monkeypatch.setattr(main, 'fetch_openbb_fundamentals', missing_openbb)
    monkeypatch.setattr(main, '_yf_resolve_info', lambda symbol: (symbol, None, {}))
    monkeypatch.setattr(main, '_FUNDAMENTALS_CACHE', FundamentalsCache())
    with pytest.raises(HTTPException) as failure: asyncio.run(main.get_fundamentals('BAD.NS'))
    assert failure.value.status_code == 503
    with pytest.raises(HTTPException) as invalid: asyncio.run(main.get_fundamentals('BAD/../'))
    assert invalid.value.status_code == 400
