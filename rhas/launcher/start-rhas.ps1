# Starter fuer die Railway Hazard Analysis Suite (Windows, ohne Administratorrechte).
# Liefert die HTML-Datei aus diesem Ordner unter http://127.0.0.1:8765 aus, damit
# der Browser eine echte Herkunft sendet, die Ollama standardmaessig zulaesst.
# Nur an 127.0.0.1 gebunden: von anderen Rechnern nicht erreichbar.
param([int]$Port = 8765, [string]$File = "")
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $File) { $File = (Get-ChildItem -Path $dir -Filter "Railway_Hazard_Analysis_Suite*.html" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
if (-not $File -or -not (Test-Path $File)) { Write-Error "Keine Railway_Hazard_Analysis_Suite*.html neben dem Starter gefunden."; exit 1 }
$bytes = [System.IO.File]::ReadAllBytes($File)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$url = "http://127.0.0.1:$Port/"
Write-Host "RHAS laeuft unter $url  (Datei: $(Split-Path -Leaf $File)). Fenster schliessen oder Strg+C beendet den Starter."
Start-Process $url
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream)
      $request = $reader.ReadLine()
      while ($reader.ReadLine()) { }
      if ($request -match '^GET (/|/index\.html)(\?.*)? HTTP') {
        $head = "HTTP/1.1 200 OK`r`nContent-Type: text/html; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
        $h = [System.Text.Encoding]::ASCII.GetBytes($head); $stream.Write($h, 0, $h.Length); $stream.Write($bytes, 0, $bytes.Length)
      } else {
        $h = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 404 Not Found`r`nContent-Length: 0`r`nConnection: close`r`n`r`n"); $stream.Write($h, 0, $h.Length)
      }
      $stream.Flush()
    } catch { } finally { $client.Close() }
  }
} finally { $listener.Stop() }
