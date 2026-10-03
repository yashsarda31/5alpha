"""Bounded provider orchestration for the featured forecast endpoint."""
import asyncio
import re
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

try:
    from api.stock_forecast import build_forecast
except ImportError:
    from stock_forecast import build_forecast


async def _cancel_stragglers_on_unknown(facts_task, stragglers):
    """Dead symbols must not burn the full timeout: once fundamentals proves
    the listing unknown, stop waiting out slow providers."""
    try:
        await facts_task
    except HTTPException as exc:
        if exc.status_code == 404:
            for task in stragglers:
                if not task.done():
                    task.cancel()
    except Exception:
        pass


async def assemble_forecast(ticker, history_loader, fundamentals_loader, news_loader, now=None, timeout=25):
    ts = pd.Timestamp(now or datetime.now(timezone.utc))
    now = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")
    market_key = str(ticker).upper()
    history_task = asyncio.ensure_future(asyncio.to_thread(history_loader, ticker))
    facts_task = asyncio.ensure_future(fundamentals_loader(ticker))
    news_task = asyncio.ensure_future(news_loader(ticker))
    watcher = asyncio.ensure_future(
        _cancel_stragglers_on_unknown(facts_task, (history_task, news_task)))
    try:
        outcomes = await asyncio.gather(
            asyncio.wait_for(history_task, timeout),
            asyncio.wait_for(facts_task, timeout),
            asyncio.wait_for(news_task, timeout),
            return_exceptions=True,
        )
    finally:
        if not watcher.done():
            watcher.cancel()
    history, facts, news = [None if isinstance(value, BaseException) else value for value in outcomes]
    if isinstance(outcomes[1], HTTPException) and outcomes[1].status_code == 404:
        # Definitive unknown listing: one clear message instead of piecemeal
        # timeout/mismatch warnings from the cancelled stragglers.
        return build_forecast(ticker, None, None, None, now=now, ticker_unknown=True)
    if isinstance(history, pd.DataFrame) and isinstance(history.index, pd.DatetimeIndex):
        # Daily candles carry their exchange-local session date. Exclude today's
        # candle even after close: publication/adjustment completion is unknown.
        local_date = now.tz_convert("Asia/Kolkata" if market_key.endswith((".NS", ".BO")) else "America/New_York").date()
        history = history.loc[history.index.date != local_date].copy()
    payload = build_forecast(ticker, history, facts, news, now=now)
    for label, outcome in zip(("Price history", "Fundamentals", "News"), outcomes):
        if isinstance(outcome, BaseException):
            if isinstance(outcome, HTTPException) and outcome.status_code == 404:
                continue  # empty evidence already has its own specific warning
            payload["warnings"].append(f"{label} provider unavailable or timed out. Retry to refresh this evidence.")
    return payload


def forecast_router(history_loader, fundamentals_loader, news_loader):
    router = APIRouter()

    @router.get("/api/forecast/{ticker}")
    async def forecast(ticker: str):
        ticker = ticker.strip().upper()
        if not re.fullmatch(r"[A-Z0-9][A-Z0-9&-]{0,24}(?:\.NS|\.BO)?", ticker):
            raise HTTPException(status_code=422, detail="Use an NSE (.NS), BSE (.BO), or US equity ticker.")
        payload = await assemble_forecast(ticker, history_loader, fundamentals_loader, news_loader)
        return JSONResponse(payload, headers={"Cache-Control": "private, no-store"})

    return router
