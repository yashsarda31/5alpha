"""Built-app user flows using deterministic providers, desktop and mobile."""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

BASE = 'http://127.0.0.1:4191'
OUTPUT = Path(__file__).resolve().parents[2] / '.tmp' / 'fundamentals-qa'
OUTPUT.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        rows = []
        for width in (320, 390, 1440):
            context = await browser.new_context(viewport={'width':width, 'height':900}, reduced_motion='reduce', service_workers='block')
            page = await context.new_page()
            errors, requests = [], []
            page.on('pageerror', lambda err: errors.append(str(err)))
            failed = False
            async def provider(route):
                nonlocal failed
                url = route.request.url
                if '/api/fundamentals/' in url:
                    symbol = url.split('/api/fundamentals/')[1]
                    requests.append(symbol)
                    if symbol == 'BAD.NS' and not failed:
                        failed = True
                        await route.fulfill(status=503, json={'detail':'Company data is unavailable from the provider. Check the symbol and retry.'})
                        return
                    if symbol == 'MSFT': await asyncio.sleep(.3)
                    body = {'ticker':symbol, 'name':symbol+' company', 'marketCap':1000000000, 'totalCash':0, 'trailingPE':None, 'returnOnEquity':25, 'debtToEquity':50, 'freeCashflow':-1000000000,
                            'dataQuality':{'provider':'Yahoo Finance', 'retrievedAt':'2026-10-05T02:20:00Z', 'missingFields':['trailingPE'], 'fieldPeriods':{'returnOnEquity':'2026-03-31'}, 'fieldMethods':{'returnOnEquity':'Annual income / average common equity.'}}}
                    try: await route.fulfill(json=body)
                    except Exception: pass  # Browser cancelled an older company request.
                elif '/api/symbol-search' in url:
                    await route.fulfill(json={'results':[{'symbol':'TCS.NS', 'name':'Tata Consultancy Services', 'exchange':'NSE'}]})
                else: await route.fulfill(json={})
            await page.route('**/api/**', provider)
            await page.goto(BASE+'/fundamentals')
            await page.get_by_role('heading', name='RELIANCE.NS company (RELIANCE.NS)', exact=True).wait_for()
            assert requests == ['RELIANCE.NS'], requests
            assert await page.locator('h1').count() == 1
            assert await page.get_by_text('25.00%', exact=True).is_visible()
            assert await page.get_by_text('₹0.00B', exact=True).is_visible()
            assert await page.get_by_text('₹-1.00B', exact=True).is_visible()
            await page.get_by_text('Annual statement fields', exact=False).click()
            assert await page.get_by_text('ROE: annual', exact=False).is_visible()
            assert await page.get_by_text('N/A', exact=True).count() > 0
            await page.get_by_role('button', name='TCS', exact=True).click()
            await page.get_by_role('heading', name='TCS.NS company (TCS.NS)', exact=True).wait_for()
            assert 'symbol=TCS.NS' in page.url
            await page.get_by_role('combobox').fill('BAD')
            await page.get_by_role('button', name='Fetch Fundamentals').click()
            await page.get_by_role('button', name='Retry', exact=True).wait_for()
            assert await page.get_by_text('Company data is unavailable from the provider. Check the symbol and retry.', exact=True).is_visible()
            await page.get_by_role('button', name='Retry', exact=True).click()
            await page.get_by_role('heading', name='BAD.NS company (BAD.NS)', exact=True).wait_for()
            await page.get_by_role('button', name='US Market', exact=True).click()
            await page.get_by_role('heading', name='AAPL company (AAPL)', exact=True).wait_for()
            assert 'symbol=' not in page.url
            await page.get_by_role('button', name='MSFT', exact=True).click()
            await page.get_by_role('button', name='NVDA', exact=True).click()
            await page.get_by_role('heading', name='NVDA company (NVDA)', exact=True).wait_for()
            await page.wait_for_timeout(450)
            assert not await page.get_by_role('heading', name='MSFT company (MSFT)', exact=True).count()
            await page.goto(BASE+'/fundamentals?symbol=TCS.NS&market=IN')
            await page.get_by_role('heading', name='TCS.NS company (TCS.NS)', exact=True).wait_for()
            assert not await page.evaluate('document.documentElement.scrollWidth > innerWidth'), width
            await page.screenshot(path=str(OUTPUT/f'fundamentals-{width}.png'), full_page=True)
            assert not errors, errors
            rows.append({'width':width, 'company_requests':requests, 'uncaught_errors':errors})
            await context.close()
        context = await browser.new_context(java_script_enabled=False)
        page = await context.new_page()
        await page.goto(BASE+'/fundamentals/')
        assert await page.get_by_role('heading', level=1).inner_text() == 'Company Fundamentals'
        assert await page.get_by_role('heading', name='Why are some fields unavailable?').is_visible()
        assert await page.get_by_role('link', name='stock screener', exact=True).get_attribute('href') == '/screener'
        await context.close()
        await browser.close()
        (OUTPUT/'browser-results.json').write_text(json.dumps(rows, indent=2))
        print('PASS: desktop/mobile automatic loading, share links, retry, market switch, stale response protection, missing/zero/negative figures, no-JS SEO, no overflow or uncaught errors.')

asyncio.run(main())
