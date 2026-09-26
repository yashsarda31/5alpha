"""User-flow regressions with isolated API fixtures; never writes to real accounts."""
import json
import os
import sys
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('APP_TEST_ORIGIN', 'http://127.0.0.1:5178')
failures = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)

    def run(name, check, authenticated=False, watchlist_failure=False):
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, service_workers='block')
        context.add_init_script("localStorage.setItem('alphanova_disclaimer_acknowledged_v1', '1')")
        if authenticated:
            context.add_init_script("""localStorage.setItem('alphanova_auth_token', 'qa-fixture');
                localStorage.setItem('alphanova_auth_user', JSON.stringify({id: 'qa', displayName: 'QA'}));""")
        page = context.new_page()
        errors, pending = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def api(route):
            path = urlparse(route.request.url).path
            if path == '/api/symbol-search':
                pending.append(route)
            elif path == '/api/auth/me':
                route.fulfill(json={'user': {'id': 'qa', 'displayName': 'QA'}})
            elif path == '/api/watchlist':
                if watchlist_failure:
                    route.fulfill(status=503, json={'detail': 'Temporarily unavailable'})
                else:
                    route.fulfill(json={'symbols': [dict(symbol=s, market='US') for s in ['AAPL', 'MSFT', 'NVDA']]})
            elif path.startswith('/api/watchlist/') and route.request.method == 'DELETE':
                if path.endswith('/AAPL'):
                    pending.append(route)
                else:
                    route.fulfill(json={'ok': True})
            else:
                route.fulfill(json={})

        page.route('**/api/**', api)
        try:
            page.goto(BASE + '/watchlist', wait_until='domcontentloaded', timeout=60000)
            expect(page.get_by_role('heading', name='Watchlist', exact=True)).to_be_visible()
            check(page, pending, errors)
            assert not errors, errors
            print('PASS:', name)
        except Exception as exc:
            failures.append(name)
            print('FAIL:', name, str(exc)[:900])
        finally:
            context.close()

    def result(route, symbol='AAPL'):
        route.fulfill(json={'results': [{'symbol': symbol, 'name': 'Apple', 'exchange': 'NASDAQ'}]})

    def dismissed_search(page, pending, errors):
        search = page.get_by_label('Add a symbol to your watchlist')
        search.fill('APPLE')
        page.wait_for_timeout(350)
        assert pending, 'Search request did not start'
        search.press('Escape')
        result(pending.pop())
        page.wait_for_timeout(150)
        expect(page.get_by_role('listbox')).not_to_be_visible()

    def stale_selection(page, pending, errors):
        search = page.get_by_label('Add a symbol to your watchlist')
        search.fill('APPLE')
        page.wait_for_timeout(350)
        result(pending.pop())
        expect(page.get_by_role('option')).to_be_visible()
        search.fill('MICROSOFT')
        search.press('ArrowDown')
        search.press('Enter')
        assert search.input_value() != 'AAPL', 'Old Apple result selected for a Microsoft query'

    def keyboard_semantics(page, pending, errors):
        search = page.get_by_label('Add a symbol to your watchlist')
        search.fill('APPLE')
        page.wait_for_timeout(350)
        result(pending.pop())
        expect(search).to_have_attribute('role', 'combobox')
        expect(search).to_have_attribute('aria-expanded', 'true')
        search.press('ArrowDown')
        active = search.get_attribute('aria-activedescendant')
        assert active and page.locator('[id="' + active + '"]').get_attribute('role') == 'option'
        search.press('Tab')
        expect(page.get_by_role('listbox')).not_to_be_visible()

    def failed_removal(page, pending, errors):
        page.get_by_role('button', name='Remove AAPL from watchlist').click()
        page.get_by_role('button', name='Remove MSFT from watchlist').click()
        assert pending, 'Delete request did not start'
        pending.pop().fulfill(status=503, json={'detail': 'Could not remove this stock'})
        expect(page.get_by_role('button', name='Remove AAPL from watchlist')).to_be_visible()
        expect(page.get_by_role('button', name='Remove MSFT from watchlist')).not_to_be_visible()
        expect(page.get_by_role('alert')).to_contain_text('Could not remove')

    def failed_load(page, pending, errors):
        expect(page.get_by_role('alert')).to_contain_text('Could not load your watchlist')
        expect(page.get_by_role('button', name='Retry watchlist')).to_be_visible()
        expect(page.get_by_role('heading', name='Your watchlist is empty')).not_to_be_visible()
        page.route('**/api/watchlist', lambda route: route.fulfill(json={'symbols': [{'symbol': 'NVDA', 'market': 'US'}]}))
        page.get_by_role('button', name='Retry watchlist').click()
        expect(page.get_by_role('button', name='Remove NVDA from watchlist')).to_be_visible()
        expect(page.get_by_role('alert')).not_to_be_visible()

    def failed_search_retry(page, pending, errors):
        search = page.get_by_label('Add a symbol to your watchlist')
        search.fill('APPLE')
        page.wait_for_timeout(350)
        pending.pop().fulfill(status=503, json={'detail': 'Temporary search failure'})
        search.fill('')
        search.fill('APPLE')
        page.wait_for_timeout(350)
        assert pending, 'Failed search was cached and could not be retried'
        result(pending.pop())
        expect(page.get_by_role('option')).to_be_visible()
        search.press('ArrowDown')
        search.press('Enter')
        expect(search).to_have_value('AAPL')
        expect(page.get_by_role('listbox')).not_to_be_visible()

    def mobile_news(page, pending, errors):
        page.set_viewport_size({'width': 320, 'height': 844})
        page.goto(BASE + '/news', wait_until='domcontentloaded', timeout=60000)
        expect(page.get_by_role('heading', name='Latest News')).to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'News overflows at 320px'

    def mobile_watchlist(page, pending, errors):
        for width in [390, 320]:
            page.set_viewport_size({'width': width, 'height': 844})
            search = page.get_by_label('Add a symbol to your watchlist').bounding_box()
            button = page.get_by_role('button', name='NSE', exact=True).bounding_box()
            separated = (search['y'] + search['height'] <= button['y']
                         or search['x'] + search['width'] <= button['x'])
            assert separated, f'Stock input overlaps the NSE button at {width}px'

    run('Escape cancels delayed search', dismissed_search)
    run('Editing clears stale selectable results', stale_selection)
    run('Autocomplete supports keyboard and screen readers', keyboard_semantics)
    run('Failed removal preserves other successful removals', failed_removal, authenticated=True)
    run('Failed watchlist load offers recovery', failed_load, authenticated=True, watchlist_failure=True)
    run('Search recovers after a provider failure', failed_search_retry)
    run('News fits narrow mobile screens', mobile_news)
    run('Watchlist controls do not overlap on mobile', mobile_watchlist)
    browser.close()

assert not failures, json.dumps(failures)
