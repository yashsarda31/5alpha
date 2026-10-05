"""OpenBB-backed normalization for Alpha Nova's legacy Fundamentals contract."""

from datetime import datetime, timezone
import asyncio
import concurrent.futures
import math
from copy import deepcopy


def supplement_annual_statements(payload, income, balance, cash, now=None):
    """Fill absent fields only; comparable periods and explicit annual provenance."""
    import pandas as pd
    output = deepcopy(payload)
    today = pd.Timestamp(now or datetime.now(timezone.utc)).date()
    quality = output.setdefault('dataQuality', {})

    def dates(frame, max_age=550):
        if not isinstance(frame, pd.DataFrame) or not frame.columns.is_unique or not frame.index.is_unique:
            return []
        return sorted(date for date in frame.columns if isinstance(date, pd.Timestamp)
                      and 0 < (today - date.date()).days <= max_age)

    def value(frame, row, date):
        if row not in frame.index or date not in frame.columns:
            return None
        try:
            number = float(frame.loc[row, date])
            return number if math.isfinite(number) else None
        except (TypeError, ValueError):
            return None

    def fill(field, number, date, method):
        if output.get(field) is not None or number is None or not math.isfinite(number):
            return
        output[field] = round(number, 2)
        quality.setdefault('fieldSources', {})[field] = 'Yahoo Finance annual statements'
        quality.setdefault('fieldPeriods', {})[field] = date.date().isoformat()
        quality.setdefault('fieldMethods', {})[field] = method
        quality.setdefault('derivedFields', []).append(field)

    balance_dates = dates(balance, 1100)
    if balance_dates and (today - balance_dates[-1].date()).days <= 550:
        current = balance_dates[-1]
        assets = value(balance, 'CurrentAssets', current)
        liabilities = value(balance, 'CurrentLiabilities', current)
        if assets is not None and liabilities is not None and liabilities > 0:
            fill('currentRatio', assets / liabilities, current, 'Annual current assets / current liabilities.')
        income_dates = dates(income)
        if current in income_dates and len(balance_dates) >= 2:
            previous = balance_dates[-2]
            if 320 <= (current - previous).days <= 410:
                for field, profit_row, equity_row in (
                    ('returnOnEquity', 'NetIncomeCommonStockholders', 'CommonStockEquity'),
                    ('returnOnAssets', 'NetIncome', 'TotalAssets'),
                ):
                    profit = value(income, profit_row, current)
                    begin, end = value(balance, equity_row, previous), value(balance, equity_row, current)
                    if profit is not None and begin is not None and end is not None and min(begin, end) > 0:
                        method = ('Annual net income attributable to common shareholders / average opening and closing common equity, percent.'
                                  if field == 'returnOnEquity' else 'Annual net income / average opening and closing total assets, percent.')
                        fill(field, profit / ((begin + end) / 2) * 100, current, method)
    cash_dates = dates(cash)
    if cash_dates:
        current = cash_dates[-1]
        fill('freeCashflow', value(cash, 'FreeCashFlow', current), current, 'Reported annual free cash flow.')
    quality['missingFields'] = [field for field in _LEGACY_FIELDS if output.get(field) is None]
    return output


def fetch_statement_supplement(payload, stock):
    if all(payload.get(field) is not None for field in ('returnOnEquity', 'returnOnAssets', 'currentRatio', 'freeCashflow')):
        return payload
    import pandas as pd
    datasets = {}
    calls = {'income': stock.get_income_stmt, 'balance': stock.get_balance_sheet, 'cash': stock.get_cashflow}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        pending = {executor.submit(call, pretty=False): name for name, call in calls.items()}
        for future in concurrent.futures.as_completed(pending):
            name = pending[future]
            try:
                datasets[name] = future.result()
            except Exception:
                datasets[name] = pd.DataFrame()
    return supplement_annual_statements(payload, **datasets)


