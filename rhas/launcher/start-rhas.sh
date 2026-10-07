#!/usr/bin/env bash
# Starter fuer Linux/macOS: liefert die RHAS-HTML-Datei unter http://127.0.0.1:8765 aus
# (nur lokal gebunden), damit Ollama die Herkunft ohne OLLAMA_ORIGINS=* zulaesst.
set -euo pipefail
PORT="${PORT:-8765}"
DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="${1:-$(ls -t "$DIR"/Railway_Hazard_Analysis_Suite*.html 2>/dev/null | head -1)}"
[ -f "$FILE" ] || { echo "Keine Railway_Hazard_Analysis_Suite*.html neben dem Starter gefunden." >&2; exit 1; }
URL="http://127.0.0.1:$PORT/"
echo "RHAS laeuft unter $URL (Datei: $(basename "$FILE")). Strg+C beendet den Starter."
( sleep 1; (xdg-open "$URL" || open "$URL") >/dev/null 2>&1 || true ) &
exec python3 - "$FILE" "$PORT" <<'PY'
import sys, http.server
path, port = sys.argv[1], int(sys.argv[2])
data = open(path, 'rb').read()
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] in ('/', '/index.html'):
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(data))); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data)
        else:
            self.send_response(404); self.send_header('Content-Length', '0'); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
PY
