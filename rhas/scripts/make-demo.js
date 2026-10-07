// Builds src/data/demo-project.json: the reference project (tests/fixtures) plus
// prepared security data for levels 1-3, so the demo can switch levels live.
// The profile stays at security level 0; higher-level data is kept but hidden
// until the level is raised. Run: node scripts/make-demo.js
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('../src/model.js');
const TL = require('../src/threatlog.js');
const Z = require('../src/zones.js');

const T = '2026-09-24T08:00:00.000Z';
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/reference-project.json'), 'utf8'));
d.project = { name: 'Beispiel: Minimel Lynx ATWS – Gleiserneuerung Reiden Süd (fiktiv)', description: 'Fiktives Demonstrationsprojekt mit Systemdefinition, zwei Leitgefährdungen, Anforderungen, SRAC und CCA sowie vorbereiteten Security-Daten für die Stufen 1–3 — keine realen Projekt- oder Produktdaten.' };

// --- security context (stage 1, shown from level 1) ---
Object.assign(d.meta.systemDefinition, {
  secAttacker: 'sophisticated',
  secTransmission: '3',
  secAccess: 'Einschaltstellen, Funkwarngeräte und Zentrale stehen ungeschützt im öffentlich zugänglichen Gleisumfeld; Diebstahl und Manipulation während der Bauzeit möglich.',
  secMaintenance: 'Parametrierung und Diagnose über einen Service-Laptop mit Kabelverbindung zur Zentrale; Laptop wird zwischen Baustellen transportiert.',
  secUpdate: 'Firmware-Aktualisierung durch den Hersteller in der Werkstatt; im Feld keine Aktualisierung vorgesehen (Annahme, zu bestätigen).',
  secKeys: 'Schlüssel- und Berechtigungskonzept für Funk und Parametrierung unbekannt – offene Frage an den Hersteller.',
});

const H = Object.fromEntries(d.hazards.map((h) => [h.id, h]));
// --- deliberate causes and security measures (level 1) ---
H['H-0002'].causes.push({ text: 'Angreifer spielt eine aufgezeichnete Ausschaltmeldung erneut ein und beendet die Warnung vorzeitig', kind: 'intentional' });
H['H-0002'].causes.push({ text: 'Gezielte Funkstörung unterdrückt Einschaltmeldungen', kind: 'intentional' });
H['H-0002'].threats = ['repetition', 'masquerade', 'jamming'];
H['H-0002'].interfaces = [...new Set([...(H['H-0002'].interfaces || []), 'IF-0003'])];
H['H-0002'].measures.push(M.makeMeasure({ id: 'M2', text: 'Nachrichtenauthentisierung mit Sequenznummer und Zeitstempel für alle Funkmeldungen (EN 50159 Kategorie 3)', type: 'frequencyReduction', hierarchy: 'additionalSafety', residualSeverity: 'critical', residualFrequency: 'highlyImprobable', status: 'accepted', securityRelated: true }));
H['H-0002'].measures.push(M.makeMeasure({ id: 'M3', text: 'Lebenszeichenüberwachung löst bei Funkausfall die Störungswarnung aus (sicherer Zustand)', type: 'propagationReduction', hierarchy: 'additionalSafety', residualSeverity: 'critical', residualFrequency: 'highlyImprobable', status: 'accepted', securityRelated: true }));
H['H-0001'].causes.push({ text: 'Manipulierte Projektierungsdaten der Einschaltstellen über den Service-Laptop', kind: 'intentional' });
H['H-0001'].threats = ['maliciousConfiguration'];
H['H-0001'].interfaces = [...new Set([...(H['H-0001'].interfaces || []), 'IF-0012'])];
H['H-0001'].measures.push(M.makeMeasure({ id: 'M5', text: 'Parametrierung nur mit signierten Konfigurationsdateien und Vier-Augen-Freigabe; Service-Laptop ohne Netzanbindung', type: 'frequencyReduction', hierarchy: 'safetyInformation', residualSeverity: 'critical', residualFrequency: 'rare', status: 'accepted', securityRelated: true }));
d.hazards = d.hazards.map((h) => M.recomputeHazardRisk(h));

