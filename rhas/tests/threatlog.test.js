'use strict';
// WP5 level 2: threat log and locally computed security risk.
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, R, loadProject, bundleFrom, docxText, xlsxText } = require('./helpers.js');
const TL = require('../src/threatlog.js');

const snap = loadProject('reference-project.json');
const cal = TL.defaultCalibration();

test('likelihood = exposure + vulnerability - 1, only for valid scales', () => {
  assert.equal(TL.likelihood(1, 1), 1);
  assert.equal(TL.likelihood(3, 3), 5);
  assert.equal(TL.likelihood(2, 3), 4);
  assert.equal(TL.likelihood(0, 3), null);
  assert.equal(TL.likelihood(4, 1), null);
});

test('default security matrix is complete and monotonic, but not approved', () => {
  const v = TL.validateCalibration(cal);
  assert.equal(v.ok, true);
  assert.ok(v.findings.some((f) => /nicht freigegeben/.test(f.text)));
  const rank = (id) => TL.levelMeta(id, cal).rank;
  const imps = cal.impacts.map((i) => i.id);
  for (let a = 0; a < imps.length; a++) for (let l = 1; l <= 5; l++) {
    if (l < 5) assert.ok(rank(cal.matrix[imps[a]][l + 1]) >= rank(cal.matrix[imps[a]][l]), `${imps[a]} ${l}`);
    if (a + 1 < imps.length) assert.ok(rank(cal.matrix[imps[a]][l]) >= rank(cal.matrix[imps[a + 1]][l]), `${imps[a]} vs ${imps[a + 1]} at ${l}`);
  }
});

test('risk and residual risk are computed from the matrix; only accepted countermeasures count', () => {
  const t = TL.makeThreat({ exposure: 3, vulnerability: 3, impact: 'A', countermeasures: [
    TL.makeCountermeasure({ text: 'MAC mit Sequenznummer', status: 'accepted', residualVulnerability: 1 }),
    TL.makeCountermeasure({ text: 'unwirksam, verworfen', status: 'rejected', residualExposure: 1, residualVulnerability: 1 }),
  ] });
  TL.recomputeThreat(t, cal);
  assert.equal(t.likelihood, 5); assert.equal(t.risk, 'secHigh');
  assert.equal(t.residualRisk, 'secHigh', 'A with likelihood 3 stays high');
  t.countermeasures[0].residualExposure = 1; TL.recomputeThreat(t, cal);
  assert.equal(t.residualRisk, 'secMedium', 'A with likelihood 1');
});

test('impact floor follows the worst linked safety severity (proposal)', () => {
  assert.equal(TL.impactFloor([{ accidents: [{ severity: 'catastrophic' }] }], M.data().calibration, cal), 'A');
  assert.equal(TL.impactFloor([{ accidents: [{ severity: 'critical' }, { severity: 'marginal' }] }], M.data().calibration, cal), 'B');
  assert.equal(TL.impactFloor([], M.data().calibration, cal), '');
});

test('derive: one threat per deliberate cause of an accepted hazard, no duplicates', () => {
  const hz = structuredClone(snap.hazards);
  hz[1].causes.push({ text: 'Replay einer Ausschaltmeldung', kind: 'intentional' }); hz[1].threats = ['repetition'];
  hz[2].causes.push({ text: 'ignoriert: verworfene Gefährdung', kind: 'intentional' });
  const first = TL.deriveFromHazards(hz, [], M.data().calibration, cal);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].hazards, ['H-0002']);
  assert.deepEqual(first[0].threatClasses, ['repetition']);
  assert.equal(first[0].impact, 'B', 'critical severity -> impact B proposed');
  assert.equal(TL.deriveFromHazards(hz, [{ ...first[0], id: 'T-0001' }], M.data().calibration, cal).length, 0);
});

test('completeness: rationale, hazard link, high risk needs countermeasure, countermeasure needs requirement', () => {
  const t = TL.recomputeThreat(TL.makeThreat({ title: 'X', exposure: 3, vulnerability: 3, impact: 'A' }), cal);
  const p = TL.threatCompleteness(t, cal, snap.requirements).problems.join(' | ');
  for (const s of ['Keine verknüpfte Gefährdung', 'Exposition mit Begründung', 'Hohes Security-Risiko ohne wirksame Gegenmaßnahme']) assert.ok(p.includes(s), s);
  Object.assign(t, { hazards: ['H-0002'], exposureRationale: 'Funk', vulnerabilityRationale: 'ohne MAC', impactRationale: 'Unfall', countermeasures: [TL.makeCountermeasure({ id: 'G1', status: 'accepted', residualExposure: 1, residualVulnerability: 1 })] });
  TL.recomputeThreat(t, cal);
  assert.deepEqual(TL.threatCompleteness(t, cal, snap.requirements).problems, ['Gegenmaßnahme G1 ohne Anforderung']);
  t.countermeasures[0].requirements = ['R-0001'];
  assert.equal(TL.threatCompleteness(t, cal, snap.requirements).ok, true);
});

test('level 2 report: matrix, threat log, trace; XLSX sheet', () => {
  const s = structuredClone(snap);
  s.meta.projectProfile.security = { level: 2, standard: 'ts50701-2023', justification: '' };
  s.meta.threats = [TL.makeThreat({ id: 'T-0001', title: 'Replay einer Ausschaltmeldung', hazards: ['H-0002'], threatClasses: ['repetition'], exposure: 3, vulnerability: 2, impact: 'B', countermeasures: [TL.makeCountermeasure({ id: 'G1', text: 'MAC mit Sequenznummer', status: 'accepted', residualExposure: 1, residualVulnerability: 1, requirements: ['R-0001'] })] })];
  const b = bundleFrom(s);
  const txt = docxText(R.buildDocx('full', b));
  for (const t of ['Bedrohungsprotokoll und Security-Risikobewertung (Security-Stufe 2)', 'Security-Risikomatrix (Auswirkung × Wahrscheinlichkeit)', 'Replay einer Ausschaltmeldung', 'G1: MAC mit Sequenznummer', 'Nachverfolgbarkeit Bedrohung → Gefährdung → Anforderung', 'RHAS-Vorschlag', 'nicht freigegeben']) assert.ok(txt.includes(t), t);
  assert.equal(b.threats[0].risk, 'secHigh'); assert.equal(b.threats[0].residualRisk, 'secLow');
  assert.ok(xlsxText(R.buildXlsx(b)).includes('## Bedrohungsprotokoll'));
  const lvl1 = structuredClone(s); lvl1.meta.projectProfile.security.level = 1;
  assert.ok(!docxText(R.buildDocx('full', bundleFrom(lvl1))).includes('Bedrohungsprotokoll und Security-Risikobewertung'));
});
