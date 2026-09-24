// Pure domain model for the Railway Hazard Analysis Suite (RHAS).
// No DOM, no IO. Everything that decides something normative lives here so it
// can be unit-tested under Node and reused unchanged by the UI and the exports:
//  - enum labels (single German source of truth for UI + DOCX/XLSX),
//  - risk class from the project calibration (EN 50126-1 Annex C, project data),
//  - SIL from TFFR (EN 50126-2 Table 2 / EN 50129 Table A.1),
//  - apportionment checks (OR-sum, AND only with an independence record),
//  - record factories + completeness/validation rules per stage,
//  - coverage evidence and traceability computations.
// The LLM is NEVER asked for a risk class, a SIL or a THR. Those are computed
// or entered here from engineer-confirmed inputs.
(function () {
// Normative tables: in the browser they are inlined as window.RHAS_DATA by
// build.py; under Node (tests) they are read from src/data/*.json.
let DATA = null;
function data() {
  if (DATA) return DATA;
  if (typeof window !== 'undefined' && window.RHAS_DATA) DATA = window.RHAS_DATA;
  else if (typeof require !== 'undefined') {
    DATA = {
      calibration: require('./data/calibration.json'),
      sil: require('./data/sil.json'),
      sources: require('./data/hazard-sources.json').sources,
      guidewords: require('./data/guidewords.json').guidewords,
      modes: require('./data/modes.json').modes,
    };
  }
  return DATA || {};
}

// ---------------------------------------------------------------- enums ----
const LABELS = {
  frequency: { frequent: 'Häufig', probable: 'Wahrscheinlich', occasional: 'Gelegentlich', rare: 'Selten', improbable: 'Unwahrscheinlich', highlyImprobable: 'Höchst unwahrscheinlich' },
  severity: { catastrophic: 'Katastrophal', critical: 'Kritisch', marginal: 'Marginal', insignificant: 'Unbedeutend' },
  riskClass: { Intolerable: 'Untragbar', Undesirable: 'Unerwünscht', Tolerable: 'Tragbar', Negligible: 'Vernachlässigbar' },
  hazardStatus: { identified: 'Identifiziert', analysed: 'Analysiert', evaluated: 'Bewertet', controlled: 'Beherrscht', transferred: 'Übertragen', closed: 'Geschlossen', rejected: 'Verworfen' },
  hazardLevel: { boundary: 'Systemgrenze (System under consideration)', railway: 'Eisenbahnsystem', design: 'Entwurfsebene (Verfeinerung)' },
  method: { function: 'Funktionsanalyse', guideword: 'Leitwort (HAZOP-artig)', interface: 'Schnittstellenanalyse', mode: 'Betriebsart / Szenario', source: 'Gefährdungsquelle (EN 50126-1 7.4.2.1)', interaction: 'Interaktionsanalyse', gapfill: 'Lückenfüllung nach Kritik', manual: 'Manuell erfasst', import: 'Import', seed: 'Beispieldaten' },
  causeKind: { systematic: 'Systematisch', random: 'Zufällig', human: 'Menschlich', external: 'Extern' },
  barrierType: { frequency: 'Häufigkeitsmindernd', severity: 'Schadensmindernd' },
  measureType: { elimination: 'Gefährdung vermeiden', frequencyReduction: 'Häufigkeit der Gefährdung senken', propagationReduction: 'Übergang Gefährdung → Unfall verhindern', severityMitigation: 'Schadensausmaß mindern' },
  hierarchy: { design: 'Konstruktiv (Vermeidung durch Entwurf)', protective: 'Technische Schutzfunktion', warning: 'Warnung / Anzeige', procedural: 'Organisatorisch / Verfahren' },
  rap: { cop: 'Anerkannte Regeln der Technik (CoP)', reference: 'Referenzsystem', ere: 'Explizite Risikoabschätzung' },
  rac: { matrix: 'Kalibrierte Risikomatrix (EN 50126-1 Anhang C)', alarp: 'ALARP', game: 'GAME', mem: 'MEM', legal: 'Gesetzliche / behördliche Vorgabe', other: 'Sonstige (begründen)' },
  thrOrigin: { dutyHolder: 'Vom Betreiber vorgegeben', joint: 'Gemeinsam vereinbart', supplier: 'Vom Lieferanten vorgeschlagen (zu vereinbaren)', ere: 'Aus expliziter Risikoabschätzung abgeleitet', reference: 'Aus Referenzsystem abgeleitet', cop: 'Aus Regelwerk abgeleitet' },
  reqCategory: { functional: 'Funktionale Sicherheitsanforderung', technical: 'Technische Sicherheitsanforderung', contextual: 'Betriebliche / instandhalterische Anforderung', srac: 'Sicherheitsbezogene Anwendungsbedingung (SRAC)' },
  verification: { test: 'Test', analysis: 'Analyse', inspection: 'Inspektion', demonstration: 'Demonstration / Nachweisführung', review: 'Review' },
  reqStatus: { draft: 'Entwurf', reviewed: 'Geprüft', agreed: 'Vereinbart', rejected: 'Verworfen' },
  functionKind: { electronic: 'Elektronisch', mechanical: 'Mechanisch / nicht elektronisch', mixed: 'Gemischt (elektronischer Anteil)', procedural: 'Prozedural / menschlich' },
  integrity: { SIL4: 'SIL 4', SIL3: 'SIL 3', SIL2: 'SIL 2', SIL1: 'SIL 1', BasicIntegrity: 'Basisintegrität', notApplicable: 'SIL nicht anwendbar (CoP)', notSafetyRelated: 'Nicht sicherheitsrelevant', belowRange: 'Unter 10⁻⁹/h — Aufteilung oder SIL 4 + Zusatzmaßnahmen', undetermined: 'Nicht bestimmt' },
  affected: { passengers: 'Fahrgäste', staff: 'Personal', maintenance: 'Instandhaltungspersonal', third: 'Dritte / Straßenverkehr', environment: 'Umwelt', property: 'Sachwerte' },
  review: { pending: 'Offen', accepted: 'Übernommen', rejected: 'Verworfen' },
};

const FREQUENCIES = Object.keys(LABELS.frequency);
const SEVERITIES = Object.keys(LABELS.severity);
const RISK_CLASSES = Object.keys(LABELS.riskClass);
const RISK_RANK = { Negligible: 1, Tolerable: 2, Undesirable: 3, Intolerable: 4 };

function label(kind, value) {
  const map = LABELS[kind];
  if (!map) return value == null ? '' : String(value);
  return value == null || value === '' ? '' : (map[value] || String(value));
}

// ------------------------------------------------------------ identifiers ----
function nextId(prefix, records, key = 'id') {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  let max = 0;
  for (const r of records || []) {
    const m = re.exec(r && r[key] ? r[key] : '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function nowIso() {
  return new Date().toISOString();
}

// ------------------------------------------------------------------ risk ----
/** Risk class for one accident scenario from the project calibration matrix. Throws on unknown categories (never silently maps). */
function riskClass(frequency, severity, calibration) {
  const cal = calibration || data().calibration;
  if (!cal) throw new Error('Kalibrierung fehlt');
  const row = cal.matrix[frequency];
  if (!row) throw new RangeError(`Unbekannte Häufigkeitskategorie: ${frequency}`);
  const cell = row[severity];
  if (!cell) throw new RangeError(`Unbekannte Schadenskategorie: ${severity}`);
  return cell;
}

function riskClassOrNull(frequency, severity, calibration) {
  if (!frequency || !severity) return null;
  try { return riskClass(frequency, severity, calibration); } catch { return null; }
}

/** Highest (worst) risk class among a list of classes; null when none. */
function worstRiskClass(classes) {
  let worst = null;
  for (const c of classes || []) {
    if (!c || !RISK_RANK[c]) continue;
    if (!worst || RISK_RANK[c] > RISK_RANK[worst]) worst = c;
  }
  return worst;
}

/** Recompute every derived risk field on a hazard (accident classes, worst class, residual per measure). Mutates and returns the hazard. */
function recomputeHazardRisk(h, calibration) {
  for (const a of h.accidents || []) a.riskClass = riskClassOrNull(a.frequency, a.severity, calibration);
  h.riskClass = worstRiskClass((h.accidents || []).map((a) => a.riskClass));
  for (const m of h.measures || []) m.residualRiskClass = riskClassOrNull(m.residualFrequency, m.residualSeverity, calibration);
  const residuals = (h.measures || []).filter((m) => m.status !== 'rejected').map((m) => m.residualRiskClass).filter(Boolean); // PATCH-2
  // Residual risk of the hazard = best (lowest) residual any single confirmed measure claims — conservative enough for a PHA; engineer confirms.
  h.residualRiskClass = residuals.length ? residuals.reduce((best, c) => (RISK_RANK[c] < RISK_RANK[best] ? c : best)) : h.riskClass;
  return h;
}

// ------------------------------------------------------------------- SIL ----
/**
 * EN 50126-2 Table 2 / EN 50129 Table A.1, half-open bands. Returns
 * { integrity, boundary, note }. Values exactly on a band boundary are flagged
 * so the engineer confirms them. Never returns "SIL 0" or "SIL 5".
 */
function silFromTffr(tffr, silTable) {
  const table = silTable || data().sil;
  if (!table) throw new Error('SIL-Tabelle fehlt');
  if (tffr == null || tffr === '' || Number.isNaN(Number(tffr))) return { integrity: 'undetermined', boundary: false, note: 'Keine TFFR eingetragen.' };
  const v = Number(tffr);
  if (!(v > 0) || !isFinite(v)) return { integrity: 'undetermined', boundary: false, note: 'TFFR muss eine positive Zahl je Stunde sein.' };
  if (v < table.lowerLimit) return { integrity: 'belowRange', boundary: false, note: table.rules.belowRange };
  if (v >= table.basicIntegrityThreshold) return { integrity: 'BasicIntegrity', boundary: v === table.basicIntegrityThreshold, note: table.rules.basicIntegrity };
  // Bands are half-open (10⁻⁹ ≤ TFFR < 10⁻⁸ → SIL 4, …), so a round target such as
  // 1e-8 is unambiguously SIL 3. Only the Basic-Integrity threshold (10⁻⁵) is worded
  // "less demanding than" in the standards and is therefore flagged for confirmation.
  for (const b of table.bands) {
    if (v >= b.min && v < b.max) return { integrity: b.sil, boundary: false, note: '' };
  }
  return { integrity: 'undetermined', boundary: false, note: 'TFFR außerhalb der Tabelle.' };
}

/** Integrity attribute for a function record, honouring applicability (EN 50126-2 10.2.1, 10.3) before any table lookup. */
function functionIntegrity(fn, silTable) {
  if (!fn) return { integrity: 'undetermined', note: '' };
  if (fn.safetyRelated === false) return { integrity: 'notSafetyRelated', note: 'Als nicht sicherheitsrelevant eingestuft (Begründung im Datensatz).' };
  if (fn.kind === 'mechanical' || fn.kind === 'procedural') return { integrity: 'notApplicable', note: data().sil ? data().sil.rules.applicability : '' };
  return silFromTffr(fn.tffr, silTable);
}

/** Parse "1e-7", "1E-7", "0,0000001", "1·10⁻⁷" style inputs into a number per hour; null if not parseable. */
function parseRate(text) {
  if (text == null) return null;
  if (typeof text === 'number') return isFinite(text) ? text : null;
  let s = String(text).trim().toLowerCase().replace(/\s+/g, '').replace(',', '.').replace(/[·×x]10\^?/g, 'e').replace(/⁻/g, '-')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).replace(/\/h.*$/, '').replace(/h-1$/, '');
  if (!s) return null;
  const v = Number(s);
  return isFinite(v) ? v : null;
}

function formatRate(v) {
  if (v == null || !isFinite(v)) return '';
  const exp = Math.floor(Math.log10(v));
  const mant = v / Math.pow(10, exp);
  const m = Math.round(mant * 100) / 100;
  return `${String(m).replace('.', ',')} × 10^${exp} /h`;
}

// ---------------------------------------------------------- apportionment ----
/**
 * OR-gate check (EN 50126-2 D.3.5, EN 50129 A.4.3.4 NOTE 1, Annex D): children whose
 * individual failure causes the parent event must satisfy Σ TFFR_children ≤ parent target.
 */
function checkOrSum(parentRate, childRates) {
  const sum = (childRates || []).reduce((a, r) => a + (Number(r) || 0), 0);
  return { ok: parentRate == null || sum <= Number(parentRate) * (1 + 1e-9), sum, parent: parentRate, excess: parentRate == null ? 0 : Math.max(0, sum - Number(parentRate)) };
}

/**
 * Hazard → function allocation consistency (EN 50126-2 10.2.2, EN 50129 A.4.3.2):
 * one-to-one → TFFR must equal THR; several functions without an independence
 * record → treated as OR (sum ≤ THR); with a CCA record marking them independent
 * (random AND systematic) → AND credit allowed, no numeric check here (engineer
 * documents the SDT-based arithmetic in the record).
 */
function checkHazardAllocation(hazard, functions, ccaRecords) {
  const thr = hazard.thr && hazard.thr.valuePerHour != null ? Number(hazard.thr.valuePerHour) : null;
  const fns = (hazard.functions || []).map((id) => (functions || []).find((f) => f.id === id)).filter(Boolean);
  const findings = [];
  if (thr == null) return { findings, mode: 'none' };
  if (fns.length === 0) {
    findings.push({ level: 'error', text: `Gefährdung ${hazard.id} hat eine THR, ist aber keiner Funktion zugeordnet (EN 50129 A.4.3.2 Regel 1).` });
    return { findings, mode: 'none' };
  }
  const withTffr = fns.filter((f) => f.tffr != null && f.tffr !== '');
  if (fns.length === 1) {
    const f = fns[0];
    if (f.tffr != null && f.tffr !== '' && Math.abs(Number(f.tffr) - thr) / thr > 1e-6) {
      findings.push({ level: 'warn', text: `Eins-zu-eins-Zuordnung: TFFR von ${f.id} (${formatRate(Number(f.tffr))}) sollte der THR (${formatRate(thr)}) entsprechen (EN 50126-2 10.2.2).` });
    }
    return { findings, mode: 'one-to-one' };
  }
  const cca = (ccaRecords || []).find((c) => c.outcome === 'independent' && fns.every((f) => (c.functions || []).includes(f.id)));
  if (cca && cca.randomIndependence && cca.systematicIndependence) {
    return { findings, mode: 'and', cca: cca.id };
  }
  const check = checkOrSum(thr, withTffr.map((f) => Number(f.tffr)));
  if (!check.ok) findings.push({ level: 'error', text: `ODER-Verknüpfung: Summe der TFFR (${formatRate(check.sum)}) überschreitet die THR (${formatRate(thr)}) von ${hazard.id}. Ohne Unabhängigkeitsnachweis (CCA) ist keine UND-Anrechnung zulässig (EN 50126-2 10.2.2, 11.4).` });
  if (withTffr.length < fns.length) findings.push({ level: 'info', text: `${fns.length - withTffr.length} zugeordnete Funktion(en) ohne TFFR.` });
  return { findings, mode: 'or' };
}

// -------------------------------------------------------------- factories ----
function makeSystemDefinition() {
  return {
    name: '', type: '', purpose: '', missionProfile: '', description: '',
    boundary: '', includedFunctions: '', excludedFunctions: '', location: '',
    physicalEnvironment: '', operatingStrategy: '', maintenanceStrategy: '', lifetime: '', logistics: '',
    operatingConditions: '', infrastructureConstraints: '', personnel: '', humanActivitiesExcludedReason: '',
    pastExperience: '', existingSafetyMeasures: '', assumptions: '', deviationsFromReference: '',
    applicableStandards: '', referenceSystems: '', legalFramework: '',
    modes: ['normal', 'degraded', 'transition', 'maintenance', 'emergency', 'commissioning', 'decommissioning'],
    documents: [],
  };
}

const SYSTEM_DEFINITION_FIELDS = [
  // EN 50126-1 7.3.2.1 a)–e): normative minimum, marked N; Annex D items marked D.
  { key: 'name', label: 'Systemname', norm: 'N', ref: '7.3.2.1 e)' },
  { key: 'type', label: 'Systemtyp', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'purpose', label: 'Zweck / Systemziel', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'missionProfile', label: 'Missionsprofil (Einsatz, Verkehr, Betriebszeiten)', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'description', label: 'Systembeschreibung', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'boundary', label: 'Systemgrenze und Schnittstellen (Umwelt, andere Systeme, Menschen, andere Betreiber)', norm: 'N', ref: '7.3.2.1 b)' },
  { key: 'includedFunctions', label: 'Eingeschlossene Funktionen / Elemente', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'excludedFunctions', label: 'Ausdrücklich ausgeschlossene Funktionen', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'location', label: 'Räumliche Lage der Systemteile und Einfluss auf Nachbarn', norm: 'N', ref: '7.3.2.1 b)' },
  { key: 'physicalEnvironment', label: 'Physikalische Umgebung (Klima, Mechanik, EMV, Höhe)', norm: 'N', ref: '7.3.2.1 b)' },
  { key: 'operatingStrategy', label: 'Langfristige Betriebsstrategie und -bedingungen', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'maintenanceStrategy', label: 'Langfristige Instandhaltungsstrategie und -bedingungen', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'lifetime', label: 'Systemlebensdauer', norm: 'N', ref: '7.3.2.1 a)' },
  { key: 'logistics', label: 'Logistik / logistische Unterstützung', norm: 'N', ref: '7.3.2.1 a), c)' },
  { key: 'operatingConditions', label: 'Betriebsbedingungen, Betriebsverfahren und zulässiges Personal (Qualifikation, Zeit)', norm: 'N', ref: '7.3.2.1 c)' },
  { key: 'infrastructureConstraints', label: 'Randbedingungen aus bestehender Infrastruktur', norm: 'N', ref: '7.3.2.1 c)' },
  { key: 'personnel', label: 'Einfluss auf Betriebs-/Instandhaltungspersonal, Fahrgäste und Öffentlichkeit', norm: 'N', ref: '7.3.2.1 c)' },
  { key: 'humanActivitiesExcludedReason', label: 'Begründung, falls keine menschlichen Tätigkeiten betrachtet werden', norm: 'D', ref: '7.3.2.1 c)' },
  { key: 'pastExperience', label: 'Erfahrungen mit ähnlichen Systemen (Betriebsdaten, Unfälle, Störungen)', norm: 'N', ref: '7.3.2.1 c)' },
  { key: 'existingSafetyMeasures', label: 'Bestehende Sicherheitsmaßnahmen und Annahmen, die den Umfang der Risikobewertung begrenzen', norm: 'N', ref: '7.3.2.1 d)' },
  { key: 'assumptions', label: 'Annahmen zu Schnittstellen und Systemgrenzen (RAMS-Annahmen)', norm: 'N', ref: '6.5.2' },
  { key: 'deviationsFromReference', label: 'Abweichungen von einer Referenzversion (mit Begründung)', norm: 'D', ref: '7.3.2.1 e)' },
  { key: 'applicableStandards', label: 'Anzuwendende Normen / anerkannte Regeln der Technik (CoP)', norm: 'D', ref: 'EN 50126-2 8.3.1' },
  { key: 'referenceSystems', label: 'Referenzsysteme (falls Referenzsystem-Prinzip angewendet wird)', norm: 'D', ref: 'EN 50126-2 8.3.2' },
  { key: 'legalFramework', label: 'Rechtlicher Rahmen / Sicherheitsvorschriften', norm: 'D', ref: '7.2.2 e)' },
];

function makeFunction(fields = {}) {
  return {
    id: '', name: '', description: '', kind: 'electronic', safetyRelated: null, safetyRelatedRationale: '',
    subsystem: '', interfaces: [], modes: [], inputs: '', outputs: '', safeState: '', tffr: null, tffrRationale: '',
    source: 'manual', createdAt: nowIso(), updatedAt: nowIso(), ...fields,
  };
}

function makeHazard(fields = {}) {
  return {
    id: '', title: '', description: '', level: 'boundary', sourceCategory: '', domain: '', method: 'manual', guideword: '', guidewords: [],
    functions: [], interfaces: [], modes: [], lifecyclePhase: '',
    causes: [], triggeringEvent: '', enablingConditions: [], railwayHazard: '',
    accidents: [], riskClass: null, residualRiskClass: null,
    broadlyAcceptable: { decision: null, justification: '', by: '', at: '' },
    rap: { principle: '', reference: '', justification: '', rac: '', racNote: '' },
    existingBarriers: [], measures: [],
    thr: { valuePerHour: null, origin: '', justification: '' },
    status: 'identified', owner: '', responsibleEntity: '',
    review: { decision: 'pending', by: '', at: '', rationale: '' },
    provenance: { runId: '', pass: '', model: '', reasoning: '' },
    duplicateOf: '', notes: '',
    createdAt: nowIso(), createdBy: '', updatedAt: nowIso(), updatedBy: '', ...fields,
  };
}

function makeAccident(fields = {}) {
  return { id: '', description: '', affected: [], severity: '', severityRationale: '', frequency: '', frequencyRationale: '', uncertainty: 'reasonable', riskClass: null, ...fields };
}

function makeMeasure(fields = {}) {
  return { id: '', text: '', type: 'frequencyReduction', hierarchy: 'protective', residualSeverity: '', residualFrequency: '', residualRiskClass: null, rationale: '', status: 'proposed', becomesSrac: false, ...fields };
}

function makeRequirement(fields = {}) {
  return {
    id: '', text: '', title: '', category: 'functional', hazards: [], functions: [], measures: [],
    integrity: { tffr: null, level: 'undetermined', applicabilityNote: '' },
    safeState: '', timeToSafeState: '', detection: '', allocation: '', verificationMethod: 'test', verificationNote: '',
    rationale: '', status: 'draft',
    srac: { receiver: '', origin: '', verification: '' },
    source: 'manual', provenance: { runId: '', pass: '', model: '' },
    createdAt: nowIso(), createdBy: '', updatedAt: nowIso(), updatedBy: '', ...fields,
  };
}

function makeCca(fields = {}) {
  return { id: '', functions: [], randomIndependence: false, systematicIndependence: false, evidenceRef: '', outcome: 'dependent', assumptions: [], notes: '', createdAt: nowIso(), ...fields };
}

// ------------------------------------------------------------- validation ----
function isBlank(v) {
  return v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
}

/** EN 50126-1 7.3.2.1: hazard identification may only start once the normative minimum of the system definition is outlined. */
function validateSystemDefinition(sd, functions) {
  const missing = SYSTEM_DEFINITION_FIELDS.filter((f) => f.norm === 'N' && isBlank(sd && sd[f.key]));
  const findings = missing.map((f) => ({ level: 'error', field: f.key, text: `${f.label} fehlt (EN 50126-1 ${f.ref}).` }));
  if (!functions || functions.length === 0) findings.push({ level: 'error', field: 'functions', text: 'Keine Funktionen definiert — die Funktionsliste ist Grundlage der Gefährdungsidentifikation (EN 50126-1 7.3.2.1, Anhang D.3.2).' });
  if (sd && isBlank(sd.modes)) findings.push({ level: 'warn', field: 'modes', text: 'Keine Betriebsarten ausgewählt (7.3.2.1 c)).' });
  return { ok: findings.filter((f) => f.level === 'error').length === 0, findings, filled: SYSTEM_DEFINITION_FIELDS.filter((f) => !isBlank(sd && sd[f.key])).length, total: SYSTEM_DEFINITION_FIELDS.length };
}

/** Stage completeness of one hazard: which of identified / analysed / evaluated / controlled it satisfies, with the reasons it does not. */
function hazardCompleteness(h) {
  const out = { identified: true, analysed: false, evaluated: false, controlled: false, problems: [] };
  const p = out.problems;
  if (isBlank(h.title)) p.push('Titel fehlt');
  if (isBlank(h.description)) p.push('Beschreibung (Zustand) fehlt');
  if (isBlank(h.sourceCategory)) p.push('Gefährdungsquelle a)–n) fehlt (7.4.2.1)');
  if (isBlank(h.functions) && isBlank(h.interfaces)) p.push('Keine beitragende Funktion/Schnittstelle zugeordnet (7.4.2.2 b))');
  if (p.length) out.identified = false;

  const analysedProblems = [];
  if (isBlank(h.causes)) analysedProblems.push('Ursachen fehlen');
  if (isBlank(h.triggeringEvent)) analysedProblems.push('Auslösendes Ereignis fehlt');
  if (isBlank(h.accidents)) analysedProblems.push('Kein Unfallszenario');
  else if (h.accidents.some((a) => isBlank(a.severity) || isBlank(a.frequency))) analysedProblems.push('Unfallszenario ohne Schadensausmaß/Häufigkeit');
  else if (h.accidents.some((a) => isBlank(a.severityRationale) || isBlank(a.frequencyRationale))) analysedProblems.push('Begründung für Schadensausmaß/Häufigkeit fehlt (8.2.4)');
  out.analysed = out.identified && analysedProblems.length === 0;
  p.push(...analysedProblems);

  const evalProblems = [];
  if (!h.riskClass) evalProblems.push('Risikoklasse nicht berechnet');
  const ba = h.broadlyAcceptable || {};
  if (ba.decision == null) evalProblems.push('Entscheidung „weitgehend akzeptabel“ fehlt (6.3)');
  else if (ba.decision === true && isBlank(ba.justification)) evalProblems.push('Begründung für „weitgehend akzeptabel“ fehlt (6.3)');
  else if (ba.decision === false) {
    if (isBlank(h.rap && h.rap.principle)) evalProblems.push('Risikoakzeptanzprinzip nicht gewählt (6.3, EN 50126-2 8.3)');
    else if (h.rap.principle === 'ere' && isBlank(h.rap.rac)) evalProblems.push('Risikoakzeptanzkriterium für explizite Risikoabschätzung fehlt (8.3.3)');
    else if (h.rap.principle !== 'ere' && isBlank(h.rap.reference)) evalProblems.push('Referenz auf Regelwerk / Referenzsystem fehlt (8.3.1, 8.3.2)');
  }
  out.evaluated = out.analysed && evalProblems.length === 0;
  p.push(...evalProblems);

  const ctrlProblems = [];
  if (ba.decision === false) {
    const needsMeasures = h.riskClass && RISK_RANK[h.riskClass] >= RISK_RANK.Tolerable;
    if (needsMeasures && isBlank((h.measures || []).filter((m) => m.status !== 'rejected'))) ctrlProblems.push('Keine Maßnahme bei nicht vernachlässigbarem Risiko (7.4.2.2 f))');
    if (h.riskClass === 'Intolerable' && (!h.residualRiskClass || h.residualRiskClass === 'Intolerable')) ctrlProblems.push('Untragbares Risiko ohne wirksame Reduktion (Tabelle C.8)');
    if ((h.measures || []).filter((m) => m.status !== 'rejected').some((m) => isBlank(m.residualSeverity) || isBlank(m.residualFrequency))) ctrlProblems.push('Maßnahme ohne Restrisiko-Einschätzung');
  }
  out.controlled = out.evaluated && ctrlProblems.length === 0;
  p.push(...ctrlProblems);
  return out;
}

function requirementCompleteness(r, functions) {
  const p = [];
  if (isBlank(r.text)) p.push('Anforderungstext fehlt');
  if (!/\b(muss|müssen|darf nicht|dürfen nicht|ist .* zu|sind .* zu|shall)\b/i.test(r.text || '')) p.push('Anforderung ist nicht als verbindliche Forderung formuliert („muss“, „darf nicht“)');
  if (r.category !== 'technical' && isBlank(r.hazards)) p.push('Keine Gefährdung verknüpft (Nachverfolgbarkeit)');
  if (r.category === 'functional') {
    if (isBlank(r.functions)) p.push('Funktionale Sicherheitsanforderung ohne zugeordnete Funktion (EN 50129 A.2)');
    if (isBlank(r.safeState)) p.push('Sicherer Zustand nicht definiert (EN 50126-2 9.3.2)');
  }
  if (r.category === 'srac') {
    if (isBlank(r.srac && r.srac.receiver)) p.push('SRAC ohne Empfänger (EN 50129 5.3.13)');
    if (isBlank(r.hazards)) p.push('SRAC muss mit mindestens einer Gefährdung verknüpft sein (EN 50129 5.3.13)');
  }
  if (isBlank(r.verificationMethod)) p.push('Verifikationsmethode fehlt');
  return { ok: p.length === 0, problems: p };
}

// --------------------------------------------------------------- coverage ----
/** Coverage evidence for the PHL: what was searched, by which pass, and what it yielded. Computed purely from provenance and record fields. */
function coverage({ hazards, functions, interfaces, sources, guidewords, modes, runs }) {
  const all = hazards || [];
  const accepted = all.filter((h) => h.review && h.review.decision === 'accepted');
  const bySource = (sources || []).map((s) => ({ id: s.id, code: s.code, title: s.title, proposed: all.filter((h) => h.sourceCategory === s.id).length, accepted: accepted.filter((h) => h.sourceCategory === s.id).length, searched: (runs || []).some((r) => (r.passes || []).some((p) => p.kind === 'source' && p.unit === s.id)) }));
  const byFunction = (functions || []).map((f) => ({ id: f.id, name: f.name, proposed: all.filter((h) => (h.functions || []).includes(f.id)).length, accepted: accepted.filter((h) => (h.functions || []).includes(f.id)).length, searched: (runs || []).some((r) => (r.passes || []).some((p) => p.kind === 'function' && p.unit === f.id)) }));
  const byInterface = (interfaces || []).map((i) => ({ id: i.id, name: i.name, proposed: all.filter((h) => (h.interfaces || []).includes(i.id)).length, accepted: accepted.filter((h) => (h.interfaces || []).includes(i.id)).length, searched: (runs || []).some((r) => (r.passes || []).some((p) => p.kind === 'interface' && p.unit === i.id)) }));
  // A hazard may consolidate several guideword deviations, so count across the
  // full list and fall back to the single field for older / manual records.
  const hasGw = (h, id) => ((h.guidewords || []).length ? h.guidewords.includes(id) : h.guideword === id);
  const byGuideword = (guidewords || []).map((g) => ({ id: g.id, label: g.label, proposed: all.filter((h) => hasGw(h, g.id)).length, accepted: accepted.filter((h) => hasGw(h, g.id)).length }));
  const byMode = (modes || []).map((m) => ({ id: m.id, label: m.label, proposed: all.filter((h) => (h.modes || []).includes(m.id)).length, accepted: accepted.filter((h) => (h.modes || []).includes(m.id)).length, searched: (runs || []).some((r) => (r.passes || []).some((p) => p.kind === 'mode' && p.unit === m.id)) }));
  const byMethod = Object.keys(LABELS.method).map((k) => ({ id: k, label: LABELS.method[k], proposed: all.filter((h) => h.method === k).length, accepted: accepted.filter((h) => h.method === k).length })).filter((x) => x.proposed > 0);
  return { bySource, byFunction, byInterface, byGuideword, byMode, byMethod, totals: { proposed: all.length, accepted: accepted.length, rejected: all.filter((h) => h.review && h.review.decision === 'rejected').length } };
}

// ----------------------------------------------------------- traceability ----
function traceability({ hazards, requirements, functions }) {
  const reqs = requirements || [];
  const hz = (hazards || []).filter((h) => h.review && h.review.decision === 'accepted');
  const hazardRows = hz.map((h) => ({ hazard: h, requirements: reqs.filter((r) => (r.hazards || []).includes(h.id)), functions: (h.functions || []).map((id) => (functions || []).find((f) => f.id === id)).filter(Boolean), measuresWithoutRequirement: (h.measures || []).filter((m) => m.status !== 'rejected' && !reqs.some((r) => (r.measures || []).includes(m.id))) }));
  const orphanRequirements = reqs.filter((r) => r.category !== 'technical' && isBlank(r.hazards));
  const hazardsWithoutRequirement = hazardRows.filter((row) => row.requirements.length === 0 && row.hazard.broadlyAcceptable && row.hazard.broadlyAcceptable.decision === false).map((r) => r.hazard);
  const functionRows = (functions || []).map((f) => ({ fn: f, hazards: hz.filter((h) => (h.functions || []).includes(f.id)), requirements: reqs.filter((r) => (r.functions || []).includes(f.id)), integrity: functionIntegrity(f) }));
  return { hazardRows, orphanRequirements, hazardsWithoutRequirement, functionRows };
}

// ----------------------------------------------------------- statistics ----
function projectStats({ hazards, requirements, functions, sd }) {
  const all = hazards || [];
  const accepted = all.filter((h) => h.review && h.review.decision === 'accepted');
  const comp = accepted.map(hazardCompleteness);
  const byClass = {};
  for (const c of RISK_CLASSES) byClass[c] = accepted.filter((h) => h.riskClass === c).length;
  const residualByClass = {};
  for (const c of RISK_CLASSES) residualByClass[c] = accepted.filter((h) => h.residualRiskClass === c).length;
  const heat = {};
  for (const f of FREQUENCIES) { heat[f] = {}; for (const s of SEVERITIES) heat[f][s] = 0; }
  for (const h of accepted) for (const a of h.accidents || []) if (a.frequency && a.severity && heat[a.frequency]) heat[a.frequency][a.severity]++;
  const reqs = requirements || [];
  const sdv = validateSystemDefinition(sd || {}, functions || []);
  return {
    hazards: { total: all.length, accepted: accepted.length, pending: all.filter((h) => !h.review || h.review.decision === 'pending').length, rejected: all.filter((h) => h.review && h.review.decision === 'rejected').length, analysed: comp.filter((c) => c.analysed).length, evaluated: comp.filter((c) => c.evaluated).length, controlled: comp.filter((c) => c.controlled).length, broadlyAcceptable: accepted.filter((h) => h.broadlyAcceptable && h.broadlyAcceptable.decision === true).length },
    byClass, residualByClass, heat,
    requirements: { total: reqs.length, byCategory: Object.fromEntries(Object.keys(LABELS.reqCategory).map((k) => [k, reqs.filter((r) => r.category === k).length])), complete: reqs.filter((r) => requirementCompleteness(r).ok).length },
    functions: { total: (functions || []).length, safetyRelated: (functions || []).filter((f) => f.safetyRelated === true).length, withTffr: (functions || []).filter((f) => f.tffr != null && f.tffr !== '').length },
    systemDefinition: { filled: sdv.filled, total: sdv.total, ok: sdv.ok },
    stageProgress: {
      definition: sdv.total ? Math.round((sdv.filled / sdv.total) * 100) : 0,
      identification: all.length ? Math.round(((all.length - all.filter((h) => !h.review || h.review.decision === 'pending').length) / all.length) * 100) : 0,
      analysis: accepted.length ? Math.round((comp.filter((c) => c.evaluated).length / accepted.length) * 100) : 0,
      requirements: accepted.filter((h) => h.broadlyAcceptable && h.broadlyAcceptable.decision === false).length ? Math.round((accepted.filter((h) => h.broadlyAcceptable && h.broadlyAcceptable.decision === false && reqs.some((r) => (r.hazards || []).includes(h.id))).length / accepted.filter((h) => h.broadlyAcceptable && h.broadlyAcceptable.decision === false).length) * 100) : 0,
    },
  };
}

const api = {
  LABELS, FREQUENCIES, SEVERITIES, RISK_CLASSES, RISK_RANK, SYSTEM_DEFINITION_FIELDS,
  data, label, nextId, nowIso,
  riskClass, riskClassOrNull, worstRiskClass, recomputeHazardRisk,
  silFromTffr, functionIntegrity, parseRate, formatRate,
  checkOrSum, checkHazardAllocation,
  makeSystemDefinition, makeFunction, makeHazard, makeAccident, makeMeasure, makeRequirement, makeCca,
  validateSystemDefinition, hazardCompleteness, requirementCompleteness,
  coverage, traceability, projectStats, isBlank,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.RHAS_MODEL = api;
})();

