const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, ShadingType, LevelFormat, BorderStyle, Footer, PageNumber, Header } = require('docx') /* npm i docx */;

const W = 9638; // A4 text width at 2 cm margins (DXA)
const FONT = 'Calibri';
const p = (text, o = {}) => new Paragraph({ spacing: { after: 120 }, ...o, children: [].concat(text).map((t) => (typeof t === 'string' ? new TextRun({ text: t }) : t)) });
const b = (t) => new TextRun({ text: t, bold: true });
const i = (t) => new TextRun({ text: t, italics: true });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, children: [new TextRun(t)] });
const bullet = (t) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60 }, children: [].concat(t).map((x) => (typeof x === 'string' ? new TextRun(x) : x)) });
const num = (t, ref = 'num') => new Paragraph({ numbering: { reference: ref, level: 0 }, spacing: { after: 60 }, children: [].concat(t).map((x) => (typeof x === 'string' ? new TextRun(x) : x)) });
const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFC7D5' };
const borders = { top: border, bottom: border, left: border, right: border };
function table(headers, rows, fracs) {
  const widths = fracs.map((f) => Math.round(W * f)); widths[widths.length - 1] = W - widths.slice(0, -1).reduce((a, c) => a + c, 0);
  const cell = (t, w, head) => new TableCell({ borders, width: { size: w, type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, fill: 'DCE3EE', color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: String(t).split('\n').map((line) => new Paragraph({ children: [new TextRun({ text: line, bold: head, size: 19 })] })) });
  return new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, rows: [new TableRow({ tableHeader: true, children: headers.map((h, k) => cell(h, widths[k], true)) }), ...rows.map((r) => new TableRow({ children: r.map((c, k) => cell(c, widths[k], false)) }))] });
}
const gap = () => new Paragraph({ spacing: { after: 60 }, children: [] });

