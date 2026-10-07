#!/usr/bin/env python3
"""Build the single-file RHAS application from the source tree.

Usage:  python3 build.py [--out dist/Railway_Hazard_Analysis_Suite.html]

The output is one self-contained, offline HTML file. Source files keep CRLF
line endings byte-for-byte (see .gitattributes); the build only concatenates.
"""
import json, os, re, sys, argparse

ROOT = os.path.dirname(os.path.abspath(__file__))
CR = b'\r\n'

def rd(p):
    with open(os.path.join(ROOT, p), 'rb') as f:
        return f.read()

def body(p):
    """File content without its final CRLF (the build re-adds line breaks)."""
    b = rd(p)
    if not b.endswith(CR):
        raise SystemExit(f'{p}: must end with CRLF')
    return b[:-2]

def script_body(p, vendor=False):
    """Body of a file that is inlined into a <script> element. A literal </script (or, outside vendor
    libraries, <!--) would end or confuse the element, so the build fails instead of emitting a broken page.
    Vendor libraries contain <!-- only inside strings/regexes that are never followed by <script."""
    b = body(p)
    if re.search(rb'</script', b, re.I) or (not vendor and b'<!--' in b):
        raise SystemExit(f'{p}: contains </script or <!-- and cannot be inlined into a <script> element')
    return b

def check_manifest(man):
    listed = set(man['modules']) | set(man['vendor'])
    found = {os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/')
             for d, _, fs in os.walk(os.path.join(ROOT, 'src')) for f in fs if f.endswith('.js')}
    missing = sorted(found - listed)
    if missing:
        raise SystemExit('not in build-manifest.json (would be silently dropped): ' + ', '.join(missing))
    absent = sorted(p for p in listed if not os.path.isfile(os.path.join(ROOT, p)))
    if absent:
        raise SystemExit('listed in build-manifest.json but missing: ' + ', '.join(absent))

def data_json():
    load = lambda n: json.loads(rd('src/data/' + n).decode('utf-8'))
    data = {
        'calibration': load('calibration.json'),
        'sil': load('sil.json'),
        'sources': load('hazard-sources.json')['sources'],
        'guidewords': load('guidewords.json')['guidewords'],
        'modes': load('modes.json')['modes'],
        'demo': load('demo-project.json'),
        'domains': load('domains.json'),
        'security': load('security.json'),
    }
    # '<' is escaped so that no string in the data can contain a literal </script or <!-- (valid JSON and JS).
    return json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').encode('utf-8')

def build():
    man = json.loads(rd('build-manifest.json'))
    check_manifest(man)
    version = rd('src/VERSION').decode().strip()
    parts = [
        body('src/head.html'),
        b'<style>', body('src/styles.css'), b'</style>',
        b'</head>', b'<body>',
        body('src/markup.html'),
        b'<script>window.RHAS_DATA = ' + data_json() + b';',
        b'window.RHAS_VERSION = "' + version.encode() + b'";</script>',
    ]
    for v in man['vendor']:
        tag = b'<script type="application/json" id="pdf-worker-source">' if v.endswith('pdf.worker.min.js') else b'<script>'
        parts += [tag, script_body(v, vendor=True), b'</script>']
    for m in man['modules']:
        parts += [b'<script>', f'// ==== {m} ===='.encode(), script_body(m), b'</script>']
    parts += [b'</body>', b'</html>', b'']
    return CR.join(parts)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='dist/Railway_Hazard_Analysis_Suite.html')
    a = ap.parse_args()
    out = os.path.join(ROOT, a.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    html = build()
    with open(out, 'wb') as f:
        f.write(html)
    print(f'built {a.out} ({len(html):,} bytes)')
