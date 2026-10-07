@echo off
rem Doppelklick-Starter fuer Windows: ruft start-rhas.ps1 ohne Aenderung der Systemrichtlinie auf.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-rhas.ps1" %*
