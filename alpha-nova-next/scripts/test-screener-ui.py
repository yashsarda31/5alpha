"""Browser regression for a locally served production build; API fixtures only."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('SCREENER_TEST_ORIGIN', 'http://127.0.0.1:8765')
OUT = Path(__file__).resolve().parents[2] / '.tmp' / 'screener-qa'
OUT.mkdir(parents=True, exist_ok=True)


def fixture(mode):
    rows = [dict(ticker=symbol, price=price, priceDate='2026-09-04', sma200=price + 10,
                 dist200=-5.5, rsNewHigh=True, rsRatio=0.1, volumeRatio=1.8,
                 peRatio=45, roe=25, epsGrowth=30, divYield=3, momentum=20, alphaScore=65,
                 benchmark='^NSEI', reasons=['Close below 200 DMA', 'RS above prior 63-session high', 'P/E ≥ 40'])
            for symbol, price in [('TCS.NS', 100), ('INFY.NS', 200)]]
    incomplete = [{'ticker': 'MISSING.NS', 'reason': 'Needs 200 completed sessions'}]
    if mode == 'empty':
        rows, incomplete = [], []
    elif mode == 'unavailable':
        rows = []
        incomplete = [{'ticker': symbol, 'reason': 'Provider data unavailable'} for symbol in ['TCS.NS', 'INFY.NS', 'MISSING.NS']]
    return dict(data=rows, requested=3, scanned=3-len(incomplete), matched=len(rows),
                non_matches=3-len(incomplete)-len(rows), incomplete_count=len(incomplete), incomplete=incomplete,
                truncated=False, price_dates=['2026-09-04'] if mode != 'unavailable' else [],
                source='QA daily candle fixture', technical=True, generated_at='2026-09-05T10:00:00+00:00')


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    context.add_init_script("localStorage.setItem('alphanova_disclaimer_acknowledged_v1', '1')")
    page = context.new_page()
    errors, requests = [], []
    mode = 'normal'
    page.on('pageerror', lambda e: errors.append(str(e)))

    def api(route):
        if route.request.url.endswith('/api/screener'):
            requests.append(route.request.post_data_json)
            if mode == 'error':
                route.fulfill(status=503, json={'detail': 'Test provider unavailable'})
            else:
                route.fulfill(json=fixture(mode))
        else:
            route.fulfill(json={})

    page.route('**/api/**', api)
    page.goto(BASE + '/screener')
    expect(page.get_by_role('heading', name='Quant Screener', exact=True)).to_be_visible()
    expect(page.locator('.screen-preset')).to_have_count(6)
    page.locator('.screen-preset').filter(has_text='Find stocks below their long-term average.').click()
    expect(page.get_by_role('button', name='Remove Price below 200 DMA')).to_be_visible()
    page.get_by_role('button', name='Edit filters', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    page.get_by_label('Relative strength', exact=True).select_option('new_high')
    page.get_by_label('RS lookback', exact=True).select_option('63')
    page.get_by_label('Minimum P/E', exact=True).fill('40')
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).not_to_be_visible()
    expect(page.get_by_role('button', name='Edit filters', exact=True)).to_be_focused()
    expect(page.get_by_role('button', name='Remove P/E ≥ 40')).to_be_visible()
    page.get_by_role('button', name='Save screen', exact=True).click()
    page.get_by_label('Screen name', exact=True).fill('My RS leaders')
    page.get_by_role('button', name='Save on this browser', exact=True).click()
    page.reload()
    page.get_by_role('button', name='Saved (1)', exact=True).click()
    page.locator('.screen-preset').filter(has_text='My RS leaders').click()
    page.get_by_role('button', name='Run these rules', exact=True).click()
    expect(page.get_by_role('heading', name='2 matches / 3 stocks')).to_be_visible()
    assert requests[-1]['price_trend'] == 'below_200' and requests[-1]['rs_lookback'] == 63
    assert requests[-1]['min_pe'] == 40 and requests[-1]['rs_screen'] == 'new_high'
    expect(page.locator('.screen-coverage')).to_contain_text('1 incomplete')
    page.locator('.screen-incomplete summary').click()
    expect(page.locator('.screen-incomplete')).to_contain_text('Needs 200 completed sessions')
    page.locator('.screen-sort select').select_option('price')
    expect(page.locator('.screen-desktop tbody tr').first).to_contain_text('INFY')
    page.locator('.screen-desktop th button').filter(has_text='Scan close').focus()
    page.keyboard.press('Enter')
    expect(page.locator('.screen-desktop tbody tr').first).to_contain_text('TCS')
    page.get_by_label('Search results').fill('TCS')
    expect(page.locator('.screen-desktop tbody tr')).to_have_count(1)
    with page.expect_download() as download:
        page.get_by_role('button', name='Export CSV').click()
    download.value.save_as(str(OUT / 'screen-export.csv'))
    csv = (OUT / 'screen-export.csv').read_text(encoding='utf-8-sig')
    assert 'TCS.NS' in csv and 'INFY.NS' not in csv and '2026-09-04' in csv
    assert page.locator('.screen-desktop').get_by_role('link', name='TCS').get_attribute('href') == '/chart?symbol=TCS.NS'
    page.get_by_label('Search results').fill('')
    page.locator('.screen-ai summary').click()
    page.get_by_role('button', name='Generate brief', exact=True).click()
    expect(page.locator('.screen-ai')).to_contain_text('Add your Gemini API key')
    page.get_by_role('button', name='Remove P/E ≥ 40').click()
    expect(page.locator('.screen-pending')).to_contain_text('Filters changed')
    page.screenshot(path=str(OUT / 'desktop-results.png'), full_page=True)
    mode = 'error'
    page.get_by_role('button', name='Run these rules', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Test provider unavailable')
    expect(page.get_by_role('heading', name='2 matches / 3 stocks')).to_be_visible()
    mode = 'empty'
    page.get_by_role('button', name='Retry screen', exact=True).click()
    expect(page.get_by_role('heading', name='No stocks matched these rules')).to_be_visible()
    mode = 'unavailable'
    page.get_by_role('button', name='Run these rules', exact=True).click()
    expect(page.get_by_role('heading', name='No stocks could be evaluated')).to_be_visible()
    expect(page.locator('.screen-coverage')).to_contain_text('3 incomplete')
    mode = 'normal'
    page.get_by_role('button', name='Retry screen', exact=True).click()
    expect(page.get_by_role('heading', name='2 matches / 3 stocks')).to_be_visible()
    for width in [390, 320]:
        page.set_viewport_size({'width': width, 'height': 844})
        page.get_by_role('button', name='Technical', exact=True).click()
        page.locator('.screen-preset').filter(has_text='Find stocks below their long-term average.').click()
        page.get_by_role('button', name='Run these rules', exact=True).click()
        expect(page.locator('.screen-mobile')).to_be_visible()
        expect(page.locator('.screen-desktop')).not_to_be_visible()
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow at {width}px'
        page.locator('.screen-mobile details summary').first.click()
        expect(page.locator('.screen-mobile details').first).to_contain_text('Close below 200 DMA')
        page.screenshot(path=str(OUT / f'mobile-{width}.png'), full_page=True)
        page.get_by_role('button', name='Edit filters', exact=True).click()
        expect(page.get_by_role('dialog')).to_be_visible()
        bounds = page.get_by_role('dialog').bounding_box()
        assert bounds['width'] <= width + 1
        page.get_by_label('Minimum ROE (%)').fill('15')
        page.screenshot(path=str(OUT / f'filters-{width}.png'))
        page.get_by_role('button', name='Done ·', exact=False).click()
        expect(page.get_by_role('dialog')).not_to_be_visible()
    page.locator('.screen-mobile').get_by_role('button', name='Add TCS.NS to watchlist').click()
    expect(page).to_have_url(BASE + '/login?mode=signup')
    assert not errors, errors
    print(json.dumps({'status': 'PASS', 'browser_errors': errors, 'screen_requests': len(requests),
                      'viewports': [1440, 390, 320], 'checks': ['presets', 'editable filters', 'keyboard dialog',
                       'saved reload', 'payload', 'coverage', 'sort', 'search', 'CSV', 'chart link', 'AI missing key',
                       'changed filters', 'error retry', 'no matches', 'all incomplete', 'mobile details', 'watchlist auth']}))
    browser.close()
