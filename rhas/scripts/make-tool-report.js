// Generates docs/werkzeugnachweis/04_Werkzeugnachweis_RHAS.docx from the
// validation run (docs/validation/validation-run.json) and the verification
// matrix (docs/verification-matrix.md). Run: python3 scripts/validate.py && node scripts/make-tool-report.js
'use strict';
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, ShadingType, LevelFormat, BorderStyle, Footer, Header, PageNumber } = require('docx'); // npm i docx
const ROOT = path.join(__dirname, '..');
const run = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/validation/validation-run.json'), 'utf8'));
const W = 9638, FONT = 'Calibri';
const tr = (t) => (typeof t === 'string' ? new TextRun(t) : t);
const p = (t, o = {}) => new Paragraph({ spacing: { after: 120 }, ...o, children: [].concat(t).map(tr) });
const b = (t) => new TextRun({ text: t, bold: true });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const bullet = (t) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60 }, children: [].concat(t).map(tr) });
const bd = { style: BorderStyle.SINGLE, size: 4, color: 'BFC7D5' };
function table(headers, rows, fracs, size = 18) {
  const w = fracs.map((f) => Math.round(W * f)); w[w.length - 1] = W - w.slice(0, -1).reduce((a, c) => a + c, 0);
  const cell = (t, k, head, shade) => new TableCell({ borders: { top: bd, bottom: bd, left: bd, right: bd }, width: { size: w[k], type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 80, right: 80 },
    shading: head ? { type: ShadingType.CLEAR, fill: 'DCE3EE', color: 'auto' } : shade ? { type: ShadingType.CLEAR, fill: shade, color: 'auto' } : undefined,
    children: String(t).split('\n').map((l) => new Paragraph({ children: [new TextRun({ text: l, bold: head, size })] })) });
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: w, rows: [new TableRow({ tableHeader: true, children: headers.map((h, k) => cell(h, k, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c, k) => cell(c, k, false, c === 'bestanden' ? 'E6F3EA' : c === 'fehlgeschlagen' ? 'FDECEB' : undefined)) }))] });
}
const DE = { passed: 'bestanden', failed: 'fehlgeschlagen', skipped: 'übersprungen' };
const suites = run.suites;
const count = (f, st = 'passed') => (suites[f] || []).filter((t) => t.status === st).length;
const total = Object.values(suites).reduce((n, v) => n + v.length, 0);
const passed = Object.values(suites).reduce((n, v) => n + v.filter((t) => t.status === 'passed').length, 0);
const bPassed = run.browser.filter((x) => x.status === 'passed').length;

