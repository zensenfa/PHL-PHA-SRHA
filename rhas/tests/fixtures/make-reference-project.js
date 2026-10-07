// Builds tests/fixtures/reference-project.json: the Lynx demo (stage 1) plus the
// two lead hazards, requirements, TFFR values and CCA record from the demo input
// sheet (02_Eingabedaten, sections 5-7). Fixed timestamps keep it deterministic.
// Run: node tests/fixtures/make-reference-project.js
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../../src/model.js');

const T = '2026-09-24T08:00:00.000Z';
const BY = 'Referenzprojekt';
const stamp = { createdAt: T, updatedAt: T, createdBy: BY, updatedBy: BY };
const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-stufe1.json'), 'utf8'));
const cal = M.data().calibration;

// --- TFFR per function (input sheet section 7) ---
const TFFR = { 'F-0001': 1e-8, 'F-0002': 1e-8, 'F-0003': 1e-8, 'F-0004': 1.5e-8, 'F-0005': 1e-7, 'F-0006': 1e-7,
  'F-0007': 1e-7, 'F-0008': 1e-8, 'F-0009': 1e-7, 'F-0010': 1e-7, 'F-0011': 1e-5 };
snap.functions = snap.functions.map((f) => ({ ...f, tffr: TFFR[f.id] ?? null, updatedAt: T }));

const accepted = { decision: 'accepted', by: BY, at: T, rationale: 'Übernommen: Leitgefährdung aus dem Eingabeblatt.' };

// --- Lead hazard A: crossover W 12/13 ---
const hA = M.makeHazard({
  ...stamp, id: 'H-0001', method: 'manual', level: 'boundary',
  title: 'Keine oder zu kurze Warnung bei Zugfahrt über Spurwechsel W 12/13',
  description: 'Ein Zug gelangt über den Spurwechsel W 12/13 von Gleis 2 auf Gleis 1 zwischen Einschaltstelle Nord und Baustellenende; das Personal erhält keine oder eine deutlich zu kurze Warnung.',
  sourceCategory: 'e', functions: ['F-0001', 'F-0012'], interfaces: ['IF-0008'], modes: ['normal', 'degraded'],
  causes: [
    { text: 'Sicherung von W 12/13 im Stellwerk nicht eingegeben oder aufgehoben', kind: 'human' },
    { text: 'Umleitung über W 12/13 ohne Information des Sicherheitschefs', kind: 'human' },
    { text: 'Projektierung der Einschaltstelle ohne Berücksichtigung des Spurwechsels', kind: 'systematic' },
  ],
  triggeringEvent: 'Zugfahrt von Gleis 2 über W 12/13 auf Gleis 1 in Richtung Baustelle',
  accidents: [
    M.makeAccident({ id: 'A1', description: 'Zug erfasst Arbeiter auf der Brücke über die Wigger', affected: ['staff'],
      severity: 'critical', severityRationale: 'Kollision mit einer Person bei bis zu 140 km/h; 1–3 Betroffene.',
      frequency: 'occasional', frequencyRationale: 'Ein Ereignis in vier Jahren (LYNX-BE-04, Ereignis 9) und Personal ca. 30 % der Schichtzeit im Gefahrenbereich.' }),
    M.makeAccident({ id: 'A2', description: 'Zug kollidiert mit Zweiwegebagger im Lichtraum; Entgleisung', affected: ['staff', 'passengers', 'property'],
      severity: 'catastrophic', severityRationale: 'Entgleisung eines Reisezuges bei 140 km/h.',
      frequency: 'improbable', frequencyRationale: 'Erfordert gleichzeitig Fahrt über W 12/13 und Maschine im Lichtraum.' }),
  ],
  broadlyAcceptable: { decision: false, justification: '', by: BY, at: T },
  rap: { principle: 'ere', reference: '', justification: 'Projektspezifische Gleistopologie.', rac: 'matrix', racNote: '' },
  existingBarriers: [{ text: 'Stellwerkssicherung W 12/13 in Grundstellung', type: 'frequency', effectiveness: '', becomesSrac: true }],
  measures: [
    M.makeMeasure({ id: 'M1', text: 'Zusätzliche Einschaltstelle auf Gleis 2 vor dem Spurwechsel W 12/13', type: 'frequencyReduction',
      residualSeverity: 'critical', residualFrequency: 'improbable', status: 'accepted' }),
    M.makeMeasure({ id: 'M2', text: 'Infrastrukturbetreiberin sichert W 12/13 für die gesamte Bauzeit', type: 'frequencyReduction', hierarchy: 'procedural',
      residualSeverity: 'critical', residualFrequency: 'rare', status: 'accepted', becomesSrac: true }),
    M.makeMeasure({ id: 'M3', text: 'Vier-Augen-Prüfung der Einschaltstellen gegen den Gleisplan', type: 'frequencyReduction', hierarchy: 'procedural',
      residualSeverity: 'critical', residualFrequency: 'rare', status: 'accepted' }),
    // Rejected measure claiming a better residual: must NOT lower the residual risk (PATCH-2 regression).
    M.makeMeasure({ id: 'M4', text: 'Verworfen: Warnung per SMS an alle Mitarbeitenden', type: 'frequencyReduction', hierarchy: 'warning',
      residualSeverity: 'insignificant', residualFrequency: 'highlyImprobable', status: 'rejected' }),
  ],
  owner: 'Projektierung M2S', responsibleEntity: 'Projektierung M2S / Infrastrukturbetreiberin', review: accepted,
});

