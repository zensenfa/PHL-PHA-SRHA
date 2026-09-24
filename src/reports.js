// Report generation for the Railway Hazard Analysis Suite: DOCX (own writer),
// XLSX (SheetJS) and a print-ready HTML view, all from one bundle and one set
// of table specifications, so the three formats can never disagree.
// Deliverables follow EN 50126-1 phase 3/4 outputs: hazard identification,
// risk analysis and evaluation, hazard log, safety requirements and SRAC,
// and the combined report.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;
const DOCX = typeof require !== 'undefined' ? require('./docx.js') : window.RHAS_DOCX;

const L = (k, v) => M.label(k, v);
const nz = (v) => (v == null ? '' : String(v));
const join = (arr, sep = '; ') => (arr || []).filter(Boolean).join(sep);
const dateDe = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const RISK_SHADE = { Intolerable: 'FDECEB', Undesirable: 'FBF0DF', Tolerable: 'F7F1D6', Negligible: 'E6F3EA' };
const riskCell = (rc) => (rc ? { text: L('riskClass', rc), shade: RISK_SHADE[rc], bold: true } : '–');

const REFERENCES = [
  ['EN 50126-1:2017', 'Bahnanwendungen – Spezifikation und Nachweis der Zuverlässigkeit, Verfügbarkeit, Instandhaltbarkeit und Sicherheit (RAMS) – Teil 1: Generischer RAMS-Prozess'],
  ['EN 50126-2:2017', 'RAMS – Teil 2: Systembezogene Sicherheitsmethodik'],
  ['EN 50129:2018', 'Bahnanwendungen – Telekommunikationstechnik, Signaltechnik und Datenverarbeitungssysteme – Sicherheitsrelevante elektronische Systeme für Signaltechnik'],
];
const ACRONYMS = [['CCA', 'Common Cause Analysis (Analyse gemeinsamer Ursachen)'], ['CoP', 'Code of Practice (anerkannte Regeln der Technik)'], ['ERE', 'Explizite Risikoabschätzung'], ['RAC', 'Risikoakzeptanzkriterium'], ['RAP', 'Risikoakzeptanzprinzip'], ['SIL', 'Sicherheitsintegritätslevel'], ['SRAC', 'Safety-Related Application Condition (sicherheitsbezogene Anwendungsbedingung)'], ['SRS', 'Safety Requirements Specification (Sicherheitsanforderungsspezifikation)'], ['TFFR', 'Tolerable Functional Failure Rate (tolerierbare Funktionsausfallrate)'], ['THR', 'Tolerable Hazard Rate (tolerierbare Gefährdungsrate)']];

// Deliverables follow the EN 50126-1:2017 outputs of phase 3 (7.4.3 a) risk
// assessment, b) hazard log) and phase 4 (7.5.3 a) RAMS system requirements
// specification — safety part, b) SRAC). Keys 'phl'/'pha' are kept as
// aliases so older exports and bookmarks keep working.
const DELIVERABLES = {
  hazid: { code: 'GI', title: 'Gefährdungsidentifikation', purpose: 'Systematische Identifikation aller vernünftigerweise vorhersehbaren Gefährdungen des Systems an seiner Systemgrenze als erster Teil der Risikobewertung (EN 50126-1:2017 7.4.2.1, 7.4.3 a); EN 50126-2:2017 5.2.2, 8.2).' },
  risk: { code: 'RB', title: 'Risikoanalyse und Risikobewertung', purpose: 'Ursachen, Unfallszenarien, Häufigkeit und Schadensausmaß, Risikoklasse, Entscheidung „weitgehend akzeptabel“, Risikoakzeptanzprinzip und -kriterium, Maßnahmen und Restrisiko je Gefährdung (EN 50126-1:2017 6.3, 7.4.2.1, 7.4.3 a); EN 50126-2:2017 8.2–8.4).' },
  hazlog: { code: 'GP', title: 'Gefährdungsprotokoll (Hazard Log)', purpose: 'Grundlage des fortlaufenden Risikomanagements für die Sicherheit: je Gefährdung verantwortliche Stelle und beitragende Funktionen, Folgen und Häufigkeiten, Risiko, Risikoakzeptanzprinzip und -kriterium, Maßnahmen und exportierte Sicherheitsauflagen (EN 50126-1:2017 7.4.2.2 a) bis g), 7.4.3 b); EN 50129:2018 5.3.6).' },
  srs: { code: 'SAS', title: 'Sicherheitsanforderungen und sicherheitsbezogene Anwendungsbedingungen', purpose: 'Sicherheitsteil der RAMS-Systemanforderungsspezifikation: funktionale, technische und betriebliche Sicherheitsanforderungen sowie sicherheitsbezogene Anwendungsbedingungen, rückverfolgbar zu Gefährdungen, Maßnahmen und Funktionen, mit TFFR und Integritätslevel je sicherheitsrelevanter Funktion (EN 50126-1:2017 7.5.2, 7.5.3 a), b); EN 50126-2:2017 9, 10; EN 50129:2018 5.3.7, 5.3.13, Anhang A).' },
  full: { code: 'SA', title: 'Sicherheitsanalyse (EN 50126-1 Phasen 3 und 4)', purpose: 'Gesamtbericht aus Gefährdungsidentifikation, Risikoanalyse und -bewertung, Gefährdungsprotokoll sowie Sicherheitsanforderungen und Anwendungsbedingungen nach EN 50126-1/-2:2017 und EN 50129:2018.' },
};
const KIND_ALIASES = { phl: 'hazid', pha: 'risk' };
const resolveKind = (kind) => KIND_ALIASES[kind] || kind;
const SCOPE_NOTE = 'Umfang: Dieses Dokument behandelt den Sicherheitsteil (S) des RAMS-Prozesses nach EN 50126-1. RAM-Äquivalente von Gefährdungen (EN 50126-1 7.4.2.1) sind nicht Gegenstand dieses Dokuments.';

// ------------------------------------------------------------ table specs ----
function acceptedHazards(b) { return (b.hazards || []).filter((h) => h.review && h.review.decision === 'accepted').sort((x, y) => x.id.localeCompare(y.id)); }
function rejectedHazards(b) { return (b.hazards || []).filter((h) => h.review && h.review.decision === 'rejected').sort((x, y) => x.id.localeCompare(y.id)); }
function fnName(b, id) { const f = (b.functions || []).find((x) => x.id === id); return f ? `${f.id} ${f.name}` : id; }
function ifName(b, id) { const i = (b.interfaces || []).find((x) => x.id === id); return i ? `${i.id} ${i.name}` : id; }
function srcLabel(b, id) { const s = (b.sources || []).find((x) => x.id === id); return s ? `${s.code} ${s.title}` : nz(id); }
function gwLabel(b, id) { const g = (b.guidewords || []).find((x) => x.id === id); return g ? g.label : ''; }
/** A consolidated hazard covers several guideword deviations; list them all in the report. */
function gwLabels(b, h) { const ids = (h.guidewords || []).length ? h.guidewords : (h.guideword ? [h.guideword] : []); return ids.map((i) => gwLabel(b, i)).filter(Boolean).join(', '); }
function modeLabel(b, id) { const m = (b.modes || []).find((x) => x.id === id); return m ? m.label : id; }

