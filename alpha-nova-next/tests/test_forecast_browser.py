"""Forecast user-flow checks against the local Vite app; all API traffic mocked."""
import copy
import json
from pathlib import Path
from urllib.parse import unquote, urlparse

import pytest
from playwright.sync_api import expect, sync_playwright

from api.stock_forecast import build_forecast
from api.test_stock_forecast import NOW, fundamentals, history

BASE = "http://127.0.0.1:5183"
OUTPUT = Path(__file__).resolve().parents[2] / ".tmp" / "forecast-qa"


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as runtime:
        browser = runtime.chromium.launch(channel="chrome", headless=True)
        yield browser
        browser.close()


@pytest.fixture
def flow(browser):
    context = browser.new_context(service_workers="block")
    context.add_init_script("localStorage.setItem('alphanova_disclaimer_acknowledged_v1', '1')")
    state = {"failure": False, "kind": "bullish", "requests": [], "errors": []}

    def handle(route):
        path = urlparse(route.request.url).path
        if "/api/forecast/" in path:
            symbol = unquote(path.split("/api/forecast/")[1])
            state["requests"].append(symbol)
            if state["failure"]:
                return route.fulfill(status=503, json={"detail": "Fixture unavailable"})
            facts = fundamentals(ticker=symbol)
            if not symbol.endswith((".NS", ".BO")):
                facts["dataQuality"]["currency"] = "USD"
            drift = -.002 if state["kind"] == "bearish" else 0 if state["kind"] == "neutral" else .001
            if state["kind"] == "incomplete":
                facts["returnOnEquity"] = None
            data = build_forecast(symbol, history(drift), facts, {"articles": [
                {"title": "Company publishes quarterly results", "url": "https://example.com/results", "provider": "Fixture news", "publishedAt": "2026-09-24T10:00:00Z"}
            ]}, now=NOW)
            data["fundamentals"]["name"] = symbol + " company"
            return route.fulfill(json=data)
        if "/api/symbol-search" in path:
            return route.fulfill(json={"results": [{"symbol": "TCS.NS", "name": "Tata Consultancy Services", "exchange": "NSE"}]})
        if "/api/auth/" in path:
            return route.fulfill(status=401, json={"detail": "Guest fixture"})
        return route.fulfill(json={"success": True, "items": [], "rows": []})

    context.route("**/api/**", handle)
    context.route("https://vitals.vercel-insights.com/**", lambda route: route.abort())
    page = context.new_page()
    page.on("pageerror", lambda error: state["errors"].append(str(error)))
    yield page, state
    assert not state["errors"]
    context.close()


def open_report(page, symbol="RELIANCE.NS", market="IN"):
    page.goto(f"{BASE}/forecast?symbol={symbol}&market={market}")
    expect(page.get_by_role("heading", name=symbol + " company")).to_be_visible()


@pytest.mark.parametrize("width", [320, 390, 800, 1440])
def test_featured_tab_and_report_layout(flow, width):
    page, _ = flow
    page.set_viewport_size({"width": width, "height": 950})
    page.goto(BASE + "/forecast")
    expect(page.get_by_role("heading", name="Start with a stock")).to_be_visible()
    page.get_by_role("button", name="RELIANCE.NS", exact=True).click()
    expect(page.get_by_role("heading", name="Bullish historical scenario")).to_be_visible()
    expect(page.get_by_text("Prediction", exact=True)).to_be_visible()
    expect(page.get_by_text("Risk level · invalidation", exact=True)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    nav = page.get_by_role("navigation", name="Mobile navigation" if width <= 760 else "Primary navigation", exact=True)
    expect(nav.get_by_role("link", name="Forecast", exact=False)).to_be_visible()
    box = nav.get_by_role("link", name="Forecast", exact=False).bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= width
    OUTPUT.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(OUTPUT / f"forecast-{width}.png"), full_page=True)