// --- Lead hazard B: technical failure of the warning chain ---
const hB = M.makeHazard({
  ...stamp, id: 'H-0002', method: 'manual', level: 'boundary',
  title: 'Personal im Gefahrenbereich erhält keine Warnung trotz Zugannäherung auf Gleis 1',
  description: 'Ein Zug befährt die Einschaltstelle, aber durch einen unerkannten Fehler in Zugerkennung, Funkübertragung, Warnlogik oder Warnausgabe wird keine Warnung ausgegeben.',
  sourceCategory: 'b', functions: ['F-0001', 'F-0002', 'F-0003', 'F-0004'],
  causes: [
    { text: 'Unerkannter Ausfall eines Schienenkontakts', kind: 'random' },
    { text: 'Funkmeldung geht verloren, ohne dass die Lebenszeichenüberwachung anspricht', kind: 'random' },
    { text: 'Softwarefehler in der Warnlogik der EZE-L', kind: 'systematic' },
  ],
  triggeringEvent: 'Zugfahrt auf Gleis 1 bei unerkanntem Fehler der Warnkette',
  accidents: [M.makeAccident({ id: 'A1', description: 'Zug erfasst Personen im Gefahrenbereich von Gleis 1', affected: ['staff'],
    severity: 'critical', severityRationale: 'Wie Leitgefährdung A.', frequency: 'improbable',
    frequencyRationale: 'Sicherheitsgerichtete Warnkette; unerkannter gefährlicher Ausfall nur mit THR-begrenzter Rate.' })],
  broadlyAcceptable: { decision: false, justification: '', by: BY, at: T },
  rap: { principle: 'cop', reference: 'EN 50129:2018 (SIL 3), EN 50159; Vorgabe IB-02', justification: '', rac: '', racNote: '' },
  thr: { valuePerHour: 5e-8, origin: 'dutyHolder', justification: 'Vorgabe IB-02 (IB-LH-05)' },
  measures: [M.makeMeasure({ id: 'M1', text: 'Tägliche Funktionsprüfung mit Probewarnung in beiden Sektoren', type: 'frequencyReduction', hierarchy: 'procedural',
    residualSeverity: 'critical', residualFrequency: 'highlyImprobable', status: 'accepted' })],
  owner: 'Schweizer Electronic', responsibleEntity: 'Schweizer Electronic', review: accepted,
});