_LEGACY_FIELDS = (
    "marketCap",
    "trailingPE",
    "forwardPE",
    "pegRatio",
    "priceToBook",
    "dividendYield",
    "profitMargin",
    "operatingMargin",
    "returnOnAssets",
    "returnOnEquity",
    "revenueGrowth",
    "earningsGrowth",
    "trailingEps",
    "forwardEps",
    "debtToEquity",
    "currentRatio",
    "totalCash",
    "totalDebt",
    "freeCashflow",
)


def supplement_market_cap(payload, fetch_cap):
    """Use Yahoo's separate quote metadata only for an absent market cap."""
    if payload.get("marketCap") is not None:
        return payload
    try:
        value = fetch_cap()
        if isinstance(value, bool) or value is None:
            return payload
        value = float(value)
        if not math.isfinite(value) or value <= 0:
            return payload
    except Exception:
        return payload
    payload["marketCap"] = value
    quality = payload.setdefault("dataQuality", {})
    quality.setdefault("fieldSources", {})["marketCap"] = "Yahoo Finance fast_info"
    quality["missingFields"] = [field for field in _LEGACY_FIELDS if payload.get(field) is None]
    return payload


def fetch_openbb_fundamentals(
    ticker, *, client=None, fetchers=None, retrieved_at=None
):
    datasets = {
        name: {} for name in ("profile", "metrics", "quote", "cash", "balance")
    }
    failures = {}

    if client is not None:
        calls = {
            "profile": lambda: client.equity.profile(
                symbol=ticker, provider="yfinance"
            ),
            "metrics": lambda: client.equity.fundamental.metrics(
                symbol=ticker, provider="yfinance"
            ),
            "cash": lambda: client.equity.fundamental.cash(
                symbol=ticker, provider="yfinance", period="annual", limit=1
            ),
            "balance": lambda: client.equity.fundamental.balance(
                symbol=ticker, provider="yfinance", period="annual", limit=1
            ),
        }
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(calls)) as executor:
            pending = {executor.submit(call): name for name, call in calls.items()}
            for future in concurrent.futures.as_completed(pending):
                name = pending[future]
                try:
                    datasets[name] = future.result().to_dict()
                except Exception as exc:
                    failures[name] = str(exc)
    else:
        if fetchers is None:
            from openbb_yfinance.models.balance_sheet import (
                YFinanceBalanceSheetFetcher,
            )
            from openbb_yfinance.models.cash_flow import (
                YFinanceCashFlowStatementFetcher,
            )
            from openbb_yfinance.models.equity_profile import (
                YFinanceEquityProfileFetcher,
            )
            from openbb_yfinance.models.key_metrics import (
                YFinanceKeyMetricsFetcher,
            )
            from openbb_yfinance.models.equity_quote import (
                YFinanceEquityQuoteFetcher,
            )

            fetchers = {
                "profile": YFinanceEquityProfileFetcher,
                "metrics": YFinanceKeyMetricsFetcher,
                "quote": YFinanceEquityQuoteFetcher,
                "cash": YFinanceCashFlowStatementFetcher,
                "balance": YFinanceBalanceSheetFetcher,
            }

        params = {
            "profile": {"symbol": ticker},
            "metrics": {"symbol": ticker},
            "quote": {"symbol": ticker},
            "cash": {"symbol": ticker, "period": "annual", "limit": 1},
            "balance": {"symbol": ticker, "period": "annual", "limit": 1},
        }

        async def fetch_all():
            names = list(fetchers)
            results = await asyncio.gather(
                *[
                    fetchers[name].fetch_data(params[name], {})
                    for name in names
                ],
                return_exceptions=True,
            )
            return zip(names, results)

        for name, result in asyncio.run(fetch_all()):
            if isinstance(result, Exception):
                failures[name] = str(result)
                continue
            rows = result.result if hasattr(result, "result") else result
            records = [
                row.model_dump() if hasattr(row, "model_dump") else dict(row)
                for row in (rows or [])
            ]
            if records:
                keys = set().union(*(record.keys() for record in records))
                datasets[name] = {
                    key: [record.get(key) for record in records]
                    for key in keys
                }

    if not datasets["profile"] and not datasets["metrics"]:
        detail = "; ".join(
            f"{name}: {failures[name]}" for name in ("profile", "metrics")
            if name in failures
        )
        raise RuntimeError(f"OpenBB fundamentals unavailable{': ' + detail if detail else ''}")

    warnings = [
        f"{name} unavailable: {failures[name]}"
        for name in datasets
        if name in failures
    ]
    return normalize_openbb_fundamentals(
        ticker=ticker,
        profile=datasets["profile"],
        metrics=datasets["metrics"],
        quote=datasets["quote"],
        cash=datasets["cash"],
        balance=datasets["balance"],
        retrieved_at=retrieved_at,
        warnings=warnings,
    )


