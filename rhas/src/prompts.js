// German prompt set for the Railway Hazard Analysis Suite. Every prompt gets
// the FULL system definition (fields, functions, interfaces, modes), the
// retrieved document excerpts for its unit of work, and the titles already
// identified. Field names stay English (they are schema keys); all free text
// is German. Nothing here asks the model for a risk class, a THR or a SIL.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;
const PROFILE = typeof require !== 'undefined' ? require('./profile.js') : window.RHAS_PROFILE;
const DOMAINS = typeof require !== 'undefined' ? require('./domains.js') : window.RHAS_DOMAINS;
const SEC = typeof require !== 'undefined' ? require('./security.js') : window.RHAS_SECURITY;
/** WP4: domain examples come from the domain pack of the project profile. */
const ex = (ctx) => ((DOMAINS && DOMAINS.packFor(ctx && ctx.profile)) || { examples: {} }).examples || {};

const ROLE = 'Du bist ein erfahrener Sicherheitsingenieur für Bahnsysteme (EN 50126-1/-2:2017, EN 50129:2018) und arbeitest präzise, konkret und systemspezifisch. Du schreibst ausschließlich Deutsch (Feldnamen bleiben Englisch). Du erfindest keine Fakten über das System; wo Informationen fehlen, formulierst du die Annahme ausdrücklich.';

const HAZARD_RULES = `Regeln für jede Gefährdung:
- Eine Gefährdung ist ein ZUSTAND, der zu einem Unfall führen kann (EN 50126-1 3.28) — kein Ereignis, kein Unfall, keine Maßnahme.
- Formuliere sie an der Systemgrenze (beobachtbar an den Schnittstellen), nicht als internen Bauteilfehler (EN 50126-2 5.2.2). Bauteilfehler gehören in "causes".
- "title": prägnante deutsche Überschrift, max. 12 Wörter, systemspezifisch (Funktion/Schnittstelle/Betriebsart benennen). KEINE IDs, KEINE Leitworte und KEINE Klammern im Titel — IDs gehören in "functions"/"interfaces", das Leitwort in "guideword".
- "description": 1–3 Sätze: welcher Zustand, unter welchen Bedingungen, was fehlt oder falsch ist.
- "causes": alle plausiblen Ursachen, jede mit "kind" = systematic (Spezifikation/Entwurf/Prozess), random (Verschleiß, Alterung, Zufallsausfall), human (Fehlhandlung), external (Umwelt, Dritte, Fremdsystem).
- "triggeringEvent": das einzelne auslösende Ereignis; "enablingConditions": nur Bedingungen, die GLEICHZEITIG gelten müssen.
- "consequence": der schlimmste glaubhafte Unfall (Personen, Umwelt, Sachwerte), konkret.
- "sourceCategory": Buchstabe a–n der Gefährdungsquellen nach EN 50126-1 7.4.2.1 (a Normalbetrieb, b Fehlerzustände, c Notbetrieb, d Fehlgebrauch, e Schnittstellen, f Funktionalität, g Konfigurationsparameter, h Betrieb/Instandhaltung, i Entsorgung, j Menschliche Faktoren, k Arbeitsschutz, l Mechanische Umgebung, m Elektrische Umgebung, n Natürliche Umgebung).
- "reasoning.whyIdentified": warum das ein echter Befund für DIESES System ist; "reasoning.sourcesUsed": welche Beschreibung/Dokumentstelle; "reasoning.decisionRationale": 2 Sätze als Prüfhilfe für den Ingenieur (wann übernehmen, wann verwerfen, welche Evidenz entscheidet).
- Keine Wiederholung bereits identifizierter Gefährdungen. Lieber 3 präzise als 10 allgemeine. Wenn nichts Neues: leere Liste.`;

function fmtList(items, fmt) {
  return (items || []).length ? items.map(fmt).join('\n') : '(keine)';
}

