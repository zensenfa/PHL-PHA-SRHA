// Calibration management for RHAS (WP3). EN 50126-1:2017 Annex C gives example
// categories and an example matrix; C.1 requires the railway duty holder to
// define the number and scaling of categories. This module builds project
// calibrations from the Annex C category sets, validates them, and reports the
// impact of a change on existing hazards. Pure: no DOM, testable under Node.
// Category descriptions are paraphrased; the standard text is not reproduced.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;

const clone = (o) => JSON.parse(JSON.stringify(o));
const DEFAULT = () => clone(M.data().calibration);

const SETS = {
  frequency: {
    C1: { label: 'Zeitbasiert, 6 Stufen (EN 50126-1 Tabelle C.1)', items: () => DEFAULT().frequencies },
    C2: { label: 'Wegbasiert, 3 Stufen (EN 50126-1 Tabelle C.2)', items: () => [
      { id: 'F1', label: 'F1', definition: 'Tritt voraussichtlich oft auf.', range: 'Beispiel: häufiger als einmal je 5 000 km je Zug' },
      { id: 'F2', label: 'F2', definition: 'Tritt mehrmals auf.', range: 'Beispiel: etwa einmal je 25 000 km je Zug' },
      { id: 'F3', label: 'F3', definition: 'Kann gelegentlich auftreten.', range: 'Beispiel: etwa einmal je 100 000 km je Zug' },
    ] },
  },
  severity: {
    C4: { label: '4 Stufen, Personen/Umwelt und Betrieb (EN 50126-1 Tabelle C.4)', items: () => DEFAULT().severities },
    C5: { label: '5 Stufen S1–S5, Sicherheit (EN 50126-1 Tabelle C.5)', items: () => [
      { id: 'S1', label: 'S1', persons: 'Viele äquivalente Todesfälle (etwa mehr als 10) oder extremer Umweltschaden.', service: '' },
      { id: 'S2', label: 'S2', persons: 'Mehrere äquivalente Todesfälle (etwa weniger als 10) oder großer Umweltschaden.', service: '' },
      { id: 'S3', label: 'S3', persons: 'Ein Todesfall oder schwere Verletzung oder erheblicher Umweltschaden.', service: '' },
      { id: 'S4', label: 'S4', persons: 'Leichte Verletzungen oder geringer Umweltschaden.', service: '' },
      { id: 'S5', label: 'S5', persons: 'Mögliche leichte Verletzung.', service: '' },
    ] },
  },
  acceptance: {
    C8: { label: '4 Kategorien (EN 50126-1 Tabelle C.8)', items: () => DEFAULT().riskClasses },
    C7: { label: '2 Kategorien, binäre Entscheidung (EN 50126-1 Tabelle C.7)', items: () => [
      { id: 'Unacceptable', label: 'Nicht akzeptabel', action: 'Das Risiko muss weiter reduziert werden, um akzeptiert zu werden.', rank: 2, needsMeasures: true, mustReduce: true },
      { id: 'Acceptable', label: 'Akzeptabel', action: 'Das Risiko wird akzeptiert, sofern eine angemessene Überwachung aufrechterhalten wird.', rank: 1, needsMeasures: false, mustReduce: false },
    ] },
  },
};

/** New calibration from Annex C category sets. Only C1 x C4 x C8 has a published example matrix (C.9); every other combination starts empty and must be filled by the duty holder. */
function fromTemplate({ frequency = 'C1', severity = 'C4', acceptance = 'C8', id, title } = {}) {
  const base = DEFAULT();
  const freqs = SETS.frequency[frequency].items();
  const sevs = SETS.severity[severity].items();
  const classes = SETS.acceptance[acceptance].items();
  const exampleMatrix = frequency === 'C1' && severity === 'C4' && acceptance === 'C8';
  const matrix = {};
  for (const f of freqs) { matrix[f.id] = {}; for (const s of sevs) matrix[f.id][s.id] = exampleMatrix ? base.matrix[f.id][s.id] : ''; }
  return {
    id: id || `project-${frequency}-${severity}-${acceptance}`.toLowerCase(),
    version: 1,
    title: title || `Projektkalibrierung (${frequency}/${severity}/${acceptance})`,
    source: `Kategorien nach EN 50126-1:2017 Anhang C (${SETS.frequency[frequency].label}; ${SETS.severity[severity].label}; ${SETS.acceptance[acceptance].label}). Matrix ${exampleMatrix ? 'nach Beispiel Tabelle C.9, vom Betreiber zu bestätigen' : 'vom Betreiber festzulegen'}.`,
    approvedBy: '', approvedAt: '',
    note: base.note,
    frequencies: freqs, severities: sevs, riskClasses: classes, matrix,
    equivalentFatality: base.equivalentFatality,
    template: { frequency, severity, acceptance },
  };
}