def _value(columns, key):
    value = columns.get(key)
    if isinstance(value, (list, tuple)):
        value = value[0] if value else None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _rounded(value, digits=2):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return value
    return round(value, digits) if math.isfinite(value) else None


def _percent(value):
    return _rounded(value * 100) if isinstance(value, (int, float)) else None


def _quality(payload, provider, retrieved_at, currency, statement_period, warnings):
    return {
        "provider": provider,
        "retrievedAt": (retrieved_at or datetime.now(timezone.utc)).isoformat(),
        "currency": currency,
        "statementPeriod": str(statement_period) if statement_period else None,
        "missingFields": [field for field in _LEGACY_FIELDS if payload.get(field) is None],
        "warnings": list(warnings or []),
    }


def normalize_openbb_fundamentals(
    *,
    ticker,
    profile,
    metrics,
    cash,
    balance,
    quote=None,
    retrieved_at=None,
    warnings=None,
):
    quote = quote or {}
    symbol = _value(profile, "symbol") or ticker.upper()
    market_cap = _value(profile, "market_cap") or _value(metrics, "market_cap")
    shares = (
        _value(profile, "shares_outstanding")
        or _value(balance, "ordinary_shares_number")
        or _value(balance, "share_issued")
    )
    last_price = (
        market_cap / shares
        if market_cap and shares
        else _value(quote, "last_price") or _value(metrics, "last_price")
    )
    statement_period = _value(cash, "period_ending") or _value(balance, "period_ending")
    derived_fields = []

    if market_cap is None and last_price and shares:
        market_cap = last_price * shares
        derived_fields.append("marketCap")

    trailing_eps = _value(metrics, "eps_ttm")
    if trailing_eps is None and last_price and _value(metrics, "pe_ratio"):
        trailing_eps = last_price / _value(metrics, "pe_ratio")
        derived_fields.append("trailingEps")

    forward_eps = _value(metrics, "eps_forward")
    if forward_eps is None and last_price and _value(metrics, "forward_pe"):
        forward_eps = last_price / _value(metrics, "forward_pe")
        derived_fields.append("forwardEps")

    net_income = _value(cash, "net_income_from_continuing_operations")
    return_on_assets = _value(metrics, "return_on_assets")
    if return_on_assets is None and net_income is not None and _value(balance, "total_assets"):
        return_on_assets = net_income / _value(balance, "total_assets")
        derived_fields.append("returnOnAssets")

    return_on_equity = _value(metrics, "return_on_equity")
    if return_on_equity is None and net_income is not None and _value(balance, "common_stock_equity"):
        return_on_equity = net_income / _value(balance, "common_stock_equity")
        derived_fields.append("returnOnEquity")

    current_ratio = _value(metrics, "current_ratio")
    if (
        current_ratio is None
        and _value(balance, "total_current_assets") is not None
        and _value(balance, "current_liabilities")
    ):
        current_ratio = (
            _value(balance, "total_current_assets")
            / _value(balance, "current_liabilities")
        )
        derived_fields.append("currentRatio")

    price_to_book = _value(metrics, "price_to_book")
    if price_to_book is None and last_price and _value(metrics, "book_value"):
        price_to_book = last_price / _value(metrics, "book_value")
        derived_fields.append("priceToBook")
    elif (
        price_to_book is None
        and market_cap
        and _value(balance, "common_stock_equity")
    ):
        price_to_book = market_cap / _value(balance, "common_stock_equity")
        derived_fields.append("priceToBook")

    payload = {
        "ticker": symbol,
        "name": _value(profile, "name") or _value(quote, "name") or symbol,
        "sector": _value(profile, "sector"),
        "industry": _value(profile, "industry_category") or _value(profile, "industry_group"),
        "lastPrice": _rounded(last_price),
        "marketCap": market_cap,
        "trailingPE": _rounded(_value(metrics, "pe_ratio")),
        "forwardPE": _rounded(_value(metrics, "forward_pe")),
        "pegRatio": _rounded(_value(metrics, "peg_ratio")),
        "priceToBook": _rounded(price_to_book),
        # Yahoo/OpenBB reports this field in percentage points (0.47 means 0.47%).
        "dividendYield": _rounded(_value(metrics, "dividend_yield")),
        "profitMargin": _percent(_value(metrics, "profit_margin")),
        "operatingMargin": _percent(_value(metrics, "operating_margin")),
        "returnOnAssets": _percent(return_on_assets),
        "returnOnEquity": _percent(return_on_equity),
        "revenueGrowth": _percent(_value(metrics, "revenue_growth")),
        "earningsGrowth": _percent(_value(metrics, "earnings_growth")),
        "trailingEps": _rounded(trailing_eps),
        "forwardEps": _rounded(forward_eps),
        "debtToEquity": _rounded(_value(metrics, "debt_to_equity")),
        "currentRatio": _rounded(current_ratio),
        "totalCash": _value(balance, "cash_cash_equivalents_and_short_term_investments"),
        "totalDebt": _value(balance, "total_debt"),
        "freeCashflow": _value(cash, "free_cash_flow"),
    }
    payload["dataQuality"] = _quality(
        payload,
        "OpenBB / yfinance",
        retrieved_at,
        _value(profile, "currency")
        or _value(metrics, "currency")
        or _value(quote, "currency"),
        statement_period,
        warnings,
    )
    if derived_fields:
        payload["dataQuality"]["derivedFields"] = derived_fields
    return payload