/** Full system context block. sd = system definition, fns/ifs = records, docs = retrieved excerpts (string). */
function contextBlock(ctx) {
  const { sd, functions, interfaces, modes, docs } = ctx;
  const s = sd || {};
  const modeList = (modes || []).filter((m) => (s.modes || []).includes(m.id)).map((m) => `${m.id} = ${m.label}`).join(', ');
  const prof = PROFILE && ctx.profile ? PROFILE.promptLine(ctx.profile) : '';
  return `${prof ? prof + '\n' : ''}SYSTEM: ${s.name || '(ohne Namen)'} — ${s.type || ''}
ZWECK: ${s.purpose || '-'}
MISSIONSPROFIL: ${s.missionProfile || '-'}
BESCHREIBUNG: ${s.description || '-'}
SYSTEMGRENZE / SCHNITTSTELLEN: ${s.boundary || '-'}
EINGESCHLOSSENE FUNKTIONEN: ${s.includedFunctions || '-'}
AUSGESCHLOSSEN: ${s.excludedFunctions || '-'}
UMGEBUNG: ${s.physicalEnvironment || '-'} | LAGE: ${s.location || '-'}
BETRIEB: ${s.operatingStrategy || '-'} | BETRIEBSBEDINGUNGEN/PERSONAL: ${s.operatingConditions || '-'}
INSTANDHALTUNG: ${s.maintenanceStrategy || '-'}
BESTEHENDE SICHERHEITSMASSNAHMEN / ANNAHMEN: ${s.existingSafetyMeasures || '-'} ${s.assumptions ? '| ' + s.assumptions : ''}
ERFAHRUNGEN: ${s.pastExperience || '-'}
REGELWERKE: ${s.applicableStandards || '-'}
BETRIEBSARTEN IM UMFANG: ${modeList || '-'}
FUNKTIONEN:
${fmtList(functions, (f) => `- ${f.id} ${f.name}: ${f.description || ''}${f.subsystem ? ` [${f.subsystem}]` : ''}${f.safeState ? ` | sicherer Zustand: ${f.safeState}` : ''}`)}
SCHNITTSTELLEN:
${fmtList(interfaces, (i) => `- ${i.id} ${i.name}${i.partner ? ` ↔ ${i.partner}` : ''}: ${i.description || ''}`)}
${docs ? `\nAUSZÜGE AUS REFERENZDOKUMENTEN:\n${docs}\n` : ''}`;
}

function alreadyBlock(titles, rejected) {
  const list = M ? capTitles(titles, 150) : titles;
  const known = `BEREITS IDENTIFIZIERTE GEFÄHRDUNGEN (nicht wiederholen):\n${fmtList(list, (t) => `- ${t}`)}`;
  if (!rejected || !rejected.length) return known;
  return `${known}\n\nVOM INGENIEUR VERWORFEN (nicht erneut vorschlagen, auch nicht umformuliert):\n${fmtList(capTitles(rejected, 60), (t) => `- ${t}`)}`;
}

function capTitles(titles, cap) {
  const list = titles || [];
  return list.length <= cap ? list : list.slice(list.length - cap);
}

// --------------------------------------------------------- decomposition ----
function buildDecompositionPrompt(ctx) {
  const systemPrompt = `${ROLE}

Aufgabe: Zerlege das beschriebene System für die Risikoanalyse in Teilsysteme, Funktionen und Schnittstellen (EN 50126-1 Anhang D: funktionale Zerlegung; Funktionen sind unabhängig von der technischen Realisierung beschreibbar).
- 6 bis 14 Funktionen: jede mit "name" (Verb + Objekt, z. B. "${ex(ctx).functionName}"), "description" (Eingang → Verarbeitung → Ausgang), "kind" (electronic | mechanical | mixed | procedural), "safetyRelevant" (true, wenn eine Eigenschaft der Funktion in der Sicherheitsargumentation gebraucht wird) mit "rationale", "modes" (Betriebsarten, in denen die Funktion aktiv ist), "inputs"/"outputs".
- "safeState": der Zustand, den die Funktion bei erkanntem Fehler AKTIV einnehmen muss, damit keine Gefährdung entsteht — NICHT die Folge eines unerkannten Ausfalls. Formuliere ihn als anzustrebenden Zustand („…wird eingenommen/gemeldet"), nie als Ausbleiben einer Wirkung. Prüfe die sichere Ausfallrichtung: Bei schützenden oder warnenden Funktionen ist der sichere Zustand in der Regel die ausgelöste Schutzwirkung mit Störungsmeldung (z. B. ${ex(ctx).safeState}), nicht deren Wegfall. Ist ein sicherer Zustand technisch nicht erreichbar, nenne ausdrücklich die geforderte Rückfallebene.
- Schnittstellen: jede Grenze zu anderen Systemen, zur Infrastruktur, zu Menschen (${ex(ctx).interfacePartners}) und zu anderen Organisationen; "type" = physical | functional | human | externalSystem | organisation, "partner" = Gegenstelle.
- Teilsysteme: 3 bis 8, grob nach Funktion gruppiert.
- "assumptions": Annahmen, die du treffen musstest, weil die Beschreibung schweigt. "openQuestions": Fragen, deren Antwort die Analyse wesentlich beeinflusst.
Antworte NUR mit dem JSON-Objekt nach Schema, ohne Vorrede.`;
  return { systemPrompt, userPrompt: contextBlock(ctx) };
}