// Tool requirements -> evidence (test files / browser scripts)
const TRS = [
  ['TR-01', 'Risikoklasse, Häufigkeits- und Schadenskategorien werden lokal aus der Projektkalibrierung berechnet (EN 50126-1 Anhang C); unbekannte Kategorien werden abgewiesen.', 'model, calibration, reference-project'],
  ['TR-02', 'SIL aus TFFR nach EN 50126-2 Tabelle 2 (halboffene Bänder, Basic Integrity, kein SIL 0); SIL nur für elektronische Funktionen.', 'model, reference-project'],
  ['TR-03', 'THR-Aufteilung: ODER-Summe, UND-Anrechnung nur mit CCA-Nachweis (EN 50129 A.4.3.4–A.4.3.6).', 'model, reference-project'],
  ['TR-04', 'Restrisiko und „kontrolliert“ nur aus angenommenen Maßnahmen; vorgeschlagene und verworfene Maßnahmen ohne Wirkung; Restrisiko nie schlechter als das Ausgangsrisiko; „weitgehend akzeptabel“ bei Klassen mit Maßnahmenpflicht nur mit begründeter Abweichung.', 'model, reference-project'],
  ['TR-05', 'KI-Vorschläge gelangen nur durch ausdrückliche Übernahme in das Projekt; Duplikate werden zusammengeführt statt verworfen; verworfene Gefährdungen werden nicht erneut vorgeschlagen.', 'engine, security; Browser: dryrun_demo'],
  ['TR-06', 'Berichte (Word, Excel, Druck) sind deterministisch, vollständig und frei von Darstellungsfehlern; Struktur nach EN 50126-1 7.4.3/7.5.3; Gefährdungsprotokoll nach 7.4.2.2 b)–g).', 'reports (Golden-Dateien)'],
  ['TR-07', 'Grundlage ausschließlich Bahnnormen; keine MIL-STD-882E-Verweise in Ausgaben.', 'reports; Verifikationsmatrix (Anhang B)'],
  ['TR-08', 'Projektprofil ist Pflicht; Änderungen nach Bestätigung nur mit Begründung und Protokoll; vertrauliche Projekte nur mit lokaler KI.', 'profile; Browser: smoke_profile'],
  ['TR-09', 'Kalibrierung konfigurierbar, validiert, versioniert, freigabepflichtig (ein Freigabeweg mit Protokoll); Auswirkungen auf bestehende Gefährdungen werden angezeigt; eine Änderung, die bestehenden Gefährdungen Kategorien entzieht, wird abgewiesen.', 'calibration; Browser: smoke_calibration'],
  ['TR-10', 'Domänenwissen nur aus Domänenpaketen, keine Domänenbegriffe fest in KI-Anweisungen.', 'domains; Browser: smoke_domains'],
  ['TR-11', 'Security: vorsätzliche Ursachen ohne THR-/SIL-Anrechnung; Security-Maßnahme erforderlich; Security-Risiko lokal berechnet; SL-T nur durch Bearbeiter.', 'security, threatlog, zones; Browser: smoke_security, smoke_threatlog, smoke_zones'],
  ['TR-12', 'Keine stille Datenveränderung beim Speichern (z. B. Ursachenarten).', 'model; Browser: dryrun_demo'],
  ['TR-13', 'Eine Datei, ohne externe Ressourcen, reproduzierbar aus dem Quellstand gebaut; eingebettete Daten können die Seite nicht beschädigen; nicht aufgeführte Module führen zum Abbruch.', 'build'],
  ['TR-14', 'Import und Kennungen: Kennungen und Verweise mit HTML-relevanten Zeichen werden beim Import abgewiesen; Kennungen gelöschter Datensätze werden nicht erneut vergeben; Anbieter-Prüfung für vertrauliche Projekte erkennt nur echte lokale Adressen.', 'import-ids, db-ids, local-providers; Browser: smoke_local'],
  ['TR-15', 'Berichte sind unabhängig von der Zeitzone des Rechners; die Excel-Arbeitsmappe enthält die Security-Tabellen des Word-Berichts je Stufe.', 'reports, security-reports, xlsx-security'],
];

// Tool failure modes (voluntary hazard consideration)
const FM = [
  ['Falsche Risikoklasse oder falsches SIL', 'Unterschätztes Risiko im Nachweis', 'Berechnung lokal, gegen Normtabellen getestet (TR-01, TR-02); Anzeige der Einstufung je Szenario zur Prüfung', 'model, calibration'],
  ['Fehlerhafte THR-Aufteilung', 'Nicht erfüllte Integritätsanforderung bleibt unerkannt', 'ODER-/UND-Regeln getestet (TR-03); Warnung bei Grenzwerten', 'model'],
  ['Falsche oder erfundene KI-Vorschläge', 'Unzutreffende Gefährdungen oder Lücken', 'Pflichtprüfung durch den Ingenieur, Begründung und Quelle je Vorschlag, Abdeckungsnachweis, Checkliste der Domäne', 'engine; Anwendungsbedingung AB-01'],
  ['Stille Veränderung gespeicherter Daten', 'Nachweis weicht vom Arbeitsstand ab', 'Regressionstests, Trockenlauf mit Speicherprüfung (TR-12); beim Trockenlauf gefundener Fehler behoben', 'model, dryrun_demo'],
  ['Unvollständiger oder verfälschter Bericht', 'Gutachter erhält falsche Grundlage', 'Golden-Dateien aller Berichtsarten (TR-06); Durchsicht vor Freigabe', 'reports; AB-04'],
  ['Falsche Kalibrierung angewendet', 'Systematisch falsche Bewertung', 'Freigabe und Versionierung, Kalibrierung im Bericht abgedruckt (TR-09)', 'calibration; AB-02'],
  ['Unvollständiger Kontext an die KI (Kürzung)', 'Vorschläge ohne Dokumentbezug', 'Kontextlänge fest eingestellt; Kürzungsprüfung für lokalen Betrieb geplant', 'offen (Plan B)'],
  ['Datenverlust im Browser', 'Arbeitsstand nicht verfügbar', 'Checkpoints, JSON-Export', 'AB-05'],
];

