# Browser smoke test (Playwright/Chromium): profile wizard, AI gate, demo, report cards.
# Run after `python3 build.py`:  python3 tests/browser/smoke_profile.py
import asyncio, sys
from playwright.async_api import async_playwright
import os
URL='file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '../../dist/Railway_Hazard_Analysis_Suite.html'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page()
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:'+m.text) if m.type=='error' else None)
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        # new project -> profile stage
        await pg.click('#btn-new-project'); await pg.fill('#new-project-name','Smoke'); await pg.click('#btn-create-project')
        await pg.wait_for_timeout(800)
        vis = await pg.is_visible('#stage-profile'); print('profile stage visible after create:', vis)
        print('status:', await pg.inner_text('#profile-status'))
        print('confirm disabled:', await pg.is_disabled('#btn-profile-confirm'))
        for k,v in [('role','supplier'),('domain','rollingStock'),('safetyCaseType','genericProduct'),('country','DE')]:
            await pg.select_option(f'[data-pf="{k}"]', v)
        await pg.fill('[data-pf="superiorSystem"]','Fahrzeug'); await pg.dispatch_event('[data-pf="superiorSystem"]','input')
        await pg.fill('[data-pf="security.justification"]','Test'); await pg.dispatch_event('[data-pf="security.justification"]','input')
        print('confirm disabled after fill:', await pg.is_disabled('#btn-profile-confirm'))
        await pg.click('#btn-profile-confirm'); await pg.wait_for_timeout(500); print('toast1:', await pg.inner_text('#toast'), errs)
        print('status:', await pg.inner_text('#profile-status'), '| rail:', await pg.inner_text('#pct-profile'))
        await pg.select_option('[data-pf="dataClassification"]','confidential')
        print('apply btn:', await pg.inner_text('#btn-profile-apply'))
        await pg.fill('#profile-reason','Kundendaten'); await pg.click('#btn-profile-apply'); await pg.wait_for_timeout(500)
        print('log rows:', await pg.locator('#tbl-profile-log tbody tr').count())
        # AI gate: default provider ollama -> allowed; switch settings provider to mistral via localStorage and try decomposition
        await pg.evaluate("window.RHAS_APP.settings.provider='mistral-api'")
        await pg.click('.rail-btn[data-stage="definition"]'); await pg.wait_for_timeout(300)
        print('banner hidden:', await pg.is_hidden('#profile-banner'))
        await pg.fill('#stage-definition textarea >> nth=0','x') if False else None
        await pg.evaluate("window.RHAS_APP.state.sd.description='Test'")
        await pg.click('#btn-decompose'); await pg.wait_for_timeout(300)
        print('toast:', await pg.inner_text('#toast'))
        # demo project + reports
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1500)
        print('demo banner hidden:', await pg.is_hidden('#profile-banner'), '| rail:', await pg.inner_text('#pct-profile'))
        await pg.click('.rail-btn[data-stage="reports"]'); await pg.wait_for_timeout(500)
        print('cards:', [t.split('\n')[0] for t in await pg.locator('.export-card b').all_inner_texts()])
        async with pg.expect_download() as dl:
            await pg.click('[data-docx="hazlog"]')
        d = await dl.value; print('download:', d.suggested_filename)
        print('errors:', errs[:5])
        await b.close()
asyncio.run(main())
