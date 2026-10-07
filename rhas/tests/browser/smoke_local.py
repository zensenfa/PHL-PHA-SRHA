# Browser smoke test (Playwright/Chromium): local operation settings (Plan B).
# Starts the Linux launcher, compares file:// and http://127.0.0.1 behaviour.
# Run after `python3 build.py`:  python3 tests/browser/smoke_local.py
import asyncio, os, subprocess, shutil, tempfile, time
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
HTML = os.path.join(ROOT, 'dist/Railway_Hazard_Analysis_Suite.html')
async def settings_state(pg):
    await pg.click('#btn-provider'); await pg.wait_for_timeout(200)
    vis = await pg.is_visible('#file-origin-warning')
    opts = await pg.locator('#set-provider option').all_inner_texts()
    await pg.click('#settings-close'); return vis, len(opts)
async def main():
    tmp = tempfile.mkdtemp(); shutil.copy(HTML, tmp); shutil.copy(os.path.join(ROOT, 'launcher/start-rhas.sh'), tmp)
    srv = subprocess.Popen(['bash', os.path.join(tmp, 'start-rhas.sh')], env={**os.environ, 'PORT': '8766'}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.5)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); errs = []
            pg = await b.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file://' + HTML); await pg.wait_for_timeout(1000)
            vis, n = await settings_state(pg); print('file:// warning visible:', vis, '| provider options:', n)
            pg2 = await b.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)))
            await pg2.goto('http://127.0.0.1:8766/'); await pg2.wait_for_timeout(1000)
            vis2, _ = await settings_state(pg2); print('launcher warning visible:', vis2, '| origin:', await pg2.evaluate('location.origin'))
            await pg2.click('#btn-demo-project'); await pg2.wait_for_timeout(1500)
            await pg2.evaluate("window.RHAS_APP.state.projectProfile.dataClassification = 'confidential'")
            for prov, url in [('openai-compat', 'http://127.0.0.1:1234'), ('openai-compat', 'https://api.example.com'), ('mistral-api', '')]:
                ok = await pg2.evaluate(f"(() => {{ const A = window.RHAS_APP; A.settings.provider = '{prov}'; A.settings.compatUrl = '{url}'; return A.aiAllowed(); }})()")
                print(f'confidential + {prov} {url}: allowed={ok}')
            print('errors:', errs[:3])
            await b.close()
    finally: srv.terminate()
asyncio.run(main())
