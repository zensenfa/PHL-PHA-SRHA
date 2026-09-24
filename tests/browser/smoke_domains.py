# Browser smoke test (Playwright/Chromium): domain packs and Lynx demo (WP4).
# Run after `python3 build.py`:  python3 tests/browser/smoke_domains.py
import asyncio, os
from playwright.async_api import async_playwright
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '../../dist/Railway_Hazard_Analysis_Suite.html'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1800)
        print('demo:', await pg.evaluate('window.RHAS_APP.state.project.name'))
        print('hazards/reqs:', await pg.evaluate('[window.RHAS_APP.state.hazards.length, window.RHAS_APP.state.requirements.length]'))
        await pg.click('.rail-btn[data-stage="profile"]'); await pg.wait_for_timeout(400)
        form = await pg.inner_text('#profile-form')
        print('pack shown:', 'EN 16704' in form)
        # new rolling stock project
        await pg.click('#btn-new-project'); await pg.fill('#new-project-name', 'Fahrzeug'); await pg.click('#btn-create-project'); await pg.wait_for_timeout(800)
        await pg.select_option('[data-pf="domain"]', 'rollingStock'); await pg.wait_for_timeout(200)
        form = await pg.inner_text('#profile-form')
        print('rolling stock pack:', 'EN 14752' in form, '| ccs std gone:', 'EN 16704' not in form)
        await pg.evaluate("window.RHAS_APP.state.projectProfile = {...window.RHAS_APP.state.profileDraft}")
        await pg.click('.rail-btn[data-stage="definition"]'); await pg.wait_for_timeout(300)
        await pg.click('#btn-fn-templates'); await pg.wait_for_timeout(300)
        print('drawer:', (await pg.inner_text('#drawer-title')))
        await pg.click('#tpl-add'); await pg.wait_for_timeout(600)
        print('functions:', await pg.evaluate('window.RHAS_APP.state.functions.map(f => f.id + " " + f.name)'))
        await pg.click('[data-tab="interfaces"]'); await pg.wait_for_timeout(200)
        await pg.click('#btn-if-templates'); await pg.wait_for_timeout(300); await pg.click('#tpl-add'); await pg.wait_for_timeout(500)
        print('interfaces:', await pg.evaluate('window.RHAS_APP.state.interfaces.length'))
        await pg.click('[data-tab="functions"]'); await pg.wait_for_timeout(200)
        await pg.click('#btn-fn-templates'); await pg.wait_for_timeout(300)
        print('duplicates disabled:', await pg.locator('[data-tpl]:disabled').count())
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