// ------------------------------------------------------------ security (WP5) ----
/** Level 1: deliberate causes at ONE interface (security-informed safety). */
function buildThreatPrompt(ctx, iface, knownHazards, titles) {
  const th = SEC.threats().map((t) => `- ${t.id}: ${t.label} — ${t.question}`).join('\n');
  const known = (knownHazards || []).map((h) => `- ${h.id}: ${h.title}`).join('\n') || '- (noch keine)';
  const systemPrompt = `${ROLE}

Aufgabe: Security-informierte Gefährdungsanalyse für GENAU EINE Schnittstelle. EN 50126-1 7.4.2.1 d) schließt vorsätzlichen Missbrauch aus der Gefährdungsidentifikation aus; EN 50129 6.4 verlangt, dass physische und IT-Bedrohungen dennoch betrachtet werden. Prüfe für jede der folgenden Bedrohungen, ob ein ANGREIFER über diese Schnittstelle einen gefährlichen Zustand an der Systemgrenze herbeiführen kann:
${th}

Regeln:
- Betrachte nur Angriffe mit SICHERHEITSFOLGE (Unfallpotenzial). Reine Vertraulichkeits- oder Verfügbarkeitsfolgen nur, wenn sie eine Gefährdung nach sich ziehen, und dann im "consequence" benennen.
- Führt ein Angriff zu einer BEREITS BEKANNTEN Gefährdung, lege KEINE neue an: gib "existingHazardId" mit deren ID an, übernimm deren Titel und beschreibe in "causes" nur die vorsätzliche Ursache.
- Jede Ursache eines Angriffs hat "kind": "intentional". "threats": die zutreffenden Bedrohungs-IDs aus der Liste.
- Berücksichtige das angenommene Angreiferprofil und die Übertragungskategorie aus dem Security-Kontext; Angriffe, die dort ausgeschlossen sind, nicht aufnehmen.
- Keine Risikoeinstufung und keine Aussage über THR oder SIL: vorsätzliche Ursachen werden nicht über Ausfallraten beherrscht (EN 50129 6.4).
- Jede Gefährdung enthält "${iface.id}" in "interfaces".
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
SECURITY-KONTEXT:
${SEC.contextLines(ctx.sd)}

ZU ANALYSIERENDE SCHNITTSTELLE: ${iface.id} ${iface.name} (${iface.type}${iface.partner ? `, Gegenstelle: ${iface.partner}` : ''})
Beschreibung: ${iface.description || '-'}

BEKANNTE GEFÄHRDUNGEN (für "existingHazardId"):
${known}

${alreadyBlock(titles, ctx.rejectedTitles)}`;
  return { systemPrompt, userPrompt };
}

