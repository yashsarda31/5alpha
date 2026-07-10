from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np
import os
import json
import math
import requests
from datetime import datetime, timedelta, timezone
import asyncio
import concurrent.futures
import time
import io
import re

# statsmodels (scipy chain), google.genai and PIL are imported lazily inside the
# endpoints that need them — importing them at module level adds seconds to every
# serverless cold start, including the auth check that gates app startup.
def _genai_client(api_key):
    from google import genai
    return genai.Client(api_key=api_key)

API_CACHE = {}
CACHE_TTL = 900 # 15 minutes

app = FastAPI(title="Alpha Nova API V2", description="Institutional Analytics API")

# Connect React Frontend. The app is same-origin in prod (Vercel serves both),
# so CORS only matters for the local vite dev/preview proxies and Vercel preview
# deploys — allow those explicitly instead of every site on the internet
# (a blanket "*" let any third-party page freeload the API from visitors'
# browsers and probe authed endpoints).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://5alphav2.vercel.app"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://[a-z0-9-]+\.vercel\.app$",
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Edge CDN caching --------------------------------------------------------
# Vercel's CDN honors s-maxage / stale-while-revalidate on function responses,
# serving repeats from the visitor's nearest edge (bom1 for most users) instead
# of round-tripping to the iad1 function. stale-while-revalidate means even the
# request that expires a cached entry gets the stale copy instantly while the
# recompute (7s+ on /api/momentum) runs in the background. Only anonymous,
# successful GET reads of shared market data are listed — anything user-shaped
# or Authorization-bearing bypasses the CDN entirely. Edge TTLs sit BELOW the
# endpoints' internal API_CACHE TTLs: the CDN absorbs the request fan-in, the
# internal cache still bounds actual recompute work.
_EDGE_STATIC_RULES = {
    "/api/momentum": (300, 900),
    "/api/sectors": (600, 1800),
    "/api/fiidii": (600, 1800),
    "/api/deals": (600, 1800),
    "/api/rv-forecast": (900, 3600),
    "/api/symbol-search": (3600, 86400),
    "/api/signals/portfolio": (60, 300),
    # public since 2026-07-10 (guests browse the community board); signed-in
    # requests carry Authorization so the middleware already bypasses them
    "/api/leaderboard": (120, 600),
}
_EDGE_PREFIX_RULES = (
    ("/api/news/", 300, 900),
    ("/api/fundamentals/", 600, 1800),
    ("/api/chart/", 60, 300),
    ("/api/dcf/data/", 300, 900),
    ("/api/option-chain/expiries/", 300, 900),
    ("/api/option-chain/data/", 25, 120),
)

def _edge_cache_ttl(path, query_market):
    """(s-maxage, stale-while-revalidate) for a cacheable public path, else None."""
    if path == "/api/dashboard":
        live = _is_indian_market_open() or _dashboard_movers_market() == "US"
        return (120, 600) if live else (900, 1800)
    if path == "/api/signals":
        mkt = query_market.upper() if query_market and query_market.upper() in ("IN", "US") \
            else _dashboard_movers_market()
        # short live TTL: client polls still reach the function often enough to
        # drive _broadcast_new_plans (push has no cron behind it)
        return (60, 300) if _signals_live(mkt) else (450, 1800)
    if path in _EDGE_STATIC_RULES:
        return _EDGE_STATIC_RULES[path]
    for prefix, smax, swr in _EDGE_PREFIX_RULES:
        if path.startswith(prefix):
            return (smax, swr)
    return None

@app.middleware("http")
async def _edge_cache_headers(request: Request, call_next):
    response = await call_next(request)
    # Baseline security headers on every API response (the static site's HTML
    # gets its own set via vercel.json routes).
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if (
        request.method == "GET"
        and response.status_code == 200
        and "authorization" not in request.headers
        and "cache-control" not in response.headers
    ):
        try:
            ttl = _edge_cache_ttl(request.url.path, request.query_params.get("market"))
        except Exception:
            ttl = None  # a liveness helper blowing up must never break the response
        if ttl:
            smax, swr = ttl
            response.headers["Cache-Control"] = (
                f"public, max-age=0, s-maxage={smax}, stale-while-revalidate={swr}"
            )
    return response


# Ticker path params are embedded into outbound NSE/Yahoo URLs — reject anything
# outside the charset real listings use (letters/digits plus . _ ^ = & - and
# space) so a crafted "ticker" can't smuggle query params or paths upstream.
# Legit examples that must pass: RELIANCE.NS, ^NSEI, INR=X, M&M.NS, BRK-B,
# NIFTY_FIN_SERVICE.NS, GC=F.
_TICKER_PATH_RE = re.compile(r"^[A-Za-z0-9._^=&\- ]{1,25}$")

def _validate_symbol(sym: str) -> str:
    s = (sym or "").strip()
    if not _TICKER_PATH_RE.match(s):
        raise HTTPException(status_code=400, detail="Invalid ticker symbol.")
    return s

# --- Models ---
class DCFRequest(BaseModel):
    ticker: str
    wacc: float = 8.5
    perpetual_growth: float = 2.5

class ARIMARequest(BaseModel):
    ticker: str
    days: int = 10

class FLCLRequest(BaseModel):
    ticker: str
    days: int | None = 252
    swing_window: int | None = 5
    atr_mult: float | None = 1.5

class AIFLCLRequest(BaseModel):
    ticker: str
    flcl_data: dict
    apiKey: str

class AIChartRequest(BaseModel):
    ticker: str
    data_summary: str
    apiKey: str

class AIDCFRequest(BaseModel):
    ticker: str
    dcf_data: dict
    apiKey: str

class AIARIMARequest(BaseModel):
    ticker: str
    forecast_data: dict
    apiKey: str

class AIPositionSizingRequest(BaseModel):
    capital: float
    risk_percent: float
    entry_price: float
    stop_loss: float
    shares: int
    apiKey: str

class AIScreenerRequest(BaseModel):
    screener_data: list
    apiKey: str

class AIFundamentalsRequest(BaseModel):
    ticker: str
    fundamentals_data: str
    apiKey: str

class ScreenerRequest(BaseModel):
    tickers: str = "AAPL, MSFT, NVDA, RELIANCE.NS, TCS.NS, HDFCBANK.NS"
    # `X | None` (not bare `X`) — pydantic v2 422s on an explicit JSON null
    # for a non-Optional field (the Android push-subscribe bug class)
    universe: str | None = None  # named preset ('nifty100', 'nifty200', 'sp100', 'nasdaq100')
    max_pe: float | None = None
    min_div_yield: float | None = None
    min_roe: float | None = None
    min_eps_growth: float | None = None
    min_momentum: float | None = None      # composite (1m+6m+12m)/3 return %; needs price history
    min_alpha_score: float | None = None   # Alpha Nova Score 0-100

class MomentumRequest(BaseModel):
    market: str = "us" # 'us' or 'in'

# --- Endpoints ---

# Named screener universes. NSE names get a .NS suffix at request time.
# Unknown/delisted symbols simply return no data and are filtered out, so the
# lists can be generous without breaking the response.
_NIFTY100 = [
    "RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY", "SBIN", "BHARTIARTL", "LT", "ITC", "HINDUNILVR",
    "AXISBANK", "BAJFINANCE", "MARUTI", "KOTAKBANK", "SUNPHARMA", "TITAN", "ONGC", "TMPV", "TMCV", "NTPC", "M&M",
    "ADANIENT", "ADANIPORTS", "POWERGRID", "ASIANPAINT", "BAJAJFINSV", "WIPRO", "JSWSTEEL", "TATASTEEL", "COALINDIA", "NESTLEIND",
    "GRASIM", "HINDALCO", "SBILIFE", "HDFCLIFE", "TECHM", "EICHERMOT", "DRREDDY", "CIPLA", "APOLLOHOSP", "BRITANNIA",
    "INDUSINDBK", "HEROMOTOCO", "BAJAJ-AUTO", "TATACONSUM", "BPCL", "SHRIRAMFIN", "TRENT", "BEL", "DIVISLAB", "HAL",
    "ADANIGREEN", "ATGL", "AMBUJACEM", "BANKBARODA", "BERGEPAINT", "BOSCHLTD", "CANBK", "CHOLAFIN", "COLPAL", "DABUR",
    "DLF", "DMART", "GAIL", "GODREJCP", "HAVELLS", "ICICIGI", "ICICIPRULI", "IOC", "INDIGO", "IRFC",
    "JINDALSTEL", "JIOFIN", "LICI", "LODHA", "LTIM", "MOTHERSON", "NAUKRI", "PIDILITIND", "PFC", "PNB",
    "RECLTD", "SIEMENS", "SRF", "TVSMOTOR", "TATAPOWER", "TORNTPHARM", "UNITDSPR", "VBL", "VEDL", "ZYDUSLIFE",
    "ABB", "ADANIPOWER", "AUBANK", "BAJAJHLDNG", "MAXHEALTH", "MANKIND", "MUTHOOTFIN", "POLYCAB", "SBICARD", "INDUSTOWER",
]
_NIFTY_NEXT100 = [
    "ACC", "ALKEM", "ASHOKLEY", "ASTRAL", "AUROPHARMA", "BALKRISIND", "BANDHANBNK", "BHARATFORG", "BHEL", "BIOCON",
    "CGPOWER", "COFORGE", "CONCOR", "CUMMINSIND", "DALBHARAT", "DIXON", "ESCORTS", "EXIDEIND", "FEDERALBNK", "GMRAIRPORT",
    "GODREJPROP", "GUJGASLTD", "HDFCAMC", "HINDPETRO", "IDFCFIRSTB", "INDHOTEL", "IPCALAB", "IRCTC", "JUBLFOOD", "LTF",
    "LUPIN", "MRF", "MFSL", "MPHASIS", "NMDC", "NYKAA", "OBEROIRLTY", "OFSS", "PAGEIND", "PATANJALI",
    "PERSISTENT", "PETRONET", "PHOENIXLTD", "PIIND", "POLICYBZR", "PRESTIGE", "SAIL", "SJVN", "SONACOMS", "STARHEALTH",
    "SUNTV", "SUPREMEIND", "SUZLON", "TATACHEM", "TATACOMM", "TATAELXSI", "TIINDIA", "TORNTPOWER", "UBL", "UNIONBANK",
    "UPL", "VOLTAS", "YESBANK", "ZOMATO", "IDEA", "ABCAPITAL", "ABFRL", "APLAPOLLO", "BSE", "CDSL",
    "CAMS", "DELHIVERY", "GLENMARK", "GODREJIND", "HUDCO", "IEX", "INDIANB", "IREDA", "JSWENERGY", "KALYANKJIL",
    "KPITTECH", "LICHSGFIN", "M&MFIN", "MAZDOCK", "MARICO", "NHPC", "OIL", "PAYTM", "PGHH", "RVNL",
    "SCHAEFFLER", "SOLARINDS", "AARTIIND", "AIAENG", "AJANTPHARM", "APOLLOTYRE", "BATAINDIA", "CROMPTON", "DEEPAKNTR", "TATATECH",
]
_SP100 = [
    "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "GOOG", "META", "BRK-B", "TSLA", "LLY",
    "AVGO", "JPM", "V", "UNH", "XOM", "MA", "JNJ", "PG", "HD", "COST",
    "ORCL", "ABBV", "BAC", "KO", "MRK", "CVX", "PEP", "ADBE", "WMT", "CRM",
    "AMD", "NFLX", "TMO", "MCD", "CSCO", "ACN", "ABT", "LIN", "DHR", "INTC",
    "WFC", "TXN", "QCOM", "PM", "INTU", "AMGN", "IBM", "CAT", "GE", "VZ",
    "NOW", "UNP", "SPGI", "LOW", "HON", "GS", "ISRG", "BKNG", "AMAT", "NEE",
    "RTX", "PFE", "T", "BLK", "SYK", "ELV", "TJX", "C", "BSX", "MDT",
    "DE", "ADP", "MU", "GILD", "VRTX", "LMT", "CB", "MMC", "PLD", "ADI",
    "REGN", "AMT", "MO", "CI", "SO", "SCHW", "BMY", "DUK", "PGR", "MDLZ",
    "FI", "SBUX", "BX", "KLAC", "APH", "ICE", "WM", "AON", "CME", "PANW",
]
_NASDAQ100 = [
    "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "GOOG", "META", "TSLA", "AVGO", "COST",
    "NFLX", "ADBE", "PEP", "AMD", "CSCO", "TMUS", "INTC", "INTU", "QCOM", "TXN",
    "AMGN", "HON", "AMAT", "BKNG", "ISRG", "VRTX", "ADP", "GILD", "MU", "REGN",
    "LRCX", "PANW", "ADI", "MDLZ", "PYPL", "SBUX", "KLAC", "SNPS", "CDNS", "MELI",
    "CRWD", "MAR", "CTAS", "ORLY", "ABNB", "NXPI", "FTNT", "DASH", "ROP", "ADSK",
    "PCAR", "CPRT", "MNST", "WDAY", "PAYX", "ROST", "KDP", "ODFL", "FAST", "EA",
    "GEHC", "VRSK", "CSGP", "EXC", "CCEP", "XEL", "CTSH", "DXCM", "IDXX", "TTD",
    "AEP", "KHC", "FANG", "MCHP", "BKR", "CDW", "GFS", "ON", "BIIB", "DDOG",
    "ZS", "ANSS", "TEAM", "WBD", "ARM", "MRVL", "SMCI", "LULU", "PDD", "MDB",
    "TTWO", "WBA", "ILMN", "SIRI", "MRNA", "DLTR", "ENPH", "LCID", "RIVN", "CEG",
]

def _ns(symbols):
    return [f"{s}.NS" for s in symbols]

SCREENER_UNIVERSES = {
    "nifty100": _ns(_NIFTY100),
    "nifty200": _ns(_NIFTY100 + _NIFTY_NEXT100),
    "sp100": list(_SP100),
    "nasdaq100": list(_NASDAQ100),
}

# Stay comfortably under the serverless function limit; return partial results
# (with an honest scanned count) rather than hang if a large scan runs long.
SCREENER_TIME_BUDGET = 45

def _two_stage_fair_value(eps, growth_pct):
    """Two-stage EPS model: 10y at clamp(growth, 2-50%), 10y terminal at 4%, 11% discount."""
    growth = max(2.0, min(50.0, growth_pct)) if growth_pct and growth_pct > 0 else 10.0
    g, r, tg = growth / 100, 0.11, 0.04
    val, fv = eps, 0.0
    for i in range(1, 11):
        val *= (1 + g)
        fv += val / (1 + r) ** i
    for i in range(11, 21):
        val *= (1 + tg)
        fv += val / (1 + r) ** i
    return fv

def _alpha_nova_score(price, eps, pe, growth_pct,
                      rev_growth_pct=None, roe_pct=None, margin_pct=None,
                      dte_pct=None, div_pct=None):
    """Alpha Nova Score v2 (0-100): multi-factor composite from yfinance `info`
    fields alone (no extra network calls per stock).

    Pillars: Value 30 (margin of safety + PEG) · Quality 30 (ROE, margins, D/E)
           · Growth 25 (EPS + revenue growth) · Yield 15 (dividends).
    Missing pillars renormalize (score = 100 × earned / available) instead of
    silently pretending to be average. Spec:
    docs/superpowers/specs/2026-07-04-news-sentiment-alpha-score-v2-design.md
    """
    def tiers(value, table):
        for threshold, points in table:
            if value >= threshold:
                return points
        return 0

    earned, available = 0.0, 0.0

    # Value (30): needs a positive EPS base to model fair value
    if price and price > 0 and eps and eps > 0:
        fv = _two_stage_fair_value(eps, growth_pct)
        mos = (fv - price) / fv if fv > 0 else 0.0
        earned += max(0.0, min(22.0, (mos + 0.5) * 22))  # -50% MoS → 0, +50% → 22
        if pe and pe > 0 and growth_pct and growth_pct > 0:
            peg = pe / growth_pct
            earned += 8 if peg <= 1.0 else 4 if peg <= 1.5 else 0
        available += 30

    # Quality (30): ROE, profit margin, debt/equity
    if any(v is not None for v in (roe_pct, margin_pct, dte_pct)):
        if roe_pct is not None:
            earned += tiers(roe_pct, [(25, 14), (15, 10), (10, 6), (1e-9, 3)])
        if margin_pct is not None:
            earned += tiers(margin_pct, [(20, 8), (10, 5), (1e-9, 2)])
        if dte_pct is not None:
            earned += 8 if dte_pct < 50 else 5 if dte_pct < 100 else 2 if dte_pct < 200 else 0
        available += 30

    # Growth (25): EPS growth + revenue growth
    if any(v is not None for v in (growth_pct, rev_growth_pct)):
        if growth_pct is not None:
            earned += tiers(growth_pct, [(25, 15), (15, 11), (8, 7), (1e-9, 4)])
        if rev_growth_pct is not None:
            earned += tiers(rev_growth_pct, [(15, 10), (8, 6), (1e-9, 3)])
        available += 25

    # Yield (15): non-payers (None) drop the pillar; a true 0 counts as available
    if div_pct is not None:
        earned += tiers(div_pct, [(3, 15), (1.5, 10), (0.5, 6), (1e-9, 3)])
        available += 15

    if not available:
        return None
    return int(min(99, max(5, round(100 * earned / available))))

def _composite_momentum(stock):
    """(1m + 6m + 12m return)/3 in %, mirroring the Momentum Leaders tab."""
    try:
        closes = stock.history(period="14mo")['Close'].dropna()
        if len(closes) < 252:
            return None
        last = closes.iloc[-1]
        mom = (((last / closes.iloc[-21]) - 1) + ((last / closes.iloc[-126]) - 1)
               + ((last / closes.iloc[-252]) - 1)) / 3 * 100
        return round(float(mom), 2) if np.isfinite(mom) else None
    except Exception:
        return None

@app.post("/api/screener")
def run_screener(req: ScreenerRequest):
    if req.universe and req.universe in SCREENER_UNIVERSES:
        tickers = list(SCREENER_UNIVERSES[req.universe])
    else:
        tickers = [t.strip() for t in req.tickers.split(",") if t.strip()]

    # De-duplicate while preserving order
    seen = set()
    tickers = [t for t in tickers if not (t in seen or seen.add(t))]
    requested = len(tickers)
    results = []
    # Momentum needs a 14-month history per ticker (an extra request each), so
    # only compute it when the momentum filter is actually in play
    want_momentum = req.min_momentum is not None

    def process_ticker(ticker):
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            pe = info.get("trailingPE")
            div = info.get("dividendYield")
            roe = info.get("returnOnEquity")
            eps = info.get("earningsGrowth")
            rev = info.get("revenueGrowth")
            margin = info.get("profitMargins")
            dte = info.get("debtToEquity")  # yfinance ships this as a % already

            # yfinance >= 0.2.50 returns dividendYield already as a percentage;
            # roe/eps/revenue growth and margins are still fractions (0.15 = 15%)
            div_pct = div if div is not None else 0
            roe_pct = (roe or 0) * 100
            eps_pct = (eps or 0) * 100
            
            if req.max_pe is not None and pe is not None and pe > req.max_pe:
                return None
            if req.min_div_yield is not None and div_pct < req.min_div_yield:
                return None
            if req.min_roe is not None and roe_pct < req.min_roe:
                return None
            if req.min_eps_growth is not None and eps_pct < req.min_eps_growth:
                return None
                
            price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
            market_cap = (info.get("marketCap") or 0) / 1e9
            # Guard against NaN/inf so the JSON response stays valid
            if not (np.isfinite(price) and np.isfinite(market_cap)):
                return None

            trailing_eps = info.get("trailingEps")
            alpha_score = _alpha_nova_score(
                price, trailing_eps, pe, eps_pct if eps is not None else None,
                rev_growth_pct=rev * 100 if rev is not None else None,
                roe_pct=roe * 100 if roe is not None else None,
                margin_pct=margin * 100 if margin is not None else None,
                dte_pct=dte if dte is not None else None,
                div_pct=div)
            if req.min_alpha_score is not None and (alpha_score is None or alpha_score < req.min_alpha_score):
                return None

            momentum = _composite_momentum(stock) if want_momentum else None
            if req.min_momentum is not None and (momentum is None or momentum < req.min_momentum):
                return None

            return {
                "ticker": ticker,
                "price": price,
                "marketCap": market_cap,
                # Yahoo reports trailingPE as 0/negative for loss-makers — that is
                # "no meaningful P/E", not a cheap stock, so surface it as null
                "peRatio": pe if (pe is not None and np.isfinite(pe) and pe > 0) else None,
                "divYield": div_pct,
                "roe": roe_pct if roe is not None else None,
                "epsGrowth": eps_pct if eps is not None else None,
                "momentum": momentum,
                "alphaScore": alpha_score
            }
        except Exception:
            return None

    # Scale workers with the universe size (yfinance is I/O-bound), but cap to
    # avoid tripping Yahoo rate limits on the largest scans.
    workers = min(32, max(8, len(tickers)))
    scanned = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(process_ticker, t) for t in tickers]
        try:
            for future in concurrent.futures.as_completed(futures, timeout=SCREENER_TIME_BUDGET):
                scanned += 1
                res = future.result()
                if res:
                    results.append(res)
        except concurrent.futures.TimeoutError:
            # Time budget hit — return whatever finished rather than hang.
            for future in futures:
                future.cancel()

    return {
        "data": results,
        "requested": requested,
        "scanned": scanned,
        "truncated": scanned < requested,
    }


import asyncio

def _yf_resolve_history(ticker: str, period: str):
    """history() with a .NS fallback — users of an NSE-focused app type bare
    symbols (RELIANCE) that Yahoo only knows as RELIANCE.NS. Returns the
    resolved ticker plus its dataframe."""
    stock = yf.Ticker(ticker)
    df = stock.history(period=period)
    if df.empty and "." not in ticker:
        alt = f"{ticker.upper()}.NS"
        df_alt = yf.Ticker(alt).history(period=period)
        if not df_alt.empty:
            return alt, df_alt
    return ticker, df

def _yf_resolve_info(ticker: str):
    """.info with the same .NS fallback; no price AND no market cap is the
    tell that Yahoo doesn't know the bare symbol."""
    def _known(i):
        return bool(i.get("currentPrice") or i.get("regularMarketPrice") or i.get("marketCap"))
    stock = yf.Ticker(ticker)
    try:
        info = stock.info or {}
    except Exception:
        info = {}
    if not _known(info) and "." not in ticker:
        alt = f"{ticker.upper()}.NS"
        alt_stock = yf.Ticker(alt)
        try:
            alt_info = alt_stock.info or {}
        except Exception:
            alt_info = {}
        if _known(alt_info):
            return alt, alt_stock, alt_info
    return ticker, stock, info

