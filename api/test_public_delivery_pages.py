from io import BytesIO

from PIL import Image

from api.public_delivery_pages import render_delivery_preview, render_radar_page, render_stock_page


RADAR = {
    "trade_date": "2026-07-31", "source_status": "fresh",
    "availability_message": "Latest validated NSE delivery session: 2026-07-31.",
    "coverage": {"eligible": 1, "latest_rows": 2, "required_baseline_sessions": 20},
    "data": [{
        "symbol": "M&M", "trade_date": "2026-07-31", "close": 3210.5,
        "price_change_pct": 1.25, "delivery_pct": 58.1, "delivery_pct_ratio": 1.2,
        "traded_qty": 5000, "delivered_qty": 3000, "delivered_qty_ratio": 2.5,
        "source_url": "https://nsearchives.nseindia.com/source.csv",
    }],
}


def test_radar_html_contains_substantive_dated_table_and_canonical_metadata():
    html = render_radar_page(RADAR)
    assert "High Delivery Volume Stocks Today" in html
    assert "2026-07-31" in html
    assert "M&amp;M" in html
    assert "30-day" not in html
    assert '<link rel="canonical" href="https://alphanova48.in/high-delivery-volume-stocks-today"' in html
    assert 'property="og:image" content="https://alphanova48.in/api/public-preview/delivery-radar.png"' in html
    assert "not proof of institutional buying" in html


def test_stock_html_escapes_symbol_and_discloses_incomplete_baseline():
    payload = {**RADAR, "symbol": "M&M", "baseline_complete": False, "baseline_samples": 12}
    html = render_stock_page(payload)
    assert "M&amp;M delivery percentage" in html
    assert "12 of 20 prior sessions" in html
    assert "/chart?symbol=M%26M.NS" in html
    assert "<script>alert" not in html


def test_preview_is_a_real_1200_by_630_png_with_no_remote_dependency():
    content = render_delivery_preview("Delivery Radar", "NSE session 31 Jul 2026", "18 complete baselines")
    assert content.startswith(b"\x89PNG\r\n\x1a\n")
    image = Image.open(BytesIO(content))
    assert image.size == (1200, 630)
    assert image.mode == "RGB"