/** Level 1: co-engineering check — can a security measure impair a safety function (EN 50716 scope, IEC 62443-3-3 essential functions)? */
function buildCoEngineeringPrompt(ctx, titles) {
  const fns = (ctx.functions || []).filter((f) => f.safetyRelated !== false).map((f) => `- ${f.id} ${f.name}: sicherer Zustand ${f.safeState || '-'}`).join('\n');
  const systemPrompt = `${ROLE}

Aufgabe: Wechselwirkungsprüfung Safety ↔ Security. Security-Maßnahmen dürfen die sicherheitsrelevanten Funktionen nicht beeinträchtigen. Prüfe, welche GEFÄHRDUNGEN durch typische oder vorhandene Security-Maßnahmen entstehen können, insbesondere:
- zusätzliche Latenz durch Authentisierung oder Verschlüsselung gegenüber zeitkritischen Sicherheitsfunktionen,
- Sperren von Konten, Geräten oder Verbindungen nach Fehlversuchen, die eine sicherheitsrelevante Funktion blockieren,
- Sicherheitsupdates und Patches ohne erneute Validierung der sicherheitsrelevanten Software (EN 50716),
- Schlüssel- oder Zertifikatsablauf im Betrieb,
- Security-Überwachung, die Ressourcen der Sicherheitsfunktion verbraucht,
- Notfall- und Rückfallverfahren, die durch Zugriffsschutz erschwert werden.
Nur konkrete, für DIESES System plausible Gefährdungen; jede mit mindestens einer betroffenen Funktion in "functions". Ursachen sind "systematic" oder "human", nicht "intentional".
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
SECURITY-KONTEXT:
${SEC.contextLines(ctx.sd)}

SICHERHEITSRELEVANTE FUNKTIONEN:
${fns || '- (keine)'}

${alreadyBlock(titles, ctx.rejectedTitles)}`;
  return { systemPrompt, userPrompt };
}

// ---------------------------------------------------------- identification ----
function buildFunctionPrompt(ctx, fn, guidewords, titles) {
  const gw = guidewords.map((g) => `- ${g.id}: ${g.label} — ${g.question}`).join('\n');
  const systemPrompt = `${ROLE}

Aufgabe: Funktionsbezogene Gefährdungsidentifikation (Leitwortmethode, EN 50126-2 Anhang F / IEC 61882) für GENAU EINE Funktion. Arbeite in zwei Schritten:

Schritt 1 — Abweichungen: Gehe JEDES Leitwort der Reihe nach durch und bestimme, wie sich die Abweichung bei dieser Funktion konkret äußert.

Schritt 2 — Zusammenfassen zu Gefährdungen: Mehrere Leitwortabweichungen, die denselben gefährlichen Zustand an der Systemgrenze erzeugen, ergeben GENAU EINE Gefährdung mit mehreren Ursachen — nicht mehrere Gefährdungen. Typischerweise bleiben 2 bis 5 Gefährdungen je Funktion übrig.

Entscheidend ist die Formulierungsebene (EN 50126-2 5.2.2 — die Risikoanalyse betrachtet das System als Black Box an seiner Grenze): "title" und "description" beschreiben den ZUSTAND AN DER SYSTEMGRENZE, dem die gefährdeten Personen ausgesetzt sind, nicht den internen Funktionsausfall.
  RICHTIG: "${ex(ctx).hazardRight}"
  FALSCH:  "${ex(ctx).hazardWrong}" — das ist eine URSACHE, kein Gefährdungszustand
Der Funktionsausfall und jede Leitwortabweichung gehören ausschließlich in "causes".

"guidewords": alle Leitwort-IDs, die auf diese Gefährdung führen (mindestens eine, z. B. ["loss","late","partial"]). "guideword": die wichtigste davon. Immer die ID, nie der Text. Jede Gefährdung muss die Funktion "${fn.id}" in "functions" enthalten.

Unterscheide sicherheitsrelevante Abweichungen (Unfallpotenzial) von reinen Verfügbarkeitsproblemen: Letztere nur aufnehmen, wenn sie eine Folgegefährdung erzeugen (z. B. ${ex(ctx).availabilityFollowUp}), und das im "consequence" ausdrücklich benennen.
Leitworte:
${gw}
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
ZU ANALYSIERENDE FUNKTION: ${fn.id} ${fn.name}
Beschreibung: ${fn.description || '-'}
Eingänge: ${fn.inputs || '-'} | Ausgänge: ${fn.outputs || '-'} | Sicherer Zustand: ${fn.safeState || '-'} | Art: ${fn.kind}
Betriebsarten: ${(fn.modes || []).join(', ') || '-'}

${alreadyBlock(titles, ctx.rejectedTitles)}`;
  return { systemPrompt, userPrompt };
}