const stamp = { createdAt: T, updatedAt: T, createdBy: 'Demo', updatedBy: 'Demo' };
d.requirements.push(
  M.makeRequirement({ ...stamp, id: 'R-0004', category: 'technical', securityRelated: true, title: 'Authentisierte Funkmeldungen',
    text: 'Die Anlage muss jede sicherheitsrelevante Funkmeldung mit Nachrichtenauthentisierung, Sequenznummer und Zeitstempel sichern und nicht authentische, wiederholte oder verspätete Meldungen verwerfen.',
    hazards: ['H-0002'], functions: ['F-0002', 'F-0008'], measures: ['H-0002/M2'], verificationMethod: 'test', verificationNote: 'Replay- und Manipulationstest im Labor', status: 'draft' }),
  M.makeRequirement({ ...stamp, id: 'R-0005', category: 'srac', securityRelated: true, title: 'Verwahrung und Freigabe des Service-Laptops',
    text: 'Der Anwender muss den Service-Laptop unter Verschluss halten, ohne Netzanbindung betreiben und jede Parametrierung im Vier-Augen-Prinzip freigeben.',
    hazards: ['H-0001'], measures: ['H-0001/M5'], verificationMethod: 'inspection', status: 'draft',
    srac: { receiver: 'Anwender – Sicherheitschef / M2S-Service', origin: 'Massnahme H-0001/M5', verification: 'Freigabeprotokoll der Parametrierung' } }),
);

// --- threat log (level 2) ---
const cal = TL.defaultCalibration();
const th = (f) => TL.recomputeThreat(TL.makeThreat({ ...stamp, ...f }), cal);
d.meta.threats = [
  th({ id: 'T-0001', title: 'Replay einer Ausschaltmeldung', description: 'Aufgezeichnete Ausschaltmeldung wird erneut eingespielt; die Zentrale beendet die Warnung, obwohl ein Zug naht.', sourceCause: H['H-0002'].causes[3].text, hazards: ['H-0002'], interfaces: ['IF-0003'], functions: ['F-0008'], threatClasses: ['repetition', 'masquerade'], cia: { c: false, i: true, a: false },
    exposure: 3, exposureRationale: 'Lizenzfreier Funk im öffentlichen Raum, Aufzeichnung mit handelsüblichem SDR möglich.', vulnerability: 2, vulnerabilityRationale: 'Schutz durch Authentisierung nicht nachgewiesen (offene Frage an den Hersteller).', impact: 'B', impactRationale: 'Führt zu H-0002 mit Schadensausmaß kritisch.',
    countermeasures: [TL.makeCountermeasure({ id: 'G1', text: 'Nachrichtenauthentisierung mit Sequenznummer und Zeitstempel', status: 'accepted', residualExposure: 3, residualVulnerability: 1, requirements: ['R-0004'] })], status: 'open', owner: 'Hersteller' }),
  th({ id: 'T-0002', title: 'Manipulierte Projektierung über den Service-Laptop', description: 'Einschaltdistanz oder Sektorzuordnung werden über den Parametrierzugang böswillig verändert.', sourceCause: H['H-0001'].causes[3].text, hazards: ['H-0001'], interfaces: ['IF-0012'], functions: ['F-0012'], threatClasses: ['maliciousConfiguration'], cia: { c: false, i: true, a: false },
    exposure: 1, exposureRationale: 'Nur mit physischem Zugriff auf Laptop und Zentrale.', vulnerability: 2, vulnerabilityRationale: 'Keine Signatur der Konfigurationsdateien bekannt.', impact: 'B', impactRationale: 'Führt zu H-0001 mit Schadensausmaß kritisch.',
    countermeasures: [TL.makeCountermeasure({ id: 'G1', text: 'Signierte Konfigurationsdateien, Vier-Augen-Freigabe, Laptop unter Verschluss', status: 'accepted', residualExposure: 1, residualVulnerability: 1, requirements: ['R-0005'] })], status: 'treated', owner: 'Anwender' }),
  th({ id: 'T-0003', title: 'Gezielte Funkstörung', description: 'Störsender blockiert die Funkstrecken.', sourceCause: H['H-0002'].causes[4].text, hazards: ['H-0002'], interfaces: ['IF-0003'], functions: ['F-0002', 'F-0010'], threatClasses: ['jamming'], cia: { c: false, i: false, a: true },
    exposure: 3, exposureRationale: 'Störsender im öffentlichen Raum einfach einsetzbar.', vulnerability: 3, vulnerabilityRationale: 'Funkstörung lässt sich nicht verhindern.', impact: 'D', impactRationale: 'Lebenszeichenüberwachung führt in die Störungswarnung (sicherer Zustand); Folge ist Verfügbarkeitsverlust, kein Unfall.',
    countermeasures: [], status: 'accepted', owner: 'Anwender', notes: 'Restrisiko akzeptiert: sicherer Zustand gewährleistet (H-0002/M3).' }),
];

