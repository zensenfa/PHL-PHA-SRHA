#!/usr/bin/env python3
"""Ollama-Modelle fuer Rechner ohne Internet uebertragen (Plan B, Air-Gap).

  export:  python3 ollama_pack.py export qwen3.5:27b modell.tar
  import:  python3 ollama_pack.py import modell.tar
  pruefen: python3 ollama_pack.py verify modell.tar

Packt Manifest und alle referenzierten Blobs eines Modells aus dem Ollama-
Modellverzeichnis (OLLAMA_MODELS, sonst ~/.ollama/models) mit einer SHA-256-
Liste. Beim Import wird jede Datei gegen ihren Digest geprueft, bevor sie ins
Modellverzeichnis kopiert wird. Danach ist das Modell mit `ollama list` sichtbar."""
import hashlib, json, os, sys, tarfile, io, shutil

def models_dir():
    return os.environ.get('OLLAMA_MODELS') or os.path.join(os.path.expanduser('~'), '.ollama', 'models')

def manifest_path(root, name):
    model, _, tag = name.partition(':'); tag = tag or 'latest'
    parts = model.split('/')
    if len(parts) == 1: parts = ['registry.ollama.ai', 'library'] + parts
    elif len(parts) == 2: parts = ['registry.ollama.ai'] + parts
    return os.path.join(root, 'manifests', *parts, tag)

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()

def export(name, out):
    root = models_dir(); mp = manifest_path(root, name)
    if not os.path.isfile(mp): sys.exit(f'Manifest nicht gefunden: {mp}')
    man = json.load(open(mp))
    digests = [man['config']['digest']] + [l['digest'] for l in man.get('layers', [])]
    sums = []
    with tarfile.open(out, 'w') as tar:
        tar.add(mp, arcname=os.path.relpath(mp, root)); sums.append(f"{sha256(mp)}  {os.path.relpath(mp, root)}")
        for d in digests:
            blob = os.path.join(root, 'blobs', d.replace(':', '-'))
            if not os.path.isfile(blob): sys.exit(f'Blob fehlt: {blob}')
            tar.add(blob, arcname=os.path.relpath(blob, root)); sums.append(f"{d.split(':')[1]}  {os.path.relpath(blob, root)}")
        data = ('\n'.join(sums) + '\n').encode(); ti = tarfile.TarInfo('SHA256SUMS'); ti.size = len(data); tar.addfile(ti, io.BytesIO(data))
    print(f'{name}: {len(digests)} Dateien -> {out}')

def _bad_name(n):
    return n.startswith(('/', '\\')) or '\\' in n or ':' in n.split('/')[0] or '..' in n.split('/')

def _hash_member(tar, m):
    h = hashlib.sha256()
    with tar.extractfile(m) as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()

def verify(tar_path, extract_to=None):
    with tarfile.open(tar_path) as tar:
        try: sums_raw = tar.extractfile('SHA256SUMS').read().decode()
        except KeyError: sys.exit('SHA256SUMS fehlt im Archiv')
        sums = {}
        for l in sums_raw.split('\n'):
            if not l: continue
            if '  ' not in l: sys.exit(f'Ungueltige Zeile in SHA256SUMS: {l}')
            h, p = l.split('  ', 1); sums[p] = h
        names = set()
        for m in tar.getmembers():
            if m.name == 'SHA256SUMS': continue
            if _bad_name(m.name): sys.exit(f'Unzulaessiger Pfad im Archiv: {m.name}')
            if not m.isfile(): sys.exit(f'Unzulaessiger Eintrag (kein regulaeres File): {m.name}')
            if m.name not in sums: sys.exit(f'Datei nicht in SHA256SUMS: {m.name}')
            if _hash_member(tar, m) != sums[m.name]: sys.exit(f'Pruefsumme falsch: {m.name}')
            names.add(m.name)
        missing = set(sums) - names
        if missing: sys.exit(f'In SHA256SUMS gelistet, aber nicht im Archiv: {sorted(missing)[0]}')
        if extract_to:
            root = os.path.realpath(extract_to)
            for m in tar.getmembers():
                if m.name == 'SHA256SUMS': continue
                dest = os.path.realpath(os.path.join(extract_to, m.name))
                if not dest.startswith(root + os.sep): sys.exit(f'Unzulaessiger Pfad im Archiv: {m.name}')
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with tar.extractfile(m) as src, open(dest, 'wb') as dst: shutil.copyfileobj(src, dst)
    print('Pruefsummen in Ordnung' + (f', importiert nach {extract_to}' if extract_to else ''))

if __name__ == '__main__':
    if len(sys.argv) < 3: sys.exit(__doc__)
    cmd = sys.argv[1]
    if cmd == 'export' and len(sys.argv) == 4: export(sys.argv[2], sys.argv[3])
    elif cmd == 'verify': verify(sys.argv[2])
    elif cmd == 'import': verify(sys.argv[2], models_dir())
    else: sys.exit(__doc__)