function buildInterfacePrompt(ctx, iface, titles) {
  const systemPrompt = `${ROLE}

Aufgabe: Schnittstellen-Gefährdungsanalyse für GENAU EINE Schnittstelle (EN 50126-1 7.4.2.1 e), EN 50126-2 11.4). Prüfe systematisch: fehlende, verspätete, verfälschte, doppelte oder unplausible Information; unverträgliche Annahmen beider Seiten (Zeitfenster, Einheiten, Versionen, Zuständigkeiten); gemeinsame Ursachen über die Grenze hinweg (Energie, EMV, Kabelwege, Personal); Verhalten bei Ausfall der Gegenstelle; menschliche Schnittstellen (Fehlbedienung, Fehlinterpretation). Jede Gefährdung enthält "${iface.id}" in "interfaces" und in der Regel sourceCategory "e".
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
ZU ANALYSIERENDE SCHNITTSTELLE: ${iface.id} ${iface.name} (${iface.type}${iface.partner ? `, Gegenstelle: ${iface.partner}` : ''})
Beschreibung: ${iface.description || '-'}

${alreadyBlock(titles, ctx.rejectedTitles)}`;
  return { systemPrompt, userPrompt };
}

function buildModePrompt(ctx, mode, titles) {
  const systemPrompt = `${ROLE}

Aufgabe: Gefährdungsidentifikation für GENAU EINE Betriebsart bzw. ein Lebenszyklusszenario (EN 50126-1 7.3.2.1 c), 7.4.2.1 a)–d), h)–k)). Betrachte: Abläufe und Personal in dieser Betriebsart, Übergänge hinein und hinaus, Rückfallebenen, menschliche Faktoren, Arbeitsschutz, Kommunikation, Zeitdruck, vorhersehbaren Fehlgebrauch. Jede Gefährdung enthält "${mode.id}" in "modes".
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
ZU ANALYSIERENDE BETRIEBSART: ${mode.id} — ${mode.label}: ${mode.description}

${alreadyBlock(titles, ctx.rejectedTitles)}`;
  return { systemPrompt, userPrompt };
}

function buildSourcePrompt(ctx, source, titles) {
  const systemPrompt = `${ROLE}

Aufgabe: Vollständigkeitsprüfung für GENAU EINE Gefährdungsquelle der strukturierten Liste nach EN 50126-1 7.4.2.1. Frage: Welche Gefährdungen dieser Quelle sind für DIESES System an seiner Grenze relevant und fehlen noch? Jede Gefährdung erhält sourceCategory "${source.id}". Ordne beitragende Funktionen/Schnittstellen zu, wo möglich.
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
GEFÄHRDUNGSQUELLE ${source.code}: ${source.title} — ${source.description}

${alreadyBlock(titles, ctx.rejectedTitles)}`;
  return { systemPrompt, userPrompt };
}