function specSystemDefinition(b) {
  const rows = M.SYSTEM_DEFINITION_FIELDS.map((f) => [`${f.label}${f.norm === 'N' ? ' (N)' : ''}`, `EN 50126-1 ${f.ref}`, nz(b.sd[f.key])]);
  rows.push(['Betriebsarten im Umfang', 'EN 50126-1 7.3.2.1 c)', join((b.sd.modes || []).map((m) => modeLabel(b, m)), ', ')]);
  return { key: 'sd', title: 'Systemdefinition', columns: [{ header: 'Merkmal', width: 0.28 }, { header: 'Bezug', width: 0.14 }, { header: 'Inhalt', width: 0.58 }], rows, landscape: false, firstColBold: true };
}
function specFunctions(b) {
  return { key: 'functions', title: 'Funktionen', columns: [{ header: 'ID', width: 0.07 }, { header: 'Funktion', width: 0.18 }, { header: 'Beschreibung', width: 0.3 }, { header: 'Art', width: 0.09 }, { header: 'Sich.-rel.', width: 0.07 }, { header: 'Sicherer Zustand', width: 0.15 }, { header: 'Teilsystem', width: 0.08 }, { header: 'Betriebsarten', width: 0.06 }], rows: (b.functions || []).map((f) => [f.id, f.name, f.description, L('functionKind', f.kind), f.safetyRelated === true ? 'ja' : f.safetyRelated === false ? 'nein' : 'offen', f.safeState, f.subsystem, join((f.modes || []).map((m) => modeLabel(b, m)), ', ')]) };
}
function specInterfaces(b) {
  const T = { physical: 'Physisch', functional: 'Funktional', human: 'Mensch', externalSystem: 'Fremdsystem', organisation: 'Organisation' };
  return { key: 'interfaces', title: 'Schnittstellen', columns: [{ header: 'ID', width: 0.08 }, { header: 'Schnittstelle', width: 0.22 }, { header: 'Typ', width: 0.12 }, { header: 'Gegenstelle', width: 0.18 }, { header: 'Beschreibung', width: 0.4 }], rows: (b.interfaces || []).map((i) => [i.id, i.name, T[i.type] || i.type, i.partner, i.description]) };
}
function specDocuments(b) {
  return { key: 'documents', title: 'Referenzdokumente', columns: [{ header: 'Dokument', width: 0.4 }, { header: 'Umfang (Zeichen)', width: 0.2 }, { header: 'Hinweis', width: 0.4 }], rows: (b.sd.documents || []).map((d) => [d.name, String((d.text || '').length), d.note || '']) };
}
function specRuns(b) {
  const MODE = { identification: 'Gefährdungsidentifikation', analysis: 'Risikoanalyse', measures: 'Maßnahmen', requirements: 'Anforderungen' };
  return { key: 'runs', title: 'KI-Läufe (Methodennachweis)', columns: [{ header: 'Lauf', width: 0.12 }, { header: 'Art', width: 0.16 }, { header: 'Tiefe', width: 0.08 }, { header: 'Modell', width: 0.16 }, { header: 'Beginn', width: 0.12 }, { header: 'Aufrufe', width: 0.07 }, { header: 'Durchläufe', width: 0.09 }, { header: 'Ergebnis', width: 0.2 }], rows: (b.runs || []).map((r) => [r.runId, MODE[r.mode] || r.mode, r.depth ? (window !== undefined && window.RHAS_ENGINE ? window.RHAS_ENGINE.DEPTHS[r.depth].label : r.depth) : '', r.model, dateDe(r.startedAt), String(r.calls), String((r.passes || []).length || (r.totals && r.totals.passes) || ''), `${r.totals ? r.totals.proposed : ''} Vorschläge${r.totals && r.totals.failed ? `, ${r.totals.failed} fehlgeschlagen` : ''}${r.cancelled ? ', abgebrochen' : ''}${r.stoppedBy ? `, gestoppt (${r.stoppedBy})` : ''}`]) };
}
function specPassLog(b) {
  const rows = [];
  for (const r of b.runs || []) for (const p of r.passes || []) rows.push([r.runId, p.label, p.ok ? String(p.proposed != null ? p.proposed : '') : `Fehler: ${p.error || ''}`, p.merged ? String(p.merged) : '', p.duplicatesFlagged ? String(p.duplicatesFlagged) : '', p.durationMs ? `${Math.round(p.durationMs / 1000)} s` : '', p.assessment || (p.gapAreas ? p.gapAreas.map((g) => g.title).join('; ') : '')]);
  return { key: 'passes', title: 'Durchläufe der Gefährdungsidentifikation', columns: [{ header: 'Lauf', width: 0.1 }, { header: 'Durchlauf', width: 0.3 }, { header: 'Vorschläge', width: 0.08 }, { header: 'Zusammengeführt', width: 0.08 }, { header: 'Dup.-Verdacht', width: 0.08 }, { header: 'Dauer', width: 0.07 }, { header: 'Kritik / Lücken', width: 0.29 }], rows };
}
function specCoverage(b) {
  const c = b.coverage;
  const rows = [];
  for (const s of c.bySource) rows.push(['Gefährdungsquelle', `${s.code} ${s.title}`, s.searched ? 'ja' : 'nein', String(s.proposed), String(s.accepted)]);
  for (const f of c.byFunction) rows.push(['Funktion', `${f.id} ${f.name}`, f.searched ? 'ja' : 'nein', String(f.proposed), String(f.accepted)]);
  for (const i of c.byInterface) rows.push(['Schnittstelle', `${i.id} ${i.name}`, i.searched ? 'ja' : 'nein', String(i.proposed), String(i.accepted)]);
  for (const m of c.byMode) rows.push(['Betriebsart', m.label, m.searched ? 'ja' : 'nein', String(m.proposed), String(m.accepted)]);
  for (const g of c.byGuideword) rows.push(['Leitwort', g.label, '–', String(g.proposed), String(g.accepted)]);
  for (const m of c.byMethod) rows.push(['Methode', m.label, '–', String(m.proposed), String(m.accepted)]);
  return { key: 'coverage', title: 'Abdeckungsnachweis', columns: [{ header: 'Dimension', width: 0.16 }, { header: 'Einheit', width: 0.44 }, { header: 'Durchsucht', width: 0.1 }, { header: 'Vorgeschlagen', width: 0.15 }, { header: 'Übernommen', width: 0.15 }], rows };
}
function specPhl(b) {
  return { key: 'phl', title: 'Gefährdungsliste', landscape: true, columns: [{ header: 'ID', width: 0.05 }, { header: 'Gefährdung', width: 0.22 }, { header: 'Quelle', width: 0.09 }, { header: 'Funktionen / Schnittstellen', width: 0.11 }, { header: 'Leitwort', width: 0.07 }, { header: 'Betriebsarten', width: 0.07 }, { header: 'Ursachen', width: 0.16 }, { header: 'Auslöser / Bedingungen', width: 0.11 }, { header: 'Vorläufige Auswirkung', width: 0.12 }], rows: acceptedHazards(b).map((h) => [h.id, { paragraphs: [{ text: h.title, bold: true }, h.description] }, srcLabel(b, h.sourceCategory), join([...(h.functions || []), ...(h.interfaces || [])], ', '), gwLabels(b, h), join((h.modes || []).map((m) => modeLabel(b, m)), ', '), join((h.causes || []).map((c) => `${c.text} (${L('causeKind', c.kind)})`)), join([h.triggeringEvent, ...(h.enablingConditions || []).map((e) => `Bedingung: ${e}`)]), h.accidents && h.accidents[0] ? h.accidents[0].description : '']) };
}
function specRejected(b) {
  return { key: 'rejected', title: 'Verworfene Vorschläge', columns: [{ header: 'ID', width: 0.08 }, { header: 'Vorschlag', width: 0.42 }, { header: 'Herkunft', width: 0.15 }, { header: 'Begründung der Verwerfung', width: 0.35 }], rows: rejectedHazards(b).map((h) => [h.id, h.title, L('method', h.method), `${h.review.rationale || ''}${h.review.by ? ` (${h.review.by}, ${dateDe(h.review.at)})` : ''}`]) };
}
function specCalibration(b) {
  const cal = b.calibration;
  const freq = { key: 'cal-f', title: `Häufigkeitskategorien (${cal.title})`, columns: [{ header: 'Kategorie', width: 0.2 }, { header: 'Beschreibung', width: 0.45 }, { header: 'Beispielbereich (je Einzelinstanz)', width: 0.35 }], rows: cal.frequencies.map((f) => [f.label, f.definition, f.range]) };
  const sev = { key: 'cal-s', title: 'Schadenskategorien', columns: [{ header: 'Kategorie', width: 0.2 }, { header: 'Personen / Umwelt', width: 0.45 }, { header: 'Betrieb / Sachwerte', width: 0.35 }], rows: cal.severities.map((s) => [s.label, s.persons, s.service]) };
  const rc = { key: 'cal-r', title: 'Risikoakzeptanzkategorien', columns: [{ header: 'Kategorie', width: 0.2 }, { header: 'Erforderliche Handlung', width: 0.8 }], rows: cal.riskClasses.map((r) => [riskCell(r.id), r.action]) };
  const mx = { key: 'cal-m', title: 'Risikomatrix (Unfallhäufigkeit × Schadensausmaß)', columns: [{ header: 'Häufigkeit \\ Schadensausmaß', width: 0.28 }, ...cal.severities.map((s) => ({ header: s.label, width: 0.18 }))], rows: cal.frequencies.map((f) => [{ text: f.label, bold: true }, ...cal.severities.map((s) => riskCell(cal.matrix[f.id][s.id]))]), zebra: false };
  return [freq, sev, rc, mx];
}
function specPha(b) {
  const rows = [];
  for (const h of acceptedHazards(b)) {
    const acc = (h.accidents || []).map((a, i) => `${(h.accidents.length > 1 ? `A${i + 1}: ` : '')}${a.description} [${join((a.affected || []).map((x) => L('affected', x)), ', ')}] – ${L('severity', a.severity) || '?'} / ${L('frequency', a.frequency) || '?'} → ${L('riskClass', a.riskClass) || '?'}`);
    const rat = (h.accidents || []).map((a, i) => `${h.accidents.length > 1 ? `A${i + 1}: ` : ''}S: ${a.severityRationale || '–'} | H: ${a.frequencyRationale || '–'}`);
    const eval_ = h.broadlyAcceptable && h.broadlyAcceptable.decision === true ? `Weitgehend akzeptabel: ${h.broadlyAcceptable.justification || '(Begründung fehlt)'}` : h.broadlyAcceptable && h.broadlyAcceptable.decision === false ? `${L('rap', h.rap.principle) || 'RAP offen'}${h.rap.reference ? ` – ${h.rap.reference}` : ''}${h.rap.principle === 'ere' ? ` – RAC: ${L('rac', h.rap.rac) || 'offen'}` : ''}${h.rap.justification ? `. ${h.rap.justification}` : ''}` : 'Entscheidung offen';
    rows.push([h.id, { paragraphs: [{ text: h.title, bold: true }, h.description] }, join((h.causes || []).map((c) => `${c.text} (${L('causeKind', c.kind)})`)), join([h.triggeringEvent, ...(h.enablingConditions || []).map((e) => `+ ${e}`)]), nz(h.railwayHazard), { paragraphs: acc.length ? acc : ['–'] }, { paragraphs: rat.length ? rat : ['–'] }, riskCell(h.riskClass), join((h.existingBarriers || []).map((x) => `${x.text} (${L('barrierType', x.type)}${x.becomesSrac ? ', außerhalb → SRAC' : ''})`)), eval_, h.thr && h.thr.valuePerHour != null ? `${M.formatRate(Number(h.thr.valuePerHour))}${h.thr.origin ? ` (${L('thrOrigin', h.thr.origin)})` : ''}` : '–']);
  }
  return { key: 'pha', title: 'Risikoanalyse und -bewertung je Gefährdung', landscape: true, fontSize: 8, columns: [{ header: 'ID', width: 0.04 }, { header: 'Gefährdung', width: 0.14 }, { header: 'Ursachen', width: 0.11 }, { header: 'Auslöser / Bedingungen', width: 0.08 }, { header: 'Gefährdung Eisenbahnsystem', width: 0.07 }, { header: 'Unfallszenarien (S / H → Risiko)', width: 0.14 }, { header: 'Begründungen', width: 0.14 }, { header: 'Risikoklasse', width: 0.06 }, { header: 'Bestehende Barrieren', width: 0.08 }, { header: 'Bewertung (RAP / RAC)', width: 0.09 }, { header: 'THR', width: 0.05 }], rows };
}
function specMeasures(b) {
  const rows = [];
  for (const h of acceptedHazards(b)) for (const m of (h.measures || []).filter((x) => x.status !== 'rejected')) rows.push([h.id, h.title, m.id, m.text, L('measureType', m.type), L('hierarchy', m.hierarchy), `${L('severity', m.residualSeverity) || '?'} / ${L('frequency', m.residualFrequency) || '?'}`, riskCell(m.residualRiskClass), m.becomesSrac ? 'außerhalb → SRAC' : 'innerhalb', m.status === 'accepted' ? 'bestätigt' : 'vorgeschlagen', m.rationale]);
  return { key: 'measures', title: 'Maßnahmen und Restrisiko', landscape: true, fontSize: 8, columns: [{ header: 'Gef.', width: 0.05 }, { header: 'Gefährdung', width: 0.12 }, { header: 'Maßn.', width: 0.05 }, { header: 'Maßnahme', width: 0.2 }, { header: 'Wirkung', width: 0.09 }, { header: 'Hierarchie', width: 0.09 }, { header: 'Rest S / H', width: 0.09 }, { header: 'Restrisiko', width: 0.07 }, { header: 'Grenze', width: 0.06 }, { header: 'Status', width: 0.05 }, { header: 'Begründung', width: 0.13 }], rows };
}
/** EN 50126-1:2017 7.4.2.2 b) to g): one row per accepted hazard. */
function specHazardLog(b) {
  const rows = [];
  for (const h of acceptedHazards(b)) {
    const sracs = (b.requirements || []).filter((r) => r.category === 'srac' && r.status !== 'rejected' && (r.hazards || []).includes(h.id)).map((r) => `${r.id} → ${(r.srac && r.srac.receiver) || 'Empfänger offen'}`);
    const exported = new Set((b.requirements || []).filter((r) => r.category === 'srac' && r.status !== 'rejected').flatMap((r) => r.measures || []));
    const candidates = [...(h.measures || []).filter((m) => m.status !== 'rejected' && m.becomesSrac && !exported.has(`${h.id}/${m.id}`)).map((m) => `${m.id || 'Maßnahme'} (Kandidat)`), ...(h.existingBarriers || []).filter((x) => x.becomesSrac).map((x) => `${x.text} (Kandidat)`)];
    const acc = (h.accidents || []).map((a) => `${a.description || '–'}: ${L('severity', a.severity) || '?'} / ${L('frequency', a.frequency) || '?'}`);
    const ba = h.broadlyAcceptable || {};
    const rap = ba.decision === true ? 'weitgehend akzeptabel' : [L('rap', h.rap && h.rap.principle), h.rap && h.rap.principle === 'ere' ? L('rac', h.rap.rac) : (h.rap && h.rap.reference)].filter(Boolean).join(' / ') || 'offen';
    const thr = h.thr && h.thr.valuePerHour != null ? `THR ${M.formatRate(Number(h.thr.valuePerHour))}` : '';
    rows.push([
      h.id, h.title, nz(h.responsibleEntity || h.owner) || 'offen',
      join([...(h.functions || []).map((f) => fnName(b, f)), ...(h.interfaces || []).map((i) => ifName(b, i))]),
      join(acc) || 'offen',
      `${L('riskClass', h.riskClass) || 'offen'} → ${L('riskClass', h.residualRiskClass) || 'offen'}`,
      join([rap, thr]),
      join((h.measures || []).filter((m) => m.status !== 'rejected').map((m) => `${m.id ? m.id + ': ' : ''}${m.text}`)) || '–',
      join([...sracs, ...candidates]) || '–',
      L('hazardStatus', h.status),
    ]);
  }
  return { key: 'hazlog', title: 'Gefährdungsprotokoll', landscape: true, fontSize: 8, columns: [{ header: 'ID', width: 0.05 }, { header: 'Gefährdung', width: 0.14 }, { header: 'Verantwortlich (b)', width: 0.08 }, { header: 'Beitragende Funktionen (b)', width: 0.1 }, { header: 'Folgen / Häufigkeit (c)', width: 0.14 }, { header: 'Risiko → Rest (d)', width: 0.08 }, { header: 'RAP / RAC (e)', width: 0.1 }, { header: 'Maßnahmen (f)', width: 0.14 }, { header: 'Exportierte Auflagen (g)', width: 0.11 }, { header: 'Status', width: 0.06 }], rows };
}
function specEvaluationSummary(b) {
  const st = b.stats;
  const rows = M.RISK_CLASSES.map((c) => [riskCell(c), String(st.byClass[c] || 0), String(st.residualByClass[c] || 0)]);
  rows.push(['Weitgehend akzeptabel (6.3)', String(st.hazards.broadlyAcceptable), '–']);
  rows.push(['Nicht klassifiziert', String(st.hazards.accepted - M.RISK_CLASSES.reduce((n, c) => n + (st.byClass[c] || 0), 0)), '–']);
  return { key: 'eval', title: 'Ergebnis der Risikobewertung', columns: [{ header: 'Risikoklasse', width: 0.4 }, { header: 'Ausgangsrisiko (Gefährdungen)', width: 0.3 }, { header: 'Restrisiko nach Maßnahmen', width: 0.3 }], rows, zebra: false };
}
function specOpenPoints(b) {
  const rows = [];
  for (const h of acceptedHazards(b)) { const c = M.hazardCompleteness(h); if (!c.controlled) rows.push([h.id, h.title, join(c.problems)]); }
  return { key: 'open', title: 'Offene Punkte (unvollständige Datensätze)', columns: [{ header: 'ID', width: 0.08 }, { header: 'Gefährdung', width: 0.32 }, { header: 'Fehlende Angaben', width: 0.6 }], rows };
}
function specAssumptions(b) {
  const rows = [];
  if (b.sd.assumptions) for (const line of b.sd.assumptions.split('\n').map((x) => x.trim()).filter(Boolean)) rows.push(['Systemdefinition', line]);
  for (const c of b.ccas || []) for (const a of c.assumptions || []) rows.push([`CCA ${c.id}`, a]);
  for (const h of acceptedHazards(b)) for (const x of (h.existingBarriers || []).filter((bb) => bb.becomesSrac)) rows.push([`Barriere ${h.id}`, `${x.text} (außerhalb der Systemgrenze, wird Anwendungsbedingung)`]);
  return { key: 'assumptions', title: 'Annahmen', columns: [{ header: 'Herkunft', width: 0.2 }, { header: 'Annahme', width: 0.8 }], rows };
}
function specFunctionIntegrity(b) {
  const hz = acceptedHazards(b);
  return { key: 'fn-sil', title: 'Funktionen und Sicherheitsintegrität (EN 50126-2 Tabelle 2 / EN 50129 Tabelle A.1)', landscape: true, columns: [{ header: 'ID', width: 0.05 }, { header: 'Funktion', width: 0.18 }, { header: 'Art', width: 0.09 }, { header: 'Sich.-rel.', width: 0.06 }, { header: 'Begründung', width: 0.16 }, { header: 'TFFR [1/h]', width: 0.08 }, { header: 'Integrität (gefordert)', width: 0.1 }, { header: 'Gefährdungen / THR', width: 0.14 }, { header: 'Prüfhinweise', width: 0.14 }], rows: (b.functions || []).map((f) => { const integ = M.functionIntegrity(f); const rel = hz.filter((h) => (h.functions || []).includes(f.id)); const notes = []; if (integ.note) notes.push(integ.note); for (const h of rel) for (const fnd of M.checkHazardAllocation(h, b.functions, b.ccas).findings) notes.push(`${h.id}: ${fnd.text}`); return [f.id, f.name, L('functionKind', f.kind), f.safetyRelated === true ? 'ja' : f.safetyRelated === false ? 'nein' : 'offen', f.safetyRelatedRationale, f.tffr != null && f.tffr !== '' ? M.formatRate(Number(f.tffr)) : '–', L('integrity', integ.integrity), join(rel.map((h) => `${h.id}${h.thr && h.thr.valuePerHour != null ? ` (THR ${M.formatRate(Number(h.thr.valuePerHour))})` : ''}`)), join([...new Set(notes)])]; }) };
}
function specRequirements(b, category) {
  const reqs = (b.requirements || []).filter((r) => r.category === category && r.status !== 'rejected').sort((x, y) => x.id.localeCompare(y.id));
  return { key: `req-${category}`, title: L('reqCategory', category), landscape: true, fontSize: 8, columns: [{ header: 'ID', width: 0.06 }, { header: 'Titel', width: 0.12 }, { header: 'Anforderung', width: 0.26 }, { header: 'Gefährdungen', width: 0.08 }, { header: 'Funktionen', width: 0.08 }, { header: 'Maßnahmen', width: 0.07 }, { header: 'Sicherer Zustand / Zeit / Erkennung', width: 0.12 }, { header: 'Verifikation', width: 0.08 }, { header: 'Status', width: 0.05 }, { header: 'Begründung', width: 0.08 }], rows: reqs.map((r) => [r.id, r.title, r.text, join(r.hazards, ', '), join(r.functions, ', '), join(r.measures, ', '), join([r.safeState, r.timeToSafeState, r.detection], ' / '), `${L('verification', r.verificationMethod)}${r.verificationNote ? `: ${r.verificationNote}` : ''}`, L('reqStatus', r.status), r.rationale]) };
}
function specSrac(b) {
  const reqs = (b.requirements || []).filter((r) => r.category === 'srac' && r.status !== 'rejected').sort((x, y) => x.id.localeCompare(y.id));
  return { key: 'srac', title: 'Sicherheitsbezogene Anwendungsbedingungen (EN 50129 5.3.13, Tabelle 1)', landscape: true, columns: [{ header: 'Identifier', width: 0.07 }, { header: 'Titel', width: 0.15 }, { header: 'Herkunft', width: 0.12 }, { header: 'Gefährdung(en)', width: 0.1 }, { header: 'Empfänger', width: 0.12 }, { header: 'Text', width: 0.28 }, { header: 'Nachweis', width: 0.1 }, { header: 'Status', width: 0.06 }], rows: reqs.map((r) => [r.id, r.title, r.srac && r.srac.origin || '', join(r.hazards, ', '), r.srac && r.srac.receiver || '(fehlt)', r.text, r.srac && r.srac.verification || L('verification', r.verificationMethod), L('reqStatus', r.status)]) };
}
function specTrace(b) {
  const tr = b.trace;
  return { key: 'trace', title: 'Nachverfolgbarkeit Gefährdung → Funktion → Maßnahme → Anforderung', landscape: true, columns: [{ header: 'Gefährdung', width: 0.07 }, { header: 'Titel', width: 0.2 }, { header: 'Risiko → Rest', width: 0.12 }, { header: 'Funktionen (Integrität)', width: 0.18 }, { header: 'Maßnahmen', width: 0.12 }, { header: 'Anforderungen', width: 0.21 }, { header: 'Status', width: 0.1 }], rows: tr.hazardRows.map((row) => [row.hazard.id, row.hazard.title, `${L('riskClass', row.hazard.riskClass) || '–'} → ${L('riskClass', row.hazard.residualRiskClass) || '–'}`, join(row.functions.map((f) => `${f.id} (${L('integrity', M.functionIntegrity(f).integrity)})`)), join((row.hazard.measures || []).filter((m) => m.status !== 'rejected').map((m) => m.id), ', '), join(row.requirements.map((r) => `${r.id} (${L('reqCategory', r.category).split(' ')[0]})`)), row.hazard.broadlyAcceptable && row.hazard.broadlyAcceptable.decision === true ? 'weitgehend akzeptabel' : row.requirements.length ? 'nachverfolgt' : 'OHNE ANFORDERUNG']) };
}
function specCca(b) {
  return { key: 'cca', title: 'Unabhängigkeitsnachweise (CCA)', columns: [{ header: 'ID', width: 0.08 }, { header: 'Funktionen', width: 0.2 }, { header: 'Zufällig unabh.', width: 0.1 }, { header: 'Systematisch unabh.', width: 0.1 }, { header: 'Ergebnis', width: 0.1 }, { header: 'Nachweis', width: 0.2 }, { header: 'Annahmen', width: 0.22 }], rows: (b.ccas || []).map((c) => [c.id, join(c.functions, ', '), c.randomIndependence ? 'ja' : 'nein', c.systematicIndependence ? 'ja' : 'nein', c.outcome === 'independent' ? 'unabhängig' : 'abhängig', c.evidenceRef, join(c.assumptions)]) };
}
function specNotSafetyRelated(b) {
  return { key: 'nsr', title: 'Als nicht sicherheitsrelevant eingestufte Funktionen (EN 50129 5.3.1)', columns: [{ header: 'ID', width: 0.1 }, { header: 'Funktion', width: 0.3 }, { header: 'Begründung', width: 0.6 }], rows: (b.functions || []).filter((f) => f.safetyRelated === false).map((f) => [f.id, f.name, f.safetyRelatedRationale || '(Begründung fehlt)']) };
}