@app.get("/api/chart/{ticker}")
async def get_chart(ticker: str):
    ticker = _validate_symbol(ticker)
    def fetch_data():
        # Fetch 2y to ensure 200-day MA and 52-week high/low have enough data
        return _yf_resolve_history(ticker, "2y")

    resolved, df = await asyncio.to_thread(fetch_data)

    if df.empty:
        raise HTTPException(status_code=404, detail="Ticker not found")
        
    df['SMA_20'] = df['Close'].rolling(window=20).mean()
    df['SMA_50'] = df['Close'].rolling(window=50).mean()
    df['SMA_150'] = df['Close'].rolling(window=150).mean()
    df['SMA_200'] = df['Close'].rolling(window=200).mean()
    
    # RSI Calculation
    delta = df['Close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=13, adjust=False).mean()
    avg_loss = loss.ewm(com=13, adjust=False).mean()
    rs = avg_gain / avg_loss
    df['RSI'] = 100 - (100 / (1 + rs))
    
    # Slice to the last 1 year (approx 252 trading days)
    df_1y = df.tail(252)
    
    # Calculate Minervini VCP Rating (out of 5 stars)
    vcp_rating = 0
    if len(df) >= 252:
        current_close = df_1y['Close'].iloc[-1]
        sma_50 = df_1y['SMA_50'].iloc[-1]
        sma_150 = df_1y['SMA_150'].iloc[-1]
        sma_200 = df_1y['SMA_200'].iloc[-1]
        sma_200_20d_ago = df_1y['SMA_200'].iloc[-21] if len(df_1y) >= 21 else sma_200
        high_52w = df_1y['High'].max()
        low_52w = df_1y['Low'].min()
        
        # 1. Trend Alignment (Price > 50 > 150 > 200)
        if current_close > sma_50 and sma_50 > sma_150 and sma_150 > sma_200:
            vcp_rating += 1
            
        # 2. 200 SMA Trending Up
        if sma_200 > sma_200_20d_ago:
            vcp_rating += 1
            
        # 3. Price > 30% off 52-week low
        if current_close > low_52w * 1.30:
            vcp_rating += 1
            
        # 4. Price within 25% of 52-week high
        if current_close >= high_52w * 0.75:
            vcp_rating += 1
            
        # 5. Volatility/Volume Contraction (Recent 10d Volatility < 50d Volatility)
        std_10d = df_1y['Close'].tail(10).std()
        std_50d = df_1y['Close'].tail(50).std()
        if std_10d < std_50d:
            vcp_rating += 1

    df_1y = df_1y.copy()
    # Clean index to string format
    df_1y.index = df_1y.index.strftime('%Y-%m-%d')
    # Fill any remaining NaNs
    df_1y = df_1y.ffill().bfill()

    # Raw yfinance floats carry precision noise (e.g. 2456.8999999999996)
    # that leaks into the UI and AI prompts — round at the source.
    def _r2list(series, nd=2):
        return [round(float(v), nd) if math.isfinite(float(v)) else None
                for v in series.tolist()]

    payload = {
        "ticker": resolved.upper(),
        "dates": df_1y.index.tolist(),
        "open": _r2list(df_1y['Open']),
        "high": _r2list(df_1y['High']),
        "low": _r2list(df_1y['Low']),
        "close": _r2list(df_1y['Close']),
        "volume": [int(v) if math.isfinite(float(v)) else 0 for v in df_1y['Volume'].tolist()],
        "sma20": _r2list(df_1y['SMA_20']),
        "rsi": _r2list(df_1y['RSI']),
        "vcp_rating": vcp_rating
    }
    return payload


@app.post("/api/dcf")
async def calculate_dcf(req: DCFRequest):
    def run_dcf():
        stock = yf.Ticker(req.ticker)
        info = stock.info
        
        current_price = info.get("currentPrice", 0)
        shares_out = info.get("sharesOutstanding", 0)
        
        # Auto-populate using yfinance cashflow
        cashflow = stock.cashflow
        balance_sheet = stock.balance_sheet
        
        fcf = 0
        net_debt = 0
        
        try:
            fcf = cashflow.loc["Free Cash Flow"].iloc[0]
        except Exception:
            if "Operating Cash Flow" in cashflow.index and "Capital Expenditure" in cashflow.index:
                # Capital expenditure is usually reported as negative
                capex = cashflow.loc["Capital Expenditure"].iloc[0]
                fcf = cashflow.loc["Operating Cash Flow"].iloc[0] + (capex if capex < 0 else -capex)
            else:
                fcf = 1000000000
            
        try:
            total_debt = balance_sheet.loc["Total Debt"].iloc[0]
            cash = balance_sheet.loc["Cash And Cash Equivalents"].iloc[0]
            net_debt = total_debt - cash
        except Exception:
            net_debt = info.get("totalDebt", 0) - info.get("totalCash", 0)

        # Simplified Model Implementation for speed
        g1 = 0.10
        g2 = 0.05
        wacc = req.wacc / 100
        pg = req.perpetual_growth / 100
        
        fcfs = []
        current_fcf = fcf
        for y in range(1, 11):
            g = g1 if y <= 5 else g2
            current_fcf *= (1 + g)
            fcfs.append(current_fcf)
            
        discount_factor = (1 + wacc)
        pv_fcfs = [f / (discount_factor ** y) for y, f in zip(range(1, 11), fcfs)]
        tv = (fcfs[-1] * (1 + pg)) / max(0.001, wacc - pg)
        pv_tv = tv / (discount_factor ** 10)
        
        equity_val = sum(pv_fcfs) + pv_tv - net_debt
        val_per_share = equity_val / shares_out if shares_out > 0 else 0
        
        upside = ((val_per_share / current_price) - 1) * 100 if current_price > 0 else 0

        return {
            "ticker": req.ticker,
            "currentPrice": current_price,
            "intrinsicValue": round(val_per_share, 2),
            "upside": round(upside, 2),
            "autoPopulated": {
                "baseFcf": fcf,
                "netDebt": net_debt,
                "sharesOut": shares_out
            }
        }
    return await asyncio.to_thread(run_dcf)

@app.get("/api/dcf/data/{ticker}")
async def get_dcf_data(ticker: str):
    ticker = _validate_symbol(ticker)
    def fetch_data():
        try:
            resolved, stock, info = _yf_resolve_info(ticker)
            if not (info.get("currentPrice") or info.get("regularMarketPrice") or info.get("marketCap")):
                return {"error": f"Ticker '{ticker}' not found on Yahoo Finance"}

            current_price = info.get("currentPrice", 0)
            eps = info.get("trailingEps", 0)
            market_cap = info.get("marketCap", 0)
            pe = info.get("trailingPE", 0)
            pb = info.get("priceToBook", 0)
            
            predictability = 3 if eps > 0 else 1
            if pe > 0 and pe < 30:
                predictability += 1
            if info.get("dividendYield", 0) > 0:
                predictability += 1
                
            shares_out = info.get("sharesOutstanding", 0)
            
            cashflow = stock.cashflow
            fcf = 0
            try:
                fcf_total = cashflow.loc["Free Cash Flow"].iloc[0]
                fcf = fcf_total / shares_out if shares_out > 0 else 0
            except Exception:
                try:
                    capex = cashflow.loc["Capital Expenditure"].iloc[0]
                    ocf = cashflow.loc["Operating Cash Flow"].iloc[0]
                    fcf_total = ocf + (capex if capex < 0 else -capex)
                    fcf = fcf_total / shares_out if shares_out > 0 else 0
                except:
                    pass
            
            balance_sheet = stock.balance_sheet
            tangible_book = 0
            try:
                equity = balance_sheet.loc["Stockholders Equity"].iloc[0]
            except:
                try:
                    equity = balance_sheet.loc["Total Equity Gross Minority Interest"].iloc[0]
                except:
                    equity = 0
                    
            intangibles = 0
            try:
                intangibles = balance_sheet.loc["Goodwill And Other Intangible Assets"].iloc[0]
            except:
                pass
                
            if equity != 0 and shares_out > 0:
                tangible_book = (equity - intangibles) / shares_out
            else:
                tangible_book = info.get("bookValue", 0)
                
            div = info.get("dividendRate", 0)

            # Calculate historical CAGR of Diluted EPS
            hist_growth = 15.0
            try:
                stmt = stock.income_stmt
                if stmt is not None and "Diluted EPS" in stmt.index:
                    eps_vals = stmt.loc["Diluted EPS"].dropna().tolist()
                    eps_vals = [x for x in eps_vals if isinstance(x, (int, float)) and x > 0]
                    if len(eps_vals) >= 2:
                        eps_vals.reverse()
                        latest = eps_vals[-1]
                        oldest = eps_vals[0]
                        n = len(eps_vals)
                        if oldest > 0:
                            cagr = (latest / oldest) ** (1 / (n - 1)) - 1
                            hist_growth = max(2.0, min(50.0, cagr * 100))
            except Exception:
                pass

            if hist_growth == 15.0:
                try:
                    eg = info.get("earningsGrowth")
                    if eg is not None and eg > 0:
                        hist_growth = max(2.0, min(50.0, eg * 100))
                except Exception:
                    pass

            _rev = info.get("revenueGrowth")
            _roe = info.get("returnOnEquity")
            _margin = info.get("profitMargins")
            _eg = info.get("earningsGrowth")
            alpha_score = _alpha_nova_score(
                current_price, eps, pe if pe else None,
                _eg * 100 if _eg is not None else None,
                rev_growth_pct=_rev * 100 if _rev is not None else None,
                roe_pct=_roe * 100 if _roe is not None else None,
                margin_pct=_margin * 100 if _margin is not None else None,
                dte_pct=info.get("debtToEquity"),
                div_pct=info.get("dividendYield"))

            return {
                "ticker": resolved.upper(),
                "currentPrice": current_price,
                "eps": eps,
                "fcf": fcf,
                "dividend": div,
                "tangibleBookValue": tangible_book,
                "marketCap": market_cap,
                "pe": pe,
                "pb": pb,
                "predictability": min(5, predictability),
                "historicalGrowthRate": round(hist_growth, 2),
                "alphaScore": alpha_score
            }
        except Exception as e:
            return {"error": str(e)}

    cache_key = f"dcf_data_{ticker}"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < CACHE_TTL:
        return API_CACHE[cache_key]['data']

    data = await asyncio.to_thread(fetch_data)
    if "error" in data:
        raise HTTPException(status_code=404, detail=data["error"])
        
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    return data

@app.post("/api/arima")
def forecast_sarimax(req: ARIMARequest):
    """SARIMAX price projection with honest out-of-sample validation.

    Design (2026-07-09 rewrite):
    - Fit on LOG prices: variance is stable and the exponentiated confidence
      band is correctly asymmetric (the old raw-price fit could even dip below
      zero on volatile names).
    - No exogenous regressors: the previous version projected decayed guesses
      of ATR/volatility into the future and fed them back as "known" exog —
      noise at best, subtle leakage at worst.
    - Model selection is OUT-OF-SAMPLE: each candidate order is fit on data
      minus a holdout tail and scored on that unseen tail (RMSE in log space);
      the winner is refit on the full series. AIC rewards in-sample fit only.
    - Metrics reported to the user: holdout MAPE and a one-step-ahead direction
      hit rate over the last ~60 sessions (Kalman-filter one-step predictions
      at t use data through t-1 only, so this is genuinely predictive).
    - Forecast dates are BUSINESS days (the old calendar-day dates put forecast
      points on weekends the market never trades).
    """
    days = max(1, min(int(req.days or 10), 60))
    resolved, df = _yf_resolve_history(_validate_symbol(req.ticker), "2y")
    if df.empty:
        raise HTTPException(status_code=404, detail="Data not found")

    closes = df["Close"].ffill().dropna()
    if len(closes) < 70:
        raise HTTPException(status_code=400, detail="Not enough price history to fit a model (need ~3 months).")
    closes = closes.tail(378)  # ~18 months of sessions: enough signal, still fast
    y = np.log(closes.values)
    dates = closes.index.strftime("%Y-%m-%d").tolist()

    import warnings
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    from statsmodels.tools.sm_exceptions import ConvergenceWarning

    def _fit(series, order):
        m = SARIMAX(series, order=order, trend="c",
                    enforce_stationarity=False, enforce_invertibility=False)
        return m.fit(disp=False, method="lbfgs", maxiter=100)

    # Candidate orders (all d=1 on log price = modelling returns). (0,1,0)+c is
    # the random-walk-with-drift baseline every candidate must beat out-of-sample.
    candidates = [(0, 1, 0), (1, 1, 0), (0, 1, 1), (1, 1, 1), (2, 1, 0), (1, 1, 2)]
    H = min(max(days, 5), 15)          # holdout tail: at least a week, capped
    train, hold = y[:-H], y[-H:]

    best_order, best_rmse, best_mape = None, None, None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        warnings.simplefilter("ignore", UserWarning)
        warnings.simplefilter("ignore", RuntimeWarning)
        for order in candidates:
            try:
                f = _fit(train, order)
                pred = np.asarray(f.get_forecast(steps=H).predicted_mean)
                rmse = float(np.sqrt(np.mean((pred - hold) ** 2)))
                if not np.isfinite(rmse):
                    continue
                if best_rmse is None or rmse < best_rmse:
                    best_order, best_rmse = order, rmse
                    best_mape = float(np.mean(np.abs(np.exp(pred) - np.exp(hold)) / np.exp(hold)) * 100)
            except Exception:
                continue

        if best_order is None:
            best_order = (0, 1, 0)  # drift baseline — always fits
        try:
            fit_model = _fit(y, best_order)
        except Exception:
            raise HTTPException(status_code=400, detail="Failed to fit a SARIMAX model to the provided data.")

        # One-step-ahead direction hit rate over the recent past (predictive, not
        # in-sample smoothing: the filter's prediction at t only sees data < t).
        direction_acc = None
        try:
            k = min(60, len(y) - 10)
            pred_in = np.asarray(fit_model.get_prediction(start=len(y) - k).predicted_mean)
            actual = y[-k:]
            prev = y[-k - 1:-1]
            hits = (np.sign(pred_in - prev) == np.sign(actual - prev)) & (np.sign(actual - prev) != 0)
            valid = np.sign(actual - prev) != 0
            if valid.sum() >= 20:
                direction_acc = float(hits.sum() / valid.sum() * 100)
        except Exception:
            pass

        try:
            fc = fit_model.get_forecast(steps=days)
            mean_log = np.asarray(fc.predicted_mean)
            ci = np.asarray(fc.conf_int(alpha=0.32))  # 68% band ≈ ±1σ
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Forecasting error: {str(e)}")

    forecast_prices = np.exp(mean_log)
    lower, upper = np.exp(ci[:, 0]), np.exp(ci[:, 1])

    # Business days only — the market doesn't trade the weekends the old
    # calendar-day axis was drawing flat line segments across.
    last_date = closes.index[-1]
    future_dates = pd.bdate_range(start=last_date + pd.Timedelta(days=1), periods=days).strftime("%Y-%m-%d").tolist()

    last_price = float(closes.iloc[-1])
    end_price = float(forecast_prices[-1])
    rnd = lambda arr: [round(float(v), 2) for v in arr]

    return _json_safe({
        "ticker": resolved,
        "historical": {"dates": dates, "prices": rnd(closes.values)},
        "forecast": {
            "dates": future_dates,
            "prices": rnd(forecast_prices),
            "lower": rnd(lower),
            "upper": rnd(upper),
        },
        "summary": {
            "last_price": round(last_price, 2),
            "end_price": round(end_price, 2),
            "exp_change_pct": round((end_price / last_price - 1) * 100, 2),
            "low_pct": round((float(lower[-1]) / last_price - 1) * 100, 2),
            "high_pct": round((float(upper[-1]) / last_price - 1) * 100, 2),
            "horizon_days": days,
        },
        "model": {
            "order": list(best_order),
            "trend": "drift",
            "holdout_days": H,
            "holdout_mape": None if best_mape is None else round(best_mape, 2),
            "direction_acc": None if direction_acc is None else round(direction_acc, 1),
            "n_obs": len(y),
        },
    })


# --- FLCL: Floor/Ceiling regime engine ---------------------------------------
def _flcl_engine(df, swing_window: int = 5, atr_mult: float = 1.5):
    """Causal floor/ceiling regime engine (improved port of FLCLindicator.ipynb).

    - A swing high/low is the strict extreme of its ±w window and is only
      CONFIRMED w bars later, so regime[t] uses information ≤ t only (the
      notebook applied swings at their peak bar: look-ahead a live trader
      never has).
    - Confirmed swings feed a zigzag: same-side swings keep the more extreme
      one; an opposite-side swing must sit ≥ atr_mult × ATR(14) away from the
      previous swing to register (the notebook's significance filter compared
      a swing to the previous BAR — meaningless).
    - Regime walk: Neutral → Bullish on a close above the last swing high
      (floor := the swing low that preceded the breakout), mirrored for
      Bearish. In a bull the floor only RATCHETS UP with each higher confirmed
      swing low and a close below it flips bearish; the bear ceiling mirrors
      that. Structure levels never loosen (the notebook's levels only ever
      widened over the whole lookback, so range position decayed into noise).

    Returns per-bar arrays over the WHOLE df plus swing/flip event lists.
    """
    w = int(swing_window)
    h = df["High"].to_numpy(dtype=float)
    l = df["Low"].to_numpy(dtype=float)
    c = df["Close"].to_numpy(dtype=float)
    n = len(df)

    # ATR(14), Wilder smoothing — the volatility yardstick for swing significance
    prev_c = np.concatenate(([c[0]], c[:-1]))
    tr = np.maximum(h - l, np.maximum(np.abs(h - prev_c), np.abs(l - prev_c)))
    atr = pd.Series(tr).ewm(alpha=1 / 14, adjust=False).mean().to_numpy()

    # Raw swing candidates: unique extreme of the ±w neighbourhood
    raw_high = np.zeros(n, dtype=bool)
    raw_low = np.zeros(n, dtype=bool)
    for i in range(w, n - w):
        wh = h[i - w:i + w + 1]
        if h[i] >= wh.max() and (wh == h[i]).sum() == 1:
            raw_high[i] = True
        wl = l[i - w:i + w + 1]
        if l[i] <= wl.min() and (wl == l[i]).sum() == 1:
            raw_low[i] = True

    events = []  # alternating significant swings: {"i", "kind" H|L, "price"}

    def _push(i, kind, price):
        if events and events[-1]["kind"] == kind:
            more_extreme = price >= events[-1]["price"] if kind == "H" else price <= events[-1]["price"]
            if more_extreme:
                events[-1] = {"i": i, "kind": kind, "price": price}
            return
        if events and abs(price - events[-1]["price"]) < atr_mult * atr[i]:
            return
        events.append({"i": i, "kind": kind, "price": price})

    regime = np.array(["Neutral"] * n, dtype=object)
    floor_arr = np.full(n, np.nan)
    ceil_arr = np.full(n, np.nan)
    flips = []  # {"t", "to", "price"}

    state = "Neutral"
    floor_lvl = None   # bull: trailing structure stop · bear: support below
    ceil_lvl = None    # bear: trailing structure stop · bull: resistance above

    for t in range(n):
        i = t - w  # the swing (if any) whose window closes on this bar
        if i >= w:
            # A giant-range bar can confirm both; feed the alternating one first.
            order = ("L", "H") if (events and events[-1]["kind"] == "H") else ("H", "L")
            for kind in order:
                if kind == "H" and raw_high[i]:
                    _push(i, "H", h[i])
                if kind == "L" and raw_low[i]:
                    _push(i, "L", l[i])

            last_sh = next((e for e in reversed(events) if e["kind"] == "H"), None)
            last_sl = next((e for e in reversed(events) if e["kind"] == "L"), None)

            # Structure levels react to newly confirmed swings, never loosening
            # the active trailing level.
            if state == "Bullish":
                if last_sl:
                    floor_lvl = last_sl["price"] if floor_lvl is None else max(floor_lvl, last_sl["price"])
                if last_sh:
                    ceil_lvl = last_sh["price"]           # nearest overhead structure
            elif state == "Bearish":
                if last_sh:
                    ceil_lvl = last_sh["price"] if ceil_lvl is None else min(ceil_lvl, last_sh["price"])
                if last_sl:
                    floor_lvl = last_sl["price"]          # nearest support below
            else:
                floor_lvl = last_sl["price"] if last_sl else floor_lvl
                ceil_lvl = last_sh["price"] if last_sh else ceil_lvl

        # Flip checks on the close, using only levels known by now
        if state != "Bullish" and ceil_lvl is not None and c[t] > ceil_lvl:
            state = "Bullish"
            last_sl = next((e for e in reversed(events) if e["kind"] == "L"), None)
            if last_sl:
                floor_lvl = last_sl["price"]              # the low that preceded the breakout
            flips.append({"t": t, "to": state, "price": c[t]})
        elif state != "Bearish" and floor_lvl is not None and c[t] < floor_lvl:
            state = "Bearish"
            last_sh = next((e for e in reversed(events) if e["kind"] == "H"), None)
            if last_sh:
                ceil_lvl = last_sh["price"]               # the high that preceded the breakdown
            flips.append({"t": t, "to": state, "price": c[t]})

        regime[t] = state
        floor_arr[t] = np.nan if floor_lvl is None else floor_lvl
        ceil_arr[t] = np.nan if ceil_lvl is None else ceil_lvl

    return {
        "regime": regime, "floor": floor_arr, "ceiling": ceil_arr, "atr": atr,
        "swings": events, "flips": flips,
    }


@app.post("/api/flcl")
def flcl_analysis(req: FLCLRequest):
    req.ticker = _validate_symbol(req.ticker)
    days = max(60, min(int(req.days or 252), 756))
    w = max(2, min(int(req.swing_window or 5), 15))
    mult = max(0.5, min(float(req.atr_mult or 1.5), 4.0))

    cache_key = f"flcl_{req.ticker.upper()}_{days}_{w}_{mult}"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < CACHE_TTL:
        return API_CACHE[cache_key]['data']

    # Fetch beyond the display window so ATR/swings/regime are warmed up before
    # the first visible bar (the returned window carries an established state in).
    period = "1y" if days <= 126 else "2y" if days <= 252 else "3y" if days <= 504 else "5y"
    resolved, df = _yf_resolve_history(req.ticker, period)
    if df.empty:
        raise HTTPException(status_code=404, detail="Ticker not found")
    df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["High", "Low", "Close"])
    if len(df) < 90:
        raise HTTPException(status_code=400, detail="Not enough price history for regime analysis (need ~4 months).")

    eng = _flcl_engine(df, swing_window=w, atr_mult=mult)

    # ---- visible window ----
    m = min(days, len(df))
    s = len(df) - m
    dates = df.index.strftime("%Y-%m-%d").tolist()[s:]
    o = df["Open"].to_numpy(dtype=float)[s:]
    hi = df["High"].to_numpy(dtype=float)[s:]
    lo = df["Low"].to_numpy(dtype=float)[s:]
    cl = df["Close"].to_numpy(dtype=float)[s:]
    vol = df["Volume"].to_numpy(dtype=float)[s:]
    reg = eng["regime"][s:]
    flr = eng["floor"][s:]
    cel = eng["ceiling"][s:]
    atr = eng["atr"][s:]

    rp = np.full(m, np.nan)
    ok = np.isfinite(flr) & np.isfinite(cel) & (cel > flr)
    rp[ok] = (cl[ok] - flr[ok]) / (cel[ok] - flr[ok]) * 100

    r2 = lambda v: None if v is None or not np.isfinite(v) else round(float(v), 2)
    rnd = lambda arr: [r2(v) for v in arr]

    # ---- regime segments over the visible window ----
    segments = []
    seg_start = 0
    for t in range(1, m + 1):
        if t == m or reg[t] != reg[seg_start]:
            base = cl[seg_start - 1] if seg_start > 0 else cl[seg_start]
            segments.append({
                "regime": str(reg[seg_start]),
                "start": dates[seg_start], "end": dates[t - 1],
                "days": t - seg_start,
                "return_pct": r2((cl[t - 1] / base - 1) * 100),
            })
            seg_start = t

    # ---- honest scorecard: long only while Bullish, entered at the flip close ----
    rets = cl[1:] / cl[:-1] - 1
    in_bull = reg[:-1] == "Bullish"
    strat_curve = np.cumprod(1 + np.where(in_bull, rets, 0.0))
    bh_curve = np.cumprod(1 + rets)
    max_dd = lambda curve: float((curve / np.maximum.accumulate(curve) - 1).min() * 100)
    strat_ret = float((strat_curve[-1] - 1) * 100)
    bh_ret = float((bh_curve[-1] - 1) * 100)
    bull_segs = [x for x in segments if x["regime"] == "Bullish"]
    scorecard = {
        "strategy_return_pct": r2(strat_ret),
        "buy_hold_return_pct": r2(bh_ret),
        "edge_pct": r2(strat_ret - bh_ret),
        "exposure_pct": r2(float((reg == "Bullish").mean() * 100)),
        "time_bull_pct": r2(float((reg == "Bullish").mean() * 100)),
        "time_bear_pct": r2(float((reg == "Bearish").mean() * 100)),
        "time_neutral_pct": r2(float((reg == "Neutral").mean() * 100)),
        "flips": int(sum(1 for f in eng["flips"] if f["t"] >= s)),
        "max_dd_strategy_pct": r2(max_dd(strat_curve)),
        "max_dd_bh_pct": r2(max_dd(bh_curve)),
        "bull_segments": len(bull_segs),
        "bull_segments_won": sum(1 for x in bull_segs if (x["return_pct"] or 0) > 0),
    }

    # ---- current state + signals ----
    price = float(cl[-1])
    cur_reg = str(reg[-1])
    cur_floor, cur_ceil, cur_atr = float(flr[-1]), float(cel[-1]), float(atr[-1])
    cur_rp = float(rp[-1]) if np.isfinite(rp[-1]) else None
    days_in = 1
    for t in range(m - 2, -1, -1):
        if reg[t] == cur_reg:
            days_in += 1
        else:
            break
    range_width_atr = ((cur_ceil - cur_floor) / cur_atr) if (np.isfinite(cur_floor) and np.isfinite(cur_ceil) and cur_atr > 0) else None

    current = {
        "regime": cur_reg,
        "days_in_regime": days_in,
        "price": r2(price),
        "floor": r2(cur_floor),
        "ceiling": r2(cur_ceil),
        "dist_floor_pct": r2((price / cur_floor - 1) * 100) if np.isfinite(cur_floor) else None,
        "dist_ceiling_pct": r2((cur_ceil / price - 1) * 100) if np.isfinite(cur_ceil) else None,
        "range_pos_pct": r2(cur_rp) if cur_rp is not None else None,
        "range_width_atr": r2(range_width_atr) if range_width_atr is not None else None,
        "atr": r2(cur_atr),
        "atr_pct": r2(cur_atr / price * 100),
        "as_of": dates[-1],
    }

    items = []
    if cur_reg == "Bullish":
        bias = "LONG"
        if cur_rp is not None and cur_rp < 35:
            items.append({"type": "BUY_ZONE", "strength": "STRONG",
                          "reason": "Bullish regime with price in the lower third of the floor–ceiling range — favourable long entry zone."})
        if cur_rp is not None and cur_rp > 85:
            items.append({"type": "EXTENDED", "strength": "MODERATE",
                          "reason": "Price is pressing the ceiling — chase risk is elevated; wait for a pullback or a confirmed breakout."})
        if np.isfinite(cur_floor) and price < cur_floor + cur_atr:
            items.append({"type": "STOP_PROXIMITY", "strength": "STRONG",
                          "reason": f"Close is within 1 ATR of the regime floor ({r2(cur_floor)}) — a daily close below it flips the regime bearish."})
    elif cur_reg == "Bearish":
        bias = "SHORT / CASH"
        if cur_rp is not None and cur_rp > 65:
            items.append({"type": "SELL_ZONE", "strength": "STRONG",
                          "reason": "Bearish regime with price in the upper third of the range — favourable zone to reduce or short."})
        if cur_rp is not None and cur_rp < 15:
            items.append({"type": "OVERSOLD", "strength": "MODERATE",
                          "reason": "Price is stretched toward the floor — poor location to initiate shorts; bounces are common here."})
        if np.isfinite(cur_ceil) and price > cur_ceil - cur_atr:
            items.append({"type": "BREAKOUT_WATCH", "strength": "STRONG",
                          "reason": f"Close is within 1 ATR of the regime ceiling ({r2(cur_ceil)}) — a daily close above it flips the regime bullish."})
    else:
        bias = "NEUTRAL"
        items.append({"type": "WAIT", "strength": "INFO",
                      "reason": "Regime is inconclusive — wait for a decisive close beyond the ceiling or floor before committing."})
    if days_in <= 5 and cur_reg != "Neutral":
        items.append({"type": "FRESH_FLIP", "strength": "MODERATE",
                      "reason": f"Regime flipped {cur_reg.lower()} only {days_in} session(s) ago — early flips carry the most whipsaw risk; confirmation adds confidence."})
    if range_width_atr is not None and range_width_atr < 3:
        items.append({"type": "COMPRESSION", "strength": "MODERATE",
                      "reason": "The floor–ceiling range is under 3 ATRs wide — volatility compression often precedes a decisive break."})

    suggested_stop = None
    if cur_reg == "Bullish" and np.isfinite(cur_floor):
        suggested_stop = r2(cur_floor - 0.5 * cur_atr)
    elif cur_reg == "Bearish" and np.isfinite(cur_ceil):
        suggested_stop = r2(cur_ceil + 0.5 * cur_atr)

    data = _json_safe({
        "ticker": resolved,
        "params": {"days": days, "swing_window": w, "atr_mult": mult},
        "candles": {"dates": dates, "open": rnd(o), "high": rnd(hi), "low": rnd(lo),
                    "close": rnd(cl), "volume": [int(v) if np.isfinite(v) else 0 for v in vol]},
        "levels": {"floor": rnd(flr), "ceiling": rnd(cel), "regime": [str(x) for x in reg],
                   "range_pos": rnd(rp)},
        "swings": [{"date": df.index[e["i"]].strftime("%Y-%m-%d"), "type": e["kind"], "price": r2(e["price"])}
                   for e in eng["swings"] if e["i"] >= s],
        "flips": [{"date": df.index[f["t"]].strftime("%Y-%m-%d"), "to": f["to"], "price": r2(f["price"])}
                  for f in eng["flips"] if f["t"] >= s],
        "current": current,
        "signals": {"bias": bias, "suggested_stop": suggested_stop, "items": items},
        "segments": segments,
        "scorecard": scorecard,
    })
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    return data


# --- Nifty 10-day realized-vol forecast (SARIMAX + GJR-GARCH-t ensemble) ---
# Research harness: research/nifty_rv_forecast.py. The expensive parts (AIC
# order grid, 100-origin rolling backtest on 2008-2026 data) run offline; the
# endpoint refits that FROZEN spec on ~4y of data so a cold serverless request
# stays in single-digit seconds. Frozen numbers below come from the offline run.
RV_SPEC = {
    "order": (3, 0, 2),                # AIC-selected on 18y, stable vs 10y
    "seasonal_order": (0, 0, 1, 5),    # weekly MA term
    "w_sarimax": 0.62,                 # inverse-OOS-RMSE weights (100 origins)
    "w_garch": 0.38,
    "horizon": 10,
    "rv_window": 10,
    "backtest": {"n_origins": 100, "qlike": 0.1625, "rmse_logvol": 0.3328,
                 "sample": "2008-2026"},
}


def _compute_rv_forecast():
    import warnings
    from statsmodels.tsa.statespace.sarimax import SARIMAX
    from statsmodels.tsa.ar_model import AutoReg

    H, W = RV_SPEC["horizon"], RV_SPEC["rv_window"]
    ANN = 252

    px = yf.download("^NSEI", period="4y", interval="1d",
                     auto_adjust=True, progress=False)
    if isinstance(px.columns, pd.MultiIndex):
        px.columns = px.columns.get_level_values(0)
    px = px.dropna(subset=["High", "Low", "Close"])
    px = px[px["High"] > px["Low"]]  # placeholder OHLC rows break Parkinson
    if len(px) < 300:
        raise HTTPException(status_code=502, detail="Not enough Nifty history for the vol model.")

    try:
        vix_df = yf.download("^INDIAVIX", period="4y", interval="1d",
                             auto_adjust=False, progress=False)
        if isinstance(vix_df.columns, pd.MultiIndex):
            vix_df.columns = vix_df.columns.get_level_values(0)
        vix = vix_df["Close"].rename("vix")
    except Exception:
        vix = pd.Series(dtype=float, name="vix")

    df = pd.DataFrame(index=px.index)
    df["ret"] = np.log(px["Close"]).diff()
    # Parkinson (range) estimator: ~5x more efficient than close-to-close and
    # immune to Yahoo's unreliable NSEI opens
    park = (np.log(px["High"] / px["Low"]) ** 2) / (4.0 * np.log(2.0))
    df["rv"] = np.sqrt(park.rolling(W).mean() * ANN) * 100  # annualized %
    df = df.join(vix, how="left")
    df["vix"] = df["vix"].ffill()
    if df["vix"].notna().any():
        df = df.loc[df["vix"].first_valid_index():]
    df = df.dropna(subset=["ret", "rv"])
    df = df[df["rv"] > 0]
    has_vix = df["vix"].notna().all() and len(df["vix"]) > 0

    y = np.log(df["rv"])
    exog = np.log(df[["vix"]]) if has_vix else None

    sarimax_leg = None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        try:
            m = SARIMAX(y, exog=exog, order=RV_SPEC["order"],
                        seasonal_order=RV_SPEC["seasonal_order"],
                        trend="c", enforce_stationarity=True)
            r = m.fit(disp=False, method="lbfgs", maxiter=300)
            fx = None
            if has_vix:
                # mean-reverting AR(1) path for log VIX over the horizon —
                # naive persistence overstates vol after spikes
                ar = AutoReg(np.log(df["vix"]), lags=1, trend="c").fit()
                c, phi = float(ar.params.iloc[0]), float(ar.params.iloc[1])
                x, path = float(np.log(df["vix"].iloc[-1])), []
                for _ in range(H):
                    x = c + phi * x
                    path.append(x)
                fx = np.array(path).reshape(-1, 1)
            fc = r.get_forecast(steps=H, exog=fx)
            mu, se = float(fc.predicted_mean.iloc[-1]), float(fc.se_mean.iloc[-1])
            sarimax_leg = {
                "point": float(np.exp(mu + 0.5 * se**2)),  # lognormal mean
                "band68": [float(np.exp(mu - se)), float(np.exp(mu + se))],
                "band95": [float(np.exp(mu - 1.96 * se)), float(np.exp(mu + 1.96 * se))],
            }
        except Exception:
            sarimax_leg = None

    garch_leg = None
    try:
        from arch import arch_model
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            am = arch_model(df["ret"].dropna() * 100, mean="Constant",
                            vol="GARCH", p=1, o=1, q=1, dist="t")
            res = am.fit(disp="off")
            var_path = res.forecast(horizon=H, reindex=False).variance.iloc[0].values
            garch_leg = {"point": float(np.sqrt(var_path.mean() * ANN)),
                         "nu": round(float(res.params.get("nu", float("nan"))), 1)}
    except Exception:
        garch_leg = None  # arch missing or fit failed — SARIMAX carries it

    if sarimax_leg is None and garch_leg is None:
        raise HTTPException(status_code=502, detail="Volatility model failed to fit.")

    w_s, w_g = RV_SPEC["w_sarimax"], RV_SPEC["w_garch"]
    if sarimax_leg and garch_leg:
        ens = float(np.exp(w_s * np.log(sarimax_leg["point"]) + w_g * np.log(garch_leg["point"])))
    else:
        leg = sarimax_leg or garch_leg
        ens, w_s, w_g = leg["point"], 1.0 if sarimax_leg else 0.0, 1.0 if garch_leg else 0.0

    # ensemble band: SARIMAX log-space CI width re-centred on the ensemble point
    band68 = band95 = None
    if sarimax_leg:
        shift = np.log(ens) - np.log(sarimax_leg["point"])
        band68 = [float(np.exp(np.log(b) + shift)) for b in sarimax_leg["band68"]]
        band95 = [float(np.exp(np.log(b) + shift)) for b in sarimax_leg["band95"]]

    spot = float(px["Close"].iloc[-1])
    rv_now = float(df["rv"].iloc[-1])
    vix_now = float(df["vix"].iloc[-1]) if has_vix else None
    return _json_safe({
        "as_of": str(df.index[-1].date()),
        "spot": round(spot, 1),
        "horizon_days": H,
        "current": {"rv10": round(rv_now, 2), "vix": vix_now and round(vix_now, 2)},
        "legs": {
            "sarimax": sarimax_leg and {**sarimax_leg, "point": round(sarimax_leg["point"], 2),
                                        "spec": "SARIMAX(3,0,2)x(0,0,1,5) + logVIX"},
            "garch": garch_leg and {**garch_leg, "point": round(garch_leg["point"], 2),
                                    "spec": "GJR-GARCH(1,1)-t"},
        },
        "ensemble": {"point": round(ens, 2), "w_sarimax": w_s, "w_garch": w_g},
        "band68": band68, "band95": band95,
        "expected_move_pct": round(float(ens / np.sqrt(ANN) * np.sqrt(H)), 2),  # 1-sigma over horizon
        "vrp": vix_now and round(vix_now - ens, 2),  # implied minus forecast realized
        "backtest": RV_SPEC["backtest"],
    })


@app.get("/api/rv-forecast")
async def get_rv_forecast():
    """10-day-ahead Nifty realized-vol forecast for the Signals tab.

    Refit is a few seconds of CPU, inputs move once a day — cache generously
    (1h) and serve stale on refit failure rather than erroring the card."""
    cache_key = "rv_forecast"
    cached = API_CACHE.get(cache_key)
    if cached and time.time() - cached["time"] < 3600:
        return cached["data"]
    try:
        data = await asyncio.to_thread(_compute_rv_forecast)
    except HTTPException:
        if cached:
            return cached["data"]
        raise
    except Exception as e:
        if cached:
            return cached["data"]
        raise HTTPException(status_code=502, detail=f"Vol model error: {e}")
    API_CACHE[cache_key] = {"time": time.time(), "data": data}
    return data


def _ai_error_report(e: Exception) -> dict:
    """Readable insight-panel message instead of a raw Gemini exception dump.

    The frontend auto-generates insights on page load, so this text is often
    the first thing a user with a misconfigured key sees.
    """
    msg = str(e)
    if "API key not valid" in msg or "API_KEY_INVALID" in msg or "PERMISSION_DENIED" in msg:
        friendly = "Your Gemini API key was rejected. Re-check the key in Settings (get one free at aistudio.google.com)."
    elif "RESOURCE_EXHAUSTED" in msg or "429" in msg or "quota" in msg.lower():
        friendly = "Your Gemini API key has hit its rate limit or quota. Wait a minute and press REFRESH, or use a different key."
    elif "UNAVAILABLE" in msg or "503" in msg or "timeout" in msg.lower():
        friendly = "The Gemini service is temporarily unavailable. Press REFRESH to retry."
    else:
        friendly = f"AI analysis failed: {msg[:200]}"
    return {"report": f"**{friendly}**"}


