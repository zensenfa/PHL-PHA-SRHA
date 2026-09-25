# Browser smoke test (Playwright/Chromium): zones/conduits, security level 3 (WP5).
# Run after `python3 build.py`:  python3 tests/browser/smoke_zones.py
import asyncio, os
from playwright.async_api import async_playwright
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '../../dist/Railway_Hazard_Analysis_Suite.html'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1800)
        await pg.click('.rail-btn[data-stage="profile"]'); await pg.wait_for_timeout(300)
        await pg.select_option('[data-pf="security.level"]', '3'); await pg.fill('#profile-reason', 'Stufe 3'); await pg.click('#btn-profile-apply'); await pg.wait_for_timeout(600)
        await pg.click('#rail-security'); await pg.wait_for_timeout(300)
        print('zones section visible:', await pg.is_visible('#zones-section'))
        await pg.click('#btn-zone-add'); await pg.wait_for_timeout(400)
        await pg.fill('#z-name', 'Warnkette'); await pg.check('[data-zattr="safetyRelated"]'); await pg.check('[data-zattr="wireless"]')
        await pg.check('[data-zfn="F-0001"]'); await pg.check('[data-zfn="F-0002"]')
        await pg.select_option('#z-sl', '3'); await pg.fill('#z-slr', 'Lizenzfreier Funk')
        await pg.locator('#drawer-body details summary').nth(2).click(); await pg.check('[data-zsr="SR 3.1"]')
        await pg.click('#z-save'); await pg.wait_for_timeout(400)
        await pg.select_option('[data-zsrreq="SR 3.1"]', 'R-0001'); await pg.click('#z-save'); await pg.wait_for_timeout(400)
        print('zone:', await pg.evaluate('JSON.stringify(window.RHAS_APP.state.zones[0].srRequirements) + " SL" + window.RHAS_APP.state.zones[0].slT'))
        await pg.click('#btn-conduit-add'); await pg.wait_for_timeout(400)
        print('conduit drawer:', await pg.inner_text('#drawer-title'))
        print('findings:', (await pg.inner_text('#zone-findings'))[:160].replace('\n', ' | '))
        print('case rows:', await pg.locator('#tbl-case tbody tr').count())
        await pg.click('.rail-btn[data-stage="reports"]'); await pg.wait_for_timeout(400)
        async with pg.expect_download() as dl:
            await pg.click('[data-docx="full"]')
        print('download ok:', (await dl.value).suggested_filename.endswith('.docx'))
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