// -------------------------------------------------------------- sections ----
/** Section list per deliverable: {heading, level, paragraphs?, bullets?, specs?} — consumed by DOCX and HTML. */
function sections(kind, b) {
  kind = resolveKind(kind);
  const d = DELIVERABLES[kind];
  const st = b.stats;
  const common = [
    { heading: '1 Zweck und Geltungsbereich', paragraphs: [d.purpose, SCOPE_NOTE, `System: ${b.sd.name || '(ohne Namen)'} (${b.sd.type || ''}). Zweck des Systems: ${b.sd.purpose || '–'}`, b.docControl.purpose || ''] },
    { heading: '2 Normative Referenzen und Abkürzungen', specs: [{ key: 'refs', title: 'Referenzen', columns: [{ header: 'Dokument', width: 0.22 }, { header: 'Titel', width: 0.78 }], rows: REFERENCES }, { key: 'acr', title: 'Abkürzungen', columns: [{ header: 'Abkürzung', width: 0.15 }, { header: 'Bedeutung', width: 0.85 }], rows: ACRONYMS }] },
    { heading: '3 Systemdefinition (EN 50126-1 7.3.2.1, Anhang D)', paragraphs: [b.sdValidation.ok ? 'Das normative Minimum der Systemdefinition (7.3.2.1 a) bis e)) ist dokumentiert.' : `Hinweis: ${b.sdValidation.findings.filter((f) => f.level === 'error').length} normative Angaben der Systemdefinition fehlen (siehe Tabelle, mit (N) markierte Felder).`], specs: [specSystemDefinition(b), specFunctions(b), specInterfaces(b), { key: 'subs', title: 'Teilsysteme', columns: [{ header: 'Teilsystem', width: 0.3 }, { header: 'Beschreibung', width: 0.7 }], rows: (b.subsystems || []).map((s) => [s.name, s.description]) }, specDocuments(b)] },
  ];
  const method = { heading: '4 Methode und Werkzeug', paragraphs: [
    `Die Gefährdungsidentifikation erfolgte rechnergestützt mit der Railway Hazard Analysis Suite (Version ${b.version}) als KI-gestützte Vorschlagsgenerierung in Durchläufen je Funktion (Leitwortmethode, HAZOP-artig), je Schnittstelle, je Betriebsart, je Gefährdungsquelle nach EN 50126-1 7.4.2.1 a) bis n), sowie in Interaktions-, Kritik- und Lückenfüllungsdurchläufen. Jeder Vorschlag wurde vom Bearbeiter geprüft und übernommen oder mit Begründung verworfen; nichts gelangt ohne diese Entscheidung in die Gefährdungsliste. Die Vollständigkeit der Identifikation bleibt eine Ingenieurentscheidung; der Abdeckungsnachweis dokumentiert, welche Einheiten mit welchem Ergebnis durchsucht wurden.`,
    `Risikoklassen werden ausschließlich lokal aus der Projektkalibrierung (${b.calibration.title}, Version ${b.calibration.version}${b.calibration.approvedBy ? `, freigegeben von ${b.calibration.approvedBy}` : ''}) aus Häufigkeit und Schadensausmaß des Unfallszenarios berechnet. Tolerierbare Gefährdungsraten (THR) werden eingetragen und mit Herkunft dokumentiert, nie geschätzt. Der Integritätslevel je Funktion folgt lokal aus der TFFR (EN 50126-2 Tabelle 2) und wird nur elektronischen Funktionen zugeordnet.`,
    `Das Werkzeug ist ein Werkzeug mit indirektem Einfluss auf die Sicherheit im Sinne von EN 50129 6.3 (Erstellung und Nachverfolgung von Sicherheitsdokumentation); es erzeugt keine Entwurfs- oder Konfigurationsdaten. Sprachmodell: ${[...new Set((b.runs || []).map((r) => r.model).filter(Boolean))].join(', ') || 'keine KI-Läufe'}.`,
  ], specs: [specRuns(b), specPassLog(b), specCoverage(b)] };
  const phl = [
    { heading: '5 Gefährdungsliste (EN 50126-1 7.4.2.1)', paragraphs: [`${st.hazards.accepted} übernommene Gefährdungen an der Systemgrenze; ${st.hazards.rejected} Vorschläge verworfen; ${st.hazards.pending} Vorschläge noch ungeprüft.`], specs: [specPhl(b)] },
    { heading: '6 Verworfene Vorschläge', specs: [specRejected(b)] },
    { heading: '7 Annahmen und offene Punkte', specs: [specAssumptions(b), specOpenPoints(b)] },
  ];
  const pha = [
    { heading: '5 Risikoakzeptanzkriterien und Kalibrierung (EN 50126-1 Anhang C, EN 50126-2 8.3)', paragraphs: [b.calibration.note, b.calibration.equivalentFatality], specs: specCalibration(b) },
    { heading: '6 Risikoanalyse und -bewertung (EN 50126-1 7.4.2.1; EN 50126-2 8)', paragraphs: ['Je Gefährdung: Ursachen (typisiert), auslösendes Ereignis und Bedingungen, Gefährdung auf Ebene des Eisenbahnsystems, Unfallszenarien mit Schadensausmaß und Häufigkeit samt Begründung, berechnete Risikoklasse, bestehende Barrieren, Entscheidung „weitgehend akzeptabel“ bzw. gewähltes Risikoakzeptanzprinzip und -kriterium, THR.'], specs: [specPha(b)] },
    { heading: '7 Maßnahmen und Restrisiko (EN 50126-1 5.9.2, 7.4.2.1)', specs: [specMeasures(b)] },
    { heading: '8 Ergebnis der Bewertung', paragraphs: ['Die ganzheitliche Bewertung des Restrisikos über alle Gefährdungen (EN 50126-2 5.3) und die Zustimmung des Betreibers bzw. der Behörde zu Risiken der Klassen „Unerwünscht“ und „Tragbar“ (EN 50126-1 Tabelle C.8) sind außerhalb dieses Werkzeugs zu dokumentieren.'], specs: [specEvaluationSummary(b)] },
    { heading: '9 Annahmen und offene Punkte', specs: [specAssumptions(b), specOpenPoints(b)] },
  ];
  const srs = [
    { heading: '5 Ableitung der Sicherheitsanforderungen', paragraphs: ['Ableitungskette nach EN 50129 5.3.7: Gefährdungsidentifikation und -analyse → Risikobewertung → Maßnahmen → Sicherheitsanforderungen → Zuordnung von TFFR und Integritätslevel je sicherheitsrelevanter Funktion. Funktionale Sicherheitsanforderungen bestehen aus dem funktionalen Anteil und dem Sicherheitsintegritätsanteil (EN 50129 A.2). Ein SIL wird nur elektronischen Funktionen oder dem elektronischen Anteil gemischter Funktionen zugeordnet (EN 50126-2 10.2.1); für andere Anteile wird die Anwendung anerkannter Regeln der Technik dokumentiert.', 'Die Angaben „Integrität (gefordert)“ sind Anforderungen, keine Nachweise: Der Nachweis eines SIL setzt Qualitäts- und Sicherheitsmanagementbedingungen, technische Sicherheitsbedingungen und das quantitative Ziel gemeinsam voraus (EN 50129 A.5.1).'] },
    { heading: '6 Funktionen und Sicherheitsintegrität', specs: [specFunctionIntegrity(b), specCca(b), specNotSafetyRelated(b)] },
    { heading: '7 Sicherheitsanforderungen', paragraphs: [`${st.requirements.total} Anforderungen, davon ${st.requirements.complete} vollständig dokumentiert.`], specs: [specRequirements(b, 'functional'), specRequirements(b, 'technical'), specRequirements(b, 'contextual')] },
    { heading: '8 Sicherheitsbezogene Anwendungsbedingungen (SRAC)', paragraphs: ['Jede Anwendungsbedingung ist eindeutig identifiziert, mindestens einer Gefährdung zugeordnet und an einen Empfänger gerichtet (EN 50129 5.3.13).'], specs: [specSrac(b)] },
    { heading: '9 Nachverfolgbarkeit', paragraphs: [b.trace.hazardsWithoutRequirement.length ? `Hinweis: ${b.trace.hazardsWithoutRequirement.length} nicht weitgehend akzeptable Gefährdung(en) ohne Anforderung: ${b.trace.hazardsWithoutRequirement.map((h) => h.id).join(', ')}.` : 'Alle nicht weitgehend akzeptablen Gefährdungen sind mit mindestens einer Anforderung verknüpft.', b.trace.orphanRequirements.length ? `Anforderungen ohne Gefährdungsbezug: ${b.trace.orphanRequirements.map((r) => r.id).join(', ')}.` : ''], specs: [specTrace(b)] },
    { heading: '10 Annahmen und offene Punkte', specs: [specAssumptions(b), specOpenPoints(b)] },
  ];
  const renum = (list, start) => list.map((s, i) => ({ ...s, heading: s.heading.replace(/^\d+/, String(start + i)) }));
  const hazlog = [
    { heading: '5 Gefährdungsprotokoll (EN 50126-1 7.4.2.2)', paragraphs: [
      'Zweck (7.4.2.2 a)): Das Gefährdungsprotokoll ist die Grundlage des fortlaufenden Risikomanagements für die Sicherheit. Es wird über den gesamten Lebenszyklus fortgeschrieben, sobald sich identifizierte Gefährdungen ändern oder neue Gefährdungen erkannt werden.',
      'Je Gefährdung enthält es die verantwortliche Stelle und die beitragenden Funktionen (b)), Folgen und Häufigkeiten (c)), das Risiko (d)), Risikoakzeptanzprinzip und -kriterium (e)), die Maßnahmen (f)) und die exportierten Sicherheitsauflagen (g)). Ein Auszug für andere Beteiligte (externes Gefährdungsprotokoll) umfasst die Gefährdungen mit exportierten Auflagen.',
    ], specs: [specHazardLog(b)] },
    { heading: '6 Annahmen und offene Punkte', specs: [specAssumptions(b), specOpenPoints(b)] },
  ];
  if (kind === 'hazid') return [...common, method, ...phl];
  if (kind === 'risk') return [...common, method, ...pha];
  if (kind === 'hazlog') return [...common, method, ...hazlog];
  if (kind === 'srs') return [...common, method, ...srs];
  return [...common, method, ...renum(phl.slice(0, 2), 5), ...renum(pha.slice(0, 4), 7), ...renum(hazlog.slice(0, 1), 11), ...renum(srs, 12)];
}

