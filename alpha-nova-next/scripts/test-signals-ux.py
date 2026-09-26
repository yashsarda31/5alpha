"""Signals browser regressions. Build to .tmp/signals-ux-build before running."""
import asyncio
import copy
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = {
    'as_of': '2026-09-04T15:40:00', 'signals_market': 'IN', 'currency': '₹',
    'market_open': False, 'market_note': 'Weekend',
    'data_status': {'status': 'provider_limited', 'required_inputs_complete': False},
    'regime': {'overall': 'RISK-OFF', 'dir': 'bear', 'vol_scale': 1,
               'nifty': {}, 'banknifty': {}, 'vol': {}, 'iv': {}, 'breadth': {}},
    'options': {'indices': [{'symbol': 'NIFTY', 'spot': 24000, 'pcr_band': None,
                             'max_pain': None, 'atm_iv_ce': None, 'atm_iv_pe': None}],
                'buildups': {}, 'ideas': []},
    'setups': {'index_bias': 'bear', 'radar_size': 1, 'plans': [
        {'symbol': 'KOTAKBANK', 'side': 'LONG', 'score': 66, 'entry': 417.95,
         'stop': 409.9, 'target': 434.05, 'levels_locked': True,
         'lifecycle': 'open', 'actionable': False,
         'why': 'Open position · levels locked since 2026-08-26'}], 'watchlist': [
        {'symbol': 'RELIANCE', 'side': 'LONG', 'lifecycle': 'forming',
         'actionable': False, 'score': 62, 'trigger': 1400, 'initial_stop': 1350,
         'timing_reason': 'awaiting_trigger', 'chase_r': 0}]},
}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(self.translate_path(self.path.split('?')[0])).is_file():
            self.path = '/index.html'
        super().do_GET()

    def log_message(self, *args):
        pass


async def main():
    server = ThreadingHTTPServer(('127.0.0.1', 4191), partial(
        Handler, directory=str(ROOT / '.tmp/signals-ux-build')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1440, 'height': 1000})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        state = {'fail': False}

        async def route_api(route):
            url = route.request.url
            if '/api/signals/portfolio' in url:
                return await route.fulfill(json={'open': [], 'stats': {}})
            if '/api/signals' in url:
                if state['fail']:
                    return await route.fulfill(status=503, json={'detail': 'Temporary failure'})
                return await route.fulfill(json=copy.deepcopy(FIXTURE))
            if '/api/rv-forecast' in url:
                return await route.fulfill(status=503, json={})
            return await route.fulfill(json={})

        await page.route('**/api/**', route_api)
        await page.goto('http://127.0.0.1:4191/signals?market=IN')
        await page.locator('.signal-setup-card').first.wait_for()

        async def check(ok, name):
            print(('PASS ' if ok else 'FAIL ') + name, flush=True)
            if not ok:
                failures.append(name)

        await check(await page.locator('.signal-data-status').count() == 0, 'provider panel removed')
        await check(await page.locator('.signal-setup-card__levels').is_visible(), 'levels visible without disclosure')
        await check('levels locked' not in (await page.locator('.signal-setup-cards').first.inner_text()).lower(), 'no misleading locked badge')
        await check('open position' in (await page.locator('.signal-setup-card__state').first.inner_text()).lower(), 'existing position is not labelled qualifying')
        for width in [1440, 800, 390, 320]:
            await page.set_viewport_size({'width': width, 'height': 844})
            await page.locator('#signal-options').evaluate('(e) => e.open = false')
            await page.get_by_role('link', name='Options', exact=True).click()
            await check(await page.locator('.oc-summary-card').is_visible(), f'Options navigation reveals content at {width}')
            # Open manually only to inspect the pre-fix rendering too.
            await page.locator('#signal-options').evaluate('(e) => e.open = true')
            await check(await page.locator('.oc-stats .bias-BEARISH').count() == 0, 'missing PCR is not bearish')
            await check('-100.0%' not in await page.locator('.oc-summary-card').inner_text(), 'missing max pain has no drift')
            await check(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'no overflow at {width}')
        await page.get_by_role('link', name='Portfolio', exact=True).click()
        await page.locator('#signal-portfolio').evaluate('(e) => e.open = true')
        await check(await page.get_by_text('The model book is all cash.').is_visible(), 'mobile empty portfolio is visible')
        state['fail'] = True
        await page.get_by_role('button', name='Refresh snapshot', exact=True).click()
        await page.wait_for_timeout(500)
        await check(await page.get_by_text('Could not refresh signals. Showing the previous snapshot.').is_visible(), 'failed refresh is surfaced with cached data')
        await check(not errors, f'no page errors: {errors}')
        await page.screenshot(path=str(ROOT / '.tmp/signals-ux-mobile.png'), full_page=True)
        await browser.close()
    server.shutdown()
    assert not failures, failures


asyncio.run(main())
