# Demo dry run (Playwright/Chromium): the full presentation storyline on the
# built-in Lynx demo, security level 0 -> 3, with report exports saved to
# dist/demo-exports/. Run after `python3 build.py`:  python3 tests/browser/dryrun_demo.py
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
URL = 'file://' + os.path.join(ROOT, 'dist/Railway_Hazard_Analysis_Suite.html')
OUT = os.path.join(ROOT, 'dist/demo-exports'); os.makedirs(OUT, exist_ok=True)
async def export(pg, sel, name):
    async with pg.expect_download() as dl:
        await pg.click(sel)
    d = await dl.value; await d.save_as(os.path.join(OUT, name)); return name
async def level(pg, n, reason):
    await pg.click('.rail-btn[data-stage="profile"]'); await pg.wait_for_timeout(300)
    await pg.select_option('[data-pf="security.level"]', str(n)); await pg.wait_for_timeout(150)
    await pg.fill('#profile-reason', reason); await pg.click('#btn-profile-apply'); await pg.wait_for_timeout(600)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(accept_downloads=True); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1800)
        print('1 demo:', await pg.evaluate('window.RHAS_APP.state.project.name'))
        await pg.click('.rail-btn[data-stage="profile"]'); await pg.wait_for_timeout(300)
        print('2 profile:', await pg.inner_text('#profile-status'), '| level', await pg.input_value('[data-pf="security.level"]'))
        await pg.click('.rail-btn[data-stage="reports"]'); await pg.wait_for_timeout(300)
        print('3 export L0:', await export(pg, '[data-docx="full"]', 'SA_Stufe0.docx'))
        await level(pg, 1, 'Demo: Security-Stufe 1')
        await pg.click('.rail-btn[data-stage="definition"]'); await pg.wait_for_timeout(300)
        print('4 L1 security context filled:', await pg.evaluate("['secAttacker','secTransmission','secAccess','secMaintenance','secUpdate','secKeys'].every(k => window.RHAS_APP.state.sd[k])"))
        await pg.click('.rail-btn[data-stage="analysis"]'); await pg.wait_for_timeout(300)
        await pg.evaluate("window.RHAS_APP.stages.analysis.open('H-0002')"); await pg.wait_for_timeout(300)
        print('5 H-0002 shows deliberate cause:', 'intentional' in await pg.input_value('#an-causes'))
        await pg.click('#an-save') if await pg.locator('#an-save').count() else None
        await pg.wait_for_timeout(400)
        print('5b deliberate causes survive save:', await pg.evaluate("window.RHAS_APP.state.hazards.find(h => h.id === 'H-0002').causes.filter(c => c.kind === 'intentional').length"))
        await level(pg, 2, 'Demo: Security-Stufe 2')
        await pg.click('#rail-security'); await pg.wait_for_timeout(300)
        print('6 L2 threats:', await pg.locator('#tbl-threats tbody tr[data-i]').count(), '| kpis:', (await pg.inner_text('#threat-kpis')).replace('\n', ' '))
        await level(pg, 3, 'Demo: Security-Stufe 3 (Vorschau)')
        await pg.click('#rail-security'); await pg.wait_for_timeout(300)
        print('7 L3 zones/conduits:', await pg.locator('#tbl-zones tbody tr[data-z]').count(), await pg.locator('#tbl-conduits tbody tr[data-c]').count())
        print('  findings:', (await pg.inner_text('#zone-findings')).replace('\n', ' | ')[:300])
        await pg.click('.rail-btn[data-stage="reports"]'); await pg.wait_for_timeout(300)
        for k in ['full', 'hazlog', 'srs']:
            print('8 export L3:', await export(pg, f'[data-docx="{k}"]', f'{k}_Stufe3.docx'))
        print('8 export L3:', await export(pg, '#btn-xlsx', 'Arbeitsmappe_Stufe3.xlsx'))
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