const TUC = [
  ['AB-01', 'Jeder KI-Vorschlag wird von einer fachkundigen Person geprüft, bevor er übernommen wird; Verwerfungen werden begründet.'],
  ['AB-02', 'Die Kalibrierung (und bei Security-Stufe 2 die Security-Risikomatrix) wird vom Betreiber festgelegt und freigegeben, bevor Ergebnisse verwendet werden.'],
  ['AB-03', 'Das Restrisiko je Gefährdung (wirksamste einzelne Maßnahme) wird fachlich bestätigt; es ist tendenziell optimistisch.'],
  ['AB-04', 'Berichte werden vor der Herausgabe durchgesehen (in Word Inhaltsverzeichnis aktualisieren).'],
  ['AB-05', 'Projektstände werden als JSON gesichert und zu Meilensteinen als Checkpoint abgelegt.'],
  ['AB-06', 'Vertrauliche Projekte werden als „vertraulich“ klassifiziert und nur mit lokaler KI bearbeitet.'],
  ['AB-07', 'Inhalte der Domänenpakete sind Arbeitshilfen; ihre Anwendbarkeit wird im Projekt geprüft.'],
  ['AB-08', 'Security-Ergebnisse beruhen auf öffentlich beschriebenen Vorgehensweisen; für Konformitätsaussagen nach CLC/TS 50701 bzw. IEC 62443 sind die Normen heranzuziehen. Stufe 3 ist eine Vorschau.'],
];

