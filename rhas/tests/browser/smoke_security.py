# Browser smoke test (Playwright/Chromium): security level 1 (WP5).
# Run after `python3 build.py`:  python3 tests/browser/smoke_security.py
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
        opts = await pg.locator('[data-pf="security.level"] option:not([disabled])').all_inner_texts()
        print('enabled levels:', [o[:7] for o in opts])
        await pg.select_option('[data-pf="security.level"]', '1'); await pg.wait_for_timeout(200)
        await pg.fill('#profile-reason', 'Security-Stufe 1 für die Demo'); await pg.click('#btn-profile-apply'); await pg.wait_for_timeout(600)
        print('toast:', await pg.inner_text('#toast'))
        await pg.click('.rail-btn[data-stage="definition"]'); await pg.wait_for_timeout(400)
        form = await pg.inner_text('#def-form')
        print('security fieldset:', 'Angreiferprofil' in form and 'Kategorie der Übertragung' in form)
        await pg.select_option('[data-key="secTransmission"]', '3'); await pg.wait_for_timeout(400)
        print('saved sd:', await pg.evaluate('window.RHAS_APP.state.sd.secTransmission'))
        await pg.click('.rail-btn[data-stage="identification"]'); await pg.wait_for_timeout(400)
        plan = await pg.evaluate("window.RHAS_ENGINE.planIdentification({securityLevel: window.RHAS_SECURITY.level(window.RHAS_APP.state.projectProfile), depth:'standard', functions: window.RHAS_APP.state.functions, interfaces: window.RHAS_APP.state.interfaces, modes: [], sources: []}).passes.filter(p => p.kind==='threat' || p.kind==='coeng').length")
        print('security passes planned:', plan, '| interfaces:', await pg.evaluate('window.RHAS_APP.state.interfaces.length'))
        await pg.click('.rail-btn[data-stage="analysis"]'); await pg.wait_for_timeout(400)
        await pg.evaluate("window.RHAS_APP.stages.analysis.open('H-0001')"); await pg.wait_for_timeout(400)
        print('security checkbox in measures:', await pg.locator('[data-m="securityRelated"]').count())
        await pg.click('.rail-btn[data-stage="reports"]'); await pg.wait_for_timeout(400)
        async with pg.expect_download() as dl:
            await pg.click('[data-docx="hazid"]')
        print('download:', (await dl.value).suggested_filename)
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
