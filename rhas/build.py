#!/usr/bin/env python3
"""Build the single-file RHAS application from the source tree.

Usage:  python3 build.py [--out dist/Railway_Hazard_Analysis_Suite.html]

The output is one self-contained, offline HTML file. Source files keep CRLF
line endings byte-for-byte (see .gitattributes); the build only concatenates.
"""
import json, os, sys, argparse

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
    return json.dumps(data, ensure_ascii=False).encode('utf-8')

def build():
    man = json.loads(rd('build-manifest.json'))
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
        parts += [tag, body(v), b'</script>']
    for m in man['modules']:
        parts += [b'<script>', f'// ==== {m} ===='.encode(), body(m), b'</script>']
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