// ------------------------------------------------------------------ DOCX ----
function docControlRows(b, d) {
  const dc = b.docControl;
  return [['Dokument', `${d.code} – ${d.title}`], ['Dokument-ID', dc.docId || '–'], ['Revision', dc.revision || '–'], ['Datum', dateDe(dc.date) || dateDe(b.exportedAt)], ['System', `${b.sd.name || '–'}${b.sd.type ? ` (${b.sd.type})` : ''}`], ['Projekt', b.project.name], ['Ersteller (Designer)', dc.author || '–'], ['Prüfer (Verifier)', dc.verifier || '–'], ['Validierer (Validator)', dc.validator || '–'], ['Eisenbahnbetreiber (Duty holder)', dc.dutyHolder || '–'], ['Lieferant', dc.supplier || '–'], ['Werkzeug', `Railway Hazard Analysis Suite ${b.version}`], ['Kalibrierung', `${b.calibration.id} v${b.calibration.version}`], ['Exportiert', `${dateDe(b.exportedAt)} ${new Date(b.exportedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`]];
}

function buildDocx(kind, b) {
  kind = resolveKind(kind);
  const d = DELIVERABLES[kind];
  const dc = b.docControl;
  const doc = DOCX.createDocument({ title: `${d.title} – ${b.sd.name || b.project.name}`, subtitle: b.sd.name, author: dc.author, subject: d.title, headerText: `${dc.docId || d.code} · Rev. ${dc.revision || '–'} · ${b.sd.name || b.project.name}`, footerText: `Railway Hazard Analysis Suite · ${dateDe(b.exportedAt)}` });
  doc.title(d.title, `${b.sd.name || b.project.name}${b.sd.type ? ` – ${b.sd.type}` : ''}`);
  doc.keyValue(docControlRows(b, d));
  doc.heading('Revisionshistorie', 2);
  doc.table({ columns: [{ header: 'Revision', width: 0.12 }, { header: 'Datum', width: 0.15 }, { header: 'Bearbeiter', width: 0.2 }, { header: 'Änderung', width: 0.53 }], rows: [[dc.revision || 'A', dateDe(dc.date) || dateDe(b.exportedAt), dc.author || '', 'Erstellung aus der Railway Hazard Analysis Suite']] });
  doc.hint('Dieses Dokument ist ein Werkzeug-Export. Freigabe, Verifikation und Validierung erfolgen nach dem Sicherheitsplan des Projekts (EN 50126-1 6.6, 6.7; EN 50129 5.3.4).');
  doc.pageBreak(); doc.toc(); doc.pageBreak();
  let landscape = false;
  for (const s of sections(kind, b)) {
    if (landscape) { doc.section({ landscape: false }); landscape = false; }
    doc.heading(s.heading, 1);
    for (const p of s.paragraphs || []) if (p) doc.paragraph(p);
    for (const spec of s.specs || []) {
      if (!spec.rows.length) { doc.heading(spec.title, 2); doc.hint('Keine Einträge.'); continue; }
      if (!!spec.landscape !== landscape) { doc.section({ landscape: !!spec.landscape }); landscape = !!spec.landscape; }
      doc.heading(spec.title, 2);
      doc.table({ columns: spec.columns, rows: spec.rows, fontSize: spec.fontSize || 9, zebra: spec.zebra !== false, firstColBold: !!spec.firstColBold });
    }
  }
  return doc.build({ now: new Date(b.exportedAt) });
}

