"""Browser regression checks for the standalone private owner dashboard (synthetic data)."""
import copy
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
HTML = (ROOT / 'web/public/owner-analytics.html').read_text(encoding='utf-8')
assert HTML == (ROOT / 'alphanova48-growth-dashboard.html').read_text(encoding='utf-8')
routes = json.loads((ROOT / 'vercel.json').read_text())['routes']
assert any(r.get('dest') == '/web/owner-analytics.html' and r.get('headers', {}).get('x-robots-tag', '').startswith('noindex') for r in routes)
FIXTURE = {
    'generated_at': '2026-09-07T07:00:00Z',
    'totals': {'users': 42, 'new_7d': 3, 'new_previous_7d': 1, 'ever_logged_in': 20, 'active_7d': 8, 'active_30d': 18, 'active_sessions': 12},
    'growth': [{'date': '2026-09-06', 'new': 1, 'total': 41}, {'date': '2026-09-07', 'new': 1, 'total': 42}],
    'recent': [{'email': 'privateperson@example.test', 'createdAt': '2026-09-06T10:00:00Z', 'lastLoginAt': None}],
    'traffic': {'unique_ever': 311, 'unique_7d': 105, 'unique_30d': 200, 'today': 0, 'tracked_since': '2026-06-01T00:00:00Z', 'last_received_at': '2026-09-07T06:59:00Z', 'coverage': 'Recorded browsers only; earlier unrecorded visits unavailable.', 'daily': [{'date': '2026-09-06', 'visitors': 9, 'visits': 12}, {'date': '2026-09-07', 'visitors': 0, 'visits': 0}], 'campaigns': [
        {'date': '2026-09-01', 'source': 'youtube', 'medium': 'paid_video', 'campaign': 'launch', 'landing': '/', 'visits': 5},
        {'date': '2026-09-06', 'source': 'youtube', 'medium': 'paid_video', 'campaign': 'launch', 'landing': '/', 'visits': 7},
        {'date': '2026-08-20', 'source': 'youtube', 'medium': 'paid_video', 'campaign': 'launch', 'landing': '/', 'visits': 30},
        {'date': '2026-09-07', 'source': '<img src=x onerror=alert(1)>', 'medium': '', 'campaign': '', 'landing': '/', 'visits': 1},
    ], 'timezone': 'Asia/Kolkata'},
}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel=os.environ.get('OWNER_TEST_BROWSER', 'chrome'))
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    calls = []
    data = copy.deepcopy(FIXTURE)
    failed = [False]
    def intercept(route):
        if route.request.url == 'http://localhost:4179/owner-analytics.html':
            route.fulfill(status=200, content_type='text/html', body=HTML)
        elif route.request.url == 'http://localhost:4179/api/admin/metrics':
            calls.append(route.request)
            route.fulfill(status=503 if failed[0] else 200, content_type='application/json', body=json.dumps(data))
        else:
            route.abort()
    page.route('**/*', intercept)
    page.goto('http://localhost:4179/owner-analytics.html')
    assert page.locator('#apiUrl').input_value() == 'http://localhost:4179/api/admin/metrics'
    for target in ['https://example.com/api/admin/metrics', 'https://abovealphasolutions.com/api/admin/metrics?key=leak', 'https://abovealphasolutions.com/api/admin/metrics#leak', 'https://abovealphasolutions.com:444/api/admin/metrics']:
        page.locator('#apiUrl').fill(target)
        page.locator('#adminKey').fill('synthetic-secret')
        page.locator('#connectButton').click()
        assert page.locator('#connectError').is_visible()
        assert not calls, 'Untrusted destination received admin key'
    page.locator('#apiUrl').fill('http://localhost:4179/api/admin/metrics')
    page.locator('#adminKey').fill('synthetic-secret')
    page.locator('#connectButton').click()
    page.locator('#dashboardView').wait_for(state='visible')
    assert len(calls) == 1
    assert calls[0].headers['x-admin-metrics-key'] == 'synthetic-secret'
    assert 'synthetic-secret' not in calls[0].url
    assert page.locator('#adminKey').input_value() == ''
    assert page.evaluate('localStorage.length + sessionStorage.length') == 0
    assert '311' in page.locator('#kpiGrid').inner_text()
    assert 'Lifetime recorded browsers' in page.locator('#kpiGrid').text_content()
    assert page.locator('.kpi').filter(has_text='Visitors today').locator('.kpi-value').inner_text() == '0'
    assert 'privateperson' not in page.locator('#recentTable').inner_text()
    assert 'pr•••@example.test' in page.locator('#recentTable').inner_text()
    assert page.locator('#campaignTable img').count() == 0
    assert page.locator('#campaignTable tbody tr').first.locator('td').last.inner_text() == '42'
    page.locator('[data-days="7"]').click()
    assert page.locator('#campaignTable tbody tr').first.locator('td').last.inner_text() == '12'
    assert '7 days' in page.locator('#campaignSubtitle').inner_text()
    page.locator('#campaignLabel').fill('september_ad')
    page.locator('#landingPath').select_option('/signals')
    assert page.locator('#campaignUrl').input_value() == 'https://abovealphasolutions.com/signals?utm_source=youtube&utm_medium=paid_video&utm_campaign=september_ad'
    if os.environ.get('OWNER_TEST_SCREENSHOTS'):
        folder = ROOT / '.tmp' / 'owner-dashboard-qa'
        folder.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(folder / 'desktop.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.screenshot(path=str(folder / 'mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
    page.locator('#campaignLabel').fill('private@example.test')
    assert page.locator('#campaignUrl').input_value() == ''
    failed[0] = True
    page.locator('#refreshButton').click()
    page.locator('#refreshError').wait_for(state='visible')
    assert '311' in page.locator('#kpiGrid').inner_text(), 'Failed refresh erased last snapshot'
    failed[0] = False
    data['traffic']['unique_ever'] = None
    data['traffic']['last_received_at'] = None
    page.locator('#refreshButton').click()
    page.locator('#refreshError').wait_for(state='hidden')
    assert page.locator('.kpi').filter(has_text='Lifetime recorded browsers').locator('.kpi-value').inner_text() == 'Unavailable'
    assert 'No saved-event time' in page.locator('#collectionHealth').inner_text()
    data.pop('traffic')
    page.locator('#refreshButton').click()
    page.wait_for_function("document.querySelector('#collectionHealth').textContent.includes('Traffic reporting is unavailable')")
    assert '42' in page.locator('#kpiGrid').inner_text()
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'Page overflow at {width}px'
    page.locator('#disconnectButton').click()
    assert page.locator('#recentTable').inner_html() == ''
    assert page.locator('#connectView').is_visible()
    assert not errors, errors
    browser.close()
print('PASS: auth destination restrictions, header-only credentials, lifetime/null/zero states, period campaign aggregation, safe labels, stale snapshots, masked accounts, builder and 320/390px layout')