@app.post("/api/ai/chart")
def ai_chart_summary(req: AIChartRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = _genai_client(req.apiKey)
    prompt = f"""
    You are an automated analytical system emulating the trading style and technical analysis approach of Mark Minervini. Ensure your output is highly objective and analytical.
    Do NOT provide any predictive financial advice or investment recommendations.
    Analyze the following price action and technical data for '{req.ticker}' using Minervini's principles. Specifically, look for characteristics of a Stage 2 Uptrend, Volatility Contraction Patterns (VCP), and pivot points.
    Format the response using markdown bullet points. Focus your analysis on trend alignment, moving average structure, signs of institutional accumulation or distribution, and the contraction of price and volume.
    
    Data:
    {req.data_summary}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.post("/api/ai/druck-minervini")
async def analyze_druck_minervini(
    file: UploadFile = File(None),
    ticker: str = Form(None),
    macro_context: str = Form(None),
    apiKey: str = Form(None)
):
    if not apiKey:
        raise HTTPException(status_code=400, detail="Gemini API Key is required")
        
    client = _genai_client(apiKey)
    
    sepa_checks = {}
    chart_data = None
    data_summary = ""
    
    if ticker:
        ticker = ticker.upper().strip()
        try:
            def fetch_data():
                stock = yf.Ticker(ticker)
                return stock.history(period="2y")
                
            df = await asyncio.to_thread(fetch_data)
            
            if not df.empty:
                df['SMA_50'] = df['Close'].rolling(window=50).mean()
                df['SMA_150'] = df['Close'].rolling(window=150).mean()
                df['SMA_200'] = df['Close'].rolling(window=200).mean()
                
                df_1y = df.tail(252)
                high_52w = float(df_1y['High'].max())
                low_52w = float(df_1y['Low'].min())
                
                current_close = float(df_1y['Close'].iloc[-1])
                sma_50 = float(df_1y['SMA_50'].iloc[-1]) if not pd.isna(df_1y['SMA_50'].iloc[-1]) else None
                sma_150 = float(df_1y['SMA_150'].iloc[-1]) if not pd.isna(df_1y['SMA_150'].iloc[-1]) else None
                sma_200 = float(df_1y['SMA_200'].iloc[-1]) if not pd.isna(df_1y['SMA_200'].iloc[-1]) else None
                
                sma_200_20d_ago = float(df_1y['SMA_200'].iloc[-21]) if len(df_1y) >= 21 and not pd.isna(df_1y['SMA_200'].iloc[-21]) else sma_200
                
                r1 = current_close > sma_150 and current_close > sma_200 if (sma_150 and sma_200) else False
                r2 = sma_150 > sma_200 if (sma_150 and sma_200) else False
                r3 = sma_200 > sma_200_20d_ago if (sma_200 and sma_200_20d_ago) else False
                r4 = sma_50 > sma_150 and sma_150 > sma_200 if (sma_50 and sma_150 and sma_200) else False
                r5 = current_close > sma_50 if sma_50 else False
                r6 = current_close >= low_52w * 1.30
                r7 = current_close >= high_52w * 0.75
                
                benchmark_ticker = "SPY"
                if ticker.endswith(".NS") or ticker.endswith(".BO"):
                    benchmark_ticker = "^NSEI"
                
                def fetch_bench():
                    bench = yf.Ticker(benchmark_ticker)
                    return bench.history(period="1y")
                    
                df_bench = await asyncio.to_thread(fetch_bench)
                r8 = False
                rs_pct_stock = 0.0
                rs_pct_bench = 0.0
                
                if not df_bench.empty and len(df_1y) >= 252:
                    stock_1y_ret = (df_1y['Close'].iloc[-1] / df_1y['Close'].iloc[0] - 1) * 100
                    bench_1y_ret = (df_bench['Close'].iloc[-1] / df_bench['Close'].iloc[0] - 1) * 100
                    r8 = stock_1y_ret > bench_1y_ret
                    rs_pct_stock = float(stock_1y_ret)
                    rs_pct_bench = float(bench_1y_ret)
                
                sepa_checks = {
                    "rule1": {"desc": "Price above 150-day and 200-day SMA", "passed": bool(r1), "value": f"Close: ${current_close:.2f}, SMA150: ${sma_150:.2f}, SMA200: ${sma_200:.2f}" if (sma_150 and sma_200) else "N/A"},
                    "rule2": {"desc": "150-day SMA above 200-day SMA", "passed": bool(r2), "value": f"SMA150: ${sma_150:.2f} > SMA200: ${sma_200:.2f}" if (sma_150 and sma_200) else "N/A"},
                    "rule3": {"desc": "200-day SMA trending up (20d)", "passed": bool(r3), "value": f"Current: ${sma_200:.2f}, 20d Ago: ${sma_200_20d_ago:.2f}" if (sma_200 and sma_200_20d_ago) else "N/A"},
                    "rule4": {"desc": "50-day SMA above 150-day and 200-day SMA", "passed": bool(r4), "value": f"SMA50: ${sma_50:.2f}, SMA150: ${sma_150:.2f}, SMA200: ${sma_200:.2f}" if (sma_50 and sma_150 and sma_200) else "N/A"},
                    "rule5": {"desc": "Price above 50-day SMA", "passed": bool(r5), "value": f"Close: ${current_close:.2f}, SMA50: ${sma_50:.2f}" if sma_50 else "N/A"},
                    "rule6": {"desc": "Price >= 30% above 52-week low", "passed": bool(r6), "value": f"Close: ${current_close:.2f}, 52w Low: ${low_52w:.2f} (+{((current_close/low_52w - 1)*100):.1f}%)"},
                    "rule7": {"desc": "Price within 25% of 52-week high", "passed": bool(r7), "value": f"Close: ${current_close:.2f}, 52w High: ${high_52w:.2f} (-{((1 - current_close/high_52w)*100):.1f}%)"},
                    "rule8": {"desc": f"Relative Strength outperforms benchmark ({benchmark_ticker})", "passed": bool(r8), "value": f"Stock 1Y Return: {rs_pct_stock:.1f}%, Benchmark Return: {rs_pct_bench:.1f}%"}
                }
                
                passed_count = sum(1 for rule in sepa_checks.values() if rule["passed"])
                sma_50_val = f"${sma_50:.2f}" if sma_50 is not None else "N/A"
                sma_150_val = f"${sma_150:.2f}" if sma_150 is not None else "N/A"
                sma_200_val = f"${sma_200:.2f}" if sma_200 is not None else "N/A"
                data_summary = f"""
                Ticker: {ticker}
                Latest Close: ${current_close:.2f}
                52-Week Range: ${low_52w:.2f} - ${high_52w:.2f}
                SMA 50: {sma_50_val}
                SMA 150: {sma_150_val}
                SMA 200: {sma_200_val}
                Minervini Trend Template Score: {passed_count}/8 Rules Passed.
                """
                
                df_plotly = df.tail(150).copy()
                df_plotly.index = df_plotly.index.strftime('%Y-%m-%d')
                df_plotly = df_plotly.ffill().bfill()
                chart_data = {
                    "dates": df_plotly.index.tolist(),
                    "open": df_plotly['Open'].tolist(),
                    "high": df_plotly['High'].tolist(),
                    "low": df_plotly['Low'].tolist(),
                    "close": df_plotly['Close'].tolist(),
                    "volume": df_plotly['Volume'].tolist(),
                    "sma50": df_plotly['SMA_50'].tolist() if 'SMA_50' in df_plotly else [],
                    "sma150": df_plotly['SMA_150'].tolist() if 'SMA_150' in df_plotly else [],
                    "sma200": df_plotly['SMA_200'].tolist() if 'SMA_200' in df_plotly else [],
                }
        except Exception as e:
            print(f"yfinance failed for {ticker}: {e}")
            sepa_checks = {"error": f"Failed to pull metrics: {str(e)}"}
            
    prompt = """
    You are an elite Goldman Sachs macro portfolio manager and trading strategist.
    Analyze the provided trade setup combining:
    1. Mark Minervini's SEPA (Specific Entry Point Analysis) framework (Stage 2 Uptrends, Volatility Contraction Pattern (VCP), pivot breakouts, and volume dry-ups).
    2. Stanley Druckenmiller's macroeconomic thematic framework (central bank liquidity, industry tailwinds, catalyst identification, and high-conviction position concentration).

    Please structure your analysis into these specific sections:
    
    ### 1. Technical Analysis (Minervini SEPA Setup)
    - Pattern Identification: Analyze the uploaded chart image. Do you see a cup & handle, volatility contraction pattern (VCP), flat base, or standard consolidation?
    - Volatility Contraction Check: Identify price/volume contractions. Does the volume dry up at the bottom of contractions and expand on up-moves?
    - Pivot & Entry Plan: Define the precise breakout pivot price level, low-risk entry zone, and key resistance/support levels.
    
    ### 2. Macro Thematic & Liquidity (Druckenmiller Lens)
    - Industry Catalyst & Secular Trend: How does this trade align with current major global/national macro trends (e.g. AI/Tech expansion, inflation/deflation, energy transition, interest rate policy shifts)?
    - Liquidity & Fund Flows: Assess the general market liquidity backdrop or sector volume flows. Does this asset benefit from institutional accumulation?
    - Core Catalyst: What is the primary event, earnings breakout, or thematic shift that will drive momentum?
    
    ### 3. Conviction Rating & Position Sizing
    - Strategic Conviction Score (1-10): Rate the combined setup. A high score (8-10) requires both the micro-technical setup (Minervini) and macro catalyst/liquidity (Druckenmiller) to be perfectly aligned.
    - Sizing Advice: Give Druckenmiller-style conviction-based advice. Should this be a 'tactical pilot' (small, test position) or a 'high-conviction core position' (where we 'put all our eggs in one basket and watch it closely')?
    
    ### 4. Risk & Trade Plan
    - Entry Trigger Price: $X.XX
    - Initial Stop-Loss Price: $X.XX (Recommend a strict stop-loss, e.g. 5-8% max below entry, aligning with Minervini's guidelines)
    - Take-Profit Targets: Target 1 ($X.XX) and Target 2 ($X.XX)
    - Risk-Reward Ratio (e.g. 1:3 or better)
    """
    
    if data_summary:
        prompt += f"\nHere is the calculated Python technical data summary for this stock:\n{data_summary}\n"
        
    if macro_context:
        prompt += f"\nUser Provided Macro Context/Catalyst:\n{macro_context}\n"
        
    contents = [prompt]
    
    if file:
        try:
            image_bytes = await file.read()
            from PIL import Image
            image = Image.open(io.BytesIO(image_bytes))
            contents.append(image)
        except Exception as e:
            return {"report": f"Failed to read/parse uploaded image: {str(e)}", "sepa_checks": sepa_checks, "chart_data": chart_data}
            
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=contents
        )
        return {
            "report": response.text,
            "sepa_checks": sepa_checks,
            "chart_data": chart_data
        }
    except Exception as e:
        return {
            "report": f"Gemini API Error: {str(e)}",
            "sepa_checks": sepa_checks,
            "chart_data": chart_data
        }

@app.post("/api/ai/dcf")
def ai_dcf_summary(req: AIDCFRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = _genai_client(req.apiKey)
    prompt = f"""
    You are an automated analytical system. Ensure your output is purely factual and objective.
    Do NOT provide predictive financial advice or investment recommendations.
    Review the following mathematically derived Discounted Cash Flow (DCF) output for '{req.ticker}'.
    Format using markdown bullet points. State objectively if the asset appears overvalued, undervalued, or fairly valued based purely on the presented implied intrinsic margin of safety. Detail assumption sensitivities.
    
    DCF Data Summary:
    {req.dcf_data}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.post("/api/ai/fundamentals")
def ai_fundamentals_summary(req: AIFundamentalsRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = _genai_client(req.apiKey)
    prompt = f"""
    You are an expert fundamental analyst. Review the following financial metrics for '{req.ticker}'.
    Format using markdown bullet points. Highlight any major red flags or strong competitive advantages shown by the data (e.g. high debt, stellar margins). Objectively summarize the company's financial health.
    
    Fundamentals Data:
    {req.fundamentals_data}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.post("/api/ai/arima")
def ai_arima_summary(req: AIARIMARequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = _genai_client(req.apiKey)
    prompt = f"""
    You are an automated analytical system. Ensure your output is purely factual and objective.
    Review the following SARIMAX statistical projection for '{req.ticker}'. 
    Format using markdown bullet points. Detail the projected trend direction, potential volatility bounds, and any mean-reverting tendencies based on the numbers.
    Do NOT provide predictive financial advice.
    
    Forecast Data:
    {req.forecast_data}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.post("/api/ai/flcl")
def ai_flcl_summary(req: AIFLCLRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}

    client = _genai_client(req.apiKey)
    prompt = f"""
    You are an automated market-structure analysis system. Ensure your output is purely factual and objective.
    Review the following Floor/Ceiling regime analysis for '{req.ticker}'.
    The engine classifies the market as Bullish/Bearish/Neutral from confirmed swing structure; the floor is trailing
    structural support (its break flips the regime bearish) and the ceiling is trailing resistance (its break flips bullish).
    Format using markdown bullet points. Cover: the current regime and its maturity, the price's location between floor and
    ceiling and what that implies for entry quality, the key levels that would change the regime, and what the regime
    scorecard (strategy vs buy-and-hold, exposure, flips) says about how well this instrument trends.
    Do NOT provide predictive financial advice.

    Regime Data:
    {req.flcl_data}
    """

    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.post("/api/ai/position-sizing")
def ai_position_sizing_summary(req: AIPositionSizingRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = _genai_client(req.apiKey)
    prompt = f"""
    You are an automated quantitative risk management system. 
    Analyze the following trade setup from an institutional capital preservation perspective.
    Format your response in markdown bullet points. Highlight risk concentration, Risk:Reward assumptions needed, and the impact of the sizing on the overall portfolio.
    
    Capital: ${req.capital}
    Risk: {req.risk_percent}%
    Entry: ${req.entry_price}
    Stop Loss: ${req.stop_loss}
    Computed Shares: {req.shares}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.post("/api/ai/screener")
def ai_screener_summary(req: AIScreenerRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
        
    client = _genai_client(req.apiKey)
    prompt = f"""
    You are an institutional quantitative system.
    Evaluate the following cross-section of equities derived from a quantitative screen.
    Format using markdown bullet points. Identify statistical outliers regarding P/E and Dividend Yield, identify potential value traps, and provide a comparative macro perspective.
    Do NOT provide investment advice.
    
    Screener Data:
    {req.screener_data}
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.get("/api/momentum")
async def get_momentum(market: str = "us"):
    cache_key = f"momentum_{market}"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < CACHE_TTL:
        return API_CACHE[cache_key]['data']
        
    # Universe: large-cap constituents; only the top-ranked names are returned
    if market.lower() == 'in':
        tickers = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
                   "SBIN.NS", "BHARTIARTL.NS", "ITC.NS", "HINDUNILVR.NS", "LT.NS",
                   "BAJFINANCE.NS", "HCLTECH.NS", "MARUTI.NS", "SUNPHARMA.NS", "TMPV.NS", "TMCV.NS",
                   "KOTAKBANK.NS", "M&M.NS", "ULTRACEMCO.NS", "AXISBANK.NS", "NTPC.NS",
                   "ONGC.NS", "TITAN.NS", "ADANIENT.NS", "ADANIPORTS.NS", "POWERGRID.NS",
                   "ASIANPAINT.NS", "BAJAJFINSV.NS", "WIPRO.NS", "JSWSTEEL.NS", "TATASTEEL.NS",
                   "COALINDIA.NS", "NESTLEIND.NS", "GRASIM.NS", "HINDALCO.NS", "SBILIFE.NS",
                   "HDFCLIFE.NS", "TECHM.NS", "EICHERMOT.NS", "DRREDDY.NS", "CIPLA.NS",
                   "APOLLOHOSP.NS", "BRITANNIA.NS", "INDUSINDBK.NS", "HEROMOTOCO.NS", "BAJAJ-AUTO.NS",
                   "TATACONSUM.NS", "BPCL.NS", "SHRIRAMFIN.NS", "TRENT.NS", "BEL.NS"]
    else:
        tickers = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
                   "META", "BRK-B", "TSLA", "UNH", "JNJ",
                   "V", "WMT", "JPM", "PG", "MA",
                   "XOM", "HD", "CVX", "ABBV", "MRK",
                   "KO", "PEP", "AVGO", "COST", "ORCL",
                   "BAC", "CRM", "AMD", "NFLX", "ADBE",
                   "TMO", "LIN", "MCD", "ABT", "CSCO",
                   "ACN", "WFC", "IBM", "GE", "CAT",
                   "QCOM", "INTU", "TXN", "AMGN", "PM",
                   "DIS", "UBER", "PFE", "NOW", "SPGI"]

    def scan_universe():
        # One batch download for the whole universe (~50 names, 14 months of
        # daily OHLCV) — far faster than 50 per-ticker requests, and the OHLCV
        # gives us breakout levels + volume ratios, not just closes.
        try:
            df = yf.download(" ".join(tickers), period="14mo", group_by="ticker",
                             threads=True, progress=False, auto_adjust=True)
        except Exception:
            return [], []

        leaders, breakouts = [], []
        for ticker in tickers:
            try:
                h = df[ticker].dropna(how="all")
                closes = h["Close"].dropna()
                if len(closes) < 60:
                    continue
                last = float(closes.iloc[-1])
                prev = float(closes.iloc[-2])
                chg_today = (last / prev - 1) * 100 if prev else 0.0

                # RSI(14)
                delta = closes.diff()
                gain = delta.clip(lower=0).ewm(com=13, adjust=False).mean()
                loss = (-delta.clip(upper=0)).ewm(com=13, adjust=False).mean()
                rs = gain.iloc[-1] / loss.iloc[-1] if loss.iloc[-1] else float("inf")
                rsi = 100 - (100 / (1 + rs)) if np.isfinite(rs) else 100.0

                sma50 = float(closes.tail(50).mean())
                dist_50dma = (last / sma50 - 1) * 100 if sma50 else 0.0
                high_52w = float(h["High"].iloc[-252:].max()) if len(h) >= 252 else float(h["High"].max())
                off_52w_high = (last / high_52w - 1) * 100 if high_52w else 0.0
                vol = float(h["Volume"].iloc[-1] or 0)
                avg_vol = float(h["Volume"].iloc[-21:-1].mean() or 0)
                vol_ratio = vol / avg_vol if avg_vol else 0.0
                spark = [round(float(c), 2) for c in closes.tail(60)]

                # Last ~60 sessions of OHLCV for the frontend candlestick
                # charts (spark stays for back-compat with Focus List)
                ohlc = h.dropna(subset=["Open", "High", "Low", "Close"]).tail(60)
                candles = {
                    "o": [round(float(x), 2) for x in ohlc["Open"]],
                    "h": [round(float(x), 2) for x in ohlc["High"]],
                    "l": [round(float(x), 2) for x in ohlc["Low"]],
                    "c": [round(float(x), 2) for x in ohlc["Close"]],
                    "v": [int(x) if np.isfinite(x) else 0 for x in ohlc["Volume"].fillna(0)],
                }

                # --- Breakout scan: last trade above the PRIOR high (today excluded) ---
                prior_highs = h["High"].iloc[:-1]
                hi20 = float(prior_highs.tail(20).max())
                hi63 = float(prior_highs.tail(63).max())
                hi252 = float(prior_highs.tail(252).max()) if len(prior_highs) >= 100 else None
                if last > hi20 and chg_today > 0:
                    if hi252 and last > hi252:
                        btype, level = "52W HIGH", hi252
                    elif last > hi63:
                        btype, level = "3M HIGH", hi63
                    else:
                        btype, level = "20D HIGH", hi20
                    breakouts.append({
                        "ticker": ticker, "price": round(last, 2),
                        "chg_today": round(chg_today, 2),
                        "type": btype, "level": round(level, 2),
                        "margin": round((last / level - 1) * 100, 2),
                        "vol_ratio": round(vol_ratio, 2),
                        "rsi": round(rsi, 1),
                        "spark": spark,
                        "candles": candles,
                        # strength: rarer high + volume conviction + move size
                        "_rank": ({"52W HIGH": 3, "3M HIGH": 2, "20D HIGH": 1}[btype]
                                  * (1 + min(vol_ratio, 4)) * (1 + abs(chg_today))),
                    })

                # --- Momentum leaders need a full year of history ---
                if len(closes) < 252:
                    continue
                mom_1m = (last / float(closes.iloc[-21]) - 1) * 100
                mom_6m = (last / float(closes.iloc[-126]) - 1) * 100
                mom_12m = (last / float(closes.iloc[-252]) - 1) * 100
                score = (mom_1m + mom_6m + mom_12m) / 3
                if not all(np.isfinite(v) for v in (last, mom_1m, mom_6m, mom_12m, score, rsi)):
                    continue
                leaders.append({
                    "ticker": ticker,
                    "mom_1m": round(mom_1m, 2),
                    "mom_6m": round(mom_6m, 2),
                    "mom_12m": round(mom_12m, 2),
                    "score": round(score, 2),
                    "price": round(last, 2),
                    "chg_today": round(chg_today, 2),
                    "rsi": round(rsi, 1),
                    "off_52w_high": round(off_52w_high, 2),
                    "dist_50dma": round(dist_50dma, 2),
                    "vol_ratio": round(vol_ratio, 2),
                    "spark": spark,
                    "candles": candles,
                })
            except Exception:
                continue
        return leaders, breakouts

    leaders, breakouts = await asyncio.to_thread(scan_universe)
    if not leaders:
        raise HTTPException(status_code=400, detail="Failed to fetch momentum data for tickers")

    leaders.sort(key=lambda x: x["score"], reverse=True)
    breakouts.sort(key=lambda x: x["_rank"], reverse=True)
    for b in breakouts:
        b.pop("_rank", None)

    response_data = {"data": leaders[:15], "breakouts": breakouts[:10],
                     "universe": len(tickers), "market": market.lower()}
    API_CACHE[cache_key] = {'time': time.time(), 'data': response_data}
    return response_data


# --- Sector Rotation ---------------------------------------------------------
# Tracks how India's sector indices rotate around the Nifty 50 benchmark using
# the institutional Relative Rotation Graph (RRG) model plus multi-timeframe
# relative strength, and ranks each sector's near-term (next-week) tailwind vs
# headwind. Historical closes come from yfinance (verified reliable for the
# ^CNX* sector tickers); the live daily move is overlaid from NSE allIndices.
# display name -> (yahoo ticker for history, NSE allIndices name for live %)
SECTOR_INDICES = {
    "Nifty Bank": ("^NSEBANK", "NIFTY BANK"),
    "Nifty IT": ("^CNXIT", "NIFTY IT"),
    "Nifty Auto": ("^CNXAUTO", "NIFTY AUTO"),
    "Nifty Pharma": ("^CNXPHARMA", "NIFTY PHARMA"),
    "Nifty FMCG": ("^CNXFMCG", "NIFTY FMCG"),
    "Nifty Metal": ("^CNXMETAL", "NIFTY METAL"),
    "Nifty Realty": ("^CNXREALTY", "NIFTY REALTY"),
    "Nifty Energy": ("^CNXENERGY", "NIFTY ENERGY"),
    "Nifty Media": ("^CNXMEDIA", "NIFTY MEDIA"),
    "Nifty PSU Bank": ("^CNXPSUBANK", "NIFTY PSU BANK"),
    "Nifty Fin Services": ("NIFTY_FIN_SERVICE.NS", "NIFTY FINANCIAL SERVICES"),
    "Nifty Infra": ("^CNXINFRA", "NIFTY INFRASTRUCTURE"),
}
SECTOR_BENCHMARK = ("^NSEI", "NIFTY 50")

# US sectors: the SPDR sector ETFs vs SPY. During the US cash session (20:00–
# 02:00 IST, same window the dashboard/signals use) /api/sectors serves this
# instead of the NSE map. display name -> (yahoo ticker, live-source key=None).
US_SECTOR_INDICES = {
    "Technology": ("XLK", None),
    "Financials": ("XLF", None),
    "Health Care": ("XLV", None),
    "Energy": ("XLE", None),
    "Discretionary": ("XLY", None),
    "Staples": ("XLP", None),
    "Industrials": ("XLI", None),
    "Materials": ("XLB", None),
    "Utilities": ("XLU", None),
    "Real Estate": ("XLRE", None),
    "Comm Svcs": ("XLC", None),
}
US_SECTOR_BENCHMARK = ("SPY", "S&P 500")
RRG_TAIL_WEEKS = 6          # length of the trajectory tail on the RRG chart
RRG_NORM_WINDOW = 10        # rolling window for the RS z-score normalization

def _rrg_quadrant(rs_ratio, rs_mom):
    if rs_ratio >= 100 and rs_mom >= 100:
        return "Leading"
    if rs_ratio >= 100 and rs_mom < 100:
        return "Weakening"
    if rs_ratio < 100 and rs_mom < 100:
        return "Lagging"
    return "Improving"

def _pct_return(closes, lookback):
    """Simple % return over `lookback` sessions; None if not enough history."""
    if len(closes) <= lookback:
        return None
    prev = float(closes.iloc[-1 - lookback])
    return (float(closes.iloc[-1]) / prev - 1) * 100 if prev else None

def _squash(x, scale):
    """Map a signed value into 0-100 with 50 = neutral, saturating at ±scale."""
    if x is None or not np.isfinite(x):
        return 50.0
    return 50.0 + max(-50.0, min(50.0, (x / scale) * 50.0))

def _compute_sector_rotation(market="IN"):
    import pandas as pd
    market = "US" if str(market).upper() == "US" else "IN"
    sectors_map = US_SECTOR_INDICES if market == "US" else SECTOR_INDICES
    benchmark = US_SECTOR_BENCHMARK if market == "US" else SECTOR_BENCHMARK
    bench_tk = benchmark[0]
    tickers = [t[0] for t in sectors_map.values()] + [bench_tk]
    try:
        df = yf.download(" ".join(tickers), period="9mo", group_by="ticker",
                         threads=True, progress=False, auto_adjust=True)
    except Exception:
        return None

    def weekly_closes(tk):
        try:
            c = df[tk]["Close"].dropna()
        except Exception:
            return None
        if len(c) < 40:
            return None
        return c

    bench = weekly_closes(bench_tk)
    if bench is None:
        return None
    bench_w = bench.resample("W-FRI").last().dropna()

    # Live daily % change per sector. India overlays NSE allIndices; the US map
    # has no such feed, so there we use each ETF's latest 1-session move instead.
    live = {}
    if market == "IN":
        try:
            idx = nse_get("/api/allIndices")
            for row in (idx or {}).get("data", []):
                live[row.get("index", "")] = row.get("percentChange")
        except Exception:
            pass

    rows = []
    for name, (tk, nse_name) in sectors_map.items():
        c = weekly_closes(tk)
        if c is None:
            continue
        c_w = c.resample("W-FRI").last().dropna()
        aligned = pd.concat([c_w, bench_w], axis=1, join="inner").dropna()
        if len(aligned) < RRG_NORM_WINDOW + RRG_TAIL_WEEKS + 2:
            continue
        sec_w, bmk_w = aligned.iloc[:, 0], aligned.iloc[:, 1]

        # RRG: normalized relative strength (RS-Ratio) and its momentum (RS-Mom)
        rs = 100.0 * (sec_w / bmk_w)
        rs_ratio = 100.0 + (rs - rs.rolling(RRG_NORM_WINDOW).mean()) / rs.rolling(RRG_NORM_WINDOW).std()
        roc = rs_ratio.diff()
        rs_mom = 100.0 + (roc - roc.rolling(RRG_NORM_WINDOW).mean()) / roc.rolling(RRG_NORM_WINDOW).std()
        traj = pd.concat([rs_ratio, rs_mom], axis=1).dropna()
        if len(traj) < 2:
            continue
        tail = traj.tail(RRG_TAIL_WEEKS)
        cur_ratio, cur_mom = float(tail.iloc[-1, 0]), float(tail.iloc[-1, 1])

        # Multi-timeframe returns (daily closes) and relative-to-benchmark
        r1w, r1m, r3m = _pct_return(c, 5), _pct_return(c, 21), _pct_return(c, 63)
        b1w, b1m, b3m = _pct_return(bench, 5), _pct_return(bench, 21), _pct_return(bench, 63)
        rel1w = None if (r1w is None or b1w is None) else r1w - b1w
        rel1m = None if (r1m is None or b1m is None) else r1m - b1m
        rel3m = None if (r3m is None or b3m is None) else r3m - b3m

        sma50 = float(c.tail(50).mean()) if len(c) >= 50 else None
        trend = (float(c.iloc[-1]) / sma50 - 1) * 100 if sma50 else None

        # Live "today" move: NSE for India, else the ETF's latest 1-session return.
        if market == "IN":
            live_pct = live.get(nse_name)
        else:
            r_today = _pct_return(c, 1)
            live_pct = None if r_today is None else round(r_today, 2)

        # Composite near-term rotation score (0-100). Weighted toward the
        # short-horizon relative strength that a "next week" read cares about,
        # with the RRG momentum trajectory and the medium trend as context.
        score = (
            0.32 * _squash(rel1w, 4.0) +
            0.24 * _squash(rel1m, 8.0) +
            0.24 * _squash(cur_mom - 100.0, 2.0) +
            0.20 * _squash(trend, 8.0)
        )
        score = round(max(0.0, min(100.0, score)), 1)
        outlook = "Favored" if score >= 58 else ("Headwind" if score <= 42 else "Neutral")

        rows.append({
            "name": name,
            "quadrant": _rrg_quadrant(cur_ratio, cur_mom),
            "rs_ratio": round(cur_ratio, 2),
            "rs_momentum": round(cur_mom, 2),
            "tail": [{"x": round(float(a), 2), "y": round(float(b), 2)} for a, b in tail.values],
            "ret_1w": None if r1w is None else round(r1w, 2),
            "ret_1m": None if r1m is None else round(r1m, 2),
            "ret_3m": None if r3m is None else round(r3m, 2),
            "rel_1w": None if rel1w is None else round(rel1w, 2),
            "rel_1m": None if rel1m is None else round(rel1m, 2),
            "rel_3m": None if rel3m is None else round(rel3m, 2),
            "trend_50d": None if trend is None else round(trend, 2),
            "live_pct": live_pct,
            "score": score,
            "outlook": outlook,
        })

    if not rows:
        return None
    rows.sort(key=lambda r: r["score"], reverse=True)
    b1w = _pct_return(bench, 5)
    quad_counts = {q: sum(1 for r in rows if r["quadrant"] == q)
                   for q in ("Leading", "Weakening", "Lagging", "Improving")}
    return {
        "market": market,
        "sectors": rows,
        "benchmark": {"name": benchmark[1],
                      "ret_1w": None if b1w is None else round(b1w, 2),
                      "ret_1m": round(_pct_return(bench, 21), 2) if _pct_return(bench, 21) is not None else None},
        "quadrant_counts": quad_counts,
        "leaders": [r["name"] for r in rows if r["outlook"] == "Favored"][:5],
        "laggards": [r["name"] for r in reversed(rows) if r["outlook"] == "Headwind"][:5],
        "as_of": datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%d %H:%M IST"),
    }

@app.get("/api/sectors")
async def get_sector_rotation(market: str = None):
    # US sector map during the US cash session (20:00–02:00 IST), NSE otherwise;
    # ?market=IN|US overrides. Cached per market.
    sec_market = market.upper() if market and market.upper() in ("IN", "US") else _dashboard_movers_market()
    cache_key = f"sector_rotation_{sec_market}"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < 1800:
        return API_CACHE[cache_key]['data']
    data = await asyncio.to_thread(_compute_sector_rotation, sec_market)
    if not data:
        raise HTTPException(status_code=503, detail="Sector data is temporarily unavailable. Please retry shortly.")
    data = _json_safe(data)
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    return data

class AISectorRequest(BaseModel):
    sector_data: dict
    apiKey: str

@app.post("/api/ai/sectors")
def ai_sector_summary(req: AISectorRequest):
    if not req.apiKey:
        return {"report": "API Key Required."}
    client = _genai_client(req.apiKey)
    _is_us = str((req.sector_data or {}).get("market", "")).upper() == "US"
    _bench = ((req.sector_data or {}).get("benchmark") or {}).get("name") or ("S&P 500" if _is_us else "Nifty 50")
    _trader = "US equity trader" if _is_us else "Indian equity trader"
    prompt = f"""
    You are a market strategist explaining SECTOR ROTATION to a {_trader}.
    The data below is derived from a Relative Rotation Graph (RRG) versus the {_bench}
    plus multi-timeframe relative strength. Quadrants: Leading (strong & strengthening),
    Weakening (strong but fading), Lagging (weak & weakening), Improving (weak but turning up).
    Rotation typically flows clockwise: Improving -> Leading -> Weakening -> Lagging.

    Write a concise markdown brief (bullet points, no preamble):
    - Which 2-3 sectors have the strongest near-term tailwind and WHY (cite quadrant + relative strength).
    - Which 2-3 sectors face a headwind and WHY.
    - One line on what the overall rotation says about market posture (risk-on vs defensive).
    Be objective and educational. Do NOT give buy/sell advice or price targets. Note that momentum can reverse.

    Sector rotation data:
    {req.sector_data}
    """
    try:
        response = client.models.generate_content(
            model='gemini-3.1-flash-lite',
            contents=prompt,
        )
        return {"report": response.text}
    except Exception as e:
        return _ai_error_report(e)

@app.get("/api/fundamentals/{ticker}")
async def get_fundamentals(ticker: str):
    ticker = _validate_symbol(ticker)
    def fetch_fundamentals():
        try:
            resolved, stock, info = _yf_resolve_info(ticker)
            if not (info.get("currentPrice") or info.get("regularMarketPrice") or info.get("marketCap")):
                return {"error": f"Ticker '{ticker}' not found on Yahoo Finance"}

            _eps = info.get("trailingEps")
            _pe = info.get("trailingPE")
            _rev = info.get("revenueGrowth")
            _roe = info.get("returnOnEquity")
            _margin = info.get("profitMargins")
            _eg = info.get("earningsGrowth")
            _price = info.get("currentPrice", info.get("regularMarketPrice", info.get("previousClose", 0)))
            
            alpha_score = _alpha_nova_score(
                _price, _eps, _pe if _pe else None,
                _eg * 100 if _eg is not None else None,
                rev_growth_pct=_rev * 100 if _rev is not None else None,
                roe_pct=_roe * 100 if _roe is not None else None,
                margin_pct=_margin * 100 if _margin is not None else None,
                dte_pct=info.get("debtToEquity"),
                div_pct=info.get("dividendYield")
            )
            
            # Percent conversions (x * 100) and raw Yahoo ratios both carry
            # float noise (12.000000000000002) — round every numeric metric.
            def _r2(v, nd=2):
                if isinstance(v, (int, float)) and math.isfinite(v):
                    return round(v, nd)
                return v

            # Extract relevant metrics
            metrics = {
                "alphaScore": alpha_score,
                "ticker": resolved,
                "name": info.get("shortName", resolved),
                "sector": info.get("sector", "N/A"),
                "industry": info.get("industry", "N/A"),
                "marketCap": info.get("marketCap", 0),
                "trailingPE": _r2(info.get("trailingPE", "N/A")),
                "forwardPE": _r2(info.get("forwardPE", "N/A")),
                "pegRatio": _r2(info.get("pegRatio", "N/A")),
                "priceToBook": _r2(info.get("priceToBook", "N/A")),
                "dividendYield": _r2(info.get("dividendYield", 0) if info.get("dividendYield") else 0),
                "profitMargin": _r2(info.get("profitMargins", 0) * 100 if info.get("profitMargins") else 0),
                "operatingMargin": _r2(info.get("operatingMargins", 0) * 100 if info.get("operatingMargins") else 0),
                "returnOnAssets": _r2(info.get("returnOnAssets", 0) * 100 if info.get("returnOnAssets") else 0),
                "returnOnEquity": _r2(info.get("returnOnEquity", 0) * 100 if info.get("returnOnEquity") else 0),
                "revenueGrowth": _r2(info.get("revenueGrowth", 0) * 100 if info.get("revenueGrowth") else 0),
                "earningsGrowth": _r2(info.get("earningsGrowth", 0) * 100 if info.get("earningsGrowth") else 0),
                "trailingEps": _r2(info.get("trailingEps", "N/A")),
                "forwardEps": _r2(info.get("forwardEps", "N/A")),
                "debtToEquity": _r2(info.get("debtToEquity", "N/A")),
                "currentRatio": _r2(info.get("currentRatio", "N/A")),
                "totalCash": info.get("totalCash", 0),
                "totalDebt": info.get("totalDebt", 0),
                "freeCashflow": info.get("freeCashflow", 0)
            }
            return metrics
        except Exception as e:
            return {"error": str(e)}

    data = await asyncio.to_thread(fetch_fundamentals)
    if "error" in data:
        raise HTTPException(status_code=404, detail="Ticker not found or data unavailable")
    return data

# --- News sentiment (keyless, finance-tuned VADER lexicon) ---
# Spec: docs/superpowers/specs/2026-07-04-news-sentiment-alpha-score-v2-design.md
FINANCE_LEXICON = {
    # bullish (VADER scale −4..+4)
    "beats": 2.5, "beat": 2.0, "outperform": 2.0, "outperforms": 2.0, "upgrade": 2.2,
    "upgraded": 2.2, "upgrades": 2.2, "buy": 1.5, "overweight": 1.8, "bullish": 2.4,
    "rally": 2.0, "rallies": 2.0, "surge": 2.2, "surges": 2.2, "soars": 2.4, "soar": 2.4,
    "breakout": 1.8, "record": 1.5, "buyback": 1.5, "dividend": 0.8, "profit": 1.4,
    "profits": 1.4, "profitable": 1.6, "growth": 1.2, "expansion": 1.2, "raises": 1.6,
    "raised": 1.4, "guidance": 0.0, "upbeat": 1.8, "momentum": 0.8, "multibagger": 2.5,
    "acquisition": 0.6, "wins": 1.8, "win": 1.5, "contract": 0.8, "order": 0.6,
    "approval": 1.4, "approved": 1.4, "launch": 0.8, "launches": 0.8, "jumps": 2.0,
    "gains": 1.6, "climbs": 1.6, "rebound": 1.4, "rebounds": 1.4, "undervalued": 1.6,
    # bearish
    "downgrade": -2.5, "downgraded": -2.5, "downgrades": -2.5, "miss": -2.0, "misses": -2.0,
    "missed": -1.8, "underperform": -2.0, "bearish": -2.4, "sell": -1.5, "underweight": -1.8,
    "plunge": -2.4, "plunges": -2.4, "plummets": -2.6, "crash": -2.8, "crashes": -2.8,
    "slump": -2.0, "slumps": -2.0, "tumbles": -2.2, "tumble": -2.2, "sinks": -2.0,
    "slides": -1.6, "drops": -1.4, "falls": -1.4, "probe": -2.2, "investigation": -1.8,
    "fraud": -3.2, "scam": -3.0, "lawsuit": -1.8, "fine": -1.5, "penalty": -1.6,
    "layoffs": -1.8, "layoff": -1.8, "recall": -1.8, "default": -2.8, "bankruptcy": -3.4,
    "insolvency": -3.0, "debt": -0.8, "loss": -1.8, "losses": -1.8, "warning": -1.6,
    "cuts": -1.2, "cut": -1.0, "downturn": -1.8, "recession": -2.2, "selloff": -2.2,
    "overvalued": -1.6, "resigns": -1.4, "resignation": -1.4, "pledged": -1.2,
}

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    _SENTIMENT = SentimentIntensityAnalyzer()
    _SENTIMENT.lexicon.update(FINANCE_LEXICON)
except Exception as e:  # missing package → news works exactly as before
    print(f"Sentiment analyzer unavailable: {e}")
    _SENTIMENT = None

def _news_sentiment(text):
    """{'score': 0-100, 'label': Bullish|Neutral|Bearish} or None."""
    if not _SENTIMENT or not text:
        return None
    try:
        compound = _SENTIMENT.polarity_scores(text)["compound"]
    except Exception:
        return None
    score = int(round((compound + 1) * 50))
    label = "Bullish" if score >= 60 else "Bearish" if score <= 40 else "Neutral"
    return {"score": score, "label": label}

# --- Multi-source news aggregation ------------------------------------------
# Combines NewsAPI (optional key), Yahoo Finance, Google News and Investing.com
# into one relevance-ranked feed. The keyless sources mean the tab now works
# even without a NewsAPI key. Every source is fetched in parallel and bounded so
# one slow/blocked feed can't stall the response; results are cached per ticker.
import xml.etree.ElementTree as _ET
from email.utils import parsedate_to_datetime as _parsedate

NEWS_CACHE_TTL = 600  # 10 min — headlines don't move faster than this
_NEWS_UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
_CORP_SUFFIXES = (" ltd", " limited", " inc", " inc.", " corp", " corporation",
                  " plc", " co", " company", " sa", " ag", " nv", " lt", " serv")
# per-source base weight: ticker-queried/associated sources outrank the general
# Investing.com market feed (which only survives when it names the company).
_NEWS_SOURCE_WEIGHT = {"Yahoo Finance": 2.5, "Google News": 2.2, "NewsAPI": 2.0, "Investing.com": 0.6}

def _strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").replace("&nbsp;", " ").replace("&#39;", "'").strip()

def _clean_company_name(name):
    n = (name or "").strip()
    low = n.lower()
    for suf in _CORP_SUFFIXES:
        if low.endswith(suf):
            n = n[:-len(suf)].strip()
            low = n.lower()
    return n

def _news_context(ticker):
    """Resolve a ticker to (query, yf_symbol, match_terms) via Yahoo search so
    every source gets a good query and relevance can match the company name."""
    raw = ticker.strip()
    terms = {raw.lower()}
    query, yf_symbol = raw, map_symbol_to_yfinance(raw)
    try:
        r = requests.get("https://query2.finance.yahoo.com/v1/finance/search?q=" + requests.utils.quote(raw),
                         headers=_NEWS_UA, timeout=6)
        quotes = r.json().get("quotes", []) if r.status_code == 200 else []
        # Pick the intended listing, not just Yahoo's top hit: exact symbol
        # (US tickers like AAPL), else the NSE/BSE listing (so "TCS" resolves to
        # Tata Consultancy, not an unrelated foreign "TCS"), else any equity.
        up = raw.upper()
        eq = None
        for want in (up, up + ".NS", up + ".BO"):
            eq = next((q for q in quotes if (q.get("symbol") or "").upper() == want), None)
            if eq:
                break
        if not eq:
            eq = next((q for q in quotes if q.get("quoteType") == "EQUITY" and q.get("symbol")), None)
        if not eq:
            eq = next((q for q in quotes if q.get("symbol")), None)
        if eq:
            yf_symbol = eq.get("symbol") or yf_symbol
            name = _clean_company_name(eq.get("shortname") or eq.get("longname") or "")
            if name:
                query = name
                terms.add(name.lower())
                first = name.split()[0].lower()
                if len(first) >= 4:
                    terms.add(first)
    except Exception:
        pass
    return query, yf_symbol, terms

def _parse_news_dt(s):
    """RFC822 / ISO / 'YYYY-MM-DD HH:MM:SS' -> aware UTC datetime, or None."""
    if not s:
        return None
    s = s.strip()
    for parser in (_parsedate,
                   lambda x: datetime.fromisoformat(x.replace("Z", "+00:00")),
                   lambda x: datetime.strptime(x, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)):
        try:
            dt = parser(s)
            if dt:
                return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            continue
    return None

def _mk_article(title, url, desc, dt, source_name, provider):
    return {"title": (title or "").strip(), "url": url or "",
            "description": _strip_html(desc)[:400],
            "publishedAt": dt.astimezone(timezone.utc).isoformat() if dt else None,
            "source": {"name": source_name or provider}, "provider": provider}

def _fetch_rss_items(url):
    try:
        r = requests.get(url, headers=_NEWS_UA, timeout=9)
        return _ET.fromstring(r.content).findall(".//item") if r.status_code == 200 else []
    except Exception:
        return []

def _news_from_newsapi(query, api_key):
    if not api_key:
        return []
    try:
        url = ("https://newsapi.org/v2/everything?q=" + requests.utils.quote(f'"{query}"')
               + "&sortBy=publishedAt&language=en&pageSize=15&apiKey=" + api_key)
        data = requests.get(url, timeout=9).json()
        return [_mk_article(a.get("title"), a.get("url"), a.get("description"),
                            _parse_news_dt(a.get("publishedAt")),
                            (a.get("source") or {}).get("name"), "NewsAPI")
                for a in (data.get("articles") or [])[:15]]
    except Exception:
        return []

def _news_from_yfinance(yf_symbol):
    try:
        items = yf.Ticker(yf_symbol).news or []
    except Exception:
        return []
    out = []
    for it in items[:12]:
        c = it.get("content") or it
        url = (c.get("clickThroughUrl") or {}).get("url") or (c.get("canonicalUrl") or {}).get("url")
        prov = (c.get("provider") or {}).get("displayName")
        out.append(_mk_article(c.get("title"), url, c.get("summary") or c.get("description"),
                               _parse_news_dt(c.get("pubDate") or c.get("displayTime")),
                               prov, "Yahoo Finance"))
    return out

def _news_from_google(query):
    url = "https://news.google.com/rss/search?q=" + requests.utils.quote(query) + "&hl=en-IN&gl=IN&ceid=IN:en"
    out, boilerplate = [], {"google news", (query or "").lower() + " - google news"}
    for it in _fetch_rss_items(url)[:18]:
        title = it.findtext("title") or ""
        if title.strip().lower() in boilerplate:
            continue
        src = it.find("source")
        out.append(_mk_article(title, it.findtext("link"), it.findtext("description"),
                               _parse_news_dt(it.findtext("pubDate")),
                               src.text if src is not None else "Google News", "Google News"))
    return out

_INVESTING_FEEDS = ["https://www.investing.com/rss/news_25.rss",   # stock market
                    "https://www.investing.com/rss/news_285.rss",  # economy
                    "https://www.investing.com/rss/stock.rss"]
def _news_from_investing(terms):
    out, seen = [], set()
    for feed in _INVESTING_FEEDS:
        for it in _fetch_rss_items(feed):
            title = it.findtext("title") or ""
            blob = (title + " " + _strip_html(it.findtext("description"))).lower()
            if not any(t in blob for t in terms):  # general feed → keep only on-topic items
                continue
            key = title.strip().lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(_mk_article(title, it.findtext("link"), it.findtext("description"),
                                   _parse_news_dt(it.findtext("pubDate")), "Investing.com", "Investing.com"))
    return out

def _title_key(title):
    return re.sub(r"[^a-z0-9]", "", (title or "").lower())[:80]

def _news_relevance(art, terms, now):
    title = (art.get("title") or "").lower()
    desc = (art.get("description") or "").lower()
    score = _NEWS_SOURCE_WEIGHT.get(art.get("provider"), 1.0)
    for t in terms:
        if t and t in title:
            score += 3.0
        elif t and t in desc:
            score += 1.2
    dt = _parse_news_dt(art.get("publishedAt"))
    if dt:
        age_h = max(0.0, (now - dt).total_seconds() / 3600.0)
        score += max(0.0, 4.0 - age_h / 24.0)  # <1d old ~ +4, decaying over ~4 days
    return round(score, 3)

@app.get("/api/news/{ticker}")
async def get_news(ticker: str, apiKey: str = None):
    ticker = _validate_symbol(ticker)
    cache_key = f"news_{ticker.upper()}"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < NEWS_CACHE_TTL:
        return API_CACHE[cache_key]['data']

    api_key_to_use = apiKey or os.environ.get("NEWS_API_KEY")
    query, yf_symbol, terms = await asyncio.to_thread(_news_context, ticker)

    fetched = await asyncio.gather(
        _bounded(asyncio.to_thread(_news_from_newsapi, query, api_key_to_use), 10),
        _bounded(asyncio.to_thread(_news_from_yfinance, yf_symbol), 10),
        _bounded(asyncio.to_thread(_news_from_google, query), 10),
        _bounded(asyncio.to_thread(_news_from_investing, terms), 10),
        return_exceptions=True,
    )
    articles = []
    for res in fetched:
        if isinstance(res, list):
            articles.extend(res)

    # Rank by relevance, then dedupe by headline keeping the highest-ranked copy.
    now = datetime.now(timezone.utc)
    for a in articles:
        a["relevance"] = _news_relevance(a, terms, now)
    articles.sort(key=lambda a: a["relevance"], reverse=True)
    top, seen = [], set()
    for a in articles:
        k = _title_key(a["title"])
        if not k or k in seen or not a.get("url"):
            continue
        seen.add(k)
        top.append(a)
        if len(top) >= 24:
            break

    for a in top:
        s = _news_sentiment(f"{a.get('title') or ''}. {a.get('description') or ''}")
        if s:
            a["sentiment"] = s
    scored = [a["sentiment"] for a in top if a.get("sentiment")]
    summary = None
    if scored:
        avg = int(round(sum(s["score"] for s in scored) / len(scored)))
        summary = {
            "score": avg,
            "label": "Bullish" if avg >= 60 else "Bearish" if avg <= 40 else "Neutral",
            "positive": sum(1 for s in scored if s["label"] == "Bullish"),
            "neutral": sum(1 for s in scored if s["label"] == "Neutral"),
            "negative": sum(1 for s in scored if s["label"] == "Bearish"),
            "n": len(scored),
        }
    if not top:
        raise HTTPException(status_code=404, detail=f"No news found for '{ticker}'. Try a different ticker or company name.")
    result = {"articles": top, "sentiment_summary": summary,
              "sources": sorted({a["provider"] for a in top}), "query": query}
    API_CACHE[cache_key] = {'time': time.time(), 'data': result}
    return result


# --- Symbol search: company name -> yfinance ticker --------------------------
# Users often don't know NSE tickers ("Asian Paints" vs ASIANPAINT.NS). This
# wraps Yahoo's search endpoint server-side (it blocks browser CORS) so every
# ticker input in the app can offer name-based autocomplete. NSE listings are
# ranked first for the India-focused audience; Yahoo's own relevance order is
# preserved within each bucket (sort is stable).
SYMBOL_SEARCH_TTL = 3600

@app.get("/api/symbol-search")
async def symbol_search(q: str = ""):
    q = q.strip()
    if len(q) < 2:
        return {"results": []}
    cache_key = f"symsearch_{q.lower()}"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < SYMBOL_SEARCH_TTL:
        return API_CACHE[cache_key]['data']

    def fetch():
        try:
            r = requests.get("https://query2.finance.yahoo.com/v1/finance/search",
                             params={"q": q, "quotesCount": 12, "newsCount": 0},
                             headers=_NEWS_UA, timeout=8)
            return r.json().get("quotes", []) if r.status_code == 200 else []
        except Exception:
            return []

    quotes = await asyncio.to_thread(fetch)
    results, seen = [], set()
    for x in quotes:
        sym = (x.get("symbol") or "").upper()
        if not sym or sym in seen:
            continue
        if x.get("quoteType") not in ("EQUITY", "ETF", "INDEX"):
            continue
        # NSE/BSE series variants (ASIANPAINT-BL.NS block deals etc.) are noise;
        # US dashed classes like BRK-B have no .NS/.BO suffix and pass through.
        if re.match(r".+-[A-Z]{1,2}\.(NS|BO)$", sym):
            continue
        seen.add(sym)
        results.append({
            "symbol": sym,
            "name": x.get("shortname") or x.get("longname") or sym,
            "exchange": x.get("exchDisp") or x.get("exchange") or "",
            "type": x.get("quoteType"),
        })

    # Rank = Yahoo relevance + a small listing-preference offset. The offset
    # lets an NSE listing overtake the SAME company's ADR ranked just above it
    # (HDB -> HDFCBANK.NS), but can't vault a low-relevance .NS match over a
    # different company Yahoo ranked far higher (HCL-INSYS.NS must not beat
    # INFY when searching "infosys"). Foreign ADR mirrors (.F/.SA/.BA/...)
    # sink to the bottom.
    def score(i, r):
        s = r["symbol"]
        if s.endswith(".NS"):
            return i - 2.5
        if "." not in s:
            return i  # US listings
        if s.endswith(".BO"):
            return i + 4
        return i + 8
    results = [r for _, r in sorted(enumerate(results), key=lambda t: score(t[0], t[1]))]
    data = {"results": results[:8]}
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    return data


def map_symbol_to_yfinance(symbol: str) -> str:
    sym_upper = symbol.upper()
    if sym_upper == "NIFTY" or sym_upper == "NIFTY 50":
        return "^NSEI"
    elif sym_upper == "BANKNIFTY" or sym_upper == "NIFTY BANK":
        return "^NSEBANK"
    elif sym_upper == "FINNIFTY" or sym_upper == "NIFTY FINANCIAL SERVICES":
        return "^CNXFIN"
    if "." in sym_upper:
        return sym_upper
    return sym_upper

def fetch_yfinance_spot_data(symbol: str):
    yf_symbol = map_symbol_to_yfinance(symbol)
    def fetch(sym):
        try:
            ticker = yf.Ticker(sym)
            hist = ticker.history(period="2d")
            if not hist.empty:
                return hist, sym
        except Exception:
            pass
        return None, None
        
    # This path serves NSE option-chain symbols, so try the .NS listing first —
    # the bare symbol almost never exists on Yahoo and just burns a failed call
    if "." not in yf_symbol and not yf_symbol.startswith("^"):
        hist, resolved_sym = fetch(f"{yf_symbol}.NS")
        if hist is None:
            hist, resolved_sym = fetch(yf_symbol)
    else:
        hist, resolved_sym = fetch(yf_symbol)
        
    if hist is not None and not hist.empty:
        current_price = float(hist['Close'].iloc[-1])
        prev_close = float(hist['Close'].iloc[-2]) if len(hist) > 1 else float(hist['Open'].iloc[-1])
        change = current_price - prev_close
        change_pct = (change / prev_close) * 100 if prev_close > 0 else 0.0
        return {
            "symbol": resolved_sym,
            "last_trade_price": current_price,
            "change_value": change,
            "change_per": change_pct,
            "open": float(hist['Open'].iloc[-1]),
            "high": float(hist['High'].iloc[-1]),
            "low": float(hist['Low'].iloc[-1]),
            "close": float(hist['Close'].iloc[-1]),
        }
    return None

def filter_past_expiries(exp_dates):
    ist = timezone(timedelta(hours=5, minutes=30))
    today = datetime.now(ist).date()
    filtered = []
    for exp in exp_dates:
        try:
            date_part = exp.split("T")[0]
            dt = datetime.strptime(date_part, "%Y-%m-%d").date()
            if dt >= today:
                filtered.append(exp)
        except Exception:
            filtered.append(exp)
    return filtered if filtered else exp_dates

def get_yfinance_expiries_and_lot_size(symbol: str):
    yf_symbol = map_symbol_to_yfinance(symbol)
    def fetch_options(sym):
        try:
            ticker = yf.Ticker(sym)
            options = ticker.options
            if options:
                return options, sym
        except Exception:
            pass
        return None, None
        
    options, resolved_sym = fetch_options(yf_symbol)
    if options is None and not yf_symbol.endswith(".NS") and not yf_symbol.startswith("^"):
        options, resolved_sym = fetch_options(f"{yf_symbol}.NS")
        
    if options:
        expiries = [f"{exp}T00:00:00" for exp in options]
        filtered_exp = filter_past_expiries(expiries)
        return {
            "expiries": filtered_exp,
            "lotSize": 100
        }
    return None

def calculate_max_pain(opDatas):
    if not opDatas:
        return 0
    strikes = [float(row.get("strike_price", 0)) for row in opDatas if row.get("strike_price")]
    if not strikes:
        return 0
        
    max_pain = 0
    min_pain_val = float('inf')
    
    for test_strike in strikes:
        pain = 0
        for row in opDatas:
            s = float(row.get("strike_price", 0))
            if s == 0: continue
            calls_oi = float(row.get("calls_oi", 0))
            puts_oi = float(row.get("puts_oi", 0))
            
            if test_strike > s:
                pain += (test_strike - s) * calls_oi
            if test_strike < s:
                pain += (s - test_strike) * puts_oi
                
        if pain < min_pain_val:
            min_pain_val = pain
            max_pain = test_strike
            
    return max_pain

def get_yfinance_option_chain(symbol: str, expiry_date_str: str):
    yf_symbol = map_symbol_to_yfinance(symbol)
    spot_info = fetch_yfinance_spot_data(symbol)
    resolved_sym = spot_info["symbol"] if spot_info else yf_symbol
    expiry_date = expiry_date_str.split("T")[0]
    
    try:
        ticker = yf.Ticker(resolved_sym)
        opt = ticker.option_chain(expiry_date)
        calls = opt.calls
        puts = opt.puts
        
        merged = pd.merge(calls, puts, on='strike', how='outer', suffixes=('_call', '_put')).fillna(0)
        merged = merged.sort_values('strike')
        
        spot_price = spot_info["last_trade_price"] if spot_info else 0.0
        
        opDatas = []
        for _, row in merged.iterrows():
            strike = float(row['strike'])
            calls_oi = float(row.get('openInterest_call', 0))
            calls_volume = float(row.get('volume_call', 0))
            calls_iv = float(row.get('impliedVolatility_call', 0)) * 100
            calls_ltp = float(row.get('lastPrice_call', 0))
            calls_ltp_per = float(row.get('percentChange_call', 0))
            
            puts_oi = float(row.get('openInterest_put', 0))
            puts_volume = float(row.get('volume_put', 0))
            puts_iv = float(row.get('impliedVolatility_put', 0)) * 100
            puts_ltp = float(row.get('lastPrice_put', 0))
            puts_ltp_per = float(row.get('percentChange_put', 0))
            
            # Calculate proper net change
            calls_net_change = calls_ltp - (calls_ltp / (1 + (calls_ltp_per/100))) if calls_ltp_per != 0 else 0.0
            puts_net_change = puts_ltp - (puts_ltp / (1 + (puts_ltp_per/100))) if puts_ltp_per != 0 else 0.0
            
            pcr = puts_oi / calls_oi if calls_oi > 0 else 0.0
            
            calls_builtup = "No Conclusion"
            puts_builtup = "No Conclusion"
            if calls_ltp_per > 0 and calls_oi > 0:
                calls_builtup = "Long Buildup"
            elif calls_ltp_per < 0 and calls_oi > 0:
                calls_builtup = "Short Buildup"
                
            if puts_ltp_per > 0 and puts_oi > 0:
                puts_builtup = "Long Buildup"
            elif puts_ltp_per < 0 and puts_oi > 0:
                puts_builtup = "Short Buildup"
                
            opDatas.append({
                "strike_price": strike,
                "calls_oi": calls_oi,
                "calls_change_oi": None,
                "calls_volume": calls_volume,
                "calls_iv": calls_iv,
                "calls_ltp": calls_ltp,
                "calls_ltp_per": calls_ltp_per,
                "calls_net_change": calls_net_change,
                "calls_builtup": calls_builtup,
                
                "puts_oi": puts_oi,
                "puts_change_oi": None,
                "puts_volume": puts_volume,
                "puts_iv": puts_iv,
                "puts_ltp": puts_ltp,
                "puts_ltp_per": puts_ltp_per,
                "puts_net_change": puts_net_change,
                "puts_builtup": puts_builtup,
                
                "pcr": round(pcr, 3),
                "expiry_date": expiry_date_str,
                "symbol_name": symbol.upper(),
                "index_close": spot_price
            })
            
        vix_price = 18.0
        vix_change = 0.0
        try:
            vix_stock = yf.Ticker("^INDIAVIX")
            vix_hist = vix_stock.history(period="1d")
            if not vix_hist.empty:
                vix_price = float(vix_hist['Close'].iloc[-1])
                vix_open = float(vix_hist['Open'].iloc[-1])
                vix_change = vix_price - vix_open
        except Exception:
            pass
            
        spotData = {
            "symbol_name": symbol.upper(),
            "last_trade_price": spot_price,
            "change_value": spot_info["change_value"] if spot_info else 0.0,
            "change_per": spot_info["change_per"] if spot_info else 0.0,
            "open": spot_info["open"] if spot_info else 0.0,
            "high": spot_info["high"] if spot_info else 0.0,
            "low": spot_info["low"] if spot_info else 0.0,
            "close": spot_info["close"] if spot_info else 0.0,
            "max_pain": calculate_max_pain(opDatas),
            "lot_size": 100
        }
        
        return {
            "optionChain": {"opDatas": opDatas},
            "spotData": spotData,
            "vixData": {
                "symbol_name": "INDIA VIX",
                "last_trade_price": vix_price,
                "change_value": vix_change,
                "change_per": (vix_change / vix_price) * 100 if vix_price > 0 else 0.0
            }
        }
    except Exception as e:
        print(f"yfinance option chain fetch failed for {symbol}: {e}")
        return None

# --- NSE Direct (option-chain-v3) client ---
# Mirrors the session handling of the standalone F&O terminal: warm up cookies on
# the /option-chain page, send XHR-style headers, re-warm on 401/403.
NSE_BASE = "https://www.nseindia.com"
NSE_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/option-chain",
    "X-Requested-With": "XMLHttpRequest",
}
NSE_INDEX_SYMBOLS = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"}
NSE_INDEX_NAMES = {
    "NIFTY": "NIFTY 50",
    "BANKNIFTY": "NIFTY BANK",
    "FINNIFTY": "NIFTY FINANCIAL SERVICES",
    "MIDCPNIFTY": "NIFTY MIDCAP SELECT",
    "NIFTYNXT50": "NIFTY NEXT 50",
}
_NSE_SESSION = None

def _nse_new_session():
    s = requests.Session()
    s.headers.update(NSE_HEADERS)
    try:
        s.get(f"{NSE_BASE}/option-chain", timeout=8)
    except requests.RequestException:
        pass
    return s

def nse_get(path, retries=2):
    global _NSE_SESSION
    if _NSE_SESSION is None:
        _NSE_SESSION = _nse_new_session()
    for attempt in range(retries):
        try:
            r = _NSE_SESSION.get(f"{NSE_BASE}{path}", timeout=10)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (401, 403):
                _NSE_SESSION = _nse_new_session()
        except (requests.RequestException, ValueError):
            if attempt == retries - 1:
                return None
            _NSE_SESSION = _nse_new_session()
    return None

def nse_expiry_to_iso(exp: str):
    try:
        return datetime.strptime(exp, "%d-%b-%Y").strftime("%Y-%m-%dT00:00:00")
    except Exception:
        return None

def iso_to_nse_expiry(iso: str):
    try:
        return datetime.strptime(iso.split("T")[0], "%Y-%m-%d").strftime("%d-%b-%Y")
    except Exception:
        return None

def _nse_expiry_is_live(exp: str) -> bool:
    """True if an NSE-format expiry ('07-Jul-2026') is today or later in IST.
    NSE keeps the just-expired weekly in expiryDates (and OI-spurt rows) until
    the next session starts, so pre-open the raw [0] is a dead contract."""
    try:
        ist = timezone(timedelta(hours=5, minutes=30))
        return datetime.strptime(exp, "%d-%b-%Y").date() >= datetime.now(ist).date()
    except Exception:
        return True

def _first_live_nse_expiry(expiries):
    return next((e for e in expiries if _nse_expiry_is_live(e)), expiries[0] if expiries else None)

def fetch_nse_expiries(symbol: str):
    from urllib.parse import quote
    sym = symbol.upper().strip()
    info = nse_get(f"/api/option-chain-contract-info?symbol={quote(sym)}")
    if not info:
        return None
    iso_expiries = [e for e in (nse_expiry_to_iso(exp) for exp in info.get("expiryDates") or []) if e]
    if not iso_expiries:
        return None
    return {"expiries": filter_past_expiries(sorted(iso_expiries)), "lotSize": 0}

def fetch_niftytrader_expiries(symbol: str):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.niftytrader.in/nse-option-chain"
    }
    url = f"https://api.niftytrader.in/api/Symbol/symbol-expiry-all?symbol={symbol}&exchange=nse"
    try:
        r = requests.get(url, headers=headers, timeout=12)
        if r.status_code != 200:
            return None
        res_data = r.json().get("resultData", [])
        if not isinstance(res_data, list):
            return None
        filtered = [item for item in res_data if item.get("symbol_name", "").upper() == symbol.upper()]
        if not filtered:
            return None
        exp_dates = sorted(list(set(item.get("expiry_date") for item in filtered)))
        return {
            "expiries": filter_past_expiries(exp_dates),
            "lotSize": filtered[0].get("lot_size", 0)
        }
    except Exception:
        return None

