#!/usr/bin/env python3
"""Tool validation run for RHAS: build, Node test suite (JUnit), browser smoke
tests and the demo dry run. Writes docs/validation/validation-run.json, the
evidence base of the tool report (docs/werkzeugnachweis)."""
import json, os, subprocess, datetime, xml.etree.ElementTree as ET, hashlib, re, platform
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs/validation'); os.makedirs(OUT, exist_ok=True)
def run(cmd, env=None):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, env={**os.environ, **(env or {})})
build = run(['python3', 'build.py'])
html = os.path.join(ROOT, 'dist/Railway_Hazard_Analysis_Suite.html')
sha = hashlib.sha256(open(html, 'rb').read()).hexdigest()
files = sorted(f for f in os.listdir(os.path.join(ROOT, 'tests')) if f.endswith('.test.js'))
suites = {}
for f in files:
    dest = os.path.join(OUT, f.replace('.test.js', '.junit.xml'))
    run(['node', '--test', '--test-reporter=junit', '--test-reporter-destination=' + dest, 'tests/' + f], {'TZ': 'UTC'})
    for tc in ET.parse(dest).getroot().iter('testcase'):
        status = 'skipped' if tc.find('skipped') is not None else 'failed' if (tc.find('failure') is not None or tc.find('error') is not None) else 'passed'
        suites.setdefault(f, []).append({'name': tc.get('name'), 'status': status})
browser = []
for s in sorted(os.listdir(os.path.join(ROOT, 'tests/browser'))):
    if not s.endswith('.py'): continue
    r = run(['python3', 'tests/browser/' + s])
    errs = re.findall(r"^errors: (.*)$", r.stdout, re.M)
    page_errors = [e for e in (errs[-1] if errs else '').strip("[]").split("', '") if e and 'ERR_CONNECTION_REFUSED' not in e]
    ok = r.returncode == 0 and bool(errs) and not page_errors
    browser.append({'script': s, 'status': 'passed' if ok else 'failed', 'output': r.stdout.strip().splitlines()[-12:]})
git = run(['git', 'rev-parse', '--short', 'HEAD']).stdout.strip()
res = {
    'date': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
    'version': open(os.path.join(ROOT, 'src/VERSION')).read().strip(), 'commit': git,
    'build_sha256': sha, 'build_ok': build.returncode == 0,
    'node': run(['node', '--version']).stdout.strip(), 'python': platform.python_version(),
    'suites': suites, 'browser': browser,
}
json.dump(res, open(os.path.join(OUT, 'validation-run.json'), 'w'), ensure_ascii=False, indent=1)
n = sum(len(v) for v in suites.values()); p = sum(1 for v in suites.values() for t in v if t['status'] == 'passed')
print(f"build ok={res['build_ok']} sha={sha[:12]} | node tests {p}/{n} | browser {sum(b['status']=='passed' for b in browser)}/{len(browser)}")
