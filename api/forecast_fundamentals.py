"""Comparable annual ROE evidence from the requested listing's statements."""
from copy import deepcopy
from datetime import datetime, timezone

import pandas as pd

try:
    from api.stock_forecast import finite
except ImportError:
    from stock_forecast import finite


def enrich_roe(facts, income, balance, now=None):
    output = deepcopy(facts)
    if not isinstance(income, pd.DataFrame) or not isinstance(balance, pd.DataFrame):
        return output
    # Net income attributable to common holders / average common equity. Do
    # not mix minority-interest equity or total-company profit into this ratio.
    if 'NetIncomeCommonStockholders' not in income.index or 'CommonStockEquity' not in balance.index:
        return output
    if not income.columns.is_unique or not balance.columns.is_unique:
        return output
    today = pd.Timestamp(now or datetime.now(timezone.utc)).date()

    def value(frame, row, date):
        return finite(frame.loc[row, date]) if row in frame.index and date in frame.columns else None

    dates = sorted([date for date in balance.columns if isinstance(date, pd.Timestamp) and date.date() < today])
    records = []
    for previous, current in zip(dates, dates[1:]):
        if not 320 <= (current - previous).days <= 410 or (today - current.date()).days > 1500:
            continue
        profit = value(income, 'NetIncomeCommonStockholders', current)
        begin_equity, end_equity = value(balance, 'CommonStockEquity', previous), value(balance, 'CommonStockEquity', current)
        if profit is None or begin_equity is None or end_equity is None or min(begin_equity, end_equity) <= 0:
            continue
        average_equity = (begin_equity + end_equity) / 2
        revenue = value(income, 'TotalRevenue', current)
        assets_before, assets_after = value(balance, 'TotalAssets', previous), value(balance, 'TotalAssets', current)
        average_assets = (assets_before + assets_after) / 2 if assets_before is not None and assets_after is not None and min(assets_before, assets_after) > 0 else None
        records.append({
            'period': current.date().isoformat(), 'roe_pct': round(profit / average_equity * 100, 2),
            'net_margin_pct': round(profit / revenue * 100, 2) if revenue is not None and revenue > 0 else None,
            'asset_turnover': round(revenue / average_assets, 3) if revenue is not None and revenue > 0 and average_assets else None,
            'equity_multiplier': round(average_assets / average_equity, 3) if average_assets else None,
        })
    records = records[-3:]
    if not records or (today - pd.Timestamp(records[-1]['period']).date()).days > 550:
        return output
    output['roeEvidence'] = {'source': 'Yahoo Finance annual statements', 'history': records,
                             'method': 'Annual net income attributable to common shareholders / average opening and closing common equity.'}
    if finite(output.get('returnOnEquity')) is None:
        output['returnOnEquity'] = records[-1]['roe_pct']
        output['roeEvidence']['used_as_snapshot'] = True
    return output