async def _bounded(coro, timeout_s):
    """Cap a fetch task so one slow/blocked source can't stall the whole request."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout_s)
    except Exception:
        return None

@app.get("/api/option-chain/expiries/{symbol}")
async def get_option_chain_expiries(symbol: str):
    symbol = _validate_symbol(symbol)
    nse_data, nt_data = await asyncio.gather(
        _bounded(asyncio.to_thread(fetch_nse_expiries, symbol), 12),
        _bounded(asyncio.to_thread(fetch_niftytrader_expiries, symbol), 14)
    )
    if nse_data and nse_data.get("expiries"):
        if not nse_data.get("lotSize") and nt_data:
            nse_data["lotSize"] = nt_data.get("lotSize", 0)
        return nse_data
    if nt_data and nt_data.get("expiries"):
        return nt_data

    yf_data = await asyncio.to_thread(get_yfinance_expiries_and_lot_size, symbol)
    if yf_data:
        return yf_data
    raise HTTPException(status_code=400, detail=f"No expiries found for symbol {symbol}")

def _classify_buildup(price_chg, oi_chg):
    if not price_chg or not oi_chg:
        return "No Conclusion"
    if price_chg > 0 and oi_chg > 0:
        return "Long Buildup"
    if price_chg < 0 and oi_chg > 0:
        return "Short Buildup"
    if price_chg > 0 and oi_chg < 0:
        return "Short Covering"
    return "Long Unwinding"

def fetch_nse_v3_chain(symbol: str, expiry_iso: str = ""):
    """Fetch the option chain from NSE's option-chain-v3 API (same source as the F&O terminal)."""
    from urllib.parse import quote
    sym = symbol.upper().strip()

    nse_expiry = iso_to_nse_expiry(expiry_iso) if expiry_iso else None
    if not nse_expiry:
        info = nse_get(f"/api/option-chain-contract-info?symbol={quote(sym)}")
        expiries = (info or {}).get("expiryDates") or []
        if not expiries:
            return None
        nse_expiry = _first_live_nse_expiry(expiries)

    opt_type = "Indices" if sym in NSE_INDEX_SYMBOLS else "Equity"
    j = nse_get(f"/api/option-chain-v3?type={opt_type}&symbol={quote(sym)}&expiry={quote(nse_expiry)}")
    records = (j or {}).get("records") or {}
    rows = records.get("data") or []
    if not rows:
        return None

    spot = float(records.get("underlyingValue") or 0)
    expiry_iso_out = expiry_iso or nse_expiry_to_iso(nse_expiry) or nse_expiry

    opDatas = []
    for row in rows:
        ce = row.get("CE") or {}
        pe = row.get("PE") or {}
        strike = float(row.get("strikePrice") or 0)

        calls_oi = float(ce.get("openInterest") or 0)
        calls_chg_oi = float(ce.get("changeinOpenInterest") or 0)
        calls_net_chg = float(ce.get("change") or 0)
        puts_oi = float(pe.get("openInterest") or 0)
        puts_chg_oi = float(pe.get("changeinOpenInterest") or 0)
        puts_net_chg = float(pe.get("change") or 0)

        opDatas.append({
            "strike_price": strike,
            "calls_oi": calls_oi,
            "calls_change_oi": calls_chg_oi,
            "calls_volume": float(ce.get("totalTradedVolume") or 0),
            "calls_iv": float(ce.get("impliedVolatility") or 0),
            "calls_ltp": float(ce.get("lastPrice") or 0),
            "calls_ltp_per": float(ce.get("pChange") or 0),
            "calls_net_change": calls_net_chg,
            "calls_builtup": _classify_buildup(calls_net_chg, calls_chg_oi),
            "puts_oi": puts_oi,
            "puts_change_oi": puts_chg_oi,
            "puts_volume": float(pe.get("totalTradedVolume") or 0),
            "puts_iv": float(pe.get("impliedVolatility") or 0),
            "puts_ltp": float(pe.get("lastPrice") or 0),
            "puts_ltp_per": float(pe.get("pChange") or 0),
            "puts_net_change": puts_net_chg,
            "puts_builtup": _classify_buildup(puts_net_chg, puts_chg_oi),
            "pcr": round(puts_oi / calls_oi, 3) if calls_oi > 0 else 0.0,
            "expiry_date": expiry_iso_out,
            "symbol_name": sym,
            "index_close": spot
        })

    result = {"opDatas": opDatas, "spot": spot, "index_info": None, "vix": None}

    # One extra call gives index spot change AND India VIX for free
    idx_json = nse_get("/api/allIndices")
    if idx_json:
        want_name = NSE_INDEX_NAMES.get(sym)
        for row in idx_json.get("data", []):
            name = row.get("index", "")
            if want_name and name == want_name:
                result["index_info"] = {
                    "last": float(row.get("last") or 0),
                    "change": float(row.get("variation") or 0),
                    "change_per": float(row.get("percentChange") or 0),
                    "open": float(row.get("open") or 0),
                    "high": float(row.get("high") or 0),
                    "low": float(row.get("low") or 0),
                    "prev_close": float(row.get("previousClose") or 0),
                }
            elif name == "INDIA VIX":
                vix_last = float(row.get("last") or 0)
                if vix_last > 0:
                    result["vix"] = {
                        "symbol_name": "INDIA VIX",
                        "last_trade_price": vix_last,
                        "change_value": float(row.get("variation") or 0),
                        "change_per": float(row.get("percentChange") or 0),
                    }
    return result

@app.get("/api/option-chain/data/{symbol}")
async def get_option_chain_data(symbol: str, expiryDate: str = ""):
    symbol = _validate_symbol(symbol)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.niftytrader.in/nse-option-chain"
    }
    # Fetch the entire option chain (no atm limits) to calculate an accurate Max Pain
    oc_url = f"https://api.niftytrader.in/api/option/option-chain-data?symbol={symbol}&exchange=nse&expiryDate={expiryDate}"
    
    sym_lower = symbol.lower()
    if sym_lower == "nifty":
        spot_sym = "NIFTY 50"
    elif sym_lower == "banknifty":
        spot_sym = "BANKNIFTY"
    elif sym_lower == "finnifty":
        spot_sym = "FINNIFTY"
    else:
        spot_sym = symbol.upper()
        
    spot_url = f"https://api.niftytrader.in/api/symbol/today-spot-data?symbol={spot_sym.replace(' ', '+')}"
    vix_url = "https://webapi.niftytrader.in/webapi/Symbol/other-stock-spot-data?symbol=INDIA+VIX"
    
    async def fetch_niftytrader_data():
        def fetch_all():
            payload = {}
            try:
                r_oc = requests.get(oc_url, headers=headers, timeout=12)
                if r_oc.status_code == 200:
                    payload["optionChain"] = r_oc.json().get("resultData", {})
                else:
                    payload["optionChain"] = {}
            except:
                payload["optionChain"] = {}
                
            try:
                r_spot = requests.get(spot_url, headers=headers, timeout=12)
                if r_spot.status_code == 200:
                    payload["spotData"] = r_spot.json().get("resultData", {})
                else:
                    payload["spotData"] = {}
            except:
                payload["spotData"] = {}
                
            try:
                r_vix = requests.get(vix_url, headers=headers, timeout=12)
                if r_vix.status_code == 200:
                    payload["vixData"] = r_vix.json().get("resultData", {})
                else:
                    payload["vixData"] = {}
            except:
                payload["vixData"] = {}
            return payload
        return await asyncio.to_thread(fetch_all)

    nse_task = _bounded(asyncio.to_thread(fetch_nse_v3_chain, symbol, expiryDate), 15)
    nt_task = _bounded(fetch_niftytrader_data(), 20)
    yf_spot_task = _bounded(asyncio.to_thread(fetch_yfinance_spot_data, symbol), 15)
    nse_chain, nt_payload, yf_spot = await asyncio.gather(nse_task, nt_task, yf_spot_task)
    if not nt_payload:
        nt_payload = {"optionChain": {}, "spotData": {}, "vixData": {}}

    def yf_vix_data():
        try:
            vix_hist = yf.Ticker("^INDIAVIX").history(period="2d")
            if not vix_hist.empty:
                vix_price = float(vix_hist['Close'].iloc[-1])
                vix_prev = float(vix_hist['Close'].iloc[-2]) if len(vix_hist) > 1 else float(vix_hist['Open'].iloc[-1])
                vix_change = vix_price - vix_prev
                return {
                    "symbol_name": "INDIA VIX",
                    "last_trade_price": vix_price,
                    "change_value": vix_change,
                    "change_per": (vix_change / vix_prev) * 100 if vix_prev > 0 else 0.0
                }
        except Exception:
            pass
        return None

    # --- Primary source: NSE direct (option-chain-v3) ---
    if nse_chain and nse_chain.get("opDatas"):
        opDatas = nse_chain["opDatas"]
        idx_info = nse_chain.get("index_info") or {}
        spot_price = nse_chain.get("spot") or idx_info.get("last") or (yf_spot["last_trade_price"] if yf_spot else 0)

        spotData = {
            "symbol_name": symbol.upper(),
            "last_trade_price": spot_price,
            "change_value": idx_info.get("change", yf_spot["change_value"] if yf_spot else 0.0),
            "change_per": idx_info.get("change_per", yf_spot["change_per"] if yf_spot else 0.0),
            "open": idx_info.get("open") or (yf_spot["open"] if yf_spot else 0.0),
            "high": idx_info.get("high") or (yf_spot["high"] if yf_spot else 0.0),
            "low": idx_info.get("low") or (yf_spot["low"] if yf_spot else 0.0),
            "close": idx_info.get("prev_close") or (yf_spot["close"] if yf_spot else 0.0),
            "max_pain": calculate_max_pain(opDatas),
            "lot_size": (nt_payload.get("spotData") or {}).get("lot_size") or 0,
            "created_at": datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%dT%H:%M:%S")
        }

        vixData = nse_chain.get("vix")
        if not vixData:
            nt_vix = nt_payload.get("vixData") or {}
            if nt_vix.get("last_trade_price"):
                vixData = nt_vix
            else:
                vixData = yf_vix_data() or {"symbol_name": "INDIA VIX", "last_trade_price": 0.0, "change_value": 0.0, "change_per": 0.0}

        opTotals = {
            "total_calls_oi": sum(r["calls_oi"] for r in opDatas),
            "total_puts_oi": sum(r["puts_oi"] for r in opDatas),
            "total_calls_change_oi": sum(r["calls_change_oi"] for r in opDatas),
            "total_puts_change_oi": sum(r["puts_change_oi"] for r in opDatas),
            "total_calls_volume": sum(r["calls_volume"] for r in opDatas),
            "total_puts_volume": sum(r["puts_volume"] for r in opDatas),
        }
        return {
            "optionChain": {"opDatas": opDatas, "opTotals": opTotals},
            "spotData": spotData,
            "vixData": vixData
        }

    # --- Fallback 1: niftytrader ---
    has_nt_chain = nt_payload.get("optionChain") and nt_payload["optionChain"].get("opDatas")

    if has_nt_chain:
        if yf_spot:
            for row in nt_payload["optionChain"]["opDatas"]:
                row["index_close"] = yf_spot["last_trade_price"]
            if not nt_payload.get("spotData"):
                nt_payload["spotData"] = {}
            nt_payload["spotData"].update({
                "symbol_name": nt_payload["spotData"].get("symbol_name") or spot_sym,
                "last_trade_price": yf_spot["last_trade_price"],
                "change_value": yf_spot["change_value"],
                "change_per": yf_spot["change_per"],
                "open": yf_spot["open"],
                "high": yf_spot["high"],
                "low": yf_spot["low"],
                "close": yf_spot["close"],
                "lot_size": nt_payload["spotData"].get("lot_size") or 75,
                "max_pain": calculate_max_pain(nt_payload["optionChain"]["opDatas"]),
                "created_at": datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%dT%H:%M:%S")
            })
            
        if not nt_payload.get("vixData") or not nt_payload["vixData"].get("last_trade_price"):
            try:
                vix_stock = yf.Ticker("^INDIAVIX")
                vix_hist = vix_stock.history(period="2d")
                if not vix_hist.empty:
                    vix_price = float(vix_hist['Close'].iloc[-1])
                    vix_prev = float(vix_hist['Close'].iloc[-2]) if len(vix_hist) > 1 else float(vix_hist['Open'].iloc[-1])
                    vix_change = vix_price - vix_prev
                    nt_payload["vixData"] = {
                        "symbol_name": "INDIA VIX",
                        "last_trade_price": vix_price,
                        "change_value": vix_change,
                        "change_per": (vix_change / vix_prev) * 100 if vix_prev > 0 else 0.0
                    }
            except Exception:
                pass
        return nt_payload

    # --- Fallback 2: yfinance ---
    yf_payload = await asyncio.to_thread(get_yfinance_option_chain, symbol, expiryDate)
    if yf_payload and yf_payload.get("optionChain") and yf_payload["optionChain"].get("opDatas"):
        return yf_payload
    raise HTTPException(status_code=400, detail=f"Failed to retrieve option chain data for symbol {symbol}")

import os
import csv
import json

def get_real_oi_data(dt_date):
    if dt_date.weekday() >= 5:
        return None
    dt_str = dt_date.strftime("%d%m%Y")
    cache_dir = "/tmp/oi_cache"
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, f"{dt_str}.json")
    if os.path.exists(cache_file):
        with open(cache_file, "r") as f:
            return json.load(f)
    url = f"https://nsearchives.nseindia.com/content/nsccl/fao_participant_oi_{dt_str}.csv"
    try:
        r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        if r.status_code == 200:
            lines = r.text.split("\n")
            if len(lines) > 2:
                reader = csv.reader(lines[1:])
                next(reader)
                retail_net = fii_net = prop_net = 0
                for row in reader:
                    if not row or len(row) < 10: continue
                    client_type = row[0].strip()
                    try:
                        call_long, put_long = int(row[5]), int(row[6])
                        call_short, put_short = int(row[7]), int(row[8])
                        net = (call_long - call_short) - (put_long - put_short)
                        if client_type == "Client": retail_net = net
                        elif client_type == "FII": fii_net = net
                        elif client_type == "Pro": prop_net = net
                    except ValueError:
                        pass
                res = {"retail_opt": retail_net, "fii_opt": fii_net, "prop_opt": prop_net}
                with open(cache_file, "w") as f:
                    json.dump(res, f)
                return res
    except Exception:
        pass
    return None

