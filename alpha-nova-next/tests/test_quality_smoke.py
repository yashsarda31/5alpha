"""Production-preview smoke with synthetic data and no external requests.

Build, start npm run preview on 4178, then run this file with Python Playwright.
"""
import json
import unittest
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright, expect

STAMP = '2026-09-23T15:30:00+05:30'
DATA = {
    '/api/dashboard': {'indices': [{'name': 'NIFTY 50', 'last': 100, 'change_pct': 1,
        'spark': [98, 99, 100], 'as_of': STAMP, 'source': 'Local test fixture'}],
        'movers': [{'ticker': 'RELIANCE.NS', 'last': 100, 'change_pct': 1}],
        'market_open': False, 'pulse_names': ['NIFTY 50']},
    '/api/signals': {'data_status': {'status': 'stale', 'required_inputs_complete': False,
        'observed_at': STAMP}, 'regime': {'overall': 'NEUTRAL'},
        'setups': {'plans': [{'symbol': 'RELIANCE', 'side': 'LONG', 'score': 80,
            'entry': 100, 'stop': 95, 'target': 110}], 'watchlist': []}},
    '/api/chart/RELIANCE.NS': {'ticker': 'RELIANCE.NS', 'dates': ['2026-09-21', '2026-09-22', '2026-09-23'],
        'open': [98, 99, 100], 'high': [100, 101, 102], 'low': [97, 98, 99], 'close': [99, 100, 101]},
    '/api/fundamentals/RELIANCE.NS': {'name': 'Local test company', 'marketCap': 1000000, 'trailingPE': 20},
}
DATA['/api/chart/^NSEI'] = {**DATA['/api/chart/RELIANCE.NS'], 'ticker': '^NSEI'}
DATA['/api/fundamentals/^NSEI'] = {'name': 'Local test index'}


class ProductionSmoke(unittest.TestCase):
    def test_core_pages_mobile_and_desktop(self):
        with sync_playwright() as runtime:
            browser = runtime.chromium.launch(channel='chrome', headless=True)
            try:
                for width in [390, 1440]:
                    with self.subTest(width=width):
                        context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block')
                        errors = []

                        def route_request(route):
                            parsed = urlparse(route.request.url)
                            if parsed.hostname != '127.0.0.1':
                                return route.abort()
                            if parsed.path.startswith('/api/'):
                                return route.fulfill(status=200, content_type='application/json',
                                    body=json.dumps(DATA.get(unquote(parsed.path), {})))
                            return route.continue_()

                        context.route('**/*', route_request)
                        page = context.new_page()
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        for path, title in [('/dashboard', 'Today'),
                                            ('/signals', 'Signals'), ('/chart', 'Analyse'), ('/watchlist', 'Watchlist'),
                                            ('/chart?symbol=%5ENSEI&market=IN', 'Analyse')]:
                            page.goto('http://127.0.0.1:4178' + path)
                            expect(page.get_by_role('heading', name=title, exact=True)).to_be_visible()
                            if path == '/signals':
                                expect(page.get_by_text('Nonactionable snapshot', exact=True)).to_be_visible()
                                self.assertEqual(page.get_by_text('Withheld', exact=True).count(), 3)
                            if path == '/chart':
                                expect(page.get_by_text('Local test company', exact=True)).to_be_visible()
                            if 'symbol=' in path:
                                expect(page.get_by_text('Local test index', exact=True)).to_be_visible()
                                self.assertEqual(page.locator('.an-analyse__quote > strong').inner_text(), '101.00')
                                self.assertNotIn('United States', page.locator('.an-analyse__hero').inner_text())
                            self.assertFalse(page.evaluate('document.documentElement.scrollWidth > innerWidth'), path)
                        self.assertEqual(errors, [])
                        context.close()
            finally:
                browser.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
