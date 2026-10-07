# Browser smoke test (Playwright/Chromium): keyboard and assistive-technology behaviour. Asserts, does not just print.
# Run after `python3 build.py`:  python3 tests/browser/smoke_a11y.py
import asyncio, os
from playwright.async_api import async_playwright
URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '../../dist/Railway_Hazard_Analysis_Suite.html'))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1000)
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1500)
        # toast is a live region
        assert await pg.get_attribute('#toast', 'role') == 'status'
        # settings dialog: role, focus inside, Tab trap, Escape, focus returns to the opener
        await pg.focus('#btn-provider'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        assert await pg.get_attribute('#settings-panel', 'role') == 'dialog' and await pg.get_attribute('#settings-panel', 'aria-modal') == 'true'
        inside = lambda: pg.evaluate("document.getElementById('settings-panel').contains(document.activeElement)")
        assert await inside(), 'focus moves into the dialog'
        for _ in range(40):
            await pg.keyboard.press('Tab')
            assert await inside(), 'Tab must not leave a modal dialog'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        assert await pg.evaluate("document.activeElement.id") == 'btn-provider', 'focus returns to the opener'
        # clickable rows are keyboard operable; the drawer takes focus and gives it back
        await pg.click('.rail-btn[data-stage="analysis"]'); await pg.wait_for_timeout(500)
        rows = pg.locator('#stage-analysis tr[data-id]')
        n = await rows.count(); assert n > 0, 'demo has hazard rows'
        row = rows.first; assert await row.get_attribute('tabindex') == '0'
        await row.focus(); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        assert await pg.get_attribute('#drawer', 'role') == 'dialog'
        assert await pg.evaluate("document.getElementById('drawer').contains(document.activeElement)"), 'focus moves into the drawer'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        assert await pg.evaluate("document.activeElement.matches('tr[data-id]')"), 'focus returns to the row'
        # tab strips
        await pg.click('.rail-btn[data-stage="requirements"]'); await pg.wait_for_timeout(500)
        tabs = pg.locator('#rq-tabs .tab'); assert await tabs.count() >= 4
        assert await pg.get_attribute('#rq-tabs', 'role') == 'tablist'
        sel = await pg.evaluate("[...document.querySelectorAll('#rq-tabs .tab')].map(t => t.getAttribute('aria-selected'))")
        assert sel.count('true') == 1 and all(s in ('true', 'false') for s in sel), sel
        await tabs.nth(2).click(); await pg.wait_for_timeout(300)
        assert await tabs.nth(2).get_attribute('aria-selected') == 'true' and await tabs.nth(0).get_attribute('aria-selected') == 'false'
        # current stage is announced
        assert await pg.evaluate("document.querySelector('.rail-btn.active').getAttribute('aria-current')") == 'page'
        # every visible button has an accessible name
        unnamed = await pg.evaluate("""[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).filter(b => {
            const name = (b.getAttribute('aria-label') || b.textContent || b.title || '').trim(); return !name; }).map(b => b.id || b.outerHTML.slice(0, 80))""")
        assert not unnamed, unnamed
        short = await pg.evaluate("""[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && b.textContent.trim().length <= 2 && b.textContent.trim() && !b.getAttribute('aria-label')).map(b => b.outerHTML.slice(0, 80))""")
        assert not short, short
        print('a11y checks passed')
        print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