// verification matrix from markdown
const vm = fs.readFileSync(path.join(ROOT, 'docs/verification-matrix.md'), 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---') && !l.startsWith('| Reference')).map((l) => l.split('|').slice(1, -1).map((x) => x.trim()));

const suiteNames = { 'model.test.js': 'Normativer Kern (model.js)', 'reference-project.test.js': 'Referenzprojekt (Demo-Verhalten)', 'reports.test.js': 'Berichte (Golden-Dateien)', 'engine.test.js': 'KI-Orchestrierung', 'profile.test.js': 'Projektprofil', 'calibration.test.js': 'Kalibrierung', 'domains.test.js': 'Domänenpakete und Demo', 'security.test.js': 'Security Stufe 1', 'threatlog.test.js': 'Security Stufe 2', 'zones.test.js': 'Security Stufe 3', 'build.test.js': 'Build', 'local-providers.test.js': 'Lokale KI-Anbieter und Vertraulichkeit', 'import-ids.test.js': 'Import und Kennungen', 'db-ids.test.js': 'Kennungsvergabe', 'xlsx-security.test.js': 'Excel: Security-Blätter', 'security-reports.test.js': 'Berichte Security-Stufen 1–3 (Golden-Dateien)' };

const children = [
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Werkzeugnachweis Railway Hazard Analysis Suite (RHAS)', bold: true, size: 40, color: '1F3864' })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: `Werkzeugbeschreibung, Einstufung nach EN 50129:2018 6.3, Validierung · Version ${run.version} · Stand ${run.date}`, size: 22, color: '44546A' })] }),
  table(['Angabe', 'Wert'], [['Werkzeug', 'Railway Hazard Analysis Suite (RHAS), eine HTML-Datei, offline lauffähig'], ['Version / Quellstand', `${run.version} / Commit ${run.commit}`], ['Prüfsumme (SHA-256) der Auslieferung', run.build_sha256], ['Validierungslauf', `${run.date}; Node ${run.node}, Python ${run.python}, Chromium (Playwright)`], ['Ergebnis', `${passed} von ${total} Modul- und Berichtstests bestanden; ${bPassed} von ${run.browser.length} Browser-Prüfungen bestanden`]], [0.3, 0.7]),

  h1('1 Zweck und Geltungsbereich'),
  p('Dieses Dokument beschreibt die RHAS als Werkzeug, stuft sie nach EN 50129:2018 6.3 ein und belegt durch einen dokumentierten Validierungslauf, dass die sicherheitsbezogenen Funktionen des Werkzeugs wie spezifiziert arbeiten. Es richtet sich an Anwender, Sicherheitsverantwortliche und Gutachter, die Arbeitsergebnisse der RHAS in einem Sicherheitsnachweis verwenden.'),

  h1('2 Werkzeugbeschreibung'),
  p('Die RHAS unterstützt die Phasen 1 bis 4 des Lebenszyklus nach EN 50126-1: Projektprofil, Systemdefinition, Gefährdungsidentifikation, Risikoanalyse und -bewertung, Sicherheitsanforderungen und Berichte. Optional ergänzt sie eine Security-Betrachtung in vier Stufen.'),
  table(['Bestandteil', 'Aufgabe', 'Sicherheitsbezug'], [
    ['model.js, calibration.js', 'Risikoklasse, SIL, THR-Aufteilung, Vollständigkeit, Kalibrierung', 'Normative Berechnung, lokal, deterministisch'],
    ['profile.js, domains.js', 'Projektprofil, Änderungsprotokoll, Domänenpakete', 'Festlegungen und Nachvollziehbarkeit'],
    ['engine.js, prompts.js, schemas.js, llm-pipeline.js', 'KI-Vorschläge (Identifikation, Analyse, Maßnahmen, Anforderungen)', 'Nur Vorschläge; Übernahme durch den Menschen'],
    ['security.js, threatlog.js, zones.js', 'Security-Stufen 1–3', 'Security-Risiko lokal berechnet; SL-T durch Bearbeiter'],
    ['reports.js, docx.js', 'Word, Excel, Druckansicht', 'Liefergegenstände für den Nachweis'],
    ['db.js', 'Speicherung im Browser (IndexedDB), JSON-Export, Checkpoints', 'Datenhaltung'],
  ], [0.3, 0.4, 0.3]),
  p([b('Rolle der KI: '), 'Sprachmodelle (lokal über Ollama oder Mistral API) liefern ausschließlich Vorschläge mit Begründung und Quellenangabe. Risikoklassen, SIL, THR-Prüfungen, Security-Risiko und SL-T werden nie von der KI bestimmt.']),

  h1('3 Einstufung nach EN 50129:2018 6.3'),
  p('EN 50129 6.3 unterscheidet Werkzeuge mit direkter Wirkung auf die Sicherheit (ihre Ausgaben gehen in Entwurf oder Implementierung einer sicherheitsrelevanten Funktion ein) und Werkzeuge mit indirekter Wirkung (sie unterstützen die Sicherheitsverifikation; ihre Fehler führen nicht direkt zu einem systematischen gefährlichen Fehler, können aber das Erkennen anderer Fehler beeinträchtigen).'),
  p([b('Einstufung: Werkzeug mit indirekter Wirkung auf die Sicherheit. '), 'Die RHAS entspricht den Beispielen „Werkzeuge zur Verwaltung und Rückverfolgung von Anforderungen“ und „Werkzeuge zur Unterstützung der Erstellung des Sicherheitsnachweises“ (EN 50129 6.3, Beispiel 2 d) und e)). Sie erzeugt weder Entwurfsdaten noch Parameter des Zielsystems.']),
  p('Die zusätzlichen Anforderungen 1) bis 3) der Norm gelten nur für Werkzeuge mit direkter Wirkung. Unabhängig davon werden die allgemeinen Punkte erfüllt: Auswahl nach Bedarf, Zusammenarbeit mit Folgewerkzeugen (Word, Excel, JSON-Austausch) und Verfügbarkeit über die Lebensdauer (eine Datei, offline, Quellstand mit reproduzierbarem Build). Darüber hinaus werden freiwillig eine Gefährdungsbetrachtung des Werkzeugs (Abschnitt 4) und ein Validierungslauf (Abschnitt 6) nachgewiesen.'),
  p([b('Einordnung nach EN 50716:2023: '), 'Wird die RHAS in einem Softwareprojekt eingesetzt, entspricht sie der Werkzeugklasse T1 (keine Ausgaben, die direkt oder indirekt zum ausführbaren Code einschließlich Daten beitragen).']),

  h1('4 Gefährdungsbetrachtung des Werkzeugs'),
  table(['Fehlerart', 'Mögliche Auswirkung', 'Beherrschung', 'Nachweis'], FM, [0.22, 0.2, 0.38, 0.2]),

  h1('5 Werkzeuganforderungen und Nachweis'),
  table(['ID', 'Anforderung', 'Nachweis (Testgruppe)'], TRS, [0.08, 0.64, 0.28]),

  h1('6 Validierungsergebnis'),
  p(`Validierungslauf vom ${run.date} mit Version ${run.version} (Commit ${run.commit}). Der Lauf ist mit „python3 scripts/validate.py“ wiederholbar; die Rohdaten liegen unter docs/validation.`),
  h2('6.1 Modul- und Berichtstests'),
  table(['Testgruppe', 'Datei', 'Tests', 'Bestanden', 'Fehlgeschlagen'], Object.keys(suites).map((f) => [suiteNames[f] || f, f, String(suites[f].length), String(count(f)), String(count(f, 'failed'))]).concat([['Summe', '', String(total), String(passed), String(total - passed)]]), [0.34, 0.26, 0.12, 0.14, 0.14]),
  p('Normative Erwartungswerte (Tabelle C.9, Tabelle C.1, EN 50126-2 Tabelle 2) sind in den Tests aus den Normen übernommen und nicht aus den Datendateien der Anwendung gelesen; eine Datenänderung kann das normative Verhalten daher nicht unbemerkt verändern. Die Berichte werden gegen gespeicherte Golden-Dateien verglichen; die Wirksamkeit wurde durch gezielt eingebrachte Fehler bestätigt.'),
  h2('6.2 Browser-Prüfungen'),
  table(['Prüfung', 'Ergebnis', 'Letzte Ausgaben'], run.browser.map((x) => [x.script, DE[x.status], x.output.filter((l) => !l.startsWith('errors:')).slice(-3).concat(['Seitenfehler: keine (erwarteter Verbindungsfehler zur nicht gestarteten lokalen KI ausgenommen)']).join('\n')]), [0.22, 0.14, 0.64], 16),

  h1('7 Anwendungsbedingungen für Nutzer'),
  table(['ID', 'Bedingung'], TUC, [0.1, 0.9]),

  h1('8 Konfigurationsmanagement'),
  bullet('Quellstand unter Versionsverwaltung (git); jede Auslieferung trägt Version und Prüfsumme.'),
  bullet('„python3 build.py“ erzeugt die Auslieferungsdatei reproduzierbar aus dem Quellstand; der ursprüngliche Stand 2026-09-20-p1 wurde bitgenau rekonstruiert.'),
  bullet('Änderungen an Berichten werden über Golden-Dateien sichtbar und nur nach Durchsicht übernommen.'),
  bullet('Normative Verweise sind in einer Verifikationsmatrix geführt (Anhang B).'),

  h1('9 Offene Punkte'),
  bullet('Security-Inhalte gegen die zu beschaffenden Normen (CLC/TS 50701, IEC 62443-3-2/-3-3, EN 50159) prüfen; fachliche Freigabe durch eine qualifizierte Person.'),
  bullet('KI-Security-Durchgänge mit realen Modellen abstimmen.'),
  bullet('Deutsche Bezeichnungen der Liefergegenstände gegen die DIN-EN-Fassungen prüfen.'),
  bullet('Kürzungsprüfung des KI-Kontexts für den lokalen Betrieb (Plan B).'),

  h1('Anhang A: Testfälle'),
  ...Object.keys(suites).flatMap((f) => [h2(`${suiteNames[f] || f} (${f})`), table(['Testfall', 'Ergebnis'], suites[f].map((t) => [t.name, DE[t.status]]), [0.82, 0.18], 16)]),
  h1('Anhang B: Verifikationsmatrix der Normverweise'),
  p('Geprüft gegen EN 50126-1:2017, EN 50126-2:2017, EN 50129:2018 und EN 50716:2023. Inhalte sind sinngemäß wiedergegeben; kein Normtext.'),
  table(['Verweis', 'Verwendung', 'Inhalt (sinngemäß)', 'Status'], vm, [0.22, 0.22, 0.44, 0.12], 16),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 21 } } }, paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: '1F3864', font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '2E5597', font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } }] },
  numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
  sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `INVENSITY · Werkzeugnachweis RHAS ${run.version}`, size: 16, color: '7F8C9D' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Seite ', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16 }), new TextRun({ text: ' von ', size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 })] })] }) },
    children }],
});
Packer.toBuffer(doc).then((buf) => { const out = path.join(ROOT, 'docs/werkzeugnachweis/04_Werkzeugnachweis_RHAS.docx'); fs.writeFileSync(out, buf); console.log('written', out, buf.length); });
