# Browser smoke test (Playwright/Chromium): threat log, security level 2 (WP5).
# Run after `python3 build.py`:  python3 tests/browser/smoke_threatlog.py
import asyncio, os
from playwright.async_api import async_playwright
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '../../dist/Railway_Hazard_Analysis_Suite.html'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1800)
        print('rail hidden at level 0:', await pg.is_hidden('#rail-security'))
        await pg.click('.rail-btn[data-stage="profile"]'); await pg.wait_for_timeout(300)
        await pg.select_option('[data-pf="security.level"]', '2'); await pg.wait_for_timeout(200)
        await pg.fill('#profile-reason', 'Stufe 2'); await pg.click('#btn-profile-apply'); await pg.wait_for_timeout(600)
        print('rail visible at level 2:', await pg.is_visible('#rail-security'))
        # give lead hazard B a deliberate cause, then derive
        await pg.evaluate("""(async () => { const A = window.RHAS_APP; const h = A.state.hazards.find(x => x.id === 'H-0002'); h.causes.push({ text: 'Replay einer aufgezeichneten Ausschaltmeldung', kind: 'intentional' }); h.threats = ['repetition']; await A.saveHazard(h); })()""")
        await pg.wait_for_timeout(300)
        await pg.click('#rail-security'); await pg.wait_for_timeout(300)
        await pg.click('#btn-threat-derive'); await pg.wait_for_timeout(500)
        print('toast:', await pg.inner_text('#toast'))
        print('rows:', await pg.locator('#tbl-threats tbody tr[data-i]').count())
        await pg.click('#tbl-threats tbody tr[data-i]'); await pg.wait_for_timeout(300)
        print('impact proposal:', await pg.input_value('#th-imp'))
        await pg.select_option('#th-exp', '3'); await pg.select_option('#th-vul', '3'); await pg.wait_for_timeout(100)
        print('live risk:', await pg.inner_text('#th-risk'), '| likelihood:', await pg.inner_text('#th-lh'))
        await pg.fill('#th-exp-r', 'Lizenzfreier Funk'); await pg.fill('#th-vul-r', 'Keine Authentisierung bekannt'); await pg.fill('#th-imp-r', 'Unfall mit Personal')
        await pg.click('#th-add-cm'); await pg.wait_for_timeout(400)
        await pg.fill('[data-cm="0"] [data-c="text"]', 'Nachrichtenauthentisierung mit Sequenznummer')
        await pg.select_option('[data-cm="0"] [data-c="status"]', 'accepted')
        await pg.select_option('[data-cm="0"] [data-c="residualExposure"]', '1'); await pg.select_option('[data-cm="0"] [data-c="residualVulnerability"]', '1')
        await pg.check('[data-cm="0"] [data-c-req="R-0001"]')
        await pg.click('#th-save'); await pg.wait_for_timeout(500)
        print('residual:', await pg.inner_text('#th-res'))
        print('pct:', await pg.inner_text('#pct-security'))
        await pg.click('#drawer-close') if await pg.locator('#drawer-close').count() else None
        await pg.click('.rail-btn[data-stage="reports"]'); await pg.wait_for_timeout(400)
        async with pg.expect_download() as dl:
            await pg.click('[data-docx="full"]')
        print('download ok:', (await dl.value).suggested_filename.endswith('.docx'))
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