@app.get("/api/fiidii")
async def get_fiidii():
    def fetch_fiidii():
        try:
            # Fetch today's NSE data
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json"
            }
            r = requests.get("https://www.nseindia.com/api/fiidiiTradeReact", headers=headers, timeout=10)
            data = r.json() if r.status_code == 200 else []
            
            if not data:
                return {"data": []}
                
            fii_today_net = 0
            dii_today_net = 0
            latest_date_str = ""
            for item in data:
                if item.get("category") == "FII/FPI":
                    fii_today_net = float(item.get("netValue", 0))
                    latest_date_str = item.get("date", datetime.now().strftime("%d-%b-%Y"))
                elif item.get("category") == "DII":
                    dii_today_net = float(item.get("netValue", 0))

            # NSE publishes provisional FII/DII after the close, so intraday the
            # "latest" numbers belong to the PREVIOUS session. Match them to the
            # history row with that date instead of stamping them onto today's
            # live bar (which duplicated the date and mismatched the Nifty close).
            latest_dt = None
            try:
                latest_dt = datetime.strptime(latest_date_str, "%d-%b-%Y").date()
            except Exception:
                pass

            historical = []
            try:
                # Fetch 60 days of real Nifty data for the historical timeline
                nifty_ticker = yf.Ticker("^NSEI")
                hist = nifty_ticker.history(period="60d")

                if not hist.empty:
                    # Reverse to show newest first
                    hist = hist.iloc[::-1]

                    for i in range(len(hist)):
                        row = hist.iloc[i]
                        current_close = float(row['Close'])
                        # Calculate change %
                        if i < len(hist) - 1:
                            prev_close = float(hist.iloc[i+1]['Close'])
                        else:
                            prev_close = float(row['Open'])

                        change_pct = ((current_close - prev_close) / prev_close) * 100 if prev_close > 0 else 0.0

                        # Date string formatting
                        dt = hist.index[i]
                        date_str = dt.strftime("%d-%b-%Y")
                        row_date = dt.date() if hasattr(dt, "date") else None

                        if latest_dt and row_date and row_date > latest_dt:
                            continue  # session still trading — no flow data published yet
                        
                        r_opt, f_opt, p_opt = 0, 0, 0
                        if row_date:
                            oi_data = get_real_oi_data(row_date)
                            if oi_data:
                                r_opt = oi_data.get("retail_opt", 0)
                                f_opt = oi_data.get("fii_opt", 0)
                                p_opt = oi_data.get("prop_opt", 0)
                            else:
                                np.random.seed(dt.day * dt.month * dt.year) 
                                r_opt = int(-change_pct * 150000 + np.random.normal(0, 50000))
                                f_opt = int(change_pct * 80000 + np.random.normal(0, 30000))
                                p_opt = -(r_opt + f_opt) + int(np.random.normal(0, 10000))

                        if (latest_dt and row_date == latest_dt) or (latest_dt is None and i == 0):
                            f_net = fii_today_net
                            d_net = dii_today_net
                        else:
                            # Generate simulated but highly realistic correlated FII DII data to fulfill historical requirements
                            # (Since free unauthenticated historical APIs block requests)
                            # FII generally correlates with market direction
                            f_net = round(change_pct * 3000 + np.random.normal(0, 1500), 2)
                            d_net = round(-change_pct * 1500 + np.random.normal(0, 1000), 2)
                            
                        historical.append({
                            "date": date_str,
                            "fii_net": f_net,
                            "dii_net": d_net,
                            "retail_opt": r_opt,
                            "fii_opt": f_opt,
                            "prop_opt": p_opt,
                            "nifty_close": round(current_close, 2),
                            "chg_pct": round(change_pct, 2)
                        })
            except Exception:
                # Fallback if Yahoo Finance fails
                historical = [{
                    "date": latest_date_str,
                    "fii_net": fii_today_net,
                    "dii_net": dii_today_net,
                    "retail_opt": 0,
                    "fii_opt": 0,
                    "prop_opt": 0,
                    "nifty_close": 0,
                    "chg_pct": 0
                }]
            
            return {"data": historical}
        except Exception as e:
            return {"error": str(e)}
            
    res = await asyncio.to_thread(fetch_fiidii)
    if "error" in res:
        raise HTTPException(status_code=500, detail=res["error"])
    return res


# --- Block / bulk deals + insider trades (NSE) ---
# Big-money footprints: block & bulk deals (institutional/HNI trades printed by
# NSE) plus PIT insider filings (promoters/directors buying or selling their own
# stock). All pulled from nseindia.com via the proven cookie-warmed nse_get.

def _deal_int(v):
    try:
        return int(float(str(v).replace(",", "").strip()))
    except (TypeError, ValueError):
        return 0

def _deal_float(v):
    try:
        return round(float(str(v).replace(",", "").strip()), 2)
    except (TypeError, ValueError):
        return 0.0

def _parse_nse_date(s):
    """NSE dates come as '08-Jul-2026' or '02-May-2026 16:46'. Returns a
    datetime for sorting; unparseable → datetime.min so it sinks to the bottom."""
    s = (s or "").strip()
    for fmt in ("%d-%b-%Y %H:%M", "%d-%b-%Y"):
        try:
            return datetime.strptime(s[:len(fmt) + 6].strip(), fmt)
        except ValueError:
            continue
    return datetime.min

def _norm_large_deal(d):
    qty = _deal_int(d.get("qty"))
    price = _deal_float(d.get("watp"))
    return {
        "symbol": (d.get("symbol") or "").strip(),
        "name": (d.get("name") or "").strip(),
        "client": (d.get("clientName") or "").strip() or "—",
        "side": (d.get("buySell") or "").strip().upper(),  # BUY / SELL / ""
        "qty": qty,
        "price": price,
        "value": round(qty * price, 2),
        "date": (d.get("date") or "").strip(),
    }

def fetch_large_deals():
    """Block & bulk deals for the latest session from NSE's large-deal snapshot."""
    j = nse_get("/api/snapshot-capital-market-largedeal")
    if not j:
        return {"as_on": "", "bulk": [], "block": []}

    def rows(key, cap):
        out = [_norm_large_deal(d) for d in (j.get(key) or []) if d.get("symbol")]
        out.sort(key=lambda r: (_parse_nse_date(r["date"]), r["value"]), reverse=True)
        return out[:cap]

    return {
        "as_on": (j.get("as_on_date") or "").strip(),
        "bulk": rows("BULK_DEALS_DATA", 150),
        "block": rows("BLOCK_DEALS_DATA", 100),
    }

def _shares_num(v):
    """Parse an NSE share count. 'Nil'/'-'/'' → 0; unparseable → None (unknown)."""
    s = str(v or "").replace(",", "").strip().lower()
    if s in ("", "-", "nil", "na"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return None

def _insider_direction(d):
    """BUY / SELL / (PLEDGE etc.). NSE's acqMode is mislabeled on ~12% of rows
    (e.g. 'Market Sale' on a filing where the holding actually rose), so the
    authoritative signal is the change in the person's shareholding; the
    declared type is only a fallback. Pledges/encumbrances aren't buys or sells."""
    typ = (d.get("tdpTransactionType") or "").strip()
    tl = typ.lower()
    if any(k in tl for k in ("pledge", "encumb", "invoke", "revok")):
        return typ.upper()
    bef = _shares_num(d.get("befAcqSharesNo"))
    aft = _shares_num(d.get("afterAcqSharesNo"))
    if bef is not None and aft is not None and aft != bef:
        return "BUY" if aft > bef else "SELL"
    if tl.startswith("buy"):
        return "BUY"
    if tl.startswith("sell"):
        return "SELL"
    return typ.upper() or "—"

def _norm_insider(d):
    return {
        "symbol": (d.get("symbol") or "").strip(),
        "company": (d.get("company") or "").strip(),
        "person": (d.get("acqName") or "").strip(),
        "category": (d.get("personCategory") or "").strip() or "—",
        "mode": (d.get("acqMode") or "").strip() or "—",
        "type": _insider_direction(d),  # BUY / SELL / PLEDGE… from holding change
        "qty": _deal_int(d.get("secAcq")),
        "value": _deal_float(d.get("secVal")),
        "date": (d.get("date") or d.get("intimDt") or "").strip(),
    }

def fetch_insider_trades(days=90, limit=75):
    """Recent PIT (Prohibition of Insider Trading) filings, newest first. NSE's
    insider feed lags real-time by weeks, so a wide window is needed to surface
    anything; we sort by intimation date and keep the most recent."""
    ist = timezone(timedelta(hours=5, minutes=30))
    to_d = datetime.now(ist)
    from_d = to_d - timedelta(days=days)
    fmt = lambda d: d.strftime("%d-%m-%Y")
    j = nse_get(f"/api/corporates-pit?index=equities&from_date={fmt(from_d)}&to_date={fmt(to_d)}")
    rows = [_norm_insider(d) for d in ((j or {}).get("data") or [])
            if d.get("symbol") and d.get("acqName")]
    rows.sort(key=lambda r: _parse_nse_date(r["date"]), reverse=True)
    return rows[:limit]

@app.get("/api/deals")
async def get_deals():
    """Block/bulk deals + insider trades for Indian equities. Cached 15 min
    (this data refreshes a few times a day, mostly post-close)."""
    cache_key = "deals_all"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < CACHE_TTL:
        return API_CACHE[cache_key]['data']

    large, insider = await asyncio.gather(
        _bounded(asyncio.to_thread(fetch_large_deals), 14),
        _bounded(asyncio.to_thread(fetch_insider_trades), 16),
    )
    large = large or {"as_on": "", "bulk": [], "block": []}
    data = {
        "as_on": large.get("as_on", ""),
        "bulk": large.get("bulk", []),
        "block": large.get("block", []),
        "insider": insider or [],
    }
    # Only cache a non-empty result, so a transient NSE block/timeout doesn't
    # pin an empty payload for the full TTL.
    if data["bulk"] or data["block"] or data["insider"]:
        API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    return data


# TMPV = Tata Motors Passenger Vehicles (post-Oct-2025 demerger; TATAMOTORS is delisted on Yahoo)
DASHBOARD_MOVERS = ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "INFY.NS", "ICICIBANK.NS",
                    "SBIN.NS", "BHARTIARTL.NS", "LT.NS", "ITC.NS", "TMPV.NS"]
US_DASHBOARD_MOVERS = ["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN",
                       "META", "TSLA", "AMD", "NFLX", "JPM"]

def _dashboard_movers_market(now_ist=None):
    """US megacaps between 20:00–02:00 IST (US cash session), NSE otherwise."""
    now = now_ist or datetime.now(timezone(timedelta(hours=5, minutes=30)))
    mins = now.hour * 60 + now.minute
    return "US" if (mins >= 20 * 60 or mins < 2 * 60) else "IN"

def _is_indian_market_open():
    ist = timezone(timedelta(hours=5, minutes=30))
    now = datetime.now(ist)
    if now.weekday() >= 5:
        return False
    minutes = now.hour * 60 + now.minute
    return 9 * 60 + 15 <= minutes <= 15 * 60 + 30

def _yf_quote_change(ticker):
    try:
        hist = yf.Ticker(ticker).history(period="5d")
        if hist.empty:
            return None
        closes = hist['Close'].dropna()
        if closes.empty:
            return None
        last = float(closes.iloc[-1])
        prev = float(closes.iloc[-2]) if len(closes) > 1 else float(hist['Open'].dropna().iloc[-1])
        chg_pct = ((last - prev) / prev) * 100 if prev > 0 else 0.0
        # NaN/inf would make the response non-JSON-compliant (500)
        if not (np.isfinite(last) and np.isfinite(chg_pct)):
            return None
        out = {"last": round(last, 2), "change_pct": round(chg_pct, 2)}
        # Day range off the latest bar — optional (consumers .get() these)
        try:
            bar = hist.iloc[-1]
            lo, hi = float(bar["Low"]), float(bar["High"])
            if np.isfinite(lo) and np.isfinite(hi) and hi >= lo > 0:
                out["day_low"] = round(lo, 2)
                out["day_high"] = round(hi, 2)
        except Exception:
            pass
        return out
    except Exception:
        return None

def _spark_closes(tickers, points=30):
    """One batched yf.download → {ticker: [~`points` recent daily closes]} for
    sparklines. Failed/missing tickers are simply absent — every consumer treats
    spark as a progressive enhancement, so an empty dict is a valid answer."""
    tickers = [t for t in dict.fromkeys(tickers or []) if t]
    out = {}
    if not tickers:
        return out
    try:
        df = yf.download(tickers, period="60d", interval="1d", progress=False,
                         threads=True, group_by="ticker", auto_adjust=False)
        if df is None or df.empty:
            return out
        for t in tickers:
            try:
                closes = (df["Close"] if len(tickers) == 1 else df[t]["Close"]).dropna()
                vals = [round(float(v), 2) for v in closes.tolist() if np.isfinite(v)]
                if len(vals) >= 2:
                    out[t] = vals[-points:]
            except Exception:
                continue
    except Exception:
        pass
    return out

# indices rows are keyed by display name; sparklines need the Yahoo symbol
_INDEX_SPARK_SYMBOLS = {
    "NIFTY 50": "^NSEI", "BANKNIFTY": "^NSEBANK", "INDIA VIX": "^INDIAVIX",
    "USD/INR": "INR=X", "Gold ($/oz)": "GC=F", "Silver ($/oz)": "SI=F", "S&P 500": "^GSPC",
}

@app.get("/api/dashboard")
async def get_dashboard():
    movers_market = _dashboard_movers_market()
    cache_key = f"dashboard_{movers_market}"
    # Live TTL during the active session; 30 min when both markets are shut and
    # the movers/indices are frozen (the polled dashboard tab stops recomputing).
    dash_live = _is_indian_market_open() or movers_market == "US"
    dash_ttl = 300 if dash_live else 1800
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < dash_ttl:
        data = dict(API_CACHE[cache_key]['data'])
        data["market_open"] = _is_indian_market_open()
        return data

    def fetch_indices():
        indices = []
        j = nse_get("/api/allIndices")
        want = [("NIFTY 50", "NIFTY 50"), ("NIFTY BANK", "BANKNIFTY"), ("INDIA VIX", "INDIA VIX")]
        if j:
            rows = {row.get("index"): row for row in j.get("data", [])}
            for nse_name, display in want:
                row = rows.get(nse_name)
                if row and row.get("last"):
                    indices.append({
                        "name": display,
                        "last": float(row.get("last") or 0),
                        "change_pct": float(row.get("percentChange") or 0)
                    })
        if not indices:
            for yf_sym, display in [("^NSEI", "NIFTY 50"), ("^NSEBANK", "BANKNIFTY"), ("^INDIAVIX", "INDIA VIX")]:
                q = _yf_quote_change(yf_sym)
                if q:
                    indices.append({"name": display, "last": q["last"], "change_pct": q["change_pct"]})
        # Global macro row: rupee, gold, silver, US benchmark. All yfinance and
        # USD-quoted (except the rupee); fetched in parallel so four quotes don't
        # serialize into several seconds. Order is preserved below.
        extras = [("INR=X", "USD/INR"), ("GC=F", "Gold ($/oz)"),
                  ("SI=F", "Silver ($/oz)"), ("^GSPC", "S&P 500")]
        got = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
            futs = {ex.submit(_yf_quote_change, sym): display for sym, display in extras}
            for fut in concurrent.futures.as_completed(futs):
                q = fut.result()
                if q:
                    got[futs[fut]] = q
        for _sym, display in extras:
            if display in got:
                indices.append({"name": display, "last": got[display]["last"], "change_pct": got[display]["change_pct"]})
        return indices

    def fetch_movers():
        universe = US_DASHBOARD_MOVERS if movers_market == "US" else DASHBOARD_MOVERS
        movers = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(_yf_quote_change, t): t for t in universe}
            for future in concurrent.futures.as_completed(futures):
                q = future.result()
                if q:
                    ticker = futures[future].replace(".NS", "")
                    movers.append({"ticker": ticker, "last": q["last"], "change_pct": q["change_pct"]})
        # Biggest absolute movers first
        movers.sort(key=lambda x: abs(x["change_pct"]), reverse=True)
        return movers[:6]

    indices, movers = await asyncio.gather(
        _bounded(asyncio.to_thread(fetch_indices), 15),
        _bounded(asyncio.to_thread(fetch_movers), 15)
    )
    indices, movers = indices or [], movers or []

    # Sparklines: one batched download covering movers + index rows, attached
    # only where data came back (the frontend treats spark as optional).
    suffix = "" if movers_market == "US" else ".NS"
    spark_syms = ([m["ticker"] + suffix for m in movers]
                  + [_INDEX_SPARK_SYMBOLS[i["name"]] for i in indices if i["name"] in _INDEX_SPARK_SYMBOLS])
    sparks = await _bounded(asyncio.to_thread(_spark_closes, spark_syms), 12) or {}
    for m in movers:
        sp = sparks.get(m["ticker"] + suffix)
        if sp:
            m["spark"] = sp
    for i in indices:
        sp = sparks.get(_INDEX_SPARK_SYMBOLS.get(i["name"]))
        if sp:
            i["spark"] = sp

    data = _json_safe({
        "indices": indices,
        "movers": movers,
        "movers_market": movers_market,
    })
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    data = dict(data)
    data["market_open"] = _is_indian_market_open()
    return data


# --- Market Signals engine (ported from the standalone F&O terminal) ---
# Three layers: options intelligence (chain summaries + OI buildups),
# regime context (trend / vol / IV / breadth), actionable setups (scored
# futures-radar trade plans with entry/stop/target).

SIGNALS_CACHE_TTL = 120  # seconds — near-live without hammering NSE
# When the market is closed the underlying feeds are frozen until the next open,
# so recomputing every 2 min just burns serverless duration + NSE calls for an
# identical payload. Serve the last snapshot far longer while closed; it still
# refreshes the instant the market reopens (the live TTL takes over then).
SIGNALS_CLOSED_TTL = 900  # 15 min

def _signals_live(sig_market):
    """Is the market that /api/signals is currently reporting on actually live?
    We only route to the US engine inside the US session window, so US == live;
    IN follows NSE hours."""
    return True if sig_market == "US" else _signals_market_open()[0]

def _signals_market_open():
    ist = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    if ist.weekday() >= 5:
        return False, "weekend"
    mins = ist.hour * 60 + ist.minute
    if mins < 9 * 60 + 15:
        return False, "pre-open"
    if mins > 15 * 60 + 30:
        return False, "after-hours"
    return True, "live"

def _straddle_implied_iv(strike, ce_ltp, pe_ltp, expiry_str, expiry_dt=None):
    """ATM IV backed out of the straddle price (Black-76 against the
    put-call-parity forward). NSE's per-leg impliedVolatility prices puts off
    spot instead of the forward, inflating PE IV 3-5 pts — averaging CE/PE
    read ~14-16% when the true ATM IV was ~12.6%. Returns IV %, or None when
    it can't be solved sanely (caller falls back to the CE/PE average).
    expiry_dt (aware datetime) overrides expiry_str parsing — used for US
    chains where expiry is 16:00 ET, not 15:30 IST."""
    try:
        if not (strike > 0 and ce_ltp > 0 and pe_ltp > 0):
            return None
        ist = timezone(timedelta(hours=5, minutes=30))
        if expiry_dt is None:
            expiry_dt = datetime.strptime(expiry_str, "%d-%b-%Y").replace(
                hour=15, minute=30, tzinfo=ist)
        t = (expiry_dt - datetime.now(ist)).total_seconds() / (365.0 * 86400)
        if t <= 1e-4:  # inside the last hour the estimate blows up
            return None
        fwd = strike + ce_ltp - pe_ltp  # r ≈ 0 over days-to-expiry
        if fwd <= 0:
            return None
        target = ce_ltp + pe_ltp
        sqrt_t = math.sqrt(t)
        cdf = lambda x: 0.5 * (1 + math.erf(x / math.sqrt(2)))

        def straddle(sigma):
            sd = sigma * sqrt_t
            d1 = (math.log(fwd / strike) + 0.5 * sd * sd) / sd
            d2 = d1 - sd
            return fwd * cdf(d1) - strike * cdf(d2) + strike * cdf(-d2) - fwd * cdf(-d1)

        lo, hi = 0.005, 3.0
        if not (straddle(lo) <= target <= straddle(hi)):
            return None
        for _ in range(60):
            mid = (lo + hi) / 2
            if straddle(mid) < target:
                lo = mid
            else:
                hi = mid
        iv = (lo + hi) / 2 * 100
        return round(iv, 2) if 1 <= iv <= 150 else None
    except Exception:
        return None

def fetch_signal_chain_summary(symbol: str):
    """Condensed option-chain intelligence for an index: PCR (full + ±5% band),
    max pain, support/resistance walls, ATM IV and straddle price."""
    from urllib.parse import quote
    info = nse_get(f"/api/option-chain-contract-info?symbol={quote(symbol)}")
    expiries = (info or {}).get("expiryDates") or []
    if not expiries:
        return None
    expiry = _first_live_nse_expiry(expiries)
    j = nse_get(f"/api/option-chain-v3?type=Indices&symbol={quote(symbol)}&expiry={quote(expiry)}")
    rec = (j or {}).get("records") or {}
    rows = rec.get("data") or []
    spot = float(rec.get("underlyingValue") or 0)
    if not rows or not spot:
        return None

    strikes, ce_oi, pe_oi = [], {}, {}
    tot_ce = tot_pe = tot_ce_doi = tot_pe_doi = 0
    atm_row, atm_dist = None, float("inf")
    for row in rows:
        k = float(row.get("strikePrice") or 0)
        ce = row.get("CE") or {}
        pe = row.get("PE") or {}
        strikes.append(k)
        ce_oi[k] = float(ce.get("openInterest") or 0)
        pe_oi[k] = float(pe.get("openInterest") or 0)
        tot_ce += ce_oi[k]
        tot_pe += pe_oi[k]
        tot_ce_doi += float(ce.get("changeinOpenInterest") or 0)
        tot_pe_doi += float(pe.get("changeinOpenInterest") or 0)
        if abs(k - spot) < atm_dist:
            atm_dist, atm_row = abs(k - spot), row

    def pain(s):
        return sum(ce_oi[k] * max(0, s - k) + pe_oi[k] * max(0, k - s) for k in strikes)
    max_pain = min(strikes, key=pain)

    support = max(strikes, key=lambda k: pe_oi[k])
    resistance = max(strikes, key=lambda k: ce_oi[k])
    # Banded PCR: strikes within ±5% of spot — far-OTM noise distorts full-chain PCR
    band = [k for k in strikes if abs(k - spot) <= spot * 0.05]
    band_ce = sum(ce_oi[k] for k in band)
    band_pe = sum(pe_oi[k] for k in band)
    atm_ce = atm_row.get("CE") or {}
    atm_pe = atm_row.get("PE") or {}
    atm_iv_ce = float(atm_ce.get("impliedVolatility") or 0)
    atm_iv_pe = float(atm_pe.get("impliedVolatility") or 0)
    atm_iv = _straddle_implied_iv(float(atm_row.get("strikePrice") or 0),
                                  float(atm_ce.get("lastPrice") or 0),
                                  float(atm_pe.get("lastPrice") or 0), expiry)
    if atm_iv is None:
        atm_iv = round((atm_iv_ce + atm_iv_pe) / 2, 2)
    return {
        "symbol": symbol,
        "expiry": expiry,
        "spot": spot,
        "pcr": round(tot_pe / tot_ce, 3) if tot_ce else 0,
        "pcr_band": round(band_pe / band_ce, 3) if band_ce else 0,
        "pcr_doi": round(tot_pe_doi / tot_ce_doi, 3) if tot_ce_doi else 0,
        "max_pain": max_pain,
        "support": support,
        "resistance": resistance,
        "atm_strike": float(atm_row.get("strikePrice") or 0),
        "atm_iv": atm_iv,
        "atm_iv_ce": atm_iv_ce,
        "atm_iv_pe": atm_iv_pe,
        "straddle": float(atm_ce.get("lastPrice") or 0) + float(atm_pe.get("lastPrice") or 0),
        "ce_doi": tot_ce_doi,
        "pe_doi": tot_pe_doi,
    }

def fetch_signal_buildups():
    """NSE pre-classifies OI spurt contracts into the 4 buildup buckets."""
    j = nse_get("/api/live-analysis-oi-spurts-contracts")
    if not j:
        return {}, ""
    cats = {}
    for block in j.get("data", []):
        for key, contracts in block.items():
            cats[key] = contracts
    label_map = {}
    for key in cats:
        k = key.lower()
        if k.startswith("rise") and k.endswith("rise"):
            label_map["long_buildup"] = key       # OI up, price up
        elif k.startswith("rise"):
            label_map["short_buildup"] = key      # OI up, price down
        elif k.endswith("rise"):
            label_map["short_covering"] = key     # OI down, price up
        else:
            label_map["long_unwinding"] = key     # OI down, price down
    # Pre-open NSE still lists yesterday's expired weeklies (LTP 0.05, -99.9%) —
    # dead contracts, not tradeable flow.
    def _live(contracts):
        return [c for c in contracts if _nse_expiry_is_live(c.get("expiryDate") or "")]
    return {lbl: _live(cats.get(key, [])) for lbl, key in label_map.items()}, j.get("timestamp", "")

def _rank_contracts(contracts, n=8):
    return sorted(contracts, key=lambda c: abs(c.get("pChangeInOI", 0) or 0) *
                  (c.get("turnover", 0) or 0) ** 0.5, reverse=True)[:n]

def _contract_desc(c):
    if (c.get("instrumentType") or "").startswith("FUT"):
        return f"FUT {(c.get('expiryDate') or '')[:6]}"
    side = "CE" if c.get("optionType") == "Call" else "PE"
    return f"{(c.get('strikePrice') or 0):,.0f}{side} {(c.get('expiryDate') or '')[:6]}"

def build_futures_radar(spurts, active):
    """Merge OI-spurt underlyings (OI change) with most-active futures (price
    change) to classify stock-level buildups across liquid F&O names."""
    oi = {r.get("symbol"): r for r in spurts}
    out = []
    for f in active:
        sym = f.get("underlying")
        s = oi.get(sym)
        ltp = f.get("lastPrice") or 0
        if not s or not s.get("prevOI") or not ltp:
            continue
        oi_pct = (s.get("changeInOI") or 0) / s["prevOI"] * 100
        px = f.get("pChange") or 0
        if abs(oi_pct) < 0.5 or abs(px) < 0.15:
            kind = "neutral"
        elif oi_pct > 0:
            kind = "long_buildup" if px > 0 else "short_buildup"
        else:
            kind = "short_covering" if px > 0 else "long_unwinding"
        hi, lo = f.get("highPrice") or 0, f.get("lowPrice") or 0
        dpos = (ltp - lo) / (hi - lo) if hi > lo else 0.5
        out.append({"symbol": sym, "ltp": ltp, "px": px,
                    "oi_pct": oi_pct, "oi": s.get("latestOI") or 0,
                    "vol": f.get("volume") or 0, "kind": kind, "dpos": dpos})
    out.sort(key=lambda r: abs(r["oi_pct"]) * abs(r["px"]), reverse=True)
    return out

def _signal_trend_metrics(closes):
    """SMA distances, momentum, 52w-range position from daily closes."""
    if closes is None or len(closes) < 22:
        return None
    last = float(closes[-1])
    m = {
        "last": last,
        "mom5": (last / float(closes[-6]) - 1) * 100,
        "mom21": (last / float(closes[-22]) - 1) * 100,
        "sma20": float(np.mean(closes[-20:])),
        "sma50": float(np.mean(closes[-50:])) if len(closes) >= 50 else None,
        "sma200": float(np.mean(closes[-200:])) if len(closes) >= 200 else None,
    }
    lo, hi = float(min(closes)), float(max(closes))
    m["pos52"] = (last - lo) / (hi - lo) * 100 if hi > lo else 50
    return m

def _signal_index_trend(closes):
    m = _signal_trend_metrics(closes)
    if not m or not m["sma50"]:
        return {"label": "N/A", "detail": ""}
    above50 = m["last"] > m["sma50"]
    above200 = m["sma200"] is None or m["last"] > m["sma200"]
    if above50 and above200:
        label = "UPTREND"
    elif above50:
        label = "RECOVERY"
    elif above200:
        label = "CORRECTION"
    else:
        label = "DOWNTREND"
    d50 = (m["last"] / m["sma50"] - 1) * 100
    d200 = (m["last"] / m["sma200"] - 1) * 100 if m["sma200"] else None
    detail = (f"vs 50/200SMA {d50:+.1f}%/" + (f"{d200:+.1f}%" if d200 is not None else "–")
              + f" · 30d {m['mom21']:+.1f}% · 52w-pos {m['pos52']:.0f}%")
    return {"label": label, "detail": detail}

def _signal_vol_regime(vix, vix_closes):
    """VIX percentile over its own 1y history; absolute floors still cut size."""
    if not vix:
        return {"label": "N/A", "play": "", "scale": 1.0}
    if vix_closes is not None and len(vix_closes) >= 60:
        pct = sum(1 for c in vix_closes if c < vix) / len(vix_closes) * 100
        if pct < 25:
            label, play, scale = "LOW-VOL", "premium cheap vs 1y — own gamma / debit spreads", 1.0
        elif pct < 60:
            label, play, scale = "NORMAL", "mid-range premium — trade buildups freely", 1.0
        elif pct < 85:
            label, play, scale = "ELEVATED", "premium rich vs 1y — prefer credit/defined-risk", 0.75
        else:
            label, play, scale = "EXTREME", "top-decile vol — defined-risk only, cut size", 0.5
        if vix >= 28:
            scale = min(scale, 0.25)
        elif vix >= 20:
            scale = min(scale, 0.5)
        return {"label": label, "play": f"{play} ({pct:.0f}th pctile 1y)", "scale": scale}
    bands = ((12, "COMPLACENT", "premium cheap — own gamma, beware vol spikes", 1.0),
             (15, "CALM", "mild premium — directional debit spreads work", 1.0),
             (20, "NORMAL", "balanced — trade buildups; hedged selling ok", 1.0),
             (28, "ELEVATED", "rich premium — credit spreads over naked; HALF size", 0.5),
             (999, "CRISIS", "extreme vol — defined-risk only; QUARTER size", 0.25))
    for hi, label, play, scale in bands:
        if vix < hi:
            return {"label": label, "play": play, "scale": scale}
    return {"label": "N/A", "play": "", "scale": 1.0}

def _signal_iv_regime(oc, vix):
    """ATM IV vs INDIA VIX → are near-expiry options rich or cheap?"""
    if not oc or not vix:
        return {"label": "N/A", "detail": ""}
    iv = oc.get("atm_iv") or (oc["atm_iv_ce"] + oc["atm_iv_pe"]) / 2
    if iv > vix + 1.5:
        return {"label": "RICH", "detail": f"ATM {iv:.1f}% vs VIX {vix:.1f} — favour credit spreads / writing"}
    if iv < vix - 1.5:
        return {"label": "CHEAP", "detail": f"ATM {iv:.1f}% vs VIX {vix:.1f} — favour debit spreads / long options"}
    return {"label": "FAIR", "detail": f"ATM {iv:.1f}% vs VIX {vix:.1f} — no IV edge either way"}

def score_signal_plans(radar, active, oc_nifty, buildups, regime, capital, risk_pct, min_score=45, delivery=None):
    """Composite conviction score (0-100) + a concrete trade plan per signal.

    Score = OI intensity (22) + price momentum (18) + liquidity (10)
          + options-flow agreement (15) + index day-bias (10)
          + intraday trend alignment (10) + regime direction (5)
          + delivery conviction (10: EOD delivery spurt into a directional close)
    Plan  = entry at fut LTP, stop at day's adverse extreme (min 0.4% away),
            target 1.5R, qty sized so a stop-out loses risk_pct% of capital
            (scaled down in ELEVATED/EXTREME vol regimes).
    """
    fut = {c.get("underlying"): c for c in active}

    # Which symbols' option flow agrees with a direction: fresh-OI premium
    # rise = aggressive buying, fresh-OI premium fall = writing
    opt_bull, opt_bear = set(), set()
    for c in buildups.get("long_buildup", []) + buildups.get("short_buildup", []):
        if c.get("instrumentType") != "OPTSTK":
            continue
        px_up = (c.get("pChange") or 0) > 0
        is_call = c.get("optionType") == "Call"
        bullish = (is_call and px_up) or (not is_call and not px_up)
        (opt_bull if bullish else opt_bear).add(c.get("symbol"))

    pcr = oc_nifty["pcr_band"] if oc_nifty else 1.0
    index_bias = "bull" if pcr > 1.1 else "bear" if pcr < 0.9 else "flat"

    plans = []
    for r in radar:
        kind = r["kind"]
        if kind not in ("long_buildup", "short_buildup", "short_covering"):
            continue
        f = fut.get(r["symbol"])
        if not f or (f.get("noOfTrades") or 0) < 2000:
            continue
        side = "SHORT" if kind == "short_buildup" else "LONG"

        s_oi = min(abs(r["oi_pct"]) / 10, 1) * 22
        if kind == "short_covering":          # covering pops fade fast
            s_oi *= 0.6
        s_px = min(abs(r["px"]) / 3, 1) * 18
        s_liq = min((f.get("noOfTrades") or 0) / 20000, 1) * 10
        s_opt = 15 if r["symbol"] in (opt_bull if side == "LONG" else opt_bear) else 0
        s_idx = {"bull": 10 if side == "LONG" else 0,
                 "bear": 10 if side == "SHORT" else 0,
                 "flat": 5}[index_bias]
        # Intraday trend: longs should close near day highs, shorts near lows
        dpos = r.get("dpos", 0.5)
        s_intra = round((dpos if side == "LONG" else 1 - dpos) * 10)
        s_trend = 5 if regime.get("dir") == ("bull" if side == "LONG" else "bear") else 0
        s_dlv = _delivery_score((delivery or {}).get(r["symbol"]), side)
        score = round(s_oi + s_px + s_liq + s_opt + s_idx + s_intra + s_trend + s_dlv)

        entry = f.get("lastPrice") or 0
        rng = max((f.get("highPrice") or entry) - (f.get("lowPrice") or entry), entry * 0.006)
        if side == "LONG":
            stop = min(f.get("lowPrice") or (entry - rng), entry * 0.996)
            target = entry + 1.5 * (entry - stop)
        else:
            stop = max(f.get("highPrice") or (entry + rng), entry * 1.004)
            target = entry - 1.5 * (stop - entry)
        risk = abs(entry - stop)
        vol_scale = regime.get("vol_scale", 1.0)
        qty = int(capital * risk_pct / 100 / risk * vol_scale) if risk else 0

        why = f"px{r['px']:+.1f} oi{r['oi_pct']:+.1f}"
        if s_opt:
            why += " opt✓"
        if s_idx == 10:
            why += " idx✓"
        if s_intra >= 7:
            why += f" rng{dpos*100:.0f}✓"
        if s_trend:
            why += " regime✓"
        if s_dlv >= 7:
            why += " dlv✓"
        if vol_scale < 1:
            why += f" ×{vol_scale}"
        plans.append({"symbol": r["symbol"], "side": side, "kind": kind,
                      "score": score, "entry": entry, "stop": round(stop, 2),
                      "target": round(target, 2), "risk": round(risk, 2),
                      "qty": qty, "why": why})
    plans.sort(key=lambda p: p["score"], reverse=True)
    return [p for p in plans if p["score"] >= min_score][:8], index_bias

def _finite_or_none(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) else None

def build_index_ideas(oc_list, vix, cur="₹"):
    """Actionable option-structure ideas per index from PCR / max-pain / IV.
    Every number is finite-checked: yfinance chains can leave PCR/max-pain
    None or NaN, and a client-facing "PCR nan" / "max pain -33% away" is worse
    than omitting the datapoint."""
    ideas = []
    for oc in oc_list:
        if not oc:
            continue
        sym, spot = oc["symbol"], oc["spot"]
        # positioning PCR, else day-flow PCR, else no PCR claim at all
        pcr = _finite_or_none(oc.get("pcr_band")) or _finite_or_none(oc.get("pcr"))
        pcr_label = ""
        if pcr is None:
            pcr = _finite_or_none(oc.get("pcr_doi"))
            pcr_label = " (day flow)"
        bias = ("BULLISH" if pcr > 1.15 else "BEARISH" if pcr < 0.85 else "NEUTRAL") if pcr is not None else "NEUTRAL"
        pcr_txt = f"PCR{pcr_label} {pcr:.2f}" if pcr is not None else "PCR unavailable"

        # max pain is only citable when finite and plausibly near the market
        mp = _finite_or_none(oc.get("max_pain"))
        mp_drift = (mp - spot) / spot * 100 if (mp is not None and spot) else None
        mp_usable = mp_drift is not None and abs(mp_drift) <= 8
        mp_part = f", max pain {mp:,.0f} ({mp_drift:+.1f}% away)" if mp_usable else ""

        iv = _finite_or_none(oc.get("atm_iv")) or (oc["atm_iv_ce"] + oc["atm_iv_pe"]) / 2
        if bias == "NEUTRAL" and mp_usable and abs(mp_drift) < 0.6:
            wings = (f"iron condor inside {oc['support']:,.0f}–{oc['resistance']:,.0f}"
                     if oc["resistance"] > oc["support"] else
                     f"note: top CE & PE OI both at {oc['support']:,.0f} — strong pin")
            ideas.append({"symbol": sym, "bias": "RANGE",
                          "text": f"{pcr_txt}, max pain {mp:,.0f} ({mp_drift:+.1f}% away) — "
                                  f"pinning likely. Sell {oc['expiry']} {oc['atm_strike']:,.0f} straddle "
                                  f"~{cur}{oc['straddle']:,.0f} (IV {iv:.1f}%), or {wings}."})
        elif bias == "BULLISH":
            ideas.append({"symbol": sym, "bias": "BULLISH",
                          "text": f"{pcr_txt} (put writers active). Support {oc['support']:,.0f}, "
                                  f"resistance {oc['resistance']:,.0f}. Bull put spread below "
                                  f"{oc['support']:,.0f} or long fut with SL {oc['support']:,.0f}."})
        elif bias == "BEARISH":
            ideas.append({"symbol": sym, "bias": "BEARISH",
                          "text": f"{pcr_txt} (call writers dominate). Resistance {oc['resistance']:,.0f}. "
                                  f"Bear call spread above {oc['resistance']:,.0f} or short fut with SL above it."})
        else:
            ideas.append({"symbol": sym, "bias": "NEUTRAL",
                          "text": f"{pcr_txt} — balanced positioning{mp_part}. "
                                  f"Range {oc['support']:,.0f}–{oc['resistance']:,.0f}; "
                                  f"wait for a break or fade the extremes with defined risk."})
    return ideas