// ------------------------------------------------------------------ XLSX ----
function cellText(c) { if (c == null) return ''; if (typeof c === 'object') return c.paragraphs ? c.paragraphs.map(cellText).join('\n') : nz(c.text); return String(c); }
function buildXlsx(b) {
  if (typeof window === 'undefined' || !window.XLSX) throw new Error('XLSX-Bibliothek nicht geladen');
  const X = window.XLSX;
  const wb = X.utils.book_new();
  const add = (name, spec) => { const aoa = [spec.columns.map((c) => c.header), ...spec.rows.map((r) => r.map(cellText))]; const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = spec.columns.map((c, i) => ({ wch: Math.min(80, Math.max(10, ...aoa.map((r) => String(r[i] || '').length / 1.6))) })); ws['!freeze'] = { xSplit: 0, ySplit: 1 }; X.utils.book_append_sheet(wb, ws, name.slice(0, 31)); };
  add('Dokument', { columns: [{ header: 'Feld' }, { header: 'Wert' }], rows: docControlRows(b, DELIVERABLES.full) });
  add('Systemdefinition', specSystemDefinition(b));
  add('Funktionen', specFunctions(b));
  add('Schnittstellen', specInterfaces(b));
  add('Gefährdungsliste', specPhl(b));
  add('Risikoanalyse', specPhaFlat(b));
  add('Maßnahmen', specMeasures(b));
  add('Gefährdungsprotokoll', specHazardLog(b));
  add('Funktionen-SIL', specFunctionIntegrity(b));
  add('Anforderungen', specRequirementsAll(b));
  add('SRAC', specSrac(b));
  add('Nachverfolgbarkeit', specTrace(b));
  add('CCA', specCca(b));
  add('Verworfen', specRejected(b));
  add('Abdeckung', specCoverage(b));
  add('KI-Läufe', specRuns(b));
  add('Durchläufe', specPassLog(b));
  for (const c of specCalibration(b)) add(c.title.split(' (')[0].slice(0, 31), c);
  return X.write(wb, { type: 'array', bookType: 'xlsx' });
}
function specPhaFlat(b) {
  const rows = [];
  for (const h of acceptedHazards(b)) {
    const base = [h.id, h.title, h.description, srcLabel(b, h.sourceCategory), join((h.functions || []).map((f) => fnName(b, f))), join((h.causes || []).map((c) => `${c.text} (${L('causeKind', c.kind)})`)), h.triggeringEvent, join(h.enablingConditions), nz(h.railwayHazard)];
    const tail = [L('riskClass', h.riskClass), h.broadlyAcceptable && h.broadlyAcceptable.decision === true ? 'ja' : h.broadlyAcceptable && h.broadlyAcceptable.decision === false ? 'nein' : '', nz(h.broadlyAcceptable && h.broadlyAcceptable.justification), L('rap', h.rap && h.rap.principle), nz(h.rap && h.rap.reference), L('rac', h.rap && h.rap.rac), nz(h.rap && h.rap.justification), h.thr && h.thr.valuePerHour != null ? String(h.thr.valuePerHour) : '', L('thrOrigin', h.thr && h.thr.origin), join((h.existingBarriers || []).map((x) => x.text)), L('riskClass', h.residualRiskClass), nz(h.responsibleEntity)];
    const accs = (h.accidents || []).length ? h.accidents : [{}];
    for (const a of accs) rows.push([...base, nz(a.id), nz(a.description), join((a.affected || []).map((x) => L('affected', x)), ', '), L('severity', a.severity), nz(a.severityRationale), L('frequency', a.frequency), nz(a.frequencyRationale), L('riskClass', a.riskClass), ...tail]);
  }
  return { columns: ['ID', 'Titel', 'Beschreibung', 'Quelle', 'Funktionen', 'Ursachen', 'Auslöser', 'Bedingungen', 'Gefährdung Eisenbahnsystem', 'Szenario', 'Unfallszenario', 'Betroffene', 'Schadensausmaß', 'Begründung S', 'Häufigkeit', 'Begründung H', 'Risiko Szenario', 'Risikoklasse Gefährdung', 'Weitgehend akzeptabel', 'Begründung', 'RAP', 'Referenz', 'RAC', 'Begründung RAP', 'THR [1/h]', 'THR-Herkunft', 'Bestehende Barrieren', 'Restrisiko', 'Verantwortlich'].map((h) => ({ header: h })), rows };
}
function specRequirementsAll(b) {
  return { columns: ['ID', 'Titel', 'Anforderung', 'Kategorie', 'Gefährdungen', 'Funktionen', 'Maßnahmen', 'Sicherer Zustand', 'Zeit bis sicherer Zustand', 'Erkennung', 'Zuordnung', 'Verifikation', 'Verifikationshinweis', 'Status', 'Begründung', 'SRAC-Empfänger', 'SRAC-Herkunft', 'SRAC-Nachweis', 'Herkunft', 'Angelegt'].map((h) => ({ header: h })), rows: (b.requirements || []).map((r) => [r.id, r.title, r.text, L('reqCategory', r.category), join(r.hazards, ', '), join(r.functions, ', '), join(r.measures, ', '), r.safeState, r.timeToSafeState, r.detection, r.allocation, L('verification', r.verificationMethod), r.verificationNote, L('reqStatus', r.status), r.rationale, r.srac && r.srac.receiver || '', r.srac && r.srac.origin || '', r.srac && r.srac.verification || '', r.source === 'ai' ? 'KI' : 'manuell', dateDe(r.createdAt)]) };
}