// --- zones and conduits (level 3) ---
d.meta.zones = [
  Z.makeZone({ id: 'Z-01', name: 'Warnkette an der Strecke', description: 'Einschaltstellen, Zentrale, Warneinheiten', attributes: { safetyRelated: true, wireless: true }, functions: ['F-0001', 'F-0002', 'F-0003', 'F-0004', 'F-0005', 'F-0008', 'F-0009', 'F-0010', 'F-0011'], interfaces: ['IF-0001', 'IF-0002', 'IF-0004', 'IF-0005', 'IF-0007', 'IF-0010'],
    partition: { 3.2: true, 3.3: true, 3.5: true }, slT: 3, slTRationale: 'Lizenzfreier Funk, angenommener Angreifer mit bahnspezifischen Kenntnissen; T-0001 mit hohem Ausgangsrisiko.', srs: ['SR 1.2', 'SR 3.1', 'SR 3.8', 'SR 7.1'], srRequirements: { 'SR 3.1': 'R-0004', 'SR 3.8': 'R-0004' } }),
  Z.makeZone({ id: 'Z-02', name: 'Personen- und Maschinenwarngeräte', description: 'EPW, MWK', attributes: { safetyRelated: true, wireless: true }, functions: ['F-0006', 'F-0007'], interfaces: ['IF-0006'],
    partition: { 3.3: true, 3.5: true }, slT: 3, slTRationale: 'Wie Z-01; empfängt sicherheitsrelevante Funkmeldungen.', srs: ['SR 1.2', 'SR 3.1'], srRequirements: { 'SR 3.1': 'R-0004' } }),
  Z.makeZone({ id: 'Z-03', name: 'Parametrierung und Service', description: 'Service-Laptop, temporär verbunden', attributes: { temporary: true }, functions: ['F-0012'], interfaces: ['IF-0012'],
    partition: { 3.4: true }, slT: 2, slTRationale: 'Physischer Zugang erforderlich; T-0002 nach Gegenmaßnahme niedrig.', srs: ['SR 2.3', 'SR 3.4'], srRequirements: { 'SR 3.4': 'R-0005' } }),
];
d.meta.conduits = [
  Z.makeConduit({ id: 'C-01', name: 'Funkstrecken', zones: ['Z-01', 'Z-02'], interfaces: ['IF-0003'], slT: 3, slTRationale: 'Offene Übertragung (EN 50159 Kategorie 3).' }),
  Z.makeConduit({ id: 'C-02', name: 'Parametrierzugang', zones: ['Z-03', 'Z-01'], interfaces: [], slT: 3, slTRationale: 'Führt in die sicherheitsrelevante Zone Z-01.' }),
];
d.meta.projectProfile.changeLog = [{ at: T, by: 'Demo', reason: 'Erstbestätigung', changes: [] }];
fs.writeFileSync(path.join(__dirname, '../src/data/demo-project.json'), JSON.stringify(d, null, 2) + '\n');
console.log('demo written:', d.hazards.map((h) => `${h.id} ${h.riskClass}->${h.residualRiskClass}`).join(', '), '| threats', d.meta.threats.map((t) => `${t.id} ${t.risk}->${t.residualRisk}`).join(', '));
