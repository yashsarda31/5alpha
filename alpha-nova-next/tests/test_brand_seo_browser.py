"""Built-app SEO, navigation and startup budget checks. Start vite preview first."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('SEO_PREVIEW_URL', 'http://127.0.0.1:4188')
OUTPUT = Path(__file__).resolve().parents[2] / '.tmp' / 'brand-seo-qa'
OUTPUT.mkdir(parents=True, exist_ok=True)

def schema(page):
    return page.locator('#page-schema').evaluate('(element) => JSON.parse(element.textContent)')

with sync_playwright() as p:
    browser = p.chromium.launch()
    rows = []
    # Crawlers and people without JavaScript receive the brand, content and links.
    context = browser.new_context(java_script_enabled=False)
    page = context.new_page()
    response = page.goto(BASE)
    assert response.status == 200
    assert page.get_by_role('heading', level=1).inner_text() == 'Above Alpha Solutions'
    assert page.get_by_role('link', name='Stock screener').get_attribute('href') == '/screener'
    assert page.locator('meta[name="robots"]').get_attribute('content').startswith('index,')
    context.close()

    for width, reduced, save_data in [(390, False, False), (1440, True, False), (1440, False, True), (320, False, False), (1440, False, False)]:
        context = browser.new_context(viewport={'width': width, 'height': 900}, service_workers='block', reduced_motion='reduce' if reduced else 'no-preference')
        if save_data:
            context.add_init_script('Object.defineProperty(navigator, "connection", {value: {saveData:true}})')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/api/**', lambda route: route.fulfill(status=200, content_type='application/json', body='{}'))
        page.goto(BASE + '/?utm_source=seo-test', wait_until='networkidle')
        page.get_by_role('heading', level=1, name='Above Alpha Solutions').wait_for()
        assert page.url.endswith('/?utm_source=seo-test'), page.url
        assert page.locator('h1').count() == 1
        assert page.title() == 'Above Alpha Solutions | Alpha Nova Market Research'
        assert page.locator('link[rel="canonical"]').get_attribute('href') == 'https://abovealphasolutions.com/'
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
        resources = page.evaluate('performance.getEntriesByType("resource").filter(r=>r.name.endsWith(".js")).map(r=>({url:r.name.split("/").pop(),bytes:r.decodedBodySize}))')
        names = [row['url'] for row in resources]
        assert not any('MagicCanvas' in name or 'gsap' in name or 'Plot-' in name for name in names), names
        assert sum(row['bytes'] for row in resources) < 360000, resources
        # Validate the delayed effect policy, including desktop graceful fallback.
        page.wait_for_timeout(4500)
        names_later = page.evaluate('performance.getEntriesByType("resource").map(r=>r.name)')
        permitted = width > 760 and not reduced and not save_data
        assert any('MagicCanvas-' in name for name in names_later) == permitted
        page.screenshot(path=str(OUTPUT / f'home-{width}-{reduced}-{save_data}.png'), full_page=True)
        # A SPA navigation must update canonical, Twitter and schema together.
        nav = page.get_by_role('navigation', name='Mobile navigation' if width < 768 else 'Primary navigation', exact=True)
        nav.get_by_role('link', name='Signals', exact=True).click()
        page.wait_for_url('**/signals')
        page.wait_for_function('document.title.includes("Indian Market Signals")')
        assert page.locator('meta[name="twitter:title"]').get_attribute('content') == page.title()
        assert schema(page)['@graph'][-1]['url'] == 'https://abovealphasolutions.com/signals'
        nav.get_by_role('link', name='Watchlist', exact=True).click()
        page.wait_for_url('**/watchlist')
        page.wait_for_function('document.querySelector("meta[name=robots]").content.startsWith("noindex")')
        assert page.locator('#page-schema').count() == 0
        page.goto(BASE + '/signals/', wait_until='networkidle')
        assert page.locator('meta[name="robots"]').get_attribute('content').startswith('index,')
        assert page.locator('link[rel="canonical"]').get_attribute('href') == 'https://abovealphasolutions.com/signals'
        assert not errors, errors
        rows.append(dict(width=width, reduced_motion=reduced, save_data=save_data, initial_js_bytes=sum(row['bytes'] for row in resources), resources=resources))
        context.close()
    browser.close()
    (OUTPUT / 'results.json').write_text(json.dumps(rows, indent=2))
    print(json.dumps(rows, indent=2))
