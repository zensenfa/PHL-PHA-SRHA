# Browser smoke test (Playwright/Chromium): the Content-Security-Policy is enforced and the app works under it.
# Asserts: no policy violations while using the app (navigation, exports, print view, PDF/DOCX/XLSX/TXT import),
# and that script injected through markup does not run.
# Run after `python3 build.py`:  python3 tests/browser/smoke_csp.py
import asyncio, os
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
URL = 'file://' + os.path.join(ROOT, 'dist/Railway_Hazard_Analysis_Suite.html')
DOCS = os.path.join(ROOT, 'tests/fixtures/docs')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(accept_downloads=True); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and 'ERR_CONNECTION_REFUSED' not in m.text else None)
        await pg.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sample || '').slice(0, 60)));")
        await pg.goto(URL); await pg.wait_for_timeout(1000)
        meta = await pg.get_attribute('meta[http-equiv="Content-Security-Policy"]', 'content')
        assert meta and "default-src 'none'" in meta and "'unsafe-inline'" not in meta.split('script-src')[1].split(';')[0], 'strict script policy present'
        await pg.click('#btn-demo-project'); await pg.wait_for_timeout(1500)
        for st in ['profile', 'definition', 'identification', 'analysis', 'requirements', 'reports']:
            await pg.click(f'.rail-btn[data-stage="{st}"]'); await pg.wait_for_timeout(300)
        # document import: TXT, DOCX, XLSX, PDF (pdf.js worker is a blob: worker)
        await pg.click('.rail-btn[data-stage="definition"]'); await pg.click('#def-tabs [data-tab="documents"]'); await pg.wait_for_timeout(300)
        before = await pg.locator('#cnt-documents').inner_text()
        for f in ['sample.txt', 'sample.docx', 'sample.xlsx', 'sample.pdf']:
            await pg.set_input_files('#doc-file-input', os.path.join(DOCS, f)); await pg.wait_for_timeout(2500)
        after = await pg.locator('#cnt-documents').inner_text()
        print('documents before/after import:', before, after)
        assert after != before, 'documents were imported under the policy'
        # exports and print view
        await pg.click('.rail-btn[data-stage="reports"]'); await pg.wait_for_timeout(500)
        async with pg.expect_download() as dl: await pg.locator('#export-grid [data-docx]').first.click()
        print('docx download:', (await dl.value).suggested_filename)
        async with pg.expect_popup() as pop: await pg.locator('#export-grid [data-print]').first.click()
        popup = await pop.value; await popup.wait_for_timeout(500)
        assert 'Druckansicht' in await popup.content(), 'print view renders under the policy'
        await popup.close()
        # normal use produced no violations
        errs_normal = list(errs)
        normal = await pg.evaluate('window.__csp')
        print('violations during normal use:', normal)
        assert not normal, normal
        # injected markup cannot execute, and the policy is what stops it
        await pg.evaluate("""() => { document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__pwn=1">');
          const s = document.createElement('script'); s.textContent = 'window.__pwn2=1'; document.body.appendChild(s); }""")
        await pg.wait_for_timeout(500)
        assert await pg.evaluate('window.__pwn') is None and await pg.evaluate('window.__pwn2') is None, 'injected script must not run'
        blocked = await pg.evaluate('window.__csp')
        print('blocked injection attempts:', blocked)
        assert any(v.startswith('script-src-attr') for v in blocked) and any(v.startswith('script-src-elem') for v in blocked), blocked
        print('errors:', errs_normal[:3])
        await b.close()
asyncio.run(main())