function buildInteractionPrompt(ctx, titles) {
  const systemPrompt = `${ROLE}

Aufgabe: Interaktionsanalyse über alle Funktionen und Schnittstellen hinweg. Suche NUR nach Gefährdungen, die aus dem Zusammenwirken entstehen: Folgeausfälle (ein Ausfall verursacht den nächsten), gemeinsame Ursachen (Energie, Zeitbasis, Kabelwege, Software-Version, Personal, Umwelt), widersprüchliche Annahmen zwischen Funktionen, Mehrfachausfälle mit gemeinsamem Auslöser, Betriebsartwechsel unter Fehlerbedingungen. Keine Einzelfunktions-Gefährdungen wiederholen. Ordne alle beteiligten Funktionen zu.
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  return { systemPrompt, userPrompt: `${contextBlock(ctx)}\n${alreadyBlock(titles, ctx.rejectedTitles)}` };
}

function buildCritiquePrompt(ctx, { titles, bySource, byFunction, byMode }) {
  const systemPrompt = `${ROLE}

Aufgabe: Kritische Vollständigkeitsprüfung der bisherigen Gefährdungsliste (EN 50126-1 7.4.2.1: alle vernünftigerweise vorhersehbaren Gefährdungen; EN 50129 A.4.2.3: keine trivialen Massenlisten). Beurteile die Verteilung über Gefährdungsquellen, Funktionen und Betriebsarten, und benenne 2 bis 6 konkrete Lückenbereiche, in denen für DIESES System glaubhaft Gefährdungen fehlen (z. B. eine Funktion ohne Befunde, eine Quelle ohne Befunde, ein typisches Unfallmuster dieser Systemklasse). Jeder Lückenbereich: "title", "why" (warum eine Lücke, mit Bezug auf System und Verteilung), "sourceCategory", "relatedFunctions".
Antworte NUR mit dem JSON-Objekt nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
VERTEILUNG JE GEFÄHRDUNGSQUELLE: ${bySource.map((s) => `${s.code} ${s.title}: ${s.proposed}`).join('; ')}
VERTEILUNG JE FUNKTION: ${byFunction.map((f) => `${f.id}: ${f.proposed}`).join('; ')}
VERTEILUNG JE BETRIEBSART: ${byMode.map((m) => `${m.id}: ${m.proposed}`).join('; ')}
BISHERIGE GEFÄHRDUNGEN (${(titles || []).length}):
${fmtList(capTitles(titles, 200), (t) => `- ${t}`)}
CHECKLISTE DER DOMÄNE (empirische Phase, EN 50129 A.4.2.3) — prüfe, ob jeder Punkt abgedeckt ist:
${fmtList(((DOMAINS && DOMAINS.packFor(ctx.profile)) || { checklist: [] }).checklist || [], (t) => `- ${t}`)}`;
  return { systemPrompt, userPrompt };
}

function buildGapFillPrompt(ctx, gap, titles) {
  const systemPrompt = `${ROLE}

Aufgabe: Gezielte Lückenfüllung für GENAU EINEN Lückenbereich, den die Kritikphase benannt hat. Identifiziere die fehlenden Gefährdungen dieses Bereichs für DIESES System; verwende sourceCategory "${gap.sourceCategory}" sofern passend.
${HAZARD_RULES}
Antworte NUR mit dem JSON-Objekt {"hazards":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
LÜCKENBEREICH: ${gap.title}
BEGRÜNDUNG DER KRITIK: ${gap.why}
BETROFFENE FUNKTIONEN: ${(gap.relatedFunctions || []).join(', ') || '-'}

${alreadyBlock(titles, ctx.rejectedTitles)}`;
  return { systemPrompt, userPrompt };
}

// --------------------------------------------------------------- analysis ----
function calibrationBlock(cal) {
  const f = cal.frequencies.map((x) => `${x.id} = ${x.label}: ${x.definition} (${x.range})`).join('\n');
  const s = cal.severities.map((x) => `${x.id} = ${x.label}: ${x.persons} / ${x.service}`).join('\n');
  return `HÄUFIGKEITSKATEGORIEN (des UNFALLS, je Einzelinstanz des Systems):\n${f}\nSCHADENSKATEGORIEN:\n${s}`;
}

function hazardBlock(h, functions) {
  const fns = (h.functions || []).map((id) => { const f = (functions || []).find((x) => x.id === id); return f ? `${f.id} ${f.name}` : id; }).join('; ');
  return `GEFÄHRDUNG ${h.id}: ${h.title}
Beschreibung: ${h.description}
Gefährdungsquelle: ${h.sourceCategory || '-'} | Leitwort: ${h.guideword || '-'} | Betriebsarten: ${(h.modes || []).join(', ') || '-'}
Beitragende Funktionen: ${fns || '-'}
Bisherige Ursachen: ${(h.causes || []).map((c) => `${c.text} (${c.kind})`).join('; ') || '-'}
Auslösendes Ereignis: ${h.triggeringEvent || '-'} | Bedingungen: ${(h.enablingConditions || []).join('; ') || '-'}
Vorläufige Auswirkung: ${(h.accidents && h.accidents[0] && h.accidents[0].description) || h.consequence || '-'}`;
}

function buildRiskAnalysisPrompt(ctx, h, calibration) {
  const systemPrompt = `${ROLE}

Aufgabe: Risikoanalyse für GENAU EINE Gefährdung (EN 50126-1 7.4.2.1 Schritte 1–3, EN 50126-2 8.2). Liefere:
- "causes": vollständige, typisierte Ursachen (systematic | random | human | external); "triggeringEvent"; "enablingConditions".
- "railwayHazard": die Gefährdung auf Ebene des Eisenbahnsystems, zu der dieser Zustand führt (EN 50126-2 Bild 7).
- "accidents": 1 bis 3 Unfallszenarien mit jeweils "description", "affected", "severity" + "severityRationale" (≥ 2 Sätze: schlimmster glaubhafter Ausgang, wer betroffen, warum nicht eine Klasse höher/niedriger), "frequency" + "frequencyRationale" (≥ 2 Sätze: Exposition, wie oft die Auslösebedingungen je Einzelinstanz eintreten, warum nicht eine Klasse höher/niedriger; Annahmen benennen). Die Häufigkeit bezieht sich auf den UNFALL, nicht auf den Bauteilausfall.
- "existingBarriers": bereits vorhandene technische oder betriebliche Barrieren mit "type" (frequency | severity), "effectiveness" und "outsideSystem" (true, wenn außerhalb der Systemgrenze → wird Anwendungsbedingung).
- "suggestedRap": Vorschlag des Risikoakzeptanzprinzips (EN 50126-2 8.3): cop = anerkannte Regeln der Technik — NUR wenn du in "reference" ein konkretes, im Bahnbereich anerkanntes Regelwerk mit Nummer nennen kannst, das GENAU diese Gefährdung abdeckt (z. B. ${ex(ctx).copReference}); reference = Referenzsystem — NUR mit benanntem, bewährtem Referenzsystem in "reference"; sonst ere = explizite Risikoabschätzung. "justification" begründet die Wahl. "affected": Dritte (Öffentlichkeit, Nutzer anderer Verkehrswege) sind "third".
- "broadlyAcceptableCandidate": true nur, wenn das Risiko so gering ist, dass keine weitere Maßnahme vernünftig ist (EN 50126-1 6.3), mit "broadlyAcceptableRationale".
- "assumptions": alle getroffenen Annahmen.
Du gibst KEINE Risikoklasse an; sie wird aus der Matrix berechnet. Nur Deutsch, Enum-Werte exakt wie vorgegeben.
${calibrationBlock(calibration)}
Antworte NUR mit dem JSON-Objekt nach Schema.`;
  return { systemPrompt, userPrompt: `${contextBlock(ctx)}\n${hazardBlock(h, ctx.functions)}` };
}

function buildMeasuresPrompt(ctx, h, calibration) {
  const acc = (h.accidents || []).map((a) => `- ${a.description}: ${M.label('severity', a.severity)} / ${M.label('frequency', a.frequency)} → ${M.label('riskClass', a.riskClass)}`).join('\n');
  const systemPrompt = `${ROLE}

Aufgabe: Risikominderungsmaßnahmen für GENAU EINE bewertete Gefährdung (EN 50126-1 5.9.2, 7.4.2.1 Schritte 4–5). Schlage 2 bis 5 konkrete Maßnahmen vor, in dieser Präferenzreihenfolge: (1) Gefährdung vermeiden ("elimination"), (2) Häufigkeit der Gefährdung senken ("frequencyReduction"), (3) Übergang zum Unfall verhindern ("propagationReduction"), (4) Schadensausmaß mindern ("severityMitigation"). "hierarchy" nach EN 50126-1 5.9.2: safeFunction (a) die Funktion selbst sicher gestalten) | additionalSafety (b) zusätzliche Sicherheitsfunktion oder Barriere) | safetyInformation (c) sicherheitsbezogene Information bzw. Auflage für Anwendung, Instandhaltung oder Betrieb — nachrangig).
Je Maßnahme: "text" (konkret, prüfbar, systemspezifisch), "residualSeverity"/"residualFrequency" des Unfalls NACH der Maßnahme (Kategorien wie vorgegeben), "rationale" (≥ 2 Sätze: Wirkmechanismus und warum die Restrisikoschätzung glaubhaft und nicht optimistisch ist), "insideSystem" (false, wenn die Maßnahme außerhalb der Systemgrenze liegt → Anwendungsbedingung für Betreiber/Instandhalter).
Keine Risikoklasse angeben. Nur Deutsch.
${calibrationBlock(calibration)}
Antworte NUR mit dem JSON-Objekt {"measures":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
${hazardBlock(h, ctx.functions)}
UNFALLSZENARIEN UND BEWERTUNG:
${acc || '-'}
BESTEHENDE BARRIEREN: ${(h.existingBarriers || []).map((b) => b.text).join('; ') || '-'}`;
  return { systemPrompt, userPrompt };
}

function buildRequirementsPrompt(ctx, h, calibration) {
  const measures = (h.measures || []).filter((m) => m.status !== 'rejected').map((m, i) => `[${i}] ${m.id || ''} ${m.text} (${M.label('hierarchy', m.hierarchy)}; ${m.becomesSrac || m.insideSystem === false ? 'außerhalb der Systemgrenze' : 'innerhalb'})`).join('\n');
  const systemPrompt = `${ROLE}

Aufgabe: Ableitung der Sicherheitsanforderungen für GENAU EINE Gefährdung aus ihren bestätigten Maßnahmen (EN 50126-1 7.5.2, EN 50126-2 9.2–9.3, EN 50129 5.3.7, 5.3.13). Erzeuge je Maßnahme mindestens eine Anforderung; fasse nichts zusammen, was getrennt verifiziert wird.
Kategorien: "functional" = funktionale Sicherheitsanforderung an eine Funktion des Systems (Verhalten, Verhalten im Fehlerfall, sicherer Zustand "safeState", maximale Zeit bis zum sicheren Zustand "timeToSafeState", Fehlererkennung "detection"; "functions" = betroffene Funktions-IDs); "technical" = technische Anforderung an Entwurf/Realisierung (Umwelt, EMV, Mechanik, Regelwerkskonformität); "contextual" = betriebliche oder instandhalterische Anforderung innerhalb des Systems; "srac" = sicherheitsbezogene Anwendungsbedingung für einen Empfänger AUSSERHALB der Systemgrenze (Betreiber, Instandhalter, Projektierung, Integrator) — "sracReceiver" nennen.
Formulierung: "text" als prüfbare Forderung mit "muss"/"darf nicht", eine Forderung je Anforderung, messbare Größen mit Zahl und Einheit, keine Lösungsvorgabe außer wenn die Maßnahme sie ist. "verificationMethod": test | analysis | inspection | demonstration | review, mit "verificationNote". "rationale": Bezug zur Gefährdung und Maßnahme. "measureIndexes": Indizes der Maßnahmen, die die Anforderung umsetzt.
Du vergibst KEINE SIL, KEINE THR und KEINE TFFR. Nur Deutsch.
Antworte NUR mit dem JSON-Objekt {"requirements":[...]} nach Schema.`;
  const userPrompt = `${contextBlock(ctx)}
${hazardBlock(h, ctx.functions)}
RISIKOKLASSE: ${M.label('riskClass', h.riskClass)} | RESTRISIKO NACH MASSNAHMEN: ${M.label('riskClass', h.residualRiskClass)}
BESTÄTIGTE MASSNAHMEN:
${measures || '(keine — leite Anforderungen aus den bestehenden Barrieren und dem sicheren Zustand ab)'}`;
  return { systemPrompt, userPrompt };
}

const api = { buildThreatPrompt, buildCoEngineeringPrompt, ROLE, contextBlock, capTitles, buildDecompositionPrompt, buildFunctionPrompt, buildInterfacePrompt, buildModePrompt, buildSourcePrompt, buildInteractionPrompt, buildCritiquePrompt, buildGapFillPrompt, buildRiskAnalysisPrompt, buildMeasuresPrompt, buildRequirementsPrompt };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.RHAS_PROMPTS = api;
})();