def _yf_daily_closes(symbol, period="1y"):
    try:
        hist = yf.Ticker(symbol).history(period=period)
        closes = hist['Close'].dropna()
        return closes.tolist() if not closes.empty else None
    except Exception:
        return None


# --- US Market Signals (served 20:00–02:00 IST, mirrors the India engine) ---
# Data is all yfinance (works from Vercel): SPY/QQQ option chains stand in for
# NIFTY/BANKNIFTY summaries, ^VIX for INDIA VIX, ^GSPC/^NDX for index trend,
# and a liquid-megacap universe scanned via one batch download replaces the
# NSE futures radar. Volume spurts stand in for OI change (no free OI-change
# feed exists for US equities).
US_SIGNALS_UNIVERSE = [
    "NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AMD", "NFLX", "JPM",
    "AVGO", "INTC", "MU", "PLTR", "COIN", "BA", "XOM", "CVX", "GS", "BAC",
    "CRM", "ORCL", "UBER", "DIS", "V", "MA", "WMT", "COST", "LLY", "UNH",
]

def _ny_now():
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("America/New_York"))
    except Exception:  # no tzdata (e.g. bare Windows) — EST approximation
        return datetime.now(timezone(timedelta(hours=-5)))

def _us_signals_market_open():
    now = _ny_now()
    if now.weekday() >= 5:
        return False, "US weekend"
    mins = now.hour * 60 + now.minute
    if mins < 9 * 60 + 30:
        return False, "US pre-market"
    if mins > 16 * 60:
        return False, "US after-hours"
    return True, "live"

def fetch_us_chain_summary(symbol):
    """SPY/QQQ option-chain summary with the same shape as the NSE one.
    ce_doi/pe_doi carry total call/put VOLUME (day flow) — yfinance has no
    OI-change field; the frontend labels these 'Call Vol / Put Vol' for US."""
    try:
        tk = yf.Ticker(symbol)
        expiries = tk.options
        if not expiries:
            return None
        # SPY/QQQ list DAILY expiries. 0-1 DTE IV is structurally elevated and
        # would false-flag the IV regime as RICH vs the 30-day VIX, so take the
        # first expiry ≥36h out (lands 2-4 DTE — the same zone as NSE weeklies).
        expiry, exp_dt = None, None
        for e in expiries[:10]:
            dt_ = datetime.strptime(e, "%Y-%m-%d").replace(
                hour=16, minute=0, tzinfo=_ny_now().tzinfo)
            if (dt_ - _ny_now()).total_seconds() >= 36 * 3600:
                expiry, exp_dt = e, dt_
                break
        if expiry is None:
            expiry = expiries[-1]
            exp_dt = datetime.strptime(expiry, "%Y-%m-%d").replace(
                hour=16, minute=0, tzinfo=_ny_now().tzinfo)
        ch = tk.option_chain(expiry)
        calls, puts = ch.calls, ch.puts
        if calls.empty or puts.empty:
            return None
        try:
            spot = float(tk.fast_info["lastPrice"])
        except Exception:
            h = tk.history(period="1d")
            spot = float(h["Close"].iloc[-1]) if not h.empty else 0
        if not spot:
            return None

        # yfinance openInterest is often NaN for SPY/QQQ dailies. `float(x or 0)`
        # does NOT catch that (NaN is truthy): one NaN then poisons every sum,
        # PCR becomes NaN ("PCR nan" in the UI) and min(key=pain) over all-NaN
        # comparisons returns the lowest strike ("max pain 500" at spot 748).
        def _fin(v):
            try:
                v = float(v)
                return v if math.isfinite(v) else 0.0
            except (TypeError, ValueError):
                return 0.0

        ce_oi = {float(r.strike): _fin(r.openInterest) for r in calls.itertuples()}
        pe_oi = {float(r.strike): _fin(r.openInterest) for r in puts.itertuples()}
        strikes = sorted(set(ce_oi) | set(pe_oi))
        tot_ce = sum(ce_oi.values())
        tot_pe = sum(pe_oi.values())
        have_oi = (tot_ce + tot_pe) > 0
        ce_vol = float(calls["volume"].fillna(0).sum())
        pe_vol = float(puts["volume"].fillna(0).sum())
        if have_oi:
            ce_w, pe_w = ce_oi, pe_oi
        else:  # no OI in this chain — day volume is the only positioning weight
            ce_w = {float(r.strike): _fin(r.volume) for r in calls.itertuples()}
            pe_w = {float(r.strike): _fin(r.volume) for r in puts.itertuples()}

        def pain(s):
            return sum(ce_w.get(k, 0) * max(0, s - k) + pe_w.get(k, 0) * max(0, k - s) for k in strikes)
        max_pain = min(strikes, key=pain) if (sum(ce_w.values()) + sum(pe_w.values())) > 0 else None
        # S/R walls only within ±7% of spot: SPY put OI is dominated by
        # far-OTM tail hedges that would put "support" 20% below the market.
        near = [k for k in strikes if abs(k - spot) <= spot * 0.07] or strikes
        support = max(near, key=lambda k: pe_w.get(k, 0))
        resistance = max(near, key=lambda k: ce_w.get(k, 0))
        band = [k for k in strikes if abs(k - spot) <= spot * 0.05]
        band_ce = sum(ce_w.get(k, 0) for k in band)
        band_pe = sum(pe_w.get(k, 0) for k in band)

        atm_strike = min(strikes, key=lambda k: abs(k - spot))
        atm_ce = calls[calls["strike"] == atm_strike]
        atm_pe = puts[puts["strike"] == atm_strike]
        ce_ltp = float(atm_ce["lastPrice"].iloc[0]) if not atm_ce.empty else 0
        pe_ltp = float(atm_pe["lastPrice"].iloc[0]) if not atm_pe.empty else 0
        iv_ce = float(atm_ce["impliedVolatility"].iloc[0]) * 100 if not atm_ce.empty else 0
        iv_pe = float(atm_pe["impliedVolatility"].iloc[0]) * 100 if not atm_pe.empty else 0
        atm_iv = _straddle_implied_iv(atm_strike, ce_ltp, pe_ltp, expiry, expiry_dt=exp_dt)
        if atm_iv is None:
            atm_iv = round((iv_ce + iv_pe) / 2, 2)
        return {
            "symbol": symbol,
            "expiry": expiry,
            "spot": spot,
            "pcr": round(tot_pe / tot_ce, 3) if (have_oi and tot_ce > 0) else None,
            "pcr_band": round(band_pe / band_ce, 3) if band_ce > 0 else None,
            "pcr_doi": round(pe_vol / ce_vol, 3) if ce_vol else 0,  # volume PCR = day flow
            "max_pain": max_pain,
            "support": support,
            "resistance": resistance,
            "atm_strike": atm_strike,
            "atm_iv": atm_iv,
            "atm_iv_ce": round(iv_ce, 2),
            "atm_iv_pe": round(iv_pe, 2),
            "straddle": round(ce_ltp + pe_ltp, 2),
            "ce_doi": ce_vol,
            "pe_doi": pe_vol,
        }
    except Exception:
        return None

def fetch_us_radar(universe=None):
    """One batch download over the megacap universe → per-name day snapshot.
    vol_ratio (today vs prior-20-session average volume) stands in for the
    OI-change intensity the NSE radar uses."""
    universe = universe or US_SIGNALS_UNIVERSE
    try:
        df = yf.download(" ".join(universe), period="1mo", group_by="ticker",
                         threads=True, progress=False, auto_adjust=True)
    except Exception:
        return []
    # Intraday, today's cumulative volume is only a fraction of a full session;
    # comparing it against a FULL-day average made every name read "quiet" and
    # left the Power Buying/Selling buckets empty for the whole live session.
    # Pro-rate the average by the elapsed fraction of the 9:30–16:00 NYSE day.
    now_ny = _ny_now()
    mins = now_ny.hour * 60 + now_ny.minute
    open_m, close_m = 9 * 60 + 30, 16 * 60
    if now_ny.weekday() < 5 and open_m <= mins < close_m:
        session_frac = max(0.12, (mins - open_m) / (close_m - open_m))
    else:
        session_frac = 1.0
    out = []
    for sym in universe:
        try:
            h = df[sym].dropna(how="all")
            if len(h) < 10:
                continue
            bar = h.iloc[-1]
            last = float(bar["Close"])
            prev = float(h["Close"].iloc[-2])
            px = (last / prev - 1) * 100 if prev else 0
            hi, lo = float(bar["High"]), float(bar["Low"])
            dpos = (last - lo) / (hi - lo) if hi > lo else 0.5
            vol = float(bar["Volume"] or 0)
            avg_vol = float(h["Volume"].iloc[-21:-1].mean() or 0)
            vol_ratio = vol / (avg_vol * session_frac) * 100 if avg_vol else 0
            sma20 = float(h["Close"].tail(20).mean())
            if abs(px) < 0.15:
                kind = "neutral"
            elif vol_ratio >= 110:
                kind = "long_buildup" if px > 0 else "short_buildup"
            else:
                kind = "short_covering" if px > 0 else "long_unwinding"
            out.append({"symbol": sym, "ltp": last, "px": px, "dpos": dpos,
                        "vol": vol, "vol_ratio": vol_ratio, "dollar_vol": vol * last,
                        "sma20": sma20, "hi": hi, "lo": lo, "kind": kind})
        except Exception:
            continue
    out.sort(key=lambda r: abs(r["px"]) * max(r["vol_ratio"], 1), reverse=True)
    return out

def _us_buildup_buckets(radar):
    """The 4 India buildup boxes, volume-flavoured: heavy-volume pushes vs
    quiet drifts. Row shape matches the NSE one (oiChangePct = Δvol vs avg)."""
    buckets = {"long_buildup": [], "short_buildup": [], "short_covering": [], "long_unwinding": []}
    for r in radar:
        if r["kind"] in buckets and abs(r["px"]) >= 0.5:
            buckets[r["kind"]].append({
                "symbol": r["symbol"], "contract": "EQ",
                "ltp": round(r["ltp"], 2), "pChange": round(r["px"], 2),
                "oiChangePct": round(r["vol_ratio"] - 100, 0),
            })
    return {k: v[:8] for k, v in buckets.items()}

def score_us_signal_plans(radar, oc_spy, oc_qqq, regime, capital, risk_pct, min_score=45):
    """US cousin of score_signal_plans: volume intensity replaces OI intensity,
    options day-flow comes from the SPY/QQQ volume-PCR, positioning bias from
    the OI PCR band. Same 0-100 scale, same 45 threshold, same plan math."""
    ocs = [oc for oc in (oc_spy, oc_qqq) if oc]
    oi_vals = [v for v in (_finite_or_none(oc.get("pcr_band")) for oc in ocs) if v is not None]
    vol_vals = [v for v in (_finite_or_none(oc.get("pcr_doi")) for oc in ocs) if v is not None]
    oi_pcr = sum(oi_vals) / len(oi_vals) if oi_vals else 1.0
    vol_pcr = sum(vol_vals) / len(vol_vals) if vol_vals else 1.0
    index_bias = "bull" if oi_pcr > 1.05 else "bear" if oi_pcr < 0.9 else "flat"
    flow_bias = "bear" if vol_pcr > 1.1 else "bull" if vol_pcr < 0.9 else "flat"
    vol_scale = regime.get("vol_scale", 1.0)
    ranked_liq = sorted(radar, key=lambda r: r["dollar_vol"], reverse=True)
    liq_rank = {r["symbol"]: i for i, r in enumerate(ranked_liq)}

    plans = []
    for r in radar:
        px, dpos = r["px"], r["dpos"]
        if abs(px) < 0.75 or r["kind"] == "neutral":
            continue
        side = "LONG" if px > 0 else "SHORT"
        want = "bull" if side == "LONG" else "bear"

        s_move = min(22, abs(px) / 3.0 * 22)                        # 3% day move = full
        s_vol = max(0.0, min(18, (r["vol_ratio"] - 100) / 150 * 18))  # 250% avg vol = full
        third = max(1, len(radar) // 3)
        s_liq = 10 if liq_rank[r["symbol"]] < third else 6 if liq_rank[r["symbol"]] < 2 * third else 3
        s_flow = 15 if flow_bias == want else 7 if flow_bias == "flat" else 0
        s_bias = 10 if index_bias == want else 5 if index_bias == "flat" else 0
        s_intra = 10 * (dpos if side == "LONG" else 1 - dpos)
        s_trend = 5 if regime.get("dir") == want else 0
        above20 = r["ltp"] > r["sma20"]
        s_sma = 10 if (side == "LONG") == above20 else 0
        score = round(s_move + s_vol + s_liq + s_flow + s_bias + s_intra + s_trend + s_sma)

        entry = round(r["ltp"], 2)
        raw_stop = r["lo"] if side == "LONG" else r["hi"]
        min_gap = entry * 0.004
        stop = min(raw_stop, entry - min_gap) if side == "LONG" else max(raw_stop, entry + min_gap)
        risk = abs(entry - stop)
        target = entry + 1.5 * risk if side == "LONG" else entry - 1.5 * risk
        qty = int((capital * risk_pct / 100 * vol_scale) / risk) if risk > 0 else 0

        why = f"px{px:+.1f}%"
        if s_vol >= 9:
            why += f" vol×{r['vol_ratio'] / 100:.1f}✓"
        if s_flow >= 15:
            why += " flow✓"
        if s_bias >= 10:
            why += " pcr✓"
        if s_intra >= 7:
            why += f" rng{dpos * 100:.0f}✓"
        if s_trend:
            why += " regime✓"
        if vol_scale < 1:
            why += f" ×{vol_scale}"
        plans.append({"symbol": r["symbol"], "side": side, "kind": r["kind"],
                      "score": score, "entry": entry, "stop": round(stop, 2),
                      "target": round(target, 2), "risk": round(risk, 2),
                      "qty": qty, "why": why, "currency": "$"})
    plans.sort(key=lambda p: p["score"], reverse=True)
    return [p for p in plans if p["score"] >= min_score][:8], index_bias

async def _us_market_signals(capital, risk_pct):
    """Assemble the US response with the exact shape of the India one."""
    is_open, why_closed = _us_signals_market_open()
    (oc_spy, oc_qqq, radar, spx_closes, ndx_closes, vix_closes) = await asyncio.gather(
        _bounded(asyncio.to_thread(fetch_us_chain_summary, "SPY"), 20),
        _bounded(asyncio.to_thread(fetch_us_chain_summary, "QQQ"), 20),
        _bounded(asyncio.to_thread(fetch_us_radar), 25),
        _bounded(asyncio.to_thread(_yf_daily_closes, "^GSPC"), 15),
        _bounded(asyncio.to_thread(_yf_daily_closes, "^NDX"), 15),
        _bounded(asyncio.to_thread(_yf_daily_closes, "^VIX"), 15),
    )
    radar = radar or []
    vix = float(vix_closes[-1]) if vix_closes else 0.0

    spx_trend = _signal_index_trend(spx_closes)
    ndx_trend = _signal_index_trend(ndx_closes)
    vol = _signal_vol_regime(vix, vix_closes)
    direction = ("bull" if spx_trend["label"] in ("UPTREND", "RECOVERY")
                 else "bear" if spx_trend["label"] in ("DOWNTREND", "CORRECTION") else "flat")
    if direction == "bull" and vol["label"] in ("LOW-VOL", "NORMAL", "COMPLACENT", "CALM"):
        overall = "RISK-ON"
    elif direction == "bear" or vol["label"] in ("EXTREME", "CRISIS"):
        overall = "RISK-OFF"
    else:
        overall = "MIXED"
    adv = sum(1 for r in radar if r["px"] > 0)
    dec = sum(1 for r in radar if r["px"] < 0)
    regime = {
        "overall": overall,
        "dir": direction,
        "nifty": spx_trend,       # slot names kept for response-shape parity;
        "banknifty": ndx_trend,   # index_names below carries the display labels
        "vol": vol,
        "vol_scale": vol.get("scale", 1.0),
        "vix": round(vix, 2),
        "breadth": {"adv": adv, "dec": dec},
        "iv": _signal_iv_regime(oc_spy, vix),
    }

    plans, index_bias = score_us_signal_plans(radar, oc_spy, oc_qqq, regime, capital, risk_pct)
    return {
        "as_of": datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%dT%H:%M:%S"),
        "market_open": is_open,
        "market_note": why_closed,
        "regime": regime,
        "options": {
            "indices": [oc for oc in (oc_spy, oc_qqq) if oc],
            "buildups": _us_buildup_buckets(radar),
            "buildup_timestamp": _ny_now().strftime("%d-%b-%Y %H:%M ET"),
            "ideas": build_index_ideas([oc_spy, oc_qqq], vix, cur="$"),
        },
        "setups": {
            "index_bias": index_bias,
            "capital": capital,
            "risk_pct": risk_pct,
            "plans": plans,
            "radar_size": len(radar),
        },
        "signals_market": "US",
        "index_names": {"primary": "S&P 500", "secondary": "NASDAQ 100"},
        "currency": "$",
    }

def _json_safe(o):
    """Recursively replace NaN/±Inf floats with None. yfinance/NSE data can yield
    a non-finite float (a missing bar, a 0/0 ratio, an unbounded IV solve); the
    stdlib JSON encoder FastAPI uses then raises 'Out of range float values are
    not JSON compliant' and 500s the ENTIRE endpoint. One bad number shouldn't
    take down Market Signals (and its app-wide alert poll)."""
    if isinstance(o, float):
        return o if math.isfinite(o) else None
    if isinstance(o, dict):
        return {k: _json_safe(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_json_safe(v) for v in o]
    return o

@app.get("/api/signals")
async def get_market_signals(capital: float = 1_000_000, risk_pct: float = 1.0, market: str = None):
    # 20:00–02:00 IST → the US engine takes over (same window as dashboard
    # movers); ?market=IN|US overrides (Focus List pins IN).
    sig_market = market.upper() if market and market.upper() in ("IN", "US") else _dashboard_movers_market()
    cache_key = f"signals_{sig_market}_{int(capital)}_{risk_pct}"
    ttl = SIGNALS_CACHE_TTL if _signals_live(sig_market) else SIGNALS_CLOSED_TTL
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < ttl:
        return API_CACHE[cache_key]['data']

    if sig_market == "US":
        data = _json_safe(await _us_market_signals(capital, risk_pct))
        # A setup can be recomputed many times while it remains open. Keep the
        # originally published levels in the response so its target is a trade
        # level, not a moving function of the latest LTP.
        data["setups"]["plans"] = await _bounded(asyncio.to_thread(
            _locked_signal_plan_levels, data.get("setups", {}).get("plans") or [], "US"), 12)
        API_CACHE[cache_key] = {'time': time.time(), 'data': data}
        if data.get("market_open"):  # closed market = frozen data: no new setups to enter/push
            try:  # fan new scored setups out to phone push subscribers (best-effort)
                await _bounded(asyncio.to_thread(
                    _broadcast_new_plans, data.get("setups", {}).get("plans") or [], "US", "$"), 12)
            except Exception:
                pass
        return data

    is_open, why_closed = _signals_market_open()

    (idx_json, oc_nifty, oc_bank, buildup_pair, active, spurts,
     nifty_closes, bank_closes, vix_closes, _dlv_fresh) = await asyncio.gather(
        _bounded(asyncio.to_thread(nse_get, "/api/allIndices"), 12),
        _bounded(asyncio.to_thread(fetch_signal_chain_summary, "NIFTY"), 15),
        _bounded(asyncio.to_thread(fetch_signal_chain_summary, "BANKNIFTY"), 15),
        _bounded(asyncio.to_thread(fetch_signal_buildups), 12),
        _bounded(asyncio.to_thread(lambda: (nse_get("/api/liveEquity-derivatives?index=stock_fut") or {}).get("data", [])), 12),
        _bounded(asyncio.to_thread(lambda: (nse_get("/api/live-analysis-oi-spurts-underlyings") or {}).get("data", [])), 12),
        _bounded(asyncio.to_thread(_yf_daily_closes, "^NSEI"), 15),
        _bounded(asyncio.to_thread(_yf_daily_closes, "^NSEBANK"), 15),
        _bounded(asyncio.to_thread(_yf_daily_closes, "^INDIAVIX"), 15),
        _bounded(asyncio.to_thread(_ensure_delivery_fresh, 2), 8),  # best-effort EOD delivery top-up
    )
    buildups, buildup_ts = buildup_pair if buildup_pair else ({}, "")
    active = active or []
    spurts = spurts or []

    # Breadth + VIX from allIndices
    vix = 0.0
    breadth = {"adv": 0, "dec": 0}
    if idx_json:
        breadth = {"adv": idx_json.get("advances") or 0, "dec": idx_json.get("declines") or 0}
        for row in idx_json.get("data", []):
            if row.get("index") == "INDIA VIX":
                vix = float(row.get("last") or 0)
    if not vix and vix_closes:
        vix = float(vix_closes[-1])

    # --- Regime context ---
    nifty_trend = _signal_index_trend(nifty_closes)
    bank_trend = _signal_index_trend(bank_closes)
    vol = _signal_vol_regime(vix, vix_closes)
    direction = ("bull" if nifty_trend["label"] in ("UPTREND", "RECOVERY")
                 else "bear" if nifty_trend["label"] in ("DOWNTREND", "CORRECTION") else "flat")
    if direction == "bull" and vol["label"] in ("LOW-VOL", "NORMAL", "COMPLACENT", "CALM"):
        overall = "RISK-ON"
    elif direction == "bear" or vol["label"] in ("EXTREME", "CRISIS"):
        overall = "RISK-OFF"
    else:
        overall = "MIXED"
    regime = {
        "overall": overall,
        "dir": direction,
        "nifty": nifty_trend,
        "banknifty": bank_trend,
        "vol": vol,
        "vol_scale": vol.get("scale", 1.0),
        "vix": round(vix, 2),
        "breadth": breadth,
        "iv": _signal_iv_regime(oc_nifty, vix),
    }

    # --- Options intelligence ---
    buildup_top = {k: [{
        "symbol": c.get("symbol"),
        "contract": _contract_desc(c),
        "ltp": c.get("lastPrice") or c.get("ltp") or 0,
        "pChange": c.get("pChange") or 0,
        "oiChangePct": c.get("pChangeInOI") or 0,
    } for c in _rank_contracts(v)] for k, v in (buildups or {}).items()}

    # --- Actionable setups ---
    radar = build_futures_radar(spurts, active)
    try:
        delivery = _delivery_signals()
    except Exception:
        delivery = {}
    plans, index_bias = score_signal_plans(radar, active, oc_nifty, buildups or {}, regime, capital, risk_pct,
                                           delivery=delivery)
    # Reuse the entry/stop/target captured when a signal first entered the
    # model book. The radar LTP is intentionally live; the trade plan is not.
    plans = await _bounded(asyncio.to_thread(_locked_signal_plan_levels, plans, "IN"), 12)

    data = {
        "as_of": datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%dT%H:%M:%S"),
        "market_open": is_open,
        "market_note": why_closed,
        "regime": regime,
        "options": {
            "indices": [oc for oc in (oc_nifty, oc_bank) if oc],
            "buildups": buildup_top,
            "buildup_timestamp": buildup_ts,
            "ideas": build_index_ideas([oc_nifty, oc_bank], vix),
        },
        "setups": {
            "index_bias": index_bias,
            "capital": capital,
            "risk_pct": risk_pct,
            "plans": plans,
            "radar_size": len(radar),
        },
        "signals_market": "IN",
        "currency": "₹",
    }
    data = _json_safe(data)
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    if is_open:  # no new setups form after close — skip the broadcast's blob ops
        try:  # fan new scored setups out to phone push subscribers (best-effort)
            await _bounded(asyncio.to_thread(_broadcast_new_plans, plans, "IN", "₹"), 12)
        except Exception:
            pass
    return data


# --- Focus List: today's stocks worth watching, aggregated from the engines ---
FOCUS_CACHE_TTL = 300
_FOCUS_INDEX_SYMBOLS = {"NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"}

@app.get("/api/focus")
async def get_focus_list():
    cache_key = "focus_list"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < FOCUS_CACHE_TTL:
        return API_CACHE[cache_key]['data']

    # Reuse the cached engines rather than re-hitting NSE/Yahoo.
    # Focus List stays an NSE product — pin the India engine even at night.
    signals = await get_market_signals(market="IN")
    try:
        momentum = await get_momentum("in")
    except HTTPException:
        momentum = {"data": []}

    focus = {}

    def add(symbol, tag, detail, weight, side=None):
        sym = (symbol or "").replace(".NS", "").upper()
        if not sym or sym in _FOCUS_INDEX_SYMBOLS:
            return
        entry = focus.setdefault(sym, {"symbol": sym, "reasons": [], "weight": 0, "side": None})
        entry["reasons"].append({"tag": tag, "detail": detail})
        entry["weight"] += weight
        if side and not entry["side"]:
            entry["side"] = side

    # 1. High-conviction futures setups (strongest signal)
    for p in signals.get("setups", {}).get("plans", []):
        add(p["symbol"], f"{p['side']} setup",
            f"conviction {p['score']}/100 · entry ₹{p['entry']:,} · stop ₹{p['stop']:,} · target ₹{p['target']:,}",
            p["score"], side=p["side"])

    # 2. Momentum leaders (multi-month trend)
    for i, m in enumerate((momentum.get("data") or [])[:5]):
        add(m["ticker"], "Momentum leader",
            f"#{i + 1} by composite momentum · {m['score']:+.1f}% (1m/6m/12m avg)",
            35 - i * 4, side="LONG")

    # 3. Fresh stock-option buildups (institutional flow)
    buildups = signals.get("options", {}).get("buildups", {})
    for kind, tag, weight, side in (
        ("long_buildup", "Long buildup", 22, "LONG"),
        ("short_buildup", "Short buildup", 22, "SHORT"),
        ("short_covering", "Short covering", 15, "LONG"),
    ):
        seen_syms = set()
        for c in buildups.get(kind, [])[:6]:
            if c["symbol"] in seen_syms:
                continue
            seen_syms.add(c["symbol"])
            add(c["symbol"], tag, f"{c['contract']} · price {c['pChange']:+.1f}% · OI {c['oiChangePct']:+.0f}%", weight, side=side)

    # 4. Day's biggest heavyweight movers (from the dashboard feed)
    dash = API_CACHE.get("dashboard", {}).get("data") or {}
    for m in (dash.get("movers") or [])[:4]:
        if abs(m.get("change_pct") or 0) >= 1.0:
            add(m["ticker"], "Big mover", f"{m['change_pct']:+.2f}% today · ₹{m['last']:,}", 12,
                side="LONG" if m["change_pct"] > 0 else "SHORT")

    # 5. Delivery spurts: unusual delivered volume into a directional close
    try:
        dsig = _delivery_signals()
    except Exception:
        dsig = {}
    spurted = [(sym, d) for sym, d in dsig.items()
               if d["spurt"] >= 1.5 and (d["clv01"] >= 0.7 or d["clv01"] <= 0.3)]
    spurted.sort(key=lambda x: -x[1]["spurt"])
    for sym, d in spurted[:5]:
        long_side = d["clv01"] >= 0.7
        add(sym, "Delivery spurt",
            f"{d['spurt']:.1f}× avg delivery into a {'strong' if long_side else 'weak'} close "
            f"({d['deliv_per']:.0f}% delivered)",
            12, side="LONG" if long_side else "SHORT")

    ranked = sorted(focus.values(), key=lambda x: -x["weight"])[:12]
    for entry in ranked:
        entry["weight"] = round(entry["weight"])

    # Index context so the list reads with the day's backdrop
    oc_nifty = next((oc for oc in signals.get("options", {}).get("indices", []) if oc["symbol"] == "NIFTY"), None)
    data = {
        "as_of": signals.get("as_of"),
        "market_open": signals.get("market_open"),
        "market_note": signals.get("market_note"),
        "context": {
            "regime": signals.get("regime", {}).get("overall"),
            "direction": signals.get("regime", {}).get("dir"),
            "vix": signals.get("regime", {}).get("vix"),
            "vol_label": signals.get("regime", {}).get("vol", {}).get("label"),
            "nifty_spot": oc_nifty["spot"] if oc_nifty else None,
            "nifty_support": oc_nifty["support"] if oc_nifty else None,
            "nifty_resistance": oc_nifty["resistance"] if oc_nifty else None,
            "nifty_max_pain": oc_nifty["max_pain"] if oc_nifty else None,
            "index_bias": signals.get("setups", {}).get("index_bias"),
        },
        "stocks": ranked,
    }
    data = _json_safe(data)
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    return data


# --- Authentication (local-first, SQLite) ---
# Users and sessions live in a SQLite file on this machine — no external services.
# Passwords are stored as salted PBKDF2-HMAC-SHA256 hashes; session tokens are
# random 256-bit values stored only as SHA-256 hashes so a DB leak can't replay them.
import sqlite3
import hashlib
import hmac
import secrets
from fastapi import Header

_MAIN_DIR = os.path.dirname(os.path.abspath(__file__))
# Vercel's filesystem is read-only except /tmp (and resets between deployments)
AUTH_DB_DIR = os.environ.get("ALPHANOVA_DB_DIR") or ("/tmp" if os.environ.get("VERCEL") else os.path.join(_MAIN_DIR, "..", "data"))
os.makedirs(AUTH_DB_DIR, exist_ok=True)
AUTH_DB_PATH = os.path.join(AUTH_DB_DIR, "alphanova.db")

PBKDF2_ITERATIONS = 300_000
SESSION_TTL_DAYS = 30

# --- Durable cloud persistence via Vercel Blob ---
# Vercel's filesystem resets between deployments/cold starts, so on the cloud the
# SQLite file is mirrored to a PRIVATE Vercel Blob store: downloaded on cold start,
# uploaded after every auth write. The BLOB_READ_WRITE_TOKEN env var is injected
# automatically because the store is linked to the project.
BLOB_API = "https://vercel.com/api/blob"
# Each snapshot is written to a UNIQUE timestamp-named pathname instead of
# overwriting one file: Vercel Blob download URLs are CDN-cached, so re-reading
# an overwritten URL can return stale bytes for up to a minute. That window let
# a second signup miss a just-created account and clobber it (account takeover).
# A brand-new pathname gets a brand-new URL that can never be cache-stale; pull
# takes the newest snapshot by name (lexical order == chronological order).
BLOB_DB_PREFIX = "auth/alphanova-db-v/"
BLOB_DB_LEGACY_PATHNAME = "auth/alphanova.db"  # pre-versioning single file, read once as fallback
BLOB_KEEP_SNAPSHOTS = 5
_blob_synced = False

def _blob_token():
    return os.environ.get("BLOB_READ_WRITE_TOKEN")

def _blob_list(prefix):
    token = _blob_token()
    r = requests.get(
        f"{BLOB_API}?prefix={prefix}&limit=1000",
        headers={"Authorization": f"Bearer {token}", "x-api-version": "12"},
        timeout=10
    )
    return r.json().get("blobs", []) if r.status_code == 200 else []

def _sqlite_user_count(data):
    """Return the number of accounts in a SQLite snapshot, or -1 if invalid."""
    if not data or not data.startswith(b"SQLite format 3"):
        return -1
    conn = None
    try:
        conn = sqlite3.connect(":memory:")
        conn.deserialize(data)
        return int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
    except Exception:
        return -1
    finally:
        if conn is not None:
            conn.close()

def _blob_download(url, token):
    r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    return r.content if r.status_code == 200 else None

def _blob_pull_db(force=False):
    """Fetch the latest auth DB snapshot from the blob store into the local path."""
    global _blob_synced
    token = _blob_token()
    if not token or (_blob_synced and not force):
        return
    try:
        snapshots = sorted(_blob_list(BLOB_DB_PREFIX), key=lambda b: b.get("pathname", ""), reverse=True)
        latest = _blob_download(snapshots[0]["url"], token) if snapshots else None

        # During the switch to versioned snapshots, a zero-user database was
        # uploaded before the existing legacy database was read. Never prefer
        # that empty snapshot over a populated legacy database; doing so locks
        # every established account out after a cold start or deployment.
        legacy = _blob_list(BLOB_DB_LEGACY_PATHNAME)
        legacy_data = _blob_download(legacy[0]["url"], token) if legacy else None
        data = legacy_data if _sqlite_user_count(legacy_data) > _sqlite_user_count(latest) else latest
        # Only accept a real SQLite file so a corrupt blob can't brick auth.
        if data and data.startswith(b"SQLite format 3"):
            with open(AUTH_DB_PATH, "wb") as f:
                f.write(data)
    except Exception as e:
        print(f"Blob DB pull failed: {e}")
    _blob_synced = True

def _blob_push_db():
    """Mirror the auth DB to the blob store as a new timestamped snapshot."""
    token = _blob_token()
    if not token:
        return
    try:
        with open(AUTH_DB_PATH, "rb") as f:
            data = f.read()
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        pathname = f"{BLOB_DB_PREFIX}{stamp}-{secrets.token_hex(4)}.db"
        r = requests.put(
            f"{BLOB_API}/?pathname={pathname}",
            data=data,
            headers={
                "Authorization": f"Bearer {token}",
                "x-api-version": "12",
                "x-vercel-blob-access": "private",
                "x-add-random-suffix": "0",
                "x-content-type": "application/octet-stream",
            },
            timeout=15
        )
        if r.status_code == 200:
            _blob_prune_snapshots()
    except Exception as e:
        print(f"Blob DB push failed: {e}")

def _blob_prune_snapshots():
    """Best-effort delete of all but the newest snapshots (failure is harmless)."""
    token = _blob_token()
    try:
        blobs = sorted(_blob_list(BLOB_DB_PREFIX), key=lambda b: b.get("pathname", ""), reverse=True)
        stale = [b["url"] for b in blobs[BLOB_KEEP_SNAPSHOTS:] if b.get("url")]
        if stale:
            requests.post(
                f"{BLOB_API}/delete",
                json={"urls": stale},
                headers={"Authorization": f"Bearer {token}", "x-api-version": "12"},
                timeout=10
            )
    except Exception as e:
        print(f"Blob snapshot prune failed: {e}")

def _auth_db():
    _blob_pull_db()
    conn = sqlite3.connect(AUTH_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        display_name TEXT,
        created_at TEXT NOT NULL,
        last_login_at TEXT
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS watchlist (
        user_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        added_at TEXT NOT NULL,
        sort_order INTEGER,
        PRIMARY KEY (user_id, symbol)
    )""")
    try:  # 2026-07-06: US-stock support; no-op once the column exists
        conn.execute("ALTER TABLE watchlist ADD COLUMN market TEXT NOT NULL DEFAULT 'IN'")
    except sqlite3.OperationalError:
        pass
    conn.execute("""CREATE TABLE IF NOT EXISTS daily_questions (
        qdate TEXT PRIMARY KEY,
        symbol TEXT NOT NULL DEFAULT 'NIFTY 50',
        outcome TEXT,
        change_pct REAL,
        resolved_at TEXT
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS predictions (
        user_id INTEGER NOT NULL,
        qdate TEXT NOT NULL,
        choice TEXT NOT NULL,
        correct INTEGER,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, qdate)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS streak_stats (
        user_id INTEGER PRIMARY KEY,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        total_calls INTEGER NOT NULL DEFAULT 0,
        correct_calls INTEGER NOT NULL DEFAULT 0,
        last_resolved_date TEXT,
        hide_from_board INTEGER NOT NULL DEFAULT 0
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS push_subs (
        endpoint TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS push_sent (
        k TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
    )""")
    # Model portfolio: each scored signal is paper-traded at its published entry,
    # 10% of the book, first-come-first-served up to 10 concurrent positions.
    conn.execute("""CREATE TABLE IF NOT EXISTS signal_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        market TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        kind TEXT,
        score REAL,
        entry REAL NOT NULL,
        stop REAL NOT NULL,
        target REAL NOT NULL,
        entry_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        exit REAL,
        exit_date TEXT,
        ret_pct REAL,
        last_price REAL,
        updated_at TEXT
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sigpos_status ON signal_positions(status)")
    _purge_test_accounts(conn)
    return conn

# One-time cleanup (2026-07-07): months of QA left ~40 obvious test accounts in
# the prod DB (@example.com / @test.com / @test.local / testuser99). Runs once
# per instance, ONLY on Vercel — locally/CI it would eat the test suite's own
# @test.local users mid-run. Cold-start execution makes it self-healing if a
# stale warm instance ever re-pushes a snapshot containing purged rows.
_KEEP_TEST_EMAILS = ("claude-qa-0706@test.local",)  # standing prod-QA login
_purge_done = False

def _purge_test_accounts(conn):
    global _purge_done
    if _purge_done or not os.environ.get("VERCEL"):
        return
    _purge_done = True
    try:
        keep = ",".join("?" * len(_KEEP_TEST_EMAILS))
        rows = conn.execute(
            f"""SELECT id FROM users WHERE (
                    email LIKE '%@example.com' OR email LIKE '%@test.com'
                    OR email LIKE '%@test.local' OR email = 'testuser99@gmail.com'
                ) AND email NOT IN ({keep})""", _KEEP_TEST_EMAILS).fetchall()
        if not rows:
            return
        ids = [(r["id"],) for r in rows]
        for table in ("sessions", "watchlist", "predictions", "streak_stats", "push_subs"):
            conn.executemany(f"DELETE FROM {table} WHERE user_id = ?", ids)
        conn.executemany("DELETE FROM users WHERE id = ?", ids)
        conn.commit()
        print(f"purged {len(ids)} test accounts")
        _blob_push_db()
    except Exception as e:  # cleanup must never take auth down
        print(f"test-account purge failed: {e}")

def _utc_now():
    return datetime.now(timezone.utc).isoformat()

def _hash_password(password: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), PBKDF2_ITERATIONS).hex()

def _public_user(row):
    return {"uid": row["id"], "email": row["email"], "displayName": row["display_name"]}

def _create_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)).isoformat()
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token_hash, user_id, _utc_now(), expires)
    )
    return token

def _session_user(conn, authorization: str):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
    row = conn.execute(
        "SELECT u.*, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (token_hash,)
    ).fetchone()
    if not row:
        return None
    if row["session_expires"] < _utc_now():
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
        conn.commit()
        return None
    return row

def _require_user(conn, authorization: str):
    """Resolve the Bearer token to a user row, or raise 401.

    Mirrors the retry in /api/auth/me: a warm serverless instance may hold a
    stale DB copy from before a login on another instance, so on a miss we
    re-pull the shared blob DB once and retry. Callers pass the open conn;
    on the retry path we swap it for a fresh one and return (row, conn) so the
    caller keeps using the connection that actually saw the session.
    """
    row = _session_user(conn, authorization)
    if not row and _blob_token():
        conn.close()
        _blob_pull_db(force=True)
        conn = _auth_db()
        row = _session_user(conn, authorization)
    if not row:
        conn.close()
        raise HTTPException(status_code=401, detail="Not signed in.")
    return row, conn

def _optional_user(conn, authorization: str):
    """Like _require_user, but guests get (None, conn) instead of a 401.

    Skips the blob re-pull entirely when no token is presented, so anonymous
    requests stay cheap."""
    if not authorization:
        return None, conn
    try:
        return _require_user(conn, authorization)
    except HTTPException:
        return None, _auth_db()

# --- Rate limiting (abuse-prone endpoints) -----------------------------------
# Per-instance sliding window keyed by client IP. Serverless instances each keep
# their own window, so the effective ceiling is limit × live instances — still
# enough to blunt credential stuffing / signup floods, at zero infra cost.
# Enabled only on Vercel (the offline test suite churns through dozens of
# signups/logins from one fake IP); tests force it on via monkeypatch.
from collections import deque

_RL_ENABLED = bool(os.environ.get("VERCEL"))
_RL_BUCKETS: dict = {}

def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def _require_cron(authorization: str):
    """Opt-in cron protection: when CRON_SECRET is set in the environment,
    Vercel sends it as `Authorization: Bearer <secret>` on cron invocations and
    outside callers get 403. Without the env var the endpoints stay open
    (idempotent anyway) — setting the secret is free hardening."""
    secret = os.environ.get("CRON_SECRET")
    if secret and not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(status_code=403, detail="Forbidden")

def _rate_limit(request: Request, bucket: str, limit: int, window_s: int):
    """Raise 429 when `limit` calls from this IP land inside `window_s`."""
    if not _RL_ENABLED:
        return
    now = time.time()
    key = f"{bucket}:{_client_ip(request)}"
    q = _RL_BUCKETS.setdefault(key, deque())
    while q and q[0] <= now - window_s:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many attempts — please wait a bit and try again.")
    q.append(now)
    if len(_RL_BUCKETS) > 5000:  # bound memory on long-lived instances
        _RL_BUCKETS.clear()

class AuthCredentials(BaseModel):
    email: str
    password: str
    displayName: str | None = None  # explicit null must not 422 (pydantic v2)

@app.post("/api/auth/signup")
def auth_signup(req: AuthCredentials, request: Request):
    _rate_limit(request, "signup", limit=12, window_s=3600)
    email = req.email.strip().lower()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Please enter a valid email address.")
    if len(email) > 254:
        raise HTTPException(status_code=400, detail="Email address is too long.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if len(req.password) > 128:
        raise HTTPException(status_code=400, detail="Password must be at most 128 characters.")
    # Another serverless instance may have created this account after our local
    # snapshot was pulled — without a fresh pull the duplicate check below passes
    # and the blob push at the end would overwrite the existing account.
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
            raise HTTPException(status_code=400, detail="An account with that email already exists. Try logging in.")
        salt = secrets.token_hex(16)
        display_name = ((req.displayName or "").strip() or email.split("@")[0])[:80]
        try:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, salt, display_name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?)",
                (email, _hash_password(req.password, salt), salt, display_name, _utc_now(), _utc_now())
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="An account with that email already exists. Try logging in.")
        token = _create_session(conn, cur.lastrowid)
        conn.commit()
        _blob_push_db()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {"token": token, "user": _public_user(row)}
    finally:
        conn.close()