def normalize_yfinance_fundamentals(
    *, ticker, info, retrieved_at=None, warning=None
):
    def pct(key):
        value = _value(info, key)
        return _percent(value)

    payload = {
        "ticker": ticker.upper(),
        "name": _value(info, "shortName") or ticker.upper(),
        "sector": _value(info, "sector"),
        "industry": _value(info, "industry"),
        "lastPrice": _rounded(
            _value(info, "currentPrice") or _value(info, "regularMarketPrice")
        ),
        "marketCap": _value(info, "marketCap"),
        "trailingPE": _rounded(_value(info, "trailingPE")),
        "forwardPE": _rounded(_value(info, "forwardPE")),
        "pegRatio": _rounded(_value(info, "pegRatio")),
        "priceToBook": _rounded(_value(info, "priceToBook")),
        "dividendYield": _rounded(_value(info, "dividendYield")),
        "profitMargin": pct("profitMargins"),
        "operatingMargin": pct("operatingMargins"),
        "returnOnAssets": pct("returnOnAssets"),
        "returnOnEquity": pct("returnOnEquity"),
        "revenueGrowth": pct("revenueGrowth"),
        "earningsGrowth": pct("earningsGrowth"),
        "trailingEps": _rounded(_value(info, "trailingEps")),
        "forwardEps": _rounded(_value(info, "forwardEps")),
        "debtToEquity": _rounded(_value(info, "debtToEquity")),
        "currentRatio": _rounded(_value(info, "currentRatio")),
        "totalCash": _value(info, "totalCash"),
        "totalDebt": _value(info, "totalDebt"),
        "freeCashflow": _value(info, "freeCashflow"),
    }
    payload["dataQuality"] = _quality(
        payload,
        "yfinance direct fallback",
        retrieved_at,
        _value(info, "currency"),
        None,
        [warning] if warning else [],
    )
    return payload
