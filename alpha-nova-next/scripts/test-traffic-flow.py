"""Built app -> real local API -> owner dashboard. All data is synthetic."""
import json
import mimetypes
import os
from pathlib import Path
import sys
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / '.tmp/owner-dashboard-build'
sys.path.insert(0, str(ROOT))

with tempfile.TemporaryDirectory(prefix='owner-traffic-qa-') as directory:
    os.environ['ALPHANOVA_DB_DIR'] = directory
    os.environ.pop('VERCEL', None)
    os.environ.pop('BLOB_READ_WRITE_TOKEN', None)
    os.environ['ADMIN_METRICS_KEY'] = 'local-fixture-only'
    from api import main
    from fastapi.testclient import TestClient
    from playwright.sync_api import sync_playwright
    api = TestClient(main.app)
    assert api.get('/api/admin/metrics').status_code == 403
    traffic_requests = []

    def intercept(route):
        request = route.request
        url = urlsplit(request.url)
        if url.hostname != 'localhost':
            route.abort()
            return
        if url.path.startswith('/api/analytics/'):
            response = api.request(request.method, url.path, json=request.post_data_json)
            traffic_requests.append((url.path, request.post_data_json, response.status_code))
            route.fulfill(status=response.status_code, content_type='application/json', body=response.text)
        elif url.path == '/api/admin/metrics':
            response = api.get(url.path, headers={'X-Admin-Metrics-Key': request.headers.get('x-admin-metrics-key', '')})
            route.fulfill(status=response.status_code, content_type='application/json', body=response.text)
        elif url.path.startswith('/api/'):
            route.fulfill(status=200, content_type='application/json', body='{}')
        else:
            path = (BUILD / url.path.lstrip('/')).resolve()
            if not path.is_relative_to(BUILD.resolve()):
                route.abort()
                return
            if path.is_dir():
                path = path / 'index.html'
            if not path.is_file():
                path = BUILD / 'index.html'
            kind = 'application/javascript' if path.suffix == '.js' else mimetypes.guess_type(str(path))[0] or 'application/octet-stream'
            route.fulfill(status=200, content_type=kind, body=path.read_bytes())

    def metrics():
        response = api.get('/api/admin/metrics', headers={'X-Admin-Metrics-Key': 'local-fixture-only'})
        assert response.status_code == 200
        return response.json()['traffic']

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel='chrome')
        context = browser.new_context(service_workers='block')
        context.route('**/*', intercept)
        page = context.new_page()
        page.goto('http://localhost:4199/?utm_source=youtube&utm_medium=paid_video&utm_campaign=first&gclid=secret#private')
        page.wait_for_function("localStorage.getItem('alphanova_analytics_site_visit_day') !== null")
        assert metrics()['unique_ever'] == 1
        assert metrics()['campaigns'][0]['campaign'] == 'first'
        assert metrics()['campaigns'][0]['landing'] == '/'
        assert 'secret' not in json.dumps(traffic_requests)
        page.reload()
        page.wait_for_load_state('networkidle')
        assert sum(row['visits'] for row in metrics()['campaigns']) == 1
        page.goto('http://localhost:4199/signals?utm_source=youtube&utm_medium=paid_video&utm_campaign=second')
        page.wait_for_load_state('networkidle')
        assert metrics()['unique_ever'] == 1
        assert sum(row['visits'] for row in metrics()['campaigns']) == 2
        assert {row['campaign'] for row in metrics()['campaigns']} == {'first', 'second'}
        assert all(status == 202 for _, _, status in traffic_requests)
        assert not any('/_vercel/' in path for path, _, _ in traffic_requests)
        owner = context.new_page()
        owner.goto('http://localhost:4199/owner-analytics.html')
        owner.locator('#adminKey').fill('local-fixture-only')
        owner.locator('#connectButton').click()
        owner.locator('#dashboardView').wait_for(state='visible')
        assert owner.locator('.kpi').filter(has_text='Lifetime recorded browsers').locator('.kpi-value').inner_text() == '1'
        assert owner.locator('#campaignTable tbody tr').count() == 2
        assert 'Last saved event' in owner.locator('#collectionHealth').inner_text()
        device = page.evaluate("localStorage.getItem('alphanova_analytics_device_id')")
        assert api.request('DELETE', '/api/analytics/device', json={'device_id': device}).status_code == 200
        assert metrics()['unique_ever'] == 0
        assert metrics()['campaigns'] == []
        browser.close()
print('PASS: built root landing attribution, reload deduplication, second campaign, durable API, private dashboard and deletion')
