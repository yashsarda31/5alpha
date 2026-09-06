"""Small, privacy-bounded public share snapshots."""

from __future__ import annotations

import html
import re
import secrets
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode


ORIGIN = "https://alphanova48.in"
SHAREABLE_PATHS = {
    "/", "/dashboard", "/signals", "/chart", "/delivery-radar",
    "/high-delivery-volume-stocks-today", "/option-chain", "/screener",
    "/arima", "/dcf", "/fundamentals", "/flcl", "/position-sizing",
    "/sectors", "/momentum", "/stocks-at-52-week-high-today", "/news",
    "/deals", "/bulk-block-deals-today", "/learn",
    "/druck-minervini", "/track-record", "/fiidii", "/fii-dii-data-today",
    "/nifty-pcr-today", "/bank-nifty-oi-analysis",
}
QUERY_KEYS = {
    "/dashboard": {"market"}, "/signals": {"market"},
    "/chart": {"market", "symbol"}, "/delivery-radar": {"symbol"},
    "/option-chain": {"expiryDate", "symbol"},
    "/nifty-pcr-today": {"expiryDate", "symbol"},
    "/bank-nifty-oi-analysis": {"expiryDate", "symbol"},
    "/screener": {
        "benchmark", "max_pe", "min_alpha_score", "min_div_yield",
        "min_eps_growth", "min_momentum", "min_pe", "min_roe",
        "price_trend", "rs_lookback", "rs_screen", "tickers", "universe",
        "volume_breakout",
    },
    "/arima": {"symbol"}, "/dcf": {"symbol"}, "/fundamentals": {"symbol"},
    "/flcl": {"symbol"},
}
STOCK_DELIVERY = re.compile(r"^/stocks/[A-Z0-9][A-Z0-9&.%+-]{0,40}/delivery-percentage$")
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{4,40}$")


def ensure_share_schema(conn):
    conn.execute("""CREATE TABLE IF NOT EXISTS public_shares (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        query TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""")
    conn.commit()


def _shareable_path(path):
    value = str(path or "")
    if value in SHAREABLE_PATHS or STOCK_DELIVERY.fullmatch(value):
        return value
    raise ValueError("This path is not shareable")


def _public_query(path, query):
    allowed = QUERY_KEYS.get(path, {"market", "symbol"})
    pairs = []
    raw_query = str(query or "").lstrip("?").split("#", 1)[0]
    for key, value in parse_qsl(raw_query, keep_blank_values=False):
        if key not in allowed or not value or len(value) > (400 if key == "tickers" else 80):
            continue
        pairs.append((key, value))
    return urlencode(sorted(dict(pairs).items()))


def create_share(conn, *, path, query="", title="Alpha Nova research", share_id=None, created_at=None):
    ensure_share_schema(conn)
    safe_path = _shareable_path(path)
    safe_query = _public_query(safe_path, query)
    safe_title = " ".join(str(title or "Alpha Nova research").split())[:100] or "Alpha Nova research"
    identifier = share_id or secrets.token_urlsafe(12)
    if not ID_PATTERN.fullmatch(identifier):
        raise ValueError("Invalid share identifier")
    created = created_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    conn.execute(
        "INSERT INTO public_shares (id, path, query, title, created_at) VALUES (?, ?, ?, ?, ?)",
        (identifier, safe_path, safe_query, safe_title, created),
    )
    conn.commit()
    target = f"{ORIGIN}{safe_path}{f'?{safe_query}' if safe_query else ''}"
    return {"id": identifier, "url": f"{ORIGIN}/s/{identifier}", "target_url": target, "title": safe_title, "created_at": created}


def get_share(conn, share_id):
    ensure_share_schema(conn)
    if not ID_PATTERN.fullmatch(str(share_id or "")):
        return None
    row = conn.execute("SELECT id, path, query, title, created_at FROM public_shares WHERE id = ?", (share_id,)).fetchone()
    if not row:
        return None
    data = dict(row)
    query_suffix = f"?{data['query']}" if data["query"] else ""
    data["target_url"] = f"{ORIGIN}{data['path']}{query_suffix}"
    data["url"] = f"{ORIGIN}/s/{data['id']}"
    return data


def render_share_page(share):
    title = html.escape(share["title"])
    target = html.escape(share["target_url"], quote=True)
    url = html.escape(share["url"], quote=True)
    image = f"{ORIGIN}/api/public-preview/share/{share['id']}.png"
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} | Alpha Nova</title><meta name="description" content="Open this dated Alpha Nova research configuration.">
<meta name="robots" content="noindex, nofollow"><link rel="canonical" href="{url}">
<meta property="og:title" content="{title} | Alpha Nova"><meta property="og:description" content="Open this Alpha Nova research configuration.">
<meta property="og:url" content="{url}"><meta property="og:image" content="{image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<style>html{{color-scheme:dark}}body{{margin:0;background:#050507;color:#f5f5f7;font:16px/1.5 system-ui;display:grid;min-height:100vh;place-items:center}}main{{max-width:680px;margin:20px;padding:42px;border:1px solid #29292f;border-radius:24px;background:#0d0d11}}.brand{{color:#f5dc8c;font-weight:800}}h1{{font-size:clamp(30px,6vw,54px);line-height:1.05}}p{{color:#a6a6b1}}a.cta{{display:inline-block;margin-top:18px;padding:13px 18px;border-radius:12px;background:#57e5ff;color:#050507;font-weight:800;text-decoration:none}}</style></head>
<body><main><div class="brand">ALPHA NOVA</div><h1>{title}</h1><p>Shared research inputs from {html.escape(share['created_at'][:10])}. Live market data may have updated since this link was created.</p><a class="cta" href="{target}">Open analysis</a></main></body></html>"""