// --- Rejected proposal (exercises the "Verworfen" report section) ---
const hR = M.makeHazard({
  ...stamp, id: 'H-0003', method: 'source', sourceCategory: 'a',
  title: 'Baufahrzeug auf gesperrtem Arbeitsgleis 2 ohne Warnung', description: 'Fahrt auf Gleis 2 ohne Warnung.',
  functions: ['F-0003'],
  review: { decision: 'rejected', by: BY, at: T, rationale: 'Verworfen: betrifft Fahrten auf dem gesperrten Arbeitsgleis 2 – ausserhalb des Betrachtungsumfangs.' },
  provenance: { runId: 'run_ref', pass: 'source:a', model: 'reference', reasoning: '' },
});

snap.hazards = [hA, hB, hR].map((h) => M.recomputeHazardRisk(h, cal));

snap.requirements = [
  M.makeRequirement({ ...stamp, id: 'R-0001', category: 'functional', title: 'Warnung bei Fahrt über Spurwechsel W 12/13',
    text: 'Die Anlage muss bei jeder Zugfahrt über W 12/13 auf Gleis 1 die Warnung spätestens 20 s vor Erreichen des Baustellenendes bei 140 km/h in beiden Sektoren auslösen.',
    hazards: ['H-0001'], functions: ['F-0001', 'F-0003'], measures: ['H-0001/M1'], safeState: 'Störungswarnung bei Ausfall der Einschaltstelle Gleis 2',
    timeToSafeState: '≤ 2 s', detection: 'Lebenszeichenüberwachung', allocation: 'Zugerkennung / Funkübertragung', verificationMethod: 'test',
    verificationNote: 'Simulierte Kontaktauslösung mit Zeitmessung', rationale: 'Massnahme M1', status: 'reviewed' }),
  M.makeRequirement({ ...stamp, id: 'R-0002', category: 'srac', title: 'Sicherung Spurwechsel W 12/13 durch die Infrastrukturbetreiberin',
    text: 'Die Infrastrukturbetreiberin muss W 12/13 während der Bauzeit gegen Umstellen sichern und jede Aufhebung vorab dem Sicherheitschef mitteilen.',
    hazards: ['H-0001'], measures: ['H-0001/M2'], verificationMethod: 'inspection', status: 'agreed',
    srac: { receiver: 'Infrastrukturbetreiberin – Fahrdienstleitung / Stellwerk', origin: 'Massnahme M2; AB-02 (LYNX-SH-02)', verification: 'Stellwerksjournal und Übergabeprotokoll' } }),
  M.makeRequirement({ ...stamp, id: 'R-0003', category: 'contextual', title: 'Bestätigung der Sicherung vor jeder Schicht',
    text: 'Der Sicherheitschef muss sich vor jeder Schicht die Sicherung von W 12/13 bestätigen lassen und dies dokumentieren.',
    hazards: ['H-0001'], verificationMethod: 'review', verificationNote: 'Wöchentliche Stichprobe', status: 'draft' }),
];
snap.ccas = [M.makeCca({ id: 'CCA-0001', createdAt: T, functions: ['F-0004', 'F-0006'], randomIndependence: false, systematicIndependence: false,
  evidenceRef: 'LYNX-SB-01 Kap. 5–7', outcome: 'dependent', assumptions: ['Gemeinsame EZE-L', 'Gemeinsamer Funkkanal'] })];
snap.project = { ...snap.project, name: 'Referenzprojekt Minimel Lynx (Regressionsbasis)' };
snap.exportedAt = T;

fs.writeFileSync(path.join(__dirname, 'reference-project.json'), JSON.stringify(snap, null, 1) + '\n');
console.log('reference-project.json written:', snap.hazards.map((h) => `${h.id} ${h.riskClass}->${h.residualRiskClass}`).join(', '));