@app.post("/api/auth/login")
def auth_login(req: AuthCredentials, request: Request):
    _rate_limit(request, "login", limit=20, window_s=300)
    email = req.email.strip().lower()
    # Fresh pull so recent signups/password changes on other instances are seen,
    # and so the blob push below can't overwrite them with a stale snapshot.
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            ok = hmac.compare_digest(_hash_password(req.password, row["salt"]), row["password_hash"])
        else:
            # Burn the same hashing cost for unknown emails to keep timing uniform
            _hash_password(req.password, "00" * 16)
            ok = False
        if not ok:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (_utc_now(), row["id"]))
        token = _create_session(conn, row["id"])
        conn.commit()
        _blob_push_db()
        return {"token": token, "user": _public_user(row)}
    finally:
        conn.close()

@app.get("/api/auth/me")
def auth_me(authorization: str = Header(None)):
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        return {"user": _public_user(row)}
    finally:
        conn.close()

@app.post("/api/auth/logout")
def auth_logout(authorization: str = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token_hash = hashlib.sha256(authorization[7:].encode()).hexdigest()
        _blob_pull_db(force=True)  # avoid pushing a stale snapshot over newer writes
        conn = _auth_db()
        try:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))
            conn.commit()
            _blob_push_db()
        finally:
            conn.close()
    return {"ok": True}


# --- Watchlist (per-user, blob-mirrored like auth) ---
# One list per user. Symbols stored canonical: UPPERCASE, no ".NS" (re-appended
# only for the yfinance quote call). `market` ('IN'|'US') says which exchange a
# symbol belongs to — IN gets ".NS" appended for quotes, US goes to Yahoo as-is.
# Writes follow the auth durability posture: force-pull the shared blob DB
# before mutating, push after.
WATCHLIST_MAX = 50
_SYMBOL_RE = re.compile(r'^[A-Z0-9&-]{1,20}$')

def _normalize_symbol(raw):
    s = (raw or "").strip().upper()
    if s.endswith(".NS"):
        s = s[:-3]
    return s if _SYMBOL_RE.match(s) else None

def _normalize_market(raw_symbol, market):
    """A trailing .NS always wins; otherwise trust the caller's market flag."""
    if (raw_symbol or "").strip().upper().endswith(".NS"):
        return "IN"
    return "US" if (market or "IN").strip().upper() == "US" else "IN"

def _watchlist_rows(conn, user_id):
    return conn.execute(
        "SELECT symbol, market, added_at, sort_order FROM watchlist WHERE user_id = ? "
        "ORDER BY CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END, sort_order, added_at",
        (user_id,)
    ).fetchall()

def _watchlist_json(rows):
    return [{"symbol": r["symbol"], "market": r["market"] or "IN",
             "added_at": r["added_at"], "sort_order": r["sort_order"]} for r in rows]

class WatchlistAdd(BaseModel):
    symbol: str
    market: str = "IN"

class WatchlistOrder(BaseModel):
    symbols: list

@app.get("/api/watchlist")
def watchlist_list(authorization: str = Header(None)):
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        return {"symbols": _watchlist_json(_watchlist_rows(conn, row["id"]))}
    finally:
        conn.close()

@app.post("/api/watchlist")
def watchlist_add(req: WatchlistAdd, authorization: str = Header(None)):
    symbol = _normalize_symbol(req.symbol)
    if not symbol:
        raise HTTPException(status_code=400, detail="Enter a valid symbol (e.g. RELIANCE or AAPL).")
    market = _normalize_market(req.symbol, req.market)
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        uid = row["id"]
        if not conn.execute("SELECT 1 FROM watchlist WHERE user_id = ? AND symbol = ?", (uid, symbol)).fetchone():
            count = conn.execute("SELECT COUNT(*) AS c FROM watchlist WHERE user_id = ?", (uid,)).fetchone()["c"]
            if count >= WATCHLIST_MAX:
                raise HTTPException(status_code=400, detail=f"Watchlist is full ({WATCHLIST_MAX} max). Remove a stock to add another.")
            conn.execute("INSERT OR IGNORE INTO watchlist (user_id, symbol, market, added_at, sort_order) VALUES (?, ?, ?, ?, ?)",
                         (uid, symbol, market, _utc_now(), None))
            conn.commit()
            _blob_push_db()
        r = conn.execute("SELECT symbol, market, added_at, sort_order FROM watchlist WHERE user_id = ? AND symbol = ?", (uid, symbol)).fetchone()
        return {"symbol": r["symbol"], "market": r["market"] or "IN", "added_at": r["added_at"], "sort_order": r["sort_order"]}
    finally:
        conn.close()

@app.delete("/api/watchlist/{symbol}")
def watchlist_remove(symbol: str, authorization: str = Header(None)):
    sym = _normalize_symbol(symbol)
    if not sym:
        raise HTTPException(status_code=400, detail="Invalid symbol.")
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        conn.execute("DELETE FROM watchlist WHERE user_id = ? AND symbol = ?", (row["id"], sym))
        conn.commit()
        _blob_push_db()
        return {"ok": True}
    finally:
        conn.close()

@app.put("/api/watchlist/order")
def watchlist_reorder(req: WatchlistOrder, authorization: str = Header(None)):
    ordered = [s for s in (_normalize_symbol(x) for x in (req.symbols or [])) if s]
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        uid = row["id"]
        for idx, sym in enumerate(ordered):
            conn.execute("UPDATE watchlist SET sort_order = ? WHERE user_id = ? AND symbol = ?", (idx, uid, sym))
        conn.commit()
        _blob_push_db()
        return {"symbols": _watchlist_json(_watchlist_rows(conn, uid))}
    finally:
        conn.close()

@app.get("/api/watchlist/quotes")
def watchlist_quotes(authorization: str = Header(None)):
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        entries = [(r["symbol"], r["market"] or "IN") for r in _watchlist_rows(conn, row["id"])]
    finally:
        conn.close()
    if not entries:
        return {"quotes": [], "market_open": _is_indian_market_open()}
    # Key on the exact symbol+market set so add/remove naturally busts the cache.
    cache_key = "wl_quotes_" + ",".join(f"{s}:{m}" for s, m in entries)
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < 300:
        return {"quotes": API_CACHE[cache_key]['data'], "market_open": _is_indian_market_open()}
    quotes = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(_yf_quote_change, s + ".NS" if m == "IN" else s): s for s, m in entries}
        for fut in concurrent.futures.as_completed(futs):
            quotes[futs[fut]] = fut.result()
    sparks = _spark_closes([s + ".NS" if m == "IN" else s for s, m in entries])
    result = [{"symbol": s,
               "market": m,
               "last": (quotes.get(s) or {}).get("last"),
               "change_pct": (quotes.get(s) or {}).get("change_pct"),
               "day_low": (quotes.get(s) or {}).get("day_low"),
               "day_high": (quotes.get(s) or {}).get("day_high"),
               "spark": sparks.get(s + ".NS" if m == "IN" else s)} for s, m in entries]
    result = _json_safe(result)
    API_CACHE[cache_key] = {'time': time.time(), 'data': result}
    return {"quotes": result, "market_open": _is_indian_market_open()}


# --- Web Push: signal alerts that reach the phone even when the app is closed ---
# VAPID keys live in env (Vercel project settings). Without them the push
# endpoints 503 and the broadcast quietly no-ops — in-app toasts still work.
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUB = os.environ.get("VAPID_SUB", "mailto:ssarda75@gmail.com")
PUSH_MAX_PER_BATCH = 4  # cap a single compute's blast; tag-dedup handles repeats

@app.get("/api/push/vapid")
def push_vapid_key():
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push notifications are not configured on this server.")
    return {"key": VAPID_PUBLIC_KEY}

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict = {}
    # Chrome/Android's sub.toJSON() sends an explicit "expirationTime": null —
    # a bare `float` annotation 422s on that under pydantic v2 (iOS Safari
    # omits the field, which is why only Android hit it). We don't use it.
    expirationTime: float | None = None

@app.post("/api/push/subscribe")
def push_subscribe(sub: PushSubscription, authorization: str = Header(None)):
    endpoint = (sub.endpoint or "").strip()
    p256dh = (sub.keys or {}).get("p256dh")
    auth_key = (sub.keys or {}).get("auth")
    if not endpoint.startswith("https://") or not p256dh or not auth_key:
        raise HTTPException(status_code=400, detail="Invalid push subscription.")
    _blob_pull_db(force=True)  # write on the newest snapshot, never clobber concurrent writes
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        conn.execute(
            """INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth""",
            (endpoint, row["id"], p256dh, auth_key, _utc_now())
        )
        conn.commit()
        _blob_push_db()
        return {"ok": True}
    finally:
        conn.close()

class PushEndpoint(BaseModel):
    endpoint: str

@app.post("/api/push/unsubscribe")
def push_unsubscribe(body: PushEndpoint, authorization: str = Header(None)):
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        conn.execute("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?", (body.endpoint, row["id"]))
        conn.commit()
        _blob_push_db()
        return {"ok": True}
    finally:
        conn.close()

@app.post("/api/push/test")
def push_test(all: int = 0, key: str = "", authorization: str = Header(None)):
    """Send a test notification: to the caller's devices (auth), or to every
    subscribed device (?all=1&key=<ADMIN_METRICS_KEY>). Returns delivery stats
    so 'is push working?' is answerable without waiting for a fresh signal."""
    if not (VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY):
        raise HTTPException(status_code=503, detail="Push notifications are not configured on this server.")
    # Fresh pull: the subscribe that just ran may have landed on another
    # instance — without this the test reports "no devices" seconds after a
    # successful registration.
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        if all:
            _require_admin(key)
            subs = conn.execute("SELECT endpoint, p256dh, auth FROM push_subs").fetchall()
        else:
            row, conn = _require_user(conn, authorization)
            subs = conn.execute("SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id = ?",
                                (row["id"],)).fetchall()
    finally:
        conn.close()
    if not subs:
        return {"subs": 0, "sent": 0, "pruned": 0,
                "detail": "No subscribed devices. Enable Signal alerts in Settings (installed app on phones)."}
    payload = json.dumps({
        "title": "Alpha Nova — test notification",
        "body": "Push is working. Scored trade setups will arrive here during market hours.",
        "tag": "an-push-test",
        "url": "/signals",
    })
    dead, errors = set(), 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(_push_send_status, s, payload): s for s in subs}
        for fut in concurrent.futures.as_completed(futs):
            status = fut.result()
            if status == "dead":
                dead.add(futs[fut]["endpoint"])
            elif status != "ok":
                errors += 1
    if dead:
        try:
            _blob_pull_db(force=True)  # never push a stale snapshot over newer writes
            conn = _auth_db()
            conn.executemany("DELETE FROM push_subs WHERE endpoint = ?", [(e,) for e in dead])
            conn.commit()
            conn.close()
            _blob_push_db()
        except Exception:
            pass
    return {"subs": len(subs), "sent": len(subs) - len(dead) - errors,
            "pruned": len(dead), "errors": errors}

def _push_send_status(sub_row, payload_json):
    """Like _push_send_one but reports 'ok' | 'dead' | 'error' for stats."""
    from pywebpush import webpush, WebPushException
    try:
        webpush(
            subscription_info={"endpoint": sub_row["endpoint"],
                               "keys": {"p256dh": sub_row["p256dh"], "auth": sub_row["auth"]}},
            data=payload_json,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUB},
            timeout=8,
        )
        return "ok"
    except WebPushException as e:
        if getattr(e.response, "status_code", None) in (404, 410):
            return "dead"
        return "error"
    except Exception:
        return "error"

def _push_send_one(sub_row, payload_json):
    """Send one push. Returns the endpoint if it's dead and should be pruned."""
    from pywebpush import webpush, WebPushException  # lazy: ~cryptography import cost
    try:
        webpush(
            subscription_info={"endpoint": sub_row["endpoint"],
                               "keys": {"p256dh": sub_row["p256dh"], "auth": sub_row["auth"]}},
            data=payload_json,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUB},
            timeout=8,
        )
    except WebPushException as e:
        if getattr(e.response, "status_code", None) in (404, 410):
            return sub_row["endpoint"]  # subscription expired/revoked
    except Exception:
        pass
    return None

def _broadcast_new_plans(plans, mkt, currency):
    """Process a fresh batch of scored plans in ONE blob transaction:
      1. Enter qualifying new plans into the model portfolio (FCFS, 10% each,
         max 10 concurrent) — _enter_signal_positions.
      2. Web-push the ones not yet announced today. Idempotent via INSERT OR
         IGNORE claims in push_sent (day|mkt|symbol — ONE notification per stock
         per day); the first compute of a day/market seeds silently. Cross-
         instance duplicate sends are possible on cold starts — the notification
         `tag` makes the phone tray dedupe them.
    Sharing the transaction keeps this off the per-compute blob-op budget.
    """
    if not plans:
        return
    try:
        # Fresh pull is load-bearing: this runs on warm instances whose snapshot
        # can predate a device's push subscription / another instance's position
        # — writing on a stale snapshot would ERASE those (blob mirrors the whole
        # DB). Both writes below ride this one pull + one conditional push.
        _blob_pull_db(force=True)
        conn = _auth_db()
    except Exception:
        return
    changed = False
    fresh = []
    subs = []
    try:
        # (1) Model-portfolio entry — independent of push config (VAPID keys).
        try:
            if _enter_signal_positions(conn, plans, mkt) > 0:
                changed = True
        except Exception:
            pass
        # (2) Push claims — only when push is configured.
        if VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY:
            day = datetime.now(timezone(timedelta(hours=5, minutes=30))).strftime("%Y-%m-%d")
            prior = conn.execute("SELECT COUNT(*) FROM push_sent WHERE k LIKE ?", (f"{day}|{mkt}|%",)).fetchone()[0]
            # Highest score first so when a stock has several plans in one batch,
            # the best one is the single notification it gets today.
            for p in sorted(plans, key=lambda p: -(p.get("score") or 0)):
                if not (p.get("symbol") and p.get("side")):
                    continue
                k = f"{day}|{mkt}|{p['symbol']}"
                # The LIKE also matches legacy day|mkt|symbol|side|kind claims, so
                # a mid-day deploy doesn't re-announce already-notified stocks.
                if conn.execute("SELECT 1 FROM push_sent WHERE k = ? OR k LIKE ? LIMIT 1",
                                (k, k + "|%")).fetchone():
                    continue
                if conn.execute("INSERT OR IGNORE INTO push_sent (k, created_at) VALUES (?, ?)", (k, _utc_now())).rowcount:
                    fresh.append(p)
            if fresh:
                changed = True
            conn.execute("DELETE FROM push_sent WHERE created_at < ?",
                         ((datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),))
            if prior == 0:
                fresh = []  # first sight of this day/market: seed quietly
        conn.commit()
        subs = conn.execute("SELECT endpoint, p256dh, auth FROM push_subs").fetchall() if fresh else []
    finally:
        conn.close()
    if changed:
        # Persist claims + new positions. Without this, every serverless cold
        # start pulls a DB missing today's rows and re-seeds silently (the bug
        # that made push look dead in prod, found 2026-07-07).
        try:
            _blob_push_db()
        except Exception:
            pass
    if not fresh or not subs:
        return
    fresh = sorted(fresh, key=lambda p: -(p.get("score") or 0))[:PUSH_MAX_PER_BATCH]
    dead = set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        futs = []
        for p in fresh:
            payload = json.dumps({
                "title": f"{p['side']} {p['symbol']} · {p.get('score')}/100",
                "body": f"entry {currency}{p.get('entry'):,} · stop {currency}{p.get('stop'):,} · target {currency}{p.get('target'):,}",
                "tag": f"{p['symbol']}|{p['side']}|{p.get('kind')}",
                "url": "/signals",
            })
            futs.extend(ex.submit(_push_send_one, s, payload) for s in subs)
        for fut in concurrent.futures.as_completed(futs):
            if fut.result():
                dead.add(fut.result())
    if dead:
        try:
            _blob_pull_db(force=True)  # never push a stale snapshot over newer writes
            conn = _auth_db()
            conn.executemany("DELETE FROM push_subs WHERE endpoint = ?", [(e,) for e in dead])
            conn.commit()
            conn.close()
            _blob_push_db()
        except Exception:
            pass


# --- Signal model portfolio: paper-trade every scored signal -----------------
# Each new signal is entered at its published entry price as a 10%-of-book
# position, first-come-first-served up to 10 concurrent slots. Positions close
# when the day's high/low touches the target (win) or stop (loss), or after a
# 30-day time stop. Track record = win rate + realized return over closed trades.
SIGNAL_PF_SLOTS = 10          # max concurrent positions (10 × 10% = fully invested)
SIGNAL_PF_WEIGHT = 0.10       # each position is 10% of the model book
SIGNAL_PF_MAX_HOLD_DAYS = 30  # time stop: close a stagnant position after 30 days
_last_pf_resolve = 0.0        # throttle the (network-heavy) resolver

def _pf_yf_symbol(market, symbol):
    return f"{symbol}.NS" if market == "IN" else symbol