function validateCalibration(cal) {
  const f = [];
  const err = (text) => f.push({ level: 'error', text });
  const warn = (text) => f.push({ level: 'warn', text });
  if (!cal || typeof cal !== 'object') return { ok: false, findings: [{ level: 'error', text: 'Keine Kalibrierung.' }] };
  if (!cal.id) err('Kennung der Kalibrierung fehlt.');
  const uniq = (list, what) => { const ids = (list || []).map((x) => x.id); if (!ids.length) err(`${what}: keine Kategorien.`); if (new Set(ids).size !== ids.length) err(`${what}: Kennungen nicht eindeutig.`); (list || []).forEach((x) => { if (!String(x.label || '').trim()) err(`${what} ${x.id}: Bezeichnung fehlt.`); }); return ids; };
  const fr = uniq(cal.frequencies, 'Häufigkeit');
  const sv = uniq(cal.severities, 'Schadensausmaß');
  const rc = uniq(cal.riskClasses, 'Risikokategorie');
  if (rc.length < 2) err('Mindestens zwei Risikoakzeptanzkategorien erforderlich (EN 50126-1 Tabelle C.7).');
  const ranks = (cal.riskClasses || []).map((r) => Number(r.rank));
  if (ranks.some((r) => !(r > 0)) || new Set(ranks).size !== ranks.length) err('Jede Risikokategorie braucht einen eindeutigen Rang (höher = schlechter).');
  if (!(cal.riskClasses || []).some((r) => r.mustReduce)) warn('Keine Kategorie verlangt zwingend eine Risikoreduktion.');
  let empty = 0;
  for (const a of fr) for (const b of sv) {
    const v = cal.matrix && cal.matrix[a] && cal.matrix[a][b];
    if (!v) empty++;
    else if (!rc.includes(v)) err(`Matrixzelle ${a}/${b}: unbekannte Kategorie ${v}.`);
  }
  if (empty) err(`${empty} Matrixzelle(n) ohne Risikokategorie (EN 50126-1 Anhang C.1: vom Betreiber festzulegen).`);
  // Plausibility: a more frequent or more severe cell must not be better (frequencies and severities are ordered worst first).
  const rank = Object.fromEntries((cal.riskClasses || []).map((r) => [r.id, Number(r.rank)]));
  let nonMono = 0;
  for (let i = 0; i < fr.length; i++) for (let j = 0; j < sv.length; j++) {
    const here = rank[cal.matrix?.[fr[i]]?.[sv[j]]];
    const lessFreq = i + 1 < fr.length ? rank[cal.matrix?.[fr[i + 1]]?.[sv[j]]] : undefined;
    if (here != null && lessFreq != null && lessFreq > here) nonMono++;
  }
  const sevOrder = cal.severities || [];
  for (const a of fr) for (let j = 0; j + 1 < sevOrder.length; j++) {
    const worse = rank[cal.matrix?.[a]?.[sevOrder[j].id]]; const better = rank[cal.matrix?.[a]?.[sevOrder[j + 1].id]];
    if (worse != null && better != null && better > worse) nonMono++;
  }
  if (nonMono) warn(`${nonMono} Matrixzelle(n) nicht monoton: seltenere oder weniger schwere Szenarien werden schlechter eingestuft. Bitte prüfen.`);
  if (!cal.approvedBy) warn('Kalibrierung ist nicht freigegeben (EN 50126-1 Anhang C.1: Festlegung durch den Betreiber).');
  return { ok: !f.some((x) => x.level === 'error'), findings: f };
}

/** Effect of switching from one calibration to another on existing hazards. */
function impact(hazards, next) {
  const fr = new Set((next.frequencies || []).map((x) => x.id));
  const sv = new Set((next.severities || []).map((x) => x.id));
  const invalid = []; const changed = [];
  for (const h of hazards || []) {
    const bad = [...(h.accidents || []).filter((a) => (a.frequency && !fr.has(a.frequency)) || (a.severity && !sv.has(a.severity))).map((a) => a.id || 'Szenario'),
      ...(h.measures || []).filter((m) => (m.residualFrequency && !fr.has(m.residualFrequency)) || (m.residualSeverity && !sv.has(m.residualSeverity))).map((m) => m.id || 'Maßnahme')];
    if (bad.length) invalid.push({ id: h.id, items: bad });
    const re = M.recomputeHazardRisk(clone(h), next);
    if (re.riskClass !== h.riskClass || re.residualRiskClass !== h.residualRiskClass) changed.push({ id: h.id, from: `${h.riskClass || '–'} → ${h.residualRiskClass || '–'}`, to: `${re.riskClass || '–'} → ${re.residualRiskClass || '–'}` });
  }
  return { invalid, changed };
}

/** Structural difference used for the profile change log. */
function describeChange(prev, next) {
  const out = [];
  if (!prev || prev.id !== next.id) out.push(`Kalibrierung ${prev ? prev.id : '–'} → ${next.id}`);
  const cells = [];
  for (const f of Object.keys(next.matrix || {})) for (const s of Object.keys(next.matrix[f] || {})) { const a = prev && prev.matrix && prev.matrix[f] && prev.matrix[f][s]; if (a !== next.matrix[f][s]) cells.push(`${f}/${s}: ${a || '–'} → ${next.matrix[f][s] || '–'}`); }
  if (prev && prev.id === next.id && cells.length) out.push(`Matrix: ${cells.join('; ')}`);
  const lab = (k) => JSON.stringify((prev && prev[k] || []).map((x) => [x.id, x.label, x.definition || x.persons || x.action])) !== JSON.stringify((next[k] || []).map((x) => [x.id, x.label, x.definition || x.persons || x.action]));
  if (prev && prev.id === next.id) for (const k of ['frequencies', 'severities', 'riskClasses']) if (lab(k)) out.push(`${k}: Bezeichnungen/Beschreibungen geändert`);
  return out;
}

const api = { SETS, fromTemplate, validateCalibration, impact, describeChange };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RHAS_CALIBRATION = api;
})();
