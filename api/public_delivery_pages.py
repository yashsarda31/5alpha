"""Server-rendered public delivery pages and social preview images."""

from __future__ import annotations

import html
import io
import json
from urllib.parse import quote


ORIGIN = "https://alphanova48.in"


def _fmt(value, decimals=2):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{number:,.{decimals}f}"


def _document(title, description, canonical, body, *, index=True, image="/api/public-preview/delivery-radar.png"):
    title_e, description_e = html.escape(title), html.escape(description, quote=True)
    canonical_url = f"{ORIGIN}{canonical}"
    schema = json.dumps({
        "@context": "https://schema.org", "@type": "Dataset", "name": title,
        "description": description, "url": canonical_url,
        "creator": {"@type": "Organization", "name": "Alpha Nova"},
    }).replace("<", "\\u003c")
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title_e}</title><meta name="description" content="{description_e}">
<meta name="robots" content="{'index, follow, max-image-preview:large' if index else 'noindex, nofollow'}">
<link rel="canonical" href="{canonical_url}"><meta property="og:type" content="website"><meta property="og:title" content="{title_e}">
<meta property="og:description" content="{description_e}"><meta property="og:url" content="{canonical_url}">
<meta property="og:image" content="{ORIGIN}{image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{ORIGIN}{image}">
<script type="application/ld+json">{schema}</script>
<style>html{{color-scheme:dark}}body{{margin:0;background:#050507;color:#f5f5f7;font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif}}main{{max-width:1160px;margin:auto;padding:40px 20px 72px}}a{{color:#57e5ff}}.brand{{color:#f5dc8c;font-weight:800;letter-spacing:.04em}}h1{{font-size:clamp(32px,5vw,58px);line-height:1.04;max-width:900px;margin:35px 0 15px}}.lead{{max-width:820px;color:#b7b7c0;font-size:18px}}.notice{{margin:26px 0;padding:15px 18px;border:1px solid #29292f;border-radius:13px;background:#101014}}.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:20px 0}}.stat{{padding:18px;border:1px solid #29292f;border-radius:13px;background:#101014}}.stat span{{display:block;color:#93939e;font-size:12px}}.stat strong{{font-size:24px}}table{{width:100%;border-collapse:collapse;margin-top:24px;background:#0d0d11}}th,td{{padding:13px 12px;border-bottom:1px solid #24242a;text-align:right;font-variant-numeric:tabular-nums}}th:first-child,td:first-child{{text-align:left}}th{{color:#93939e;font-size:12px}}footer{{margin-top:28px;color:#93939e;font-size:12px}}@media(max-width:680px){{main{{padding-top:24px}}.grid{{grid-template-columns:1fr}}table{{font-size:12px}}th,td{{padding:10px 7px}}}}</style></head><body><main><a class="brand" href="/">ALPHA NOVA</a>{body}</main></body></html>"""


def render_radar_page(payload):
    data = payload.get("data") or []
    coverage = payload.get("coverage") or {}
    rows = "".join(
        f"<tr><td><a href=\"/stocks/{quote(str(row.get('symbol', '')))}/delivery-percentage\">{html.escape(str(row.get('symbol', '')))}</a></td>"
        f"<td>{_fmt(row.get('delivered_qty'), 0)}</td><td>{_fmt(row.get('delivered_qty_ratio'))}×</td>"
        f"<td>{_fmt(row.get('delivery_pct'))}%</td><td>{_fmt(row.get('price_change_pct'))}%</td></tr>"
        for row in data
    ) or '<tr><td colspan="5">No stock has a complete validated 20-session quantity baseline yet.</td></tr>'
    body = f"""<h1>High Delivery Volume Stocks Today</h1>
<p class="lead">NSE stocks ranked by delivered quantity versus each stock’s prior 20-session average, with delivery percentage and price context.</p>
<div class="notice"><strong>Latest validated NSE session: {html.escape(str(payload.get('trade_date') or 'unavailable'))}</strong><br>
Delivery activity is research context, not proof of institutional buying or a trade recommendation.</div>
<div class="grid"><div class="stat"><span>Complete baselines</span><strong>{int(coverage.get('eligible') or 0)}</strong></div><div class="stat"><span>Latest-session records</span><strong>{int(coverage.get('latest_rows') or 0)}</strong></div><div class="stat"><span>Required history</span><strong>20 sessions</strong></div></div>
<table><thead><tr><th>Stock</th><th>Delivered qty</th><th>Vs 20-session avg</th><th>Delivery %</th><th>Price move</th></tr></thead><tbody>{rows}</tbody></table>
<footer>Source: NSE security-wise price volume and deliverable position files. <a href="/delivery-radar">Open the interactive Delivery Radar</a>.</footer>"""
    return _document(
        "High Delivery Volume Stocks Today — NSE | Alpha Nova",
        "NSE stocks with unusual delivered quantity versus their prior 20-session average, with source date and coverage.",
        "/high-delivery-volume-stocks-today", body, index=bool(data),
    )


def render_stock_page(payload):
    symbol = str(payload.get("symbol") or "NSE stock")
    symbol_e = html.escape(symbol)
    data = payload.get("data") or []
    rows = "".join(
        f"<tr><td>{html.escape(str(row.get('trade_date') or ''))}</td><td>{_fmt(row.get('close'))}</td>"
        f"<td>{_fmt(row.get('delivered_qty'), 0)}</td><td>{_fmt(row.get('delivery_pct'))}%</td>"
        f"<td>{_fmt(row.get('delivered_qty_ratio'))}×</td></tr>" for row in data
    )
    incomplete = "" if payload.get("baseline_complete") else f'<div class="notice"><strong>Comparison incomplete</strong><br>{int(payload.get("baseline_samples") or 0)} of 20 prior sessions are available. Ratios remain unavailable until the baseline is complete.</div>'
    latest = data[0] if data else {}
    body = f"""<h1>{symbol_e} delivery percentage</h1><p class="lead">Delivered quantity, delivery percentage, and price context for each available NSE session.</p>
<div class="notice"><strong>Latest validated NSE session: {html.escape(str(payload.get('trade_date') or 'unavailable'))}</strong><br>Delivery activity is research context, not proof of institutional buying or a trade recommendation.</div>
<div class="grid"><div class="stat"><span>Delivered quantity</span><strong>{_fmt(latest.get('delivered_qty'), 0)}</strong></div><div class="stat"><span>Delivery percentage</span><strong>{_fmt(latest.get('delivery_pct'))}%</strong></div><div class="stat"><span>Vs prior 20 sessions</span><strong>{_fmt(latest.get('delivered_qty_ratio'))}×</strong></div></div>{incomplete}
<table><thead><tr><th>Session</th><th>Close</th><th>Delivered qty</th><th>Delivery %</th><th>Qty vs prior 20</th></tr></thead><tbody>{rows}</tbody></table>
<footer>Source: NSE security-wise price volume and deliverable position files. <a href="/chart?symbol={quote(symbol)}.NS">Analyse {symbol_e}</a> · <a href="/delivery-radar">Delivery Radar</a>.</footer>"""
    canonical = f"/stocks/{quote(symbol)}/delivery-percentage"
    return _document(
        f"{symbol} Delivery Percentage and History | Alpha Nova",
        f"Review {symbol} delivered quantity, delivery percentage, price move, and prior 20-session comparisons from NSE files.",
        canonical, body, index=bool(data),
    )


def _font(size, bold=False):
    from PIL import ImageFont
    candidates = ["DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", "arialbd.ttf" if bold else "arial.ttf"]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def render_delivery_preview(title, subtitle, metric):
    from PIL import Image, ImageDraw
    image = Image.new("RGB", (1200, 630), "#050507")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((60, 55, 1140, 575), radius=30, fill="#0d0d11", outline="#29292f", width=2)
    draw.ellipse((90, 88, 126, 124), fill="#57e5ff")
    draw.text((146, 84), "ALPHA NOVA", font=_font(28, True), fill="#f5dc8c")
    draw.text((92, 190), str(title)[:48], font=_font(60, True), fill="#f5f5f7")
    draw.text((94, 288), str(subtitle)[:72], font=_font(30), fill="#a6a6b1")
    draw.rounded_rectangle((92, 382, 720, 490), radius=18, fill="#15151b", outline="#34343c")
    draw.text((122, 408), str(metric)[:56], font=_font(34, True), fill="#57e5ff")
    draw.text((92, 526), "Official NSE delivery files · Research only", font=_font(22), fill="#7d7d88")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