// ------------------------------------------------------------------ HTML ----
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function cellHtml(c) { if (c == null) return ''; if (typeof c === 'object') { if (c.paragraphs) return c.paragraphs.map((p) => `<div>${cellHtml(p)}</div>`).join(''); return `<span style="${c.shade ? `background:#${c.shade};padding:0 4px;` : ''}${c.bold ? 'font-weight:600;' : ''}">${esc(c.text)}</span>`; } return esc(c); }
function buildPrintHtml(kind, b) {
  kind = resolveKind(kind);
  const d = DELIVERABLES[kind];
  const secs = sections(kind, b);
  const body = secs.map((s) => `<section><h2>${esc(s.heading)}</h2>${(s.paragraphs || []).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('')}${(s.specs || []).map((spec) => `<h3>${esc(spec.title)}</h3>${spec.rows.length ? `<table class="${spec.landscape ? 'wide' : ''}"><thead><tr>${spec.columns.map((c) => `<th>${esc(c.header)}</th>`).join('')}</tr></thead><tbody>${spec.rows.map((r) => `<tr>${r.map((c) => `<td>${cellHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="hint">Keine Einträge.</p>'}`).join('')}</section>`).join('');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(d.title)} – ${esc(b.sd.name || b.project.name)}</title><style>
body{font:10.5pt/1.35 -apple-system,"Segoe UI",Roboto,sans-serif;color:#17212b;margin:18mm 14mm;}h1{font-size:22pt;margin:0 0 4pt;color:#17212b}h2{font-size:14pt;color:#0b5c55;margin:18pt 0 6pt;page-break-after:avoid}h3{font-size:11pt;margin:12pt 0 4pt;page-break-after:avoid}p{margin:4pt 0}.sub{color:#55606c;font-size:12pt;margin-bottom:12pt}
table{border-collapse:collapse;width:100%;font-size:8.5pt;margin:4pt 0 8pt;page-break-inside:auto}th,td{border:1px solid #9aa5b1;padding:3px 5px;vertical-align:top;text-align:left}th{background:#d9e2ec;font-weight:600}tr{page-break-inside:avoid}tbody tr:nth-child(even) td{background:#f5f7fa}.kv td:first-child{font-weight:600;width:30%}.hint{color:#6b7580;font-style:italic;font-size:9pt}.toc li{margin:2px 0}
@page{size:A4;margin:14mm}@media print{.noprint{display:none}}
</style></head><body>
<div class="noprint" style="background:#e3f1ee;padding:6px 10px;margin-bottom:12px;font-size:10pt">Druckansicht — Strg+P / „Als PDF speichern“. <button onclick="window.print()">Drucken</button></div>
<h1>${esc(d.title)}</h1><div class="sub">${esc(b.sd.name || b.project.name)}${b.sd.type ? ` – ${esc(b.sd.type)}` : ''}</div>
<table class="kv">${docControlRows(b, d).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
<h2>Inhalt</h2><ol class="toc">${secs.map((s) => `<li>${esc(s.heading.replace(/^\d+\s*/, ''))}</li>`).join('')}</ol>
${body}
<p class="hint">Erzeugt mit Railway Hazard Analysis Suite ${esc(b.version)} am ${esc(dateDe(b.exportedAt))}. Freigabe, Verifikation und Validierung nach Sicherheitsplan.</p>
</body></html>`;
}

// ---------------------------------------------------------------- bundle ----
function makeBundle({ project, docControl, sd, functions, interfaces, subsystems, hazards, requirements, ccas, runs, calibration, data, version }) {
  const exportedAt = new Date().toISOString();
  const stats = M.projectStats({ hazards, requirements, functions, sd });
  const coverage = M.coverage({ hazards, functions, interfaces, sources: data.sources, guidewords: data.guidewords, modes: data.modes.filter((m) => (sd.modes || []).includes(m.id)), runs });
  const trace = M.traceability({ hazards, requirements, functions });
  const sdValidation = M.validateSystemDefinition(sd, functions);
  return { project, docControl, sd, functions, interfaces, subsystems, hazards, requirements, ccas, runs, calibration, sources: data.sources, guidewords: data.guidewords, modes: data.modes, version, exportedAt, stats, coverage, trace, sdValidation };
}

const api = { DELIVERABLES, KIND_ALIASES, resolveKind, makeBundle, sections, buildDocx, buildXlsx, buildPrintHtml };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.RHAS_REPORTS = api;
})();

