# RHAS – Lokaler Betrieb mit eigener KI (Plan B)

Stand 27.09.2026 · gilt ab Build 2026-10-07-wp10

Die Railway Hazard Analysis Suite (RHAS) kann vollständig ohne Internet betrieben werden: die Anwendung ist eine HTML-Datei, die KI läuft lokal über **Ollama** oder über einen **OpenAI-kompatiblen Server** im eigenen Netz (LM Studio, llama-server, vLLM). Projekte mit der Datenklassifizierung „vertraulich“ lassen nur solche lokalen Anbieter zu.

## 1 Schnellstart (Einzelplatz)

1. Ollama installieren und ein Modell laden, z. B. `ollama pull mistral-small3.2`.
2. Für 32k-Kontext auf Grafikkarten mit wenig Speicher vor dem Start von Ollama setzen:
   `OLLAMA_FLASH_ATTENTION=1` und `OLLAMA_KV_CACHE_TYPE=q8_0`.
3. Die RHAS über den **Starter** öffnen, nicht per Doppelklick auf die HTML-Datei:
   - Windows: `start-rhas.cmd` (liegt neben der HTML-Datei)
   - Linux/macOS: `./start-rhas.sh`
   Die Anwendung öffnet sich unter `http://127.0.0.1:8765`.
4. In der RHAS oben rechts „KI“: Anbieter „Ollama“, Modell wählen, **Verbindung prüfen**. Die Prüfung zeigt Kontextlänge und Fähigkeiten des Modells und warnt, wenn die eingestellte Kontextlänge größer ist als vom Modell unterstützt.

**Warum der Starter?** Eine per Doppelklick geöffnete Datei sendet die Herkunft „null“, die Ollama standardmäßig ablehnt. Die Umgehung `OLLAMA_ORIGINS=*` würde **jeder besuchten Webseite** erlauben, das lokale Modell zu nutzen – deshalb nicht verwenden. Der Starter ist nur an 127.0.0.1 gebunden und von anderen Rechnern nicht erreichbar.

**Achtung beim Umstieg:** Projekte werden im Browser je Herkunft gespeichert. Projekte, die unter `file://` angelegt wurden, sind unter `http://127.0.0.1:8765` nicht sichtbar. Vorher „Projekt als JSON sichern“, danach importieren.

## 2 KI-Einstellungen für lokale Modelle

| Einstellung | Empfehlung | Zweck |
|---|---|---|
| Kontextlänge (num_ctx) | 32768 | Identifikationsaufrufe haben etwa 10 000–15 000 Token. Zu lange Prompts werden **abgewiesen** statt stillschweigend gekürzt; eine Kürzung durch Ollama wird erkannt und als Fehler gemeldet. |
| Denkmodus | Modellstandard; bei leeren oder unstrukturierten Antworten „aus“ testen | Einige Denkmodelle ignorieren sonst das Antwortschema oder liefern die Antwort nur im Denkfeld (wird abgefangen). |
| Modell geladen halten | 30m | Vermeidet Ladezeiten zwischen den Aufrufen eines Durchlaufs. |
| Leitworte je Funktion teilen | bei Modellen unter etwa 20 Mrd. Parametern „ja“ | Halbiert die Aufgabe je Aufruf (doppelte Anzahl Aufrufe). |

## 3 OpenAI-kompatibler Server (Ausweichweg, Mehrplatz)

Anbieter „Lokaler Server, OpenAI-kompatibel“, URL z. B. `http://127.0.0.1:1234` (LM Studio) oder `http://127.0.0.1:8080` (llama-server), Modellkennung aus der Modellliste. Die Struktur der Antwort wird als `json_schema` angefordert; lehnt der Server das ab, wird automatisch `json_object` verwendet.

Für einen **gemeinsamen Server im Netz**: Modellserver nur an localhost binden und über einen Reverse-Proxy mit Anmeldung freigeben – Ollama hat keine eigene Zugriffskontrolle. Server im privaten Netz (10.x, 172.16–31.x, 192.168.x, *.local) gelten als lokal im Sinne der Datenklassifizierung.

## 4 Hardware und Modelle (Stand September 2026, vor der Auswahl per Vergleichslauf prüfen)

| Hardware | Kandidaten | Erwartung |
|---|---|---|
| 16 GB Grafikspeicher + viel Arbeitsspeicher | gemma4 26B A4B (teilweise ausgelagert), gpt-oss:20b, mistral-small3.2 (knapp bei 32k) | lauffähig; Qualität im Vergleichslauf prüfen |
| 24–32 GB Grafikspeicher | gemma4:31b, gemma4 26B A4B, Qwen 3.6 27B | empfohlene Ausstattung |
| Arbeitsstation 64–128 GB / Mac | Mistral Small 4, gpt-oss-120b | am nächsten an Mistral Large |

Ein Standard-Durchlauf (45 Aufrufe) dauert lokal auf 24 GB etwa 1–2 Stunden (Cloud: 20–30 Minuten). Werte im Vergleichslauf bestätigen.

## 5 Vergleichslauf (Modellauswahl)

```
node scripts/bakeoff.js --provider ollama --model <modell> --depth schnell
node scripts/bakeoff.js --provider ollama --model <modell> --passes threat,coeng --security 1
```

Der Lauf nutzt das eingebaute Lynx-Beispiel und meldet: erfolgreiche Aufrufe (Schema eingehalten), Dauer, Anzahl Vorschläge, Treffer der sechs projektspezifischen Befunde und – mit `--security 1` – der Security-Befunde (Replay, Funkstörung, Parametrierung). Ergebnisse liegen unter `docs/validation/bakeoff-*.json`.

Vorgeschlagene Annahmekriterien: mindestens 98 % Aufrufe mit gültiger Struktur, mindestens 5 von 6 Projektbefunden, Deutsch von zwei Personen als brauchbar bewertet, Standard-Durchlauf höchstens 2 Stunden.

## 6 Rechner ohne Internet (Air-Gap)

1. Auf einem Rechner mit Internet: Modell laden, dann
   `python3 ollama_pack.py export mistral-small3.2 modell.tar`
2. Datei zusammen mit Ollama-Installer, RHAS-HTML, Startern und `ollama_pack.py` übertragen.
3. Auf dem Zielrechner: `python3 ollama_pack.py import modell.tar` – jede Datei wird gegen ihre SHA-256-Prüfsumme geprüft – dann `ollama list`.

## 7 Grenzen

- Der Windows-Starter ist ohne Administratorrechte lauffähig, wurde aber noch nicht auf einem Windows-Rechner getestet.
- Die Token-Schätzung für die Kontextprüfung ist bewusst vorsichtig (etwa 3 Zeichen je Token); bei Fehlmeldungen die Kontextlänge erhöhen.
- Die Qualität lokaler Modelle für die deutschen Prompts ist nur über den Vergleichslauf belegbar.