const content = [
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Präsentationsleitfaden Railway Hazard Analysis Suite', bold: true, size: 40, color: '1F3864' })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: 'Version 2 – Projektprofil, Kalibrierung, Domänenpakete und Security-Erweiterung · Demo-Projekt Minimel Lynx ATWS', size: 24, color: '44546A' })] }),
  table(['Angabe', 'Wert'], [
    ['Kunde', 'Schweizer Electronic AG, Industriestrasse 3, 6260 Reiden'],
    ['Produkt im Demo-Projekt', 'Minimel Lynx ATWS (automatisches Funkwarnsystem), fiktive Gleiserneuerung Reiden Süd'],
    ['Anwendung', 'Railway_Hazard_Analysis_Suite (Build 2026-09-24-wp7), eine HTML-Datei, offline lauffähig'],
    ['KI-Anbieter', 'Mistral API (vorbereitete Ergebnisse); Ausblick: lokales Modell über Ollama'],
    ['Dauer', 'ca. 60 Minuten (Security-Teil 12 Minuten)'],
  ], [0.28, 0.72]),

  h1('1 Was ist neu gegenüber Version 1'),
  p('Aus dem Kundengespräch kamen zwei Wünsche: Cybersecurity muss in der Analyse ausdrücklich vorkommen, und die Anwendung soll für beliebige Bahnsysteme einsetzbar sein. Beides ist umgesetzt:'),
  bullet([b('Normgrundlage bereinigt. '), 'Die Anwendung stützt sich ausschließlich auf EN 50126-1/-2:2017, EN 50129:2018 und EN 50716:2023. Alle Normverweise sind geprüft; die Berichte folgen den Ergebnissen der Phasen 3 und 4 nach EN 50126-1 (Gefährdungsidentifikation GI, Risikobewertung RB, Gefährdungsprotokoll GP, Sicherheitsanforderungen SAS, Gesamtbericht SA).']),
  bullet([b('Stufe 0 „Projektprofil“. '), 'Rolle, Domäne, Art des Sicherheitsnachweises, Lebenszyklusumfang, Risikoakzeptanz, Rahmen, Security-Tiefe und Datenklassifizierung werden zu Projektbeginn festgelegt; spätere Änderungen nur mit Begründung und Protokoll.']),
  bullet([b('Kalibrierung konfigurierbar. '), 'Vorlagen nach EN 50126-1 Anhang C (zeit- oder wegbasiert, 4 oder 5 Schadensstufen, 4 oder 2 Akzeptanzkategorien), eigene Matrizen des Betreibers, Freigabe und Versionierung.']),
  bullet([b('Domänenpakete. '), 'Beispiele, Vorlagen und Checklisten für Signaltechnik/Warnsysteme, Fahrzeuge und allgemein; keine Domänenbegriffe mehr fest in der KI-Anweisung.']),
  bullet([b('Security in vier wählbaren Stufen. '), 'Stufe 0 nicht betrachtet (mit Pflichtbegründung), Stufe 1 security-informierte Sicherheit, Stufe 2 Bedrohungsprotokoll mit Security-Risikobewertung, Stufe 3 Zonen, Conduits und SL-T (Vorschau).']),

  h1('2 Kernbotschaften'),
  bullet([b('Die KI schlägt vor, der Ingenieur entscheidet. '), 'Keine Gefährdung, Bewertung, Bedrohung oder Anforderung gelangt ohne ausdrückliche Übernahme in das Projekt.']),
  bullet([b('Normative Entscheidungen trifft nie die KI. '), 'Risikoklassen, SIL, THR-Prüfungen und das Security-Risiko werden lokal aus der freigegebenen Kalibrierung berechnet.']),
  bullet([b('Für jedes Bahnsystem einsetzbar. '), 'Das Projektprofil steuert Domäne, Nachweisart, Kalibrierung und Security-Tiefe.']),
  bullet([b('Security wird ausdrücklich behandelt – in der Tiefe, die der Kunde wählt. '), 'EN 50126-1 7.4.2.1 d) schließt vorsätzlichen Missbrauch aus der Gefährdungsidentifikation aus; EN 50129 6.4 verlangt die Betrachtung dennoch. Die Anwendung schließt diese Lücke nachvollziehbar.']),
  bullet([b('Nachvollziehbar und auditierbar. '), 'Abdeckungsnachweise, Änderungsprotokoll des Profils, Freigaben von Kalibrierung und Security-Matrix, lückenlose Rückverfolgbarkeit Bedrohung → Gefährdung → Anforderung.']),

  h1('3 Vorbereitung am Vortag'),
  h2('3.1 Technik'),
  num('Chrome oder Edge; die HTML-Datei per Doppelklick öffnen. Daten liegen in der IndexedDB dieses Browsers – am Präsentationstag denselben Browser und dasselbe Profil verwenden.', 'n1'),
  num('Oben rechts „KI“: Anbieter, Modell und Schlüssel eintragen, „Verbindung prüfen“, speichern. Kopfzeile „Bearbeiter“ mit Ihrem Namen füllen.', 'n1'),
  num('„Beispielprojekt laden“: Das Lynx-Projekt öffnet sich mit bestätigtem Projektprofil (Security-Stufe 0), fünf Referenzdokumenten, Leitgefährdungen A und B, Anforderungen inkl. SRAC, CCA und TFFR sowie vorbereiteten Security-Daten für die Stufen 1–3.', 'n1'),
  num('KI-Ergebnisse wie in Version 1 vorbereiten (Standard-Durchlauf, Sichtung, Risikoanalyse, Anforderungen). Mindestens eine übernommene Gefährdung ohne Analyse für den Live-Aufruf lassen.', 'n1'),
  h2('3.2 Security-Vorbereitung'),
  num('Einmal alle Stufen durchspielen: Stufe 0 → Projektprofil: Security-Stufe 1 (Begründung „Demo-Probe“) → 2 → 3 und wieder zurück auf 0. Daten höherer Stufen bleiben erhalten und werden bei Stufe 0 weder angezeigt noch berichtet.', 'n2'),
  num('Optional, wenn Zeit ist: Security-Stufe 1 und einen Kurzlauf nur mit Security-Durchgängen testen (12 Schnittstellen + Wechselwirkungsprüfung = 13 Aufrufe). Ergebnisse notieren; sie sind noch nicht mit einem echten Modell abgestimmt.', 'n2'),
  num('Checkpoint „Demo-Stand“ anlegen und Projekt als JSON sichern. Word- und Excel-Berichte der Stufen 0 und 3 als Ausweichmaterial erzeugen.', 'n2'),

  h1('4 Ablauf der Präsentation (60 Minuten)'),
  table(['Zeit', 'Abschnitt', 'Was zeigen / klicken', 'Kernaussage'], [
    ['0–4', 'Einstieg', 'Problemstellung; Hinweis auf fiktive Projektdaten.', 'Ihr Produkt in einem realistischen Projekt.'],
    ['4–8', 'Stufe 0', 'Projektprofil: Rolle Lieferant, Domäne Signaltechnik, Spezifische Anwendung, Schweiz. Domänenpaket mit Normen und Checkliste. Änderungsverlauf. Kalibrierung: Vorlage C.2/C.5/C.7 zeigen und verwerfen.', 'Einsetzbar für jedes Bahnsystem; Festlegungen sind begründet und protokolliert.'],
    ['8–14', 'Stufe 1', 'Systemdefinition, Funktionen, Schnittstellen, Dokumente; „Vorlagen der Domäne“.', 'Grundlage nach EN 50126-1 7.3.2.1.'],
    ['14–23', 'Stufe 2', 'Durchlauf konfigurieren, Live-Kurzlauf (2 Quellen), projektspezifischer Treffer, Abdeckungsnachweis.', 'Systematisch, der Mensch entscheidet mit Begründung.'],
    ['23–31', 'Stufe 3', 'Leitgefährdung A: Szenarien, Risikoklasse live ändern, Maßnahmen und Restrisiko; Live-Einzelanalyse; Heatmap.', 'Die Kalibrierung rechnet – nie die KI.'],
    ['31–43', 'Security', 'Siehe Abschnitt 5: Stufe 0 → 1 → 2 → 3.', 'Security ausdrücklich und in wählbarer Tiefe.'],
    ['43–50', 'Stufe 4', 'Anforderungen, SRAC mit Empfänger; F-0004 live auf 3e-8 (ODER-Fehler) und zurück; CCA „abhängig“.', 'SIL und Aufteilung werden geprüft.'],
    ['50–56', 'Stufe 5', 'Gesamtbericht SA erzeugen: Projektprofil, Gefährdungsprotokoll, Security-Abschnitte; Excel-Arbeitsmappe.', 'Direkt einreichbarer Liefergegenstand.'],
    ['56–60', 'Abschluss', 'Nutzen; Ausblick lokales Modell (Ollama) für vertrauliche Projekte; Pilot.', 'Nächster Schritt: Pilot mit echten Unterlagen.'],
  ], [0.08, 0.12, 0.5, 0.3]),

  h1('5 Security-Storyline (12 Minuten)'),
  h2('5.1 Stufe 0 – die Lücke zeigen (1 Min.)'),
  p('Im Gesamtbericht Abschnitt 1 steht: vorsätzliche Handlungen sind nicht Gegenstand, mit der Begründung aus dem Projektprofil. Das ist ehrlich – und genau die Lücke, die Betreiber und Gutachter ansprechen werden.'),
  h2('5.2 Stufe 1 – security-informierte Sicherheit (4 Min.)'),
  num('Stufe 0 → Projektprofil → Security-Tiefe „Stufe 1“, Begründung eingeben, „Änderungen übernehmen“. Eintrag im Änderungsverlauf zeigen.', 'n3'),
  num('Stufe 1 öffnen: der Security-Kontext ist neu (Angreiferprofil, EN 50159 Kategorie 3, Zugänglichkeit, Parametrierzugang, Updates, Schlüssel). Die offene Frage zum Schlüsselkonzept ist bewusst stehen gelassen.', 'n3'),
  num('Stufe 3 → H-0002 öffnen: zwei vorsätzliche Ursachen (Replay einer Ausschaltmeldung, Funkstörung) und zwei Security-Maßnahmen. Die Vollständigkeitsprüfung verlangt für vorsätzliche Ursachen eine Security-Maßnahme – eine THR- oder SIL-Anrechnung gibt es dafür nicht (EN 50129 6.4).', 'n3'),
  num('Durchlauf konfigurieren: Security-Durchgänge je Schnittstelle und die Wechselwirkungsprüfung erscheinen im Plan. Nicht live starten.', 'n3'),
  h2('5.3 Stufe 2 – Bedrohungsprotokoll (4 Min.)'),
  num('Security-Tiefe „Stufe 2“ übernehmen. In der linken Leiste erscheint „3b Bedrohungsprotokoll“.', 'n4'),
  num('T-0001 Replay öffnen: Exposition 3, Verwundbarkeit 2, Auswirkung B → Wahrscheinlichkeit 4, Risiko hoch. Die Anwendung rechnet; die KI bewertet nicht.', 'n4'),
  num('Gegenmaßnahme G1 (Nachrichtenauthentisierung, R-0004): Restrisiko bleibt hoch, weil der offene Funk die Exposition nicht senkt. Das ist ein echter Befund für das Gespräch – das Werkzeug beschönigt nichts.', 'n4'),
  num('T-0002 Parametrierung: von mittel auf niedrig durch signierte Konfiguration und Vier-Augen-Freigabe (SRAC R-0005 an den Anwender). T-0003 Funkstörung: Auswirkung D, weil die Lebenszeichenüberwachung in die Störungswarnung führt – Verfügbarkeit, nicht Sicherheit.', 'n4'),
  num('Security-Risikomatrix: RHAS-Vorschlag, nicht freigegeben; Änderung nur mit Begründung, Freigabe durch den Betreiber.', 'n4'),
  h2('5.4 Stufe 3 – Zonen und SL-T (3 Min.)'),
  num('Security-Tiefe „Stufe 3“ übernehmen. Zonen Z-01 Warnkette, Z-02 Warngeräte, Z-03 Parametrierung; Conduits C-01 Funk, C-02 Parametrierzugang.', 'n5'),
  num('Z-01 öffnen: SL-T 3 mit Begründung, Vorschlag der Anwendung und dessen Grundlage, ausgewählte Systemanforderungen nach IEC 62443-3-3 (Kennung und Titel) mit umsetzender Anforderung.', 'n5'),
  num('Prüfbefunde und die Gliederung des Cybersecurity-Nachweises mit Stand „vorhanden/offen“ zeigen. Klar sagen: Stufe 3 ist eine Vorschau und ersetzt keinen Cybersecurity-Nachweis nach CLC/TS 50701.', 'n5'),

  h1('6 Sprechtext-Bausteine'),
  p([b('Projektprofil: '), '«Bevor wir analysieren, legen wir fest, wer wir im Projekt sind, welches System wir betrachten und wie tief Security betrachtet wird. Jede spätere Änderung braucht eine Begründung und steht im Bericht.»']),
  p([b('Kalibrierung: '), '«EN 50126-1 Anhang C gibt Beispiele; die Kategorien legt der Betreiber fest. Die Anwendung übernimmt Ihre Matrix, versioniert sie und bewertet alle Gefährdungen neu, wenn sie sich ändert.»']),
  p([b('Security: '), '«Die Sicherheitsnormen klammern Angriffe bei der Gefährdungsidentifikation aus, EN 50129 verlangt aber ihre Betrachtung. Wir zeigen, welche Gefährdungen ein Angreifer auslösen kann, wie hoch das Security-Risiko ist, und wie das in Zonen und Security-Levels übergeht – in der Tiefe, die Sie für Ihr Projekt wählen.»']),
  p([b('Replay-Befund: '), '«Eine eingespielte Ausschaltmeldung würde die Warnung vorzeitig beenden. Ob Ihre Funkmeldungen authentisiert sind, wissen wir nicht – das ist unsere Frage an Sie. Das Werkzeug zeigt: selbst mit Authentisierung bleibt das Risiko wegen des offenen Funks hoch, bis der Betreiber es bewertet.»']),
  p([b('Datenhoheit: '), '«Die Anwendung ist eine HTML-Datei ohne Server. Ist ein Projekt als vertraulich klassifiziert, sperrt sie Cloud-KI; dann läuft sie mit einem lokalen Modell.»']),

  h1('7 Bekannte Einschränkungen'),
  table(['Punkt', 'Auswirkung', 'Empfohlene Antwort'], [
    ['Security-Grundlage öffentlich', 'Ausgerichtet an öffentlichen Beschreibungen von CLC/TS 50701 und IEC 62443; keine Konformitätsaussage', 'Normen werden beschafft; die Daten sind austauschbar, ohne die Anwendung zu ändern.'],
    ['Security-Matrix und Abbildung Schadensausmaß → Auswirkung', 'RHAS-Vorschlag, keine Normwerte', 'Betreiber legt fest und gibt frei; Änderungen werden protokolliert.'],
    ['SL-T-Vorschlag', 'Vereinfachte Regel aus Angreiferprofil und Ausgangsrisiko', 'SL-T setzt immer der Bearbeiter mit Begründung.'],
    ['Security-Stufe 3', 'Vorschau: nur Kennungen und Titel der IEC 62443-3-3-Anforderungen', 'Vollständiger Nachweis nach Beschaffung der Normen.'],
    ['Security-Durchgänge der KI', 'Noch nicht mit echten Modellen abgestimmt', 'Vorschläge wie alle anderen prüfen; Abstimmung läuft.'],
    ['Domänenpakete', 'Inhalte von uns erstellt, Fachreview ausstehend', 'Arbeitshilfen; Anwendbarkeit im Projekt prüfen.'],
    ['Restrisiko = wirksamste einzelne Maßnahme', 'Tendenziell optimistisch', 'Vorschlag; der Ingenieur bestätigt.'],
    ['Daten im Browser', 'Browserwechsel = Projekt nicht sichtbar', 'JSON-Export und Checkpoints nutzen.'],
  ], [0.26, 0.37, 0.37]),

  h1('8 Fragen und Antworten'),
  table(['Frage', 'Antwort'], [
    ['Ist das normkonform?', 'Die Struktur folgt EN 50126-1/-2 und EN 50129; alle Verweise sind gegen die Normen geprüft (Verifikationsmatrix). Die Konformität des Nachweises bleibt Aufgabe des Ingenieurs und des Gutachters.'],
    ['Ersetzt Stufe 3 einen Cybersecurity-Nachweis?', 'Nein. Sie bereitet ihn vor: Zonen, Conduits, SL-T, Anforderungszuordnung und eine Gliederung mit Stand. Der Nachweis nach CLC/TS 50701 bzw. IEC 63452 bleibt eigenständig.'],
    ['Warum keine SIL für Security?', 'EN 50129 6.4 sieht das SIL-Konzept nicht für IT-Security vor. Vorsätzliche Ursachen werden über Security-Maßnahmen und Security-Levels beherrscht.'],
    ['Können wir unsere Risikomatrix verwenden?', 'Ja: Vorlagen nach Anhang C oder Import als JSON, Freigabe durch den Betreiber, Versionierung und Neubewertung aller Gefährdungen.'],
    ['Geht das auch für Fahrzeuge oder Energie?', 'Ja: Domäne im Projektprofil wählen; das Domänenpaket liefert Beispiele, Vorlagen und Checklisten.'],
    ['Wo liegen die Daten?', 'Lokal im Browser. Vertrauliche Projekte sperren Cloud-KI; Betrieb mit lokalem Modell (Ollama) ist vorgesehen.'],
    ['Was ist mit IEC 63452?', 'Nachfolger von CLC/TS 50701, derzeit in der Schlussabstimmung. Die Anwendung ist so gebaut, dass ein neues Normprofil nur Daten ändert.'],
  ], [0.3, 0.7]),

  h1('9 Anhang: vorbereitete Security-Daten im Beispielprojekt'),
  h2('Bedrohungsprotokoll'),
  table(['ID', 'Bedrohung', 'Gefährdung', 'E / V / W', 'Ausw.', 'Risiko → Rest', 'Gegenmaßnahme'], [
    ['T-0001', 'Replay einer Ausschaltmeldung', 'H-0002', '3 / 2 / 4', 'B', 'Hoch → Hoch', 'G1 Nachrichtenauthentisierung (R-0004)'],
    ['T-0002', 'Manipulierte Projektierung über den Service-Laptop', 'H-0001', '1 / 2 / 2', 'B', 'Mittel → Niedrig', 'G1 Signierte Konfiguration, Vier-Augen (R-0005, SRAC)'],
    ['T-0003', 'Gezielte Funkstörung', 'H-0002', '3 / 3 / 5', 'D', 'Mittel → Mittel', 'Akzeptiert: sicherer Zustand über Lebenszeichenüberwachung'],
  ], [0.09, 0.25, 0.12, 0.1, 0.07, 0.15, 0.22]),
  gap(),
  h2('Zonen und Conduits'),
  table(['ID', 'Name', 'Merkmale', 'SL-T', 'Systemanforderungen (IEC 62443-3-3)'], [
    ['Z-01', 'Warnkette an der Strecke', 'sicherheitsrelevant, drahtlos', '3', 'SR 1.2, SR 3.1, SR 3.8, SR 7.1'],
    ['Z-02', 'Personen- und Maschinenwarngeräte', 'sicherheitsrelevant, drahtlos', '3', 'SR 1.2, SR 3.1'],
    ['Z-03', 'Parametrierung und Service', 'temporär verbunden', '2', 'SR 2.3, SR 3.4'],
    ['C-01', 'Funkstrecken (Z-01 ↔ Z-02)', 'EN 50159 Kategorie 3', '3', '–'],
    ['C-02', 'Parametrierzugang (Z-03 ↔ Z-01)', '–', '3', '–'],
  ], [0.08, 0.32, 0.25, 0.08, 0.27]),

  h1('10 Checkliste am Präsentationstag'),
  bullet('Gleicher Browser und gleiches Profil wie am Vortag; Projekt „Demo-Stand“ sichtbar.'),
  bullet('Security-Tiefe steht auf Stufe 0 (Storyline beginnt mit der Lücke).'),
  bullet('KI-Verbindung geprüft; eine Gefährdung ohne Analyse für den Live-Aufruf vorhanden.'),
  bullet('F-0004 steht auf 1.5e-8 für die Live-Fehlerdemonstration.'),
  bullet('Backup-JSON und Berichte der Stufen 0 und 3 auf USB-Stick.'),
  bullet('Benachrichtigungen aus, Browser-Zoom 110–125 %.'),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, color: '1F3864', font: FONT }, paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 24, bold: true, color: '2E5597', font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
    ] },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    ...['num', 'n1', 'n2', 'n3', 'n4', 'n5'].map((r) => ({ reference: r, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] })),
  ] },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'INVENSITY · Präsentationsleitfaden RHAS v2 · intern', size: 16, color: '7F8C9D' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Seite ', size: 16 }), new TextRun({ children: [PageNumber.CURRENT], size: 16 }), new TextRun({ text: ' von ', size: 16 }), new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 })] })] }) },
    children: content,
  }],
});
Packer.toBuffer(doc).then((buf) => { fs.writeFileSync('01_Praesentationsleitfaden_RHAS_Minimel_Lynx_v2.docx', buf); console.log('ok', buf.length); });