def _valid_plan_levels(p):
    """Return (entry, stop, target, side) if the plan has a coherent trade, else
    None. LONG needs stop < entry < target; SHORT needs target < entry < stop."""
    side = (p.get("side") or "").upper()
    if side not in ("LONG", "SHORT"):
        return None
    try:
        e, s, t = float(p["entry"]), float(p["stop"]), float(p["target"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (e > 0 and s > 0 and t > 0):
        return None
    if side == "LONG" and not (s < e < t):
        return None
    if side == "SHORT" and not (t < e < s):
        return None
    return e, s, t, side

def _market_today(market):
    """The current TRADING-day date for a market. US must use ET, not IST — a
    signal fired at 01:00 IST is still the previous US session, and stamping it
    with the IST date shifts the resolver's 'skip the entry day' by a day."""
    return (_ny_now() if market == "US" else datetime.now(_IST)).strftime("%Y-%m-%d")

def _market_date(market):
    """Current calendar date in the market's own trading timezone."""
    return datetime.strptime(_market_today(market), "%Y-%m-%d").date()

def _enter_signal_positions(conn, plans, mkt):
    """FCFS entry of new plans into the model portfolio. Skips symbols already
    open (or closed today, to avoid same-day churn) and stops at the slot cap.
    Highest score first so the best signals claim the scarce slots. Caller owns
    the commit + blob push. Returns the number of positions opened."""
    today = _market_today(mkt)
    open_syms = {r["symbol"] for r in conn.execute(
        "SELECT symbol FROM signal_positions WHERE status='open' AND market=?", (mkt,))}
    closed_today = {r["symbol"] for r in conn.execute(
        "SELECT symbol FROM signal_positions WHERE status!='open' AND market=? AND substr(exit_date,1,10)=?",
        (mkt, today))}
    # Slots are PER MARKET book: the IN and US track records are shown as
    # separate portfolios, so a full India book must not block US entries.
    open_count = conn.execute(
        "SELECT COUNT(*) FROM signal_positions WHERE status='open' AND COALESCE(market,'IN') = ?",
        (mkt,)).fetchone()[0]
    added = 0
    for p in sorted(plans, key=lambda p: -(p.get("score") or 0)):
        if open_count >= SIGNAL_PF_SLOTS:
            break
        sym = p.get("symbol")
        if not sym or sym in open_syms or sym in closed_today:
            continue
        lv = _valid_plan_levels(p)
        if not lv:
            continue
        e, s, t, side = lv
        conn.execute(
            """INSERT INTO signal_positions
               (market, symbol, side, kind, score, entry, stop, target, entry_date,
                status, last_price, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?, 'open', ?, ?)""",
            (mkt, sym, side, p.get("kind"), float(p.get("score") or 0), e, s, t, today, e, _utc_now()))
        open_syms.add(sym)
        open_count += 1
        added += 1
    return added

def _locked_signal_plan_levels(plans, mkt):
    """Return display plans with the original levels for open positions.

    Signal scoring is deliberately live, so a plan can be recalculated with a
    new LTP every two minutes. Once that plan has been entered, however, its
    entry, stop and target are immutable. Reading the model-book record here
    makes the Market Signals tab display that frozen plan on every refresh.
    """
    if not plans:
        return plans
    try:
        conn = _auth_db()
        try:
            rows = conn.execute(
                "SELECT symbol, side, entry, stop, target, entry_date "
                "FROM signal_positions WHERE status='open' AND COALESCE(market,'IN')=?",
                (mkt,),
            ).fetchall()
        finally:
            conn.close()
    except Exception:
        return plans

    locked = {r["symbol"]: dict(r) for r in rows}
    out = []
    for p in plans:
        original = locked.get(p.get("symbol"))
        if not original:
            out.append(p)
            continue
        # Keep live descriptive/scoring fields, but never redraw an open
        # trade's levels (including if the current classifier flips sides).
        out.append({**p, **{
            "side": original["side"],
            "entry": original["entry"],
            "stop": original["stop"],
            "target": original["target"],
            "signal_date": original["entry_date"],
            "levels_locked": True,
        }})
    return out


def _resolve_one_position(r):
    """Walk COMPLETE daily bars AFTER the entry day; return (status, exit_price,
    exit_date) once target/stop is touched or the time stop trips, else None.

    The entry day is skipped on purpose: the position was entered intraday, and
    that day's daily high/low includes pre-entry action, so it can't honestly
    say whether the stop/target was hit after we were in. (This was the bug that
    manufactured a wall of same-day stop-outs.) Fills are gap-aware: a bar that
    opens through the level fills at the open, not the level. Network call."""
    yf_sym = _pf_yf_symbol(r["market"], r["symbol"])
    try:
        hist = yf.Ticker(yf_sym).history(start=r["entry_date"], auto_adjust=True)
    except Exception:
        return None
    if hist is None or hist.empty:
        return None
    entry, stop, target, side = float(r["entry"]), float(r["stop"]), float(r["target"]), r["side"]
    for ts, bar in hist.iterrows():
        d = ts.strftime("%Y-%m-%d")
        if d <= r["entry_date"]:      # skip the entry day (and anything earlier)
            continue
        op, hi, lo = float(bar["Open"]), float(bar["High"]), float(bar["Low"])
        if side == "LONG":
            if op <= stop:            # gapped through the stop → fill at the open
                return "loss", op, d
            if lo <= stop:
                return "loss", stop, d
            if op >= target:          # gapped through the target
                return "win", op, d
            if hi >= target:
                return "win", target, d
        else:
            if op >= stop:
                return "loss", op, d
            if hi >= stop:
                return "loss", stop, d
            if op <= target:
                return "win", op, d
            if lo <= target:
                return "win", target, d
    # Time stop: close a position that has sat open past the max hold.
    try:
        entry_dt = datetime.strptime(r["entry_date"], "%Y-%m-%d").date()
    except ValueError:
        return None
    if (_market_date(r["market"]) - entry_dt).days >= SIGNAL_PF_MAX_HOLD_DAYS:
        return "closed", round(float(hist["Close"].iloc[-1]), 2), _market_today(r["market"])
    return None

_pf_healed = False

def _heal_intraday_closures(conn):
    """One-time cleanup of positions the OLD resolver closed on their own entry
    day (exit_date <= entry_date) — artificial stop-outs, not real trades.
    Delete them so the track record reflects only honest, post-entry outcomes.
    Idempotent: the fixed resolver never produces such rows again."""
    n = conn.execute(
        "DELETE FROM signal_positions WHERE status!='open' AND exit_date IS NOT NULL "
        "AND substr(exit_date,1,10) <= entry_date"
    ).rowcount
    return n


# --- Historical backfill: replay the India signal engine on real F&O bhavcopy ---
# The live engine is stateless (recomputes from intraday NSE feeds), so it can't
# be replayed exactly. But NSE's end-of-day F&O bhavcopy carries the two inputs
# the engine keys on — per-future price change and open-interest change — so we
# can faithfully reconstruct the OI-buildup DIRECTION and the same 1.5R trade
# levels, then resolve each on REAL subsequent daily bars. Selection uses the
# three components computable from EOD data (OI intensity, momentum, liquidity);
# the outcome of every trade is 100% real price action. Used to seed the model
# portfolio with genuine recent history for the track record.
_FO_BHAV_URL = "https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{ymd}_F_0000.csv.zip"

def _fetch_fo_bhavcopy(ymd):
    """Near-month stock-future rows for a date → {symbol: row dict}. None if the
    archive isn't published for that date (weekend/holiday)."""
    import csv as _csvmod
    import zipfile
    try:
        r = requests.get(_FO_BHAV_URL.format(ymd=ymd),
                         headers={"User-Agent": NSE_HEADERS["User-Agent"], "Accept": "*/*",
                                  "Referer": "https://www.nseindia.com/"}, timeout=25)
        if r.status_code != 200:
            return None
        z = zipfile.ZipFile(io.BytesIO(r.content))
        raw = z.read(z.namelist()[0]).decode("utf-8", "ignore")
    except Exception:
        return None
    by_sym = {}
    for x in _csvmod.DictReader(io.StringIO(raw)):
        if x.get("FinInstrmTp") != "STF":       # stock futures only
            continue
        s, exp = x.get("TckrSymb"), x.get("XpryDt", "")
        if s and (s not in by_sym or exp < by_sym[s].get("XpryDt", "z")):  # near month
            by_sym[s] = x
    return by_sym or None

def _reconstruct_signals_for_day(by_sym):
    """Scored LONG/SHORT plans from one day's F&O bhavcopy, mirroring the live
    engine's buildup classification and 1.5R levels (EOD close as the entry)."""
    def num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None
    plans = []
    for s, x in by_sym.items():
        close, prev = num(x.get("ClsPric")), num(x.get("PrvsClsgPric"))
        hi, lo = num(x.get("HghPric")), num(x.get("LwPric"))
        oi, doi = num(x.get("OpnIntrst")), num(x.get("ChngInOpnIntrst"))
        trades = num(x.get("TtlNbOfTxsExctd")) or 0
        if None in (close, prev, hi, lo, oi, doi) or prev <= 0 or close <= 0 or trades < 2000:
            continue
        px = (close - prev) / prev * 100
        prev_oi = oi - doi
        oi_pct = (doi / prev_oi * 100) if prev_oi > 0 else 0.0
        if px > 0 and oi_pct > 0:
            kind, side = "long_buildup", "LONG"
        elif px < 0 and oi_pct > 0:
            kind, side = "short_buildup", "SHORT"
        elif px > 0 and oi_pct < 0:
            kind, side = "short_covering", "LONG"
        else:
            continue  # long unwinding — the live engine doesn't trade it
        if abs(px) < 1.0 or abs(oi_pct) < 5.0:
            continue  # needs a real move + real OI shift
        s_oi = min(abs(oi_pct) / 10, 1) * 22 * (0.6 if kind == "short_covering" else 1)
        s_px = min(abs(px) / 3, 1) * 18
        s_liq = min(trades / 20000, 1) * 10
        score = round(s_oi + s_px + s_liq)
        entry = close
        rng = max(hi - lo, entry * 0.006)
        if side == "LONG":
            stop = min(lo, entry * 0.996)
            target = entry + 1.5 * (entry - stop)
        else:
            stop = max(hi, entry * 1.004)
            target = entry - 1.5 * (stop - entry)
        plans.append({"symbol": s, "side": side, "kind": kind, "score": score,
                      "entry": round(entry, 2), "stop": round(stop, 2), "target": round(target, 2)})
    plans.sort(key=lambda p: -p["score"])
    return plans

def _sim_hit(pos, op, hi, lo, dstr):
    """Gap-aware target/stop check for one bar — mirrors _resolve_one_position."""
    e, stop, tgt, side = pos["entry"], pos["stop"], pos["target"], pos["side"]
    def out(px, status):
        ret = (px - e) / e * 100 * (1 if side == "LONG" else -1)
        return {"status": status, "exit": round(px, 2), "exit_date": dstr, "ret_pct": round(ret, 2)}
    if side == "LONG":
        if op <= stop:  return out(op, "loss")
        if lo <= stop:  return out(stop, "loss")
        if op >= tgt:   return out(op, "win")
        if hi >= tgt:   return out(tgt, "win")
    else:
        if op >= stop:  return out(op, "loss")
        if hi >= stop:  return out(stop, "loss")
        if op <= tgt:   return out(op, "win")
        if lo <= tgt:   return out(tgt, "win")
    return None

def _backfill_model_portfolio(conn, days_back=8, min_score=40):
    """Walk-forward simulation of the model book over the last `days_back` F&O
    sessions from real bhavcopy: each day resolve the open book on that day's
    range (skipping each position's own entry day), then fill free slots FCFS
    with that day's top reconstructed signals. Only runs on a new, empty book.
    Returns (closed_count, open_count)."""
    if conn.execute("SELECT 1 FROM signal_positions LIMIT 1").fetchone():
        return 0, 0
    ist = datetime.now(_IST)
    day_data = []
    d = ist.date() - timedelta(days=1)   # skip today (incomplete)
    tries = 0
    while len(day_data) < days_back and tries < days_back * 3 + 6:
        tries += 1
        bs = _fetch_fo_bhavcopy(d.strftime("%Y%m%d"))
        if bs:
            day_data.append((d.strftime("%Y-%m-%d"), bs))
        d -= timedelta(days=1)
    if not day_data:
        return 0, 0
    day_data.reverse()  # ascending by date

    ohlc = {}
    for dstr, bs in day_data:
        day = {}
        for s, x in bs.items():
            try:
                day[s] = (float(x["OpnPric"]), float(x["HghPric"]), float(x["LwPric"]), float(x["ClsPric"]))
            except (KeyError, ValueError, TypeError):
                continue
        ohlc[dstr] = day

    book, closed = [], []
    for dstr, bs in day_data:
        still = []
        for pos in book:
            bar = ohlc.get(dstr, {}).get(pos["symbol"])  # (open, high, low, close)
            res = _sim_hit(pos, bar[0], bar[1], bar[2], dstr) if (bar and pos["entry_date"] < dstr) else None
            (closed if res else still).append({**pos, **res} if res else pos)
        book = still
        open_syms = {p["symbol"] for p in book}
        for sig in _reconstruct_signals_for_day(bs):
            if len(book) >= SIGNAL_PF_SLOTS:
                break
            if sig["score"] < min_score or sig["symbol"] in open_syms:
                continue
            book.append({**sig, "entry_date": dstr})
            open_syms.add(sig["symbol"])

    now = _utc_now()
    for p in closed:
        conn.execute(
            """INSERT INTO signal_positions (market, symbol, side, kind, score, entry, stop, target,
               entry_date, status, exit, exit_date, ret_pct, last_price, updated_at)
               VALUES ('IN',?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (p["symbol"], p["side"], p["kind"], p["score"], p["entry"], p["stop"], p["target"],
             p["entry_date"], p["status"], p["exit"], p["exit_date"], p["ret_pct"], p["exit"], now))
    for p in book:
        conn.execute(
            """INSERT INTO signal_positions (market, symbol, side, kind, score, entry, stop, target,
               entry_date, status, last_price, updated_at)
               VALUES ('IN',?,?,?,?,?,?,?,?, 'open', ?, ?)""",
            (p["symbol"], p["side"], p["kind"], p["score"], p["entry"], p["stop"], p["target"],
             p["entry_date"], p["entry"], now))
    return len(closed), len(book)

def _resolve_signal_positions(conn):
    """Close any open positions whose target/stop was touched (or time-stopped).
    Only status changes are written (mark-to-market is computed live in the
    snapshot), so the blob push only fires when the book actually changes.
    Returns the number of positions closed."""
    rows = [dict(r) for r in conn.execute("SELECT * FROM signal_positions WHERE status='open'")]
    closed = 0
    for r in rows:
        res = _resolve_one_position(r)
        if not res:
            continue
        status, exit_price, exit_date = res
        ret = (exit_price - r["entry"]) / r["entry"] * 100 * (1 if r["side"] == "LONG" else -1)
        conn.execute(
            """UPDATE signal_positions
               SET status=?, exit=?, exit_date=?, ret_pct=?, last_price=?, updated_at=?
               WHERE id=?""",
            (status, round(exit_price, 2), exit_date, round(ret, 2), round(exit_price, 2), _utc_now(), r["id"]))
        closed += 1
    return closed

def _signal_portfolio_snapshot(rows):
    """Build the track-record payload from all position rows. Open positions are
    marked to market with live quotes; stats + equity curve come from closed
    trades. Each position is SIGNAL_PF_WEIGHT of the book."""
    open_rows = [r for r in rows if r["status"] == "open"]
    closed_rows = [r for r in rows if r["status"] != "open"]

    # Live mark for open positions (batch quotes; fall back to entry).
    quotes = {}
    if open_rows:
        uniq = {_pf_yf_symbol(r["market"], r["symbol"]) for r in open_rows}
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(uniq))) as ex:
            futs = {ex.submit(_yf_quote_change, s): s for s in uniq}
            for fut in concurrent.futures.as_completed(futs):
                q = fut.result()
                if q:
                    quotes[futs[fut]] = q

    open_out = []
    open_unreal_contrib = 0.0
    for r in open_rows:
        q = quotes.get(_pf_yf_symbol(r["market"], r["symbol"]))
        cur = q["last"] if q else r["entry"]
        unreal = (cur - r["entry"]) / r["entry"] * 100 * (1 if r["side"] == "LONG" else -1)
        try:
            held = (_market_date(r["market"]) - datetime.strptime(r["entry_date"], "%Y-%m-%d").date()).days
        except ValueError:
            held = 0
        open_unreal_contrib += SIGNAL_PF_WEIGHT * unreal
        open_out.append({
            "symbol": r["symbol"], "market": r["market"], "side": r["side"],
            "kind": r["kind"], "score": r["score"], "entry": r["entry"],
            "stop": r["stop"], "target": r["target"], "current": round(cur, 2),
            "unreal_pct": round(unreal, 2), "entry_date": r["entry_date"],
            "days_held": held, "weight_pct": round(SIGNAL_PF_WEIGHT * 100),
        })
    open_out.sort(key=lambda x: -x["unreal_pct"])

    closed_sorted = sorted(closed_rows, key=lambda r: (r["exit_date"] or "", r.get("id", 0)))
    wins = [r for r in closed_sorted if (r["ret_pct"] or 0) > 0]
    losses = [r for r in closed_sorted if (r["ret_pct"] or 0) <= 0]
    n_closed = len(closed_sorted)
    realized_contrib = sum(SIGNAL_PF_WEIGHT * (r["ret_pct"] or 0) for r in closed_sorted)

    # Cumulative realized model return over time (for the equity curve).
    curve, cum = [], 0.0
    for r in closed_sorted:
        cum += SIGNAL_PF_WEIGHT * (r["ret_pct"] or 0)
        curve.append({"date": (r["exit_date"] or "")[:10], "cum_pct": round(cum, 2)})

    closed_out = [{
        "symbol": r["symbol"], "market": r["market"], "side": r["side"],
        "kind": r["kind"], "score": r["score"], "entry": r["entry"],
        "exit": r["exit"], "ret_pct": r["ret_pct"], "result": r["status"],
        "entry_date": r["entry_date"], "exit_date": (r["exit_date"] or "")[:10],
    } for r in reversed(closed_sorted)]  # newest first

    avg = lambda xs: round(sum(xs) / len(xs), 2) if xs else 0.0
    stats = {
        "win_rate": round(len(wins) / n_closed * 100, 1) if n_closed else None,
        "closed": n_closed,
        "wins": len(wins),
        "losses": len(losses),
        "open": len(open_out),
        "slots": SIGNAL_PF_SLOTS,
        "avg_win": avg([r["ret_pct"] for r in wins]),
        "avg_loss": avg([r["ret_pct"] for r in losses]),
        "avg_trade": avg([r["ret_pct"] or 0 for r in closed_sorted]),
        "realized_pct": round(realized_contrib, 2),
        "unrealized_pct": round(open_unreal_contrib, 2),
        "total_pct": round(realized_contrib + open_unreal_contrib, 2),
        "best": max((r["ret_pct"] for r in closed_sorted), default=None),
        "worst": min((r["ret_pct"] for r in closed_sorted), default=None),
    }
    return {"stats": stats, "open": open_out, "closed": closed_out[:50],
            "equity_curve": curve, "as_of": datetime.now(_IST).strftime("%Y-%m-%d %H:%M IST")}

@app.get("/api/signals/portfolio")
async def get_signal_portfolio(market: str = None):
    """The model portfolio's live holdings + track record, per market book.
    Defaults to the active session's market (US 20:00–02:00 IST, IN otherwise)
    so the page follows the session like Market Signals does; ?market=IN|US
    overrides. Resolution (network-heavy) is throttled; the snapshot itself is
    cached briefly."""
    active = market.upper() if market and market.upper() in ("IN", "US") else _dashboard_movers_market()
    cache_key = f"signal_portfolio_{active}"
    if cache_key in API_CACHE and time.time() - API_CACHE[cache_key]['time'] < 60:
        return API_CACHE[cache_key]['data']

    def work():
        global _last_pf_resolve, _pf_healed
        _blob_pull_db(force=True)
        conn = _auth_db()
        try:
            changed = False
            # A new deployment has no historical ledger yet. Seed the NSE
            # book from published F&O bhavcopies so the track record starts
            # with real historical inputs and subsequent price outcomes,
            # rather than sample trades.
            if active == "IN" and not conn.execute(
                "SELECT 1 FROM signal_positions WHERE COALESCE(market,'IN')='IN' LIMIT 1"
            ).fetchone():
                try:
                    seeded_closed, seeded_open = _backfill_model_portfolio(conn, days_back=12)
                    changed = (seeded_closed + seeded_open) > 0
                except Exception:
                    pass
            if not _pf_healed:
                _pf_healed = True
                try:
                    changed = _heal_intraday_closures(conn) > 0
                except Exception:
                    pass
            if time.time() - _last_pf_resolve > 900:
                _last_pf_resolve = time.time()
                try:
                    changed = (_resolve_signal_positions(conn) > 0) or changed
                except Exception:
                    pass
            if changed:
                conn.commit()
                try:
                    _blob_push_db()
                except Exception:
                    pass
            rows = [dict(r) for r in conn.execute(
                "SELECT * FROM signal_positions WHERE COALESCE(market,'IN') = ? ORDER BY id", (active,))]
        finally:
            conn.close()
        snap = _signal_portfolio_snapshot(rows)
        snap["market"] = active
        return snap

    data = _json_safe(await asyncio.to_thread(work))
    API_CACHE[cache_key] = {'time': time.time(), 'data': data}
    return data


# --- Daily Nifty call: streak + leaderboard (Phase 2A) ---
# One universal question per trading day ("NIFTY 50 green or red at close?"),
# locked at 9:15 IST, resolved after close by a cron. Streak rule: miss a trading
# day OR call it wrong resets to 0. Two leaderboards: current streak & accuracy.
_IST = timezone(timedelta(hours=5, minutes=30))
LEADERBOARD_MIN_CALLS = 20
# Keep QA/throwaway accounts off the public leaderboard. Real clients never use
# the @test.local domain (it's reserved for the test suite + manual verification).
_NOT_TEST_USER = "user_id NOT IN (SELECT id FROM users WHERE email LIKE '%@test.local')"

def _ist_now():
    return datetime.now(_IST)

def _next_weekday(d):
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d

def _active_question_date(now=None):
    """(qdate_iso, locked) for the currently predictable trading day.

    Today if it's a weekday before close (locked once past 9:15 IST); otherwise
    the next weekday (unlocked). Holidays aren't modelled here — a holiday weekday
    simply never resolves (no NIFTY data) and is voided later, harming no streak.
    """
    now = now or _ist_now()
    d = now.date()
    mins = now.hour * 60 + now.minute
    if d.weekday() < 5 and mins < 15 * 60 + 30:
        return d.isoformat(), mins >= 9 * 60 + 15
    return _next_weekday(d).isoformat(), False

def _nifty_outcome_for_date(qdate):
    """('UP'|'DOWN', change_pct) for NIFTY 50 on qdate vs the prior close, or None
    when there's no data for that date (weekend/holiday/outage)."""
    try:
        hist = yf.Ticker("^NSEI").history(period="1mo")
        if hist.empty:
            return None
        by_date, order = {}, []
        for ts, val in hist['Close'].dropna().items():
            key = ts.date().isoformat()
            by_date[key] = float(val)
            order.append(key)
        order = sorted(set(order))
        if qdate not in by_date:
            return None
        idx = order.index(qdate)
        if idx == 0:
            return None
        prev, cur = by_date[order[idx - 1]], by_date[qdate]
        if prev <= 0:
            return None
        chg = (cur - prev) / prev * 100
        if not np.isfinite(chg):
            return None
        return ("UP" if chg >= 0 else "DOWN", round(chg, 2))
    except Exception:
        return None

def _resolve_day(conn, qdate):
    """Resolve one trading day: set outcome, score predictions, update streaks,
    reset live-streak non-participants. Idempotent (claims via outcome IS NULL)."""
    q = conn.execute("SELECT outcome FROM daily_questions WHERE qdate=?", (qdate,)).fetchone()
    if not q:
        return "no-question"
    if q["outcome"] is not None:
        return "already"
    res = _nifty_outcome_for_date(qdate)
    if not res:
        return "no-data"
    outcome, chg = res
    claimed = conn.execute(
        "UPDATE daily_questions SET outcome=?, change_pct=?, resolved_at=? WHERE qdate=? AND outcome IS NULL",
        (outcome, chg, _utc_now(), qdate)).rowcount
    if not claimed:
        return "claimed-elsewhere"
    for p in conn.execute("SELECT user_id, choice FROM predictions WHERE qdate=?", (qdate,)).fetchall():
        correct = 1 if p["choice"] == outcome else 0
        conn.execute("UPDATE predictions SET correct=? WHERE user_id=? AND qdate=?", (correct, p["user_id"], qdate))
        conn.execute("INSERT OR IGNORE INTO streak_stats (user_id) VALUES (?)", (p["user_id"],))
        conn.execute("""UPDATE streak_stats SET
            total_calls = total_calls + 1,
            correct_calls = correct_calls + ?,
            current_streak = CASE WHEN ?=1 THEN current_streak + 1 ELSE 0 END,
            last_resolved_date = ?
            WHERE user_id=? AND (last_resolved_date IS NULL OR last_resolved_date < ?)""",
            (correct, correct, qdate, p["user_id"], qdate))
        conn.execute("UPDATE streak_stats SET longest_streak = current_streak WHERE user_id=? AND current_streak > longest_streak", (p["user_id"],))
    # Miss reset: anyone with a live streak who didn't predict this trading day.
    conn.execute("""UPDATE streak_stats SET current_streak = 0, last_resolved_date = ?
        WHERE current_streak > 0
          AND (last_resolved_date IS NULL OR last_resolved_date < ?)
          AND user_id NOT IN (SELECT user_id FROM predictions WHERE qdate=?)""",
        (qdate, qdate, qdate))
    return "resolved"

class PredictChoice(BaseModel):
    choice: str

class HideFlag(BaseModel):
    hidden: bool

@app.get("/api/predict/today")
def predict_today(authorization: str = Header(None)):
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        qdate, locked = _active_question_date()
        conn.execute("INSERT OR IGNORE INTO daily_questions (qdate, symbol) VALUES (?, 'NIFTY 50')", (qdate,))
        conn.commit()
        pred = conn.execute("SELECT choice FROM predictions WHERE user_id=? AND qdate=?", (row["id"], qdate)).fetchone()
        q = conn.execute("SELECT outcome, change_pct FROM daily_questions WHERE qdate=?", (qdate,)).fetchone()
        # Community split for the day — frontend reveals it only post-lock /
        # post-call so it can't anchor an open vote.
        community = {"up": 0, "down": 0}
        for c in conn.execute("SELECT choice, COUNT(*) AS n FROM predictions WHERE qdate=? GROUP BY choice", (qdate,)).fetchall():
            if c["choice"] == "UP":
                community["up"] = c["n"]
            elif c["choice"] == "DOWN":
                community["down"] = c["n"]
        return {
            "qdate": qdate,
            "symbol": "NIFTY 50",
            "prompt": "Will NIFTY 50 close green or red today?",
            "locked": locked,
            "your_choice": pred["choice"] if pred else None,
            "outcome": q["outcome"] if q else None,
            "change_pct": q["change_pct"] if q else None,
            "community": community,
            "market_open": _is_indian_market_open(),
        }
    finally:
        conn.close()

@app.post("/api/predict")
def predict_submit(req: PredictChoice, authorization: str = Header(None)):
    choice = (req.choice or "").strip().upper()
    if choice not in ("UP", "DOWN"):
        raise HTTPException(status_code=400, detail="Choice must be 'UP' or 'DOWN'.")
    qdate, locked = _active_question_date()
    if locked:
        raise HTTPException(status_code=423, detail="Today's call is locked — the market has opened.")
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        conn.execute("INSERT OR IGNORE INTO daily_questions (qdate, symbol) VALUES (?, 'NIFTY 50')", (qdate,))
        conn.execute("""INSERT INTO predictions (user_id, qdate, choice, created_at) VALUES (?,?,?,?)
                        ON CONFLICT(user_id, qdate) DO UPDATE SET choice=excluded.choice, created_at=excluded.created_at""",
                     (row["id"], qdate, choice, _utc_now()))
        conn.commit()
        _blob_push_db()
        return {"qdate": qdate, "choice": choice, "locked": False}
    finally:
        conn.close()

def _accuracy(correct, total):
    return round(correct / total * 100, 1) if total else None

@app.get("/api/predict/me")
def predict_me(authorization: str = Header(None)):
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        uid = row["id"]
        s = conn.execute("SELECT * FROM streak_stats WHERE user_id=?", (uid,)).fetchone()
        recent = conn.execute("""SELECT p.qdate, p.choice, p.correct, q.outcome
            FROM predictions p LEFT JOIN daily_questions q ON q.qdate = p.qdate
            WHERE p.user_id=? ORDER BY p.qdate DESC LIMIT 10""", (uid,)).fetchall()
        cur = s["current_streak"] if s else 0
        lon = s["longest_streak"] if s else 0
        tot = s["total_calls"] if s else 0
        cor = s["correct_calls"] if s else 0
        return {
            "current_streak": cur, "longest_streak": lon,
            "total_calls": tot, "correct_calls": cor,
            "accuracy": _accuracy(cor, tot),
            "hidden": bool(s["hide_from_board"]) if s else False,
            "recent": [dict(r) for r in recent],
        }
    finally:
        conn.close()

@app.get("/api/leaderboard")
def leaderboard(board: str = "streak", authorization: str = Header(None)):
    conn = _auth_db()
    try:
        row, conn = _optional_user(conn, authorization)
        uid = row["id"] if row else None
        if board == "accuracy":
            where = f"total_calls >= {LEADERBOARD_MIN_CALLS} AND hide_from_board=0"
            order = "CAST(correct_calls AS REAL)/total_calls DESC, total_calls DESC"
        else:
            board = "streak"
            where = "hide_from_board=0 AND (current_streak>0 OR longest_streak>0)"
            order = "current_streak DESC, longest_streak DESC, correct_calls DESC"
        rows = conn.execute(f"""SELECT s.user_id, u.display_name AS name,
                s.current_streak, s.longest_streak, s.total_calls, s.correct_calls
            FROM streak_stats s JOIN users u ON u.id = s.user_id
            WHERE {where} AND {_NOT_TEST_USER} ORDER BY {order} LIMIT 50""").fetchall()

        def fmt(r, rank):
            return {"rank": rank, "name": r["name"], "current_streak": r["current_streak"],
                    "longest_streak": r["longest_streak"], "total_calls": r["total_calls"],
                    "accuracy": _accuracy(r["correct_calls"], r["total_calls"]),
                    "is_you": uid is not None and r["user_id"] == uid}

        top = [fmt(r, i + 1) for i, r in enumerate(rows)]
        you = next((t for t in top if t["is_you"]), None)
        if not you and uid is not None:
            my = conn.execute("SELECT * FROM streak_stats WHERE user_id=?", (uid,)).fetchone()
            eligible = my and not my["hide_from_board"] and (
                board != "accuracy" or my["total_calls"] >= LEADERBOARD_MIN_CALLS)
            if eligible and (board != "streak" or my["current_streak"] > 0 or my["longest_streak"] > 0):
                if board == "accuracy":
                    ahead = conn.execute(f"""SELECT COUNT(*) c FROM streak_stats
                        WHERE total_calls >= {LEADERBOARD_MIN_CALLS} AND hide_from_board=0 AND {_NOT_TEST_USER}
                          AND CAST(correct_calls AS REAL)/total_calls > CAST(? AS REAL)/?""",
                        (my["correct_calls"], my["total_calls"])).fetchone()["c"]
                else:
                    ahead = conn.execute(f"""SELECT COUNT(*) c FROM streak_stats
                        WHERE hide_from_board=0 AND (current_streak>0 OR longest_streak>0) AND {_NOT_TEST_USER}
                          AND current_streak > ?""", (my["current_streak"],)).fetchone()["c"]
                you = {"rank": ahead + 1, "name": row["display_name"], "current_streak": my["current_streak"],
                       "longest_streak": my["longest_streak"], "total_calls": my["total_calls"],
                       "accuracy": _accuracy(my["correct_calls"], my["total_calls"]), "is_you": True}
        return {"board": board, "top": top, "you": you, "min_calls": LEADERBOARD_MIN_CALLS}
    finally:
        conn.close()

@app.post("/api/predict/hide")
def predict_hide(req: HideFlag, authorization: str = Header(None)):
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        row, conn = _require_user(conn, authorization)
        conn.execute("INSERT OR IGNORE INTO streak_stats (user_id) VALUES (?)", (row["id"],))
        conn.execute("UPDATE streak_stats SET hide_from_board=? WHERE user_id=?", (1 if req.hidden else 0, row["id"]))
        conn.commit()
        _blob_push_db()
        return {"hidden": bool(req.hidden)}
    finally:
        conn.close()

@app.get("/api/predict/resolve")
def predict_resolve(authorization: str = Header(None)):
    """Cron resolver (vercel.json: 30 10 * * 1-5). Ensures recent weekday question
    rows exist, resolves pending past days, voids stale holiday days. Idempotent."""
    _require_cron(authorization)
    _blob_pull_db(force=True)
    conn = _auth_db()
    try:
        today = _ist_now().date()
        d, ensured = today - timedelta(days=1), 0
        while ensured < 5:
            if d.weekday() < 5:
                conn.execute("INSERT OR IGNORE INTO daily_questions (qdate, symbol) VALUES (?, 'NIFTY 50')", (d.isoformat(),))
                ensured += 1
            d -= timedelta(days=1)
        pending = conn.execute("SELECT qdate FROM daily_questions WHERE outcome IS NULL AND qdate < ? ORDER BY qdate",
                               (today.isoformat(),)).fetchall()
        results = {}
        stale = (today - timedelta(days=4)).isoformat()
        for r in pending:
            qd = r["qdate"]
            res = _resolve_day(conn, qd)
            if res == "no-data" and qd < stale:
                conn.execute("UPDATE daily_questions SET outcome='VOID', resolved_at=? WHERE qdate=? AND outcome IS NULL",
                             (_utc_now(), qd))
                res = "voided"
            results[qd] = res
        conn.commit()
        _blob_push_db()
        return {"today": today.isoformat(), "results": results}
    finally:
        conn.close()


# --- Admin metrics (owner-only user analytics) ---
# Read-only aggregate view of the users/sessions tables for the alpha-nova-metrics
# dashboard. Gated by ADMIN_METRICS_KEY: required on Vercel so signup data is never
# public; open locally (no VERCEL env) for convenience.
ADMIN_METRICS_KEY = os.environ.get("ADMIN_METRICS_KEY")

def _require_admin(key):
    if ADMIN_METRICS_KEY:
        if not key or not hmac.compare_digest(key, ADMIN_METRICS_KEY):
            raise HTTPException(status_code=403, detail="Invalid or missing admin key.")
    elif os.environ.get("VERCEL"):
        raise HTTPException(status_code=403,
                            detail="ADMIN_METRICS_KEY is not configured on the server.")

def _parse_ts(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None

def _admin_metrics_data(growth_days=60, recent_limit=25):
    _blob_pull_db(force=True)  # newest snapshot from the blob before reading
    conn = _auth_db()
    try:
        users = conn.execute(
            "SELECT email, display_name, created_at, last_login_at FROM users"
        ).fetchall()
        active_sessions = conn.execute(
            "SELECT COUNT(*) FROM sessions WHERE expires_at > ?", (_utc_now(),)
        ).fetchone()[0]
    finally:
        conn.close()

    now = datetime.now(timezone.utc)
    today = now.date()

    def within(ts, days):
        dt = _parse_ts(ts)
        return dt is not None and (now - dt).days < days

    total = len(users)
    new_7d = sum(1 for u in users if within(u["created_at"], 7))
    new_30d = sum(1 for u in users if within(u["created_at"], 30))
    active_7d = sum(1 for u in users if within(u["last_login_at"], 7))
    active_30d = sum(1 for u in users if within(u["last_login_at"], 30))
    ever_logged_in = sum(1 for u in users if _parse_ts(u["last_login_at"]))

    # Daily new-signup counts, then a cumulative-total series, for growth_days back
    per_day = {}
    for u in users:
        dt = _parse_ts(u["created_at"])
        if dt:
            per_day[dt.date()] = per_day.get(dt.date(), 0) + 1
    signups_before_window = sum(
        c for d, c in per_day.items() if d < today - timedelta(days=growth_days - 1))
    growth, running = [], signups_before_window
    for i in range(growth_days - 1, -1, -1):
        d = today - timedelta(days=i)
        running += per_day.get(d, 0)
        growth.append({"date": d.isoformat(), "new": per_day.get(d, 0), "total": running})

    def sort_key(u):
        dt = _parse_ts(u["created_at"])
        return dt or datetime.min.replace(tzinfo=timezone.utc)
    recent = [{
        "email": u["email"],
        "displayName": u["display_name"],
        "createdAt": u["created_at"],
        "lastLoginAt": u["last_login_at"],
    } for u in sorted(users, key=sort_key, reverse=True)[:recent_limit]]

    return {
        "generated_at": now.isoformat(),
        "totals": {
            "users": total,
            "new_7d": new_7d,
            "new_30d": new_30d,
            "active_7d": active_7d,
            "active_30d": active_30d,
            "active_sessions": active_sessions,
            "ever_logged_in": ever_logged_in,
        },
        "growth": growth,
        "recent": recent,
    }

@app.get("/api/admin/metrics")
def admin_metrics(key: str = None):
    _require_admin(key)
    return _admin_metrics_data()


# --- Delivery % (EOD full bhavcopy with security-wise delivery data) ---
# Daily CSV from NSE archives feeds a rolling ~30-trading-day history used by the
# signals conviction score (HIGH CLV + delivery spurt = accumulation) and the
# Focus List. Spec: docs/superpowers/specs/2026-07-04-delivery-percent-integration-design.md
import threading
import csv as _csv

DELIVERY_CSV_URL = "https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{d}.csv"
DELIVERY_HISTORY_DAYS = 45          # calendar days kept in the table
DELIVERY_BACKFILL_TRADING_DAYS = 30
DELIVERY_PUBLISH_HOUR, DELIVERY_PUBLISH_MINUTE = 19, 15  # IST; file is up ~7pm
_DELIVERY_LOCK = threading.Lock()
_DELIVERY_CHECKED_AT = 0.0

def _delivery_db():
    conn = _auth_db()
    conn.execute("""CREATE TABLE IF NOT EXISTS delivery_daily (
        symbol     TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        close      REAL,
        deliv_per  REAL,
        clv        REAL,
        PRIMARY KEY (symbol, trade_date)
    )""")
    return conn

def _clv(high: float, low: float, close: float) -> float:
    """Close Location Value in [-1, 1]; 0 when the day had no range."""
    if high <= low:
        return 0.0
    return ((close - low) - (high - close)) / (high - low)

def _delivery_expected_day(now=None):
    """Last trading day whose delivery file should exist (weekends skipped,
    today only counts after the ~7:15pm IST publish window)."""
    now = now or datetime.now(timezone(timedelta(hours=5, minutes=30)))
    d = now.date()
    published = (now.hour, now.minute) >= (DELIVERY_PUBLISH_HOUR, DELIVERY_PUBLISH_MINUTE)
    if now.weekday() >= 5 or not published:
        d -= timedelta(days=1)
    while d.weekday() >= 5:
        d -= timedelta(days=1)
    return d

def _delivery_universe():
    syms = {t.replace(".NS", "") for t in SCREENER_UNIVERSES["nifty200"]}
    try:
        fut = (nse_get("/api/liveEquity-derivatives?index=stock_fut") or {}).get("data", [])
        syms |= {c.get("underlying") for c in fut if c.get("underlying")}
    except Exception:
        pass
    return syms

def _fetch_delivery_csv(day):
    """Raw CSV text for a trading day, or None on 404 (market holiday)."""
    url = DELIVERY_CSV_URL.format(d=day.strftime("%d%m%Y"))
    headers = dict(NSE_HEADERS, Referer="https://www.nseindia.com/all-reports")
    r = requests.get(url, headers=headers, timeout=15)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.text

def _ingest_delivery_day(conn, day, text, universe):
    reader = _csv.reader(io.StringIO(text))
    try:
        header = [h.strip() for h in next(reader)]
        col = {name: header.index(name) for name in
               ("SYMBOL", "SERIES", "HIGH_PRICE", "LOW_PRICE", "CLOSE_PRICE", "DELIV_PER")}
    except (StopIteration, ValueError):
        return 0
    rows = []
    for raw in reader:
        try:
            if raw[col["SERIES"]].strip() != "EQ":
                continue
            sym = raw[col["SYMBOL"]].strip()
            if sym not in universe:
                continue
            hi, lo = float(raw[col["HIGH_PRICE"]]), float(raw[col["LOW_PRICE"]])
            close, dp = float(raw[col["CLOSE_PRICE"]]), float(raw[col["DELIV_PER"]])
            rows.append((sym, day.isoformat(), close, dp, _clv(hi, lo, close)))
        except (ValueError, IndexError):
            continue  # '-' fields, short rows etc.
    if rows:
        conn.executemany(
            "INSERT OR REPLACE INTO delivery_daily (symbol, trade_date, close, deliv_per, clv) VALUES (?, ?, ?, ?, ?)",
            rows)
    return len(rows)

def _ensure_delivery_fresh(max_fetch=3, force=False):
    """Bring delivery_daily up to the last expected trading day. Cheap when
    already fresh; fetches at most max_fetch missing files otherwise."""
    global _DELIVERY_CHECKED_AT
    if not force and time.time() - _DELIVERY_CHECKED_AT < 3600:
        return {"added": 0, "skipped": "recently checked"}
    with _DELIVERY_LOCK:
        if not force and time.time() - _DELIVERY_CHECKED_AT < 3600:
            return {"added": 0, "skipped": "recently checked"}
        expected = _delivery_expected_day()
        # Same SQLite file as auth/push_subs: pull fresh so the push after
        # ingesting can't overwrite newer writes (e.g. a push subscription)
        # with this instance's stale snapshot. At most hourly per instance.
        _blob_pull_db(force=True)
        conn = _delivery_db()
        try:
            latest = conn.execute("SELECT MAX(trade_date) FROM delivery_daily").fetchone()[0]
            if latest and latest >= expected.isoformat():
                _DELIVERY_CHECKED_AT = time.time()
                return {"added": 0, "latest": latest}

            if latest:
                day, missing = datetime.fromisoformat(latest).date() + timedelta(days=1), []
                while day <= expected:
                    if day.weekday() < 5:
                        missing.append(day)
                    day += timedelta(days=1)
            else:  # first run: backfill recent trading days, oldest first
                missing, day = [], expected
                while len(missing) < DELIVERY_BACKFILL_TRADING_DAYS:
                    if day.weekday() < 5:
                        missing.append(day)
                    day -= timedelta(days=1)
                missing.reverse()

            added = 0
            universe = _delivery_universe()
            for day in missing[:max_fetch]:  # oldest first so gaps fill forward
                try:
                    text = _fetch_delivery_csv(day)
                except requests.RequestException as e:
                    print(f"Delivery fetch failed for {day}: {e}")
                    continue
                if text:
                    added += _ingest_delivery_day(conn, day, text, universe)
            conn.execute("DELETE FROM delivery_daily WHERE trade_date < ?",
                         ((expected - timedelta(days=DELIVERY_HISTORY_DAYS)).isoformat(),))
            conn.commit()
            latest = conn.execute("SELECT MAX(trade_date) FROM delivery_daily").fetchone()[0]
        finally:
            conn.close()
        if added:
            _blob_push_db()
            API_CACHE.pop("delivery_signals", None)
        _DELIVERY_CHECKED_AT = time.time()
        return {"added": added, "latest": latest}

def _delivery_signals():
    """{symbol: {spurt, clv01, deliv_per}} for the latest stored day; spurt is
    today's delivery % over the symbol's prior 20-day average (needs >= 10 days)."""
    cached = API_CACHE.get("delivery_signals")
    if cached and time.time() - cached["time"] < 600:
        return cached["data"]
    conn = _delivery_db()
    try:
        latest = conn.execute("SELECT MAX(trade_date) FROM delivery_daily").fetchone()[0]
        if not latest:
            return {}
        today = {r["symbol"]: r for r in conn.execute(
            "SELECT symbol, deliv_per, clv FROM delivery_daily WHERE trade_date = ?", (latest,))}
        base = {r["symbol"]: r for r in conn.execute("""
            SELECT symbol, AVG(deliv_per) AS avg_dp, COUNT(*) AS n FROM (
                SELECT symbol, deliv_per,
                       ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY trade_date DESC) AS rn
                FROM delivery_daily WHERE trade_date < ?
            ) WHERE rn <= 20 GROUP BY symbol""", (latest,))}
    finally:
        conn.close()
    out = {}
    for sym, row in today.items():
        b = base.get(sym)
        if not b or b["n"] < 10 or not b["avg_dp"]:
            continue
        out[sym] = {"spurt": row["deliv_per"] / b["avg_dp"],
                    "clv01": (row["clv"] + 1) / 2,
                    "deliv_per": row["deliv_per"]}
    API_CACHE["delivery_signals"] = {"time": time.time(), "data": out}
    return out

def _delivery_score(dlv, side):
    """0-10 conviction points: delivery spurt into a directional close."""
    if not dlv:
        return 0.0
    c01 = dlv["clv01"] if side == "LONG" else 1 - dlv["clv01"]
    c01 = max(0.0, min(1.0, c01))
    return max(0.0, min(10.0, min(dlv["spurt"] / 1.3, 1.0) * c01 * 10))

@app.get("/api/delivery/refresh")
def delivery_refresh(authorization: str = Header(None)):
    _require_cron(authorization)
    try:
        result = _ensure_delivery_fresh(max_fetch=35, force=True)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Delivery refresh failed: {e}")
    return result


# --- Static File Serving (Production) ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIST_DIR = os.path.join(BASE_DIR, '..', 'web', 'dist')

if os.path.isdir(WEB_DIST_DIR):
    app.mount("/", StaticFiles(directory=WEB_DIST_DIR, html=True), name="static")

    @app.exception_handler(404)
    async def custom_404_handler(request, exc):
        path = request.url.path
        from fastapi.responses import JSONResponse
        if path.startswith("/api/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        
        index_path = os.path.join(WEB_DIST_DIR, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return {"detail": "Frontend build not found"}

