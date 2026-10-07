# Browser smoke test (Playwright/Chromium): calibration editor (WP3).
# Run after `python3 build.py`:  python3 tests/browser/smoke_calibration.py
import asyncio, os
from playwright.async_api import async_playwright
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '../../dist/Railway_Hazard_Analysis_Suite.html'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1500)
        await pg.click('.rail-btn[data-stage="profile"]'); await pg.wait_for_timeout(400)
        print('apply disabled (no change):', await pg.is_disabled('#btn-cal-apply'))
        await pg.select_option('#cal-t-f', 'C2'); await pg.select_option('#cal-t-s', 'C5'); await pg.select_option('#cal-t-a', 'C7')
        await pg.click('#btn-cal-template'); await pg.wait_for_timeout(300)
        print('cells:', await pg.locator('[data-cell]').count(), '| apply disabled (empty matrix):', await pg.is_disabled('#btn-cal-apply'))
        print('invalid warning:', 'nicht existieren' in await pg.inner_text('#calibration-editor'))
        bad = {'F1': ['S1', 'S2', 'S3'], 'F2': ['S1', 'S2'], 'F3': ['S1']}
        for f in ['F1', 'F2', 'F3']:
            for s in ['S1', 'S2', 'S3', 'S4', 'S5']:
                await pg.select_option(f'[data-cell="{f}|{s}"]', 'Unacceptable' if s in bad[f] else 'Acceptable')
        print('apply disabled (filled):', await pg.is_disabled('#btn-cal-apply'))
        await pg.click('#btn-cal-apply'); await pg.wait_for_timeout(300)
        print('toast without reason:', await pg.inner_text('#toast'))
        await pg.fill('#cal-reason', 'Kalibrierung des Betreibers'); await pg.click('#btn-cal-apply'); await pg.wait_for_timeout(1500)
        print('toast:', await pg.inner_text('#toast'))
        print('profile log mentions calibration:', 'calibration' in await pg.inner_text('#tbl-profile-log'))
        await pg.fill('#cal-approver', 'Betreiber X'); await pg.click('#btn-cal-approve2'); await pg.wait_for_timeout(800)
        print('approved:', 'freigegeben: Betreiber X' in await pg.inner_text('#calibration-editor'))
        await pg.click('.rail-btn[data-stage="analysis"]'); await pg.wait_for_timeout(500)
        print('class filter options:', await pg.locator('#an-f-class option').all_inner_texts())
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