def test_search_switching_market_and_deep_links(flow):
    page, state = flow
    open_report(page)
    page.get_by_role("button", name="US", exact=True).click()
    expect(page.get_by_role("heading", name="Start with a stock")).to_be_visible()
    page.get_by_role("combobox", name="Forecast stock ticker").fill("MSFT")
    page.get_by_role("button", name="Generate forecast").click()
    expect(page.get_by_role("heading", name="MSFT company")).to_be_visible()
    assert state["requests"][-1] == "MSFT"
    assert "$" in page.locator(".an-forecast-summary").inner_text()
    assert "₹" not in page.locator(".an-forecast-summary").inner_text()
    page.reload()
    expect(page.get_by_role("heading", name="MSFT company")).to_be_visible()
    page.get_by_role("button", name="India", exact=True).click()
    search = page.get_by_role("combobox", name="Forecast stock ticker")
    search.fill("Tata")
    page.get_by_role("option", name="TCS.NS Tata Consultancy Services NSE").click()
    expect(page.get_by_role("heading", name="TCS.NS company")).to_be_visible()
    assert state["requests"][-1] == "TCS.NS"


def test_failed_refresh_hides_target_and_retry_recovers(flow):
    page, state = flow
    open_report(page)
    state["failure"] = True
    page.get_by_role("button", name="Refresh evidence").click()
    expect(page.get_by_text("Could not load this research (503). Please retry.")).to_be_visible()
    expect(page.get_by_text("Prediction", exact=True)).to_have_count(0)
    state["failure"] = False
    page.get_by_role("button", name="Retry", exact=True).click()
    expect(page.get_by_role("heading", name="Bullish historical scenario")).to_be_visible()


@pytest.mark.parametrize("kind", ["bearish", "neutral", "incomplete"])
def test_direction_and_insufficient_data_states(flow, kind):
    page, state = flow
    state["kind"] = kind
    open_report(page)
    if kind == "bearish":
        expect(page.get_by_role("heading", name="Bearish historical scenario")).to_be_visible()
        expect(page.get_by_text("Daily close above this price", exact=True)).to_be_visible()
    elif kind == "neutral":
        expect(page.get_by_text("No directional level", exact=True)).to_be_visible()
    else:
        expect(page.get_by_role("heading", name="Insufficient evidence for a forecast")).to_be_visible()
        assert page.get_by_text("Withheld", exact=True).count() == 3
        expect(page.get_by_text("Core fundamental evidence unavailable: ROE. Target withheld.")).to_be_visible()


def test_sources_and_method_are_accessible(flow):
    page, _ = flow
    open_report(page, "500325.BO")
    link = page.get_by_role("link", name="Company publishes quarterly results")
    expect(link).to_have_attribute("href", "https://example.com/results")
    expect(link).to_have_attribute("rel", "noopener noreferrer")
    page.get_by_text("Method, historical checks & sources", exact=True).click()
    expect(page.get_by_text("Target mean absolute error", exact=True)).to_be_visible()
    expect(page.get_by_text("Flat-price baseline error", exact=True)).to_be_visible()


def test_slow_previous_symbol_cannot_overwrite_new_selection(flow):
    page, state = flow
    # Hold a request in JavaScript until after a new symbol succeeds. Even a
    # provider ignoring abort must not replace the new symbol's report.
    page.add_init_script("""
      const realFetch = window.fetch;
      window.fetch = (url, options) => {
        if (String(url).includes('/api/forecast/OLD.NS')) return new Promise(resolve => window.resolveOld = resolve);
        return realFetch(url, options);
      };
    """)
    page.goto(BASE + "/forecast?symbol=OLD.NS&market=IN")
    page.wait_for_function("typeof window.resolveOld === 'function'")
    page.get_by_role("combobox", name="Forecast stock ticker").fill("TCS")
    page.get_by_role("button", name="Generate forecast").click()
    expect(page.get_by_role("heading", name="TCS.NS company")).to_be_visible()
    old = build_forecast("OLD.NS", history(), fundamentals(ticker="OLD.NS"), now=NOW)
    page.evaluate("data => window.resolveOld(new Response(JSON.stringify(data), {status: 200}))", old)
    expect(page.get_by_role("heading", name="TCS.NS company")).to_be_visible()
    assert "OLD.NS company" not in page.locator(".an-forecast").inner_text()
