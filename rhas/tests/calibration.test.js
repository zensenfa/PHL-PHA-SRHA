'use strict';
// WP3: configurable calibration (EN 50126-1 Annex C.1: categories set by the duty holder).
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, R, loadProject, bundleFrom, docxText } = require('./helpers.js');
const C = require('../src/calibration.js');
const S = require('../src/schemas.js');

const filledBinary = () => {
  const cal = C.fromTemplate({ frequency: 'C2', severity: 'C5', acceptance: 'C7', id: 'im-binary' });
  // F1 (most frequent) row: S1..S3 unacceptable; F2: S1..S2; F3: S1 only.
  const bad = { F1: ['S1', 'S2', 'S3'], F2: ['S1', 'S2'], F3: ['S1'] };
  for (const f of Object.keys(cal.matrix)) for (const s of Object.keys(cal.matrix[f])) cal.matrix[f][s] = bad[f].includes(s) ? 'Unacceptable' : 'Acceptable';
  return cal;
};
test.afterEach(() => M.setCalibration(null));

test('template C.1/C.4/C.8 reproduces the Table C.9 example and is valid (approval pending)', () => {
  const cal = C.fromTemplate();
  assert.deepEqual(cal.matrix, M.data().calibration.matrix);
  const v = C.validateCalibration(cal);
  assert.equal(v.ok, true);
  assert.ok(v.findings.some((f) => /nicht freigegeben/.test(f.text)));
});

test('other Annex C combinations start with an empty matrix that must be filled', () => {
  const cal = C.fromTemplate({ frequency: 'C2', severity: 'C5', acceptance: 'C7' });
  assert.deepEqual(M.frequencyIds(cal), ['F1', 'F2', 'F3']);
  assert.deepEqual(M.severityIds(cal), ['S1', 'S2', 'S3', 'S4', 'S5']);
  const v = C.validateCalibration(cal);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some((f) => /15 Matrixzelle/.test(f.text)));
  assert.equal(C.validateCalibration(filledBinary()).ok, true);
});

test('binary calibration drives risk class, rank, labels and completeness', () => {
  const cal = filledBinary();
  assert.equal(M.riskClass('F2', 'S2', cal), 'Unacceptable');
  assert.equal(M.riskClass('F3', 'S2', cal), 'Acceptable');
  M.setCalibration(cal);
  assert.equal(M.label('riskClass', 'Unacceptable'), 'Nicht akzeptabel');
  assert.equal(M.label('severity', 'S3'), 'S3');
  assert.deepEqual(M.riskClassIds(), ['Unacceptable', 'Acceptable']);
  const h = M.makeHazard({ title: 'T', description: 'D', sourceCategory: 'a', functions: ['F-1'], causes: [{ text: 'c', kind: 'random' }], triggeringEvent: 'e',
    accidents: [M.makeAccident({ description: 'a', severity: 'S2', frequency: 'F2', severityRationale: 'x', frequencyRationale: 'y' })],
    broadlyAcceptable: { decision: false }, rap: { principle: 'ere', rac: 'matrix' } });
  M.recomputeHazardRisk(h, cal);
  assert.equal(h.riskClass, 'Unacceptable');
  const probs = M.hazardCompleteness(h).problems.join(' | ');
  assert.match(probs, /Keine Maßnahme/);
  assert.match(probs, /Nicht akzeptables Risiko ohne wirksame Reduktion/);
  h.measures = [M.makeMeasure({ residualSeverity: 'S2', residualFrequency: 'F3', status: 'accepted' })];
  M.recomputeHazardRisk(h, cal);
  assert.equal(h.residualRiskClass, 'Acceptable');
  assert.doesNotMatch(M.hazardCompleteness(h).problems.join(' | '), /ohne wirksame Reduktion/);
});

test('validation catches duplicate ids, unknown cells and non-monotonic matrices', () => {
  const cal = filledBinary();
  cal.matrix.F3.S5 = 'Unacceptable'; // rarest, least severe but unacceptable
  assert.ok(C.validateCalibration(cal).findings.some((f) => /nicht monoton/.test(f.text)));
  cal.matrix.F1.S1 = 'Red';
  assert.ok(C.validateCalibration(cal).findings.some((f) => /unbekannte Kategorie Red/.test(f.text)));
  cal.frequencies[1].id = 'F1';
  assert.ok(C.validateCalibration(cal).findings.some((f) => /nicht eindeutig/.test(f.text)));
});

test('impact analysis lists hazards whose categories no longer exist', () => {
  const snap = loadProject('reference-project.json');
  const imp = C.impact(snap.hazards, filledBinary());
  assert.deepEqual(imp.invalid.map((x) => x.id), ['H-0001', 'H-0002']);
  const same = C.impact(snap.hazards, M.data().calibration);
  assert.equal(same.invalid.length + same.changed.length, 0);
});

test('LLM schemas use the project categories', () => {
  const sch = S.withCalibration(S.RISK_ANALYSIS_SCHEMA, filledBinary());
  const acc = sch.properties.accidents.items.properties;
  assert.deepEqual(acc.frequency.enum, ['F1', 'F2', 'F3']);
  assert.deepEqual(acc.severity.enum, ['S1', 'S2', 'S3', 'S4', 'S5']);
  assert.deepEqual(S.RISK_ANALYSIS_SCHEMA.properties.accidents.items.properties.frequency.enum.length, 6, 'original schema untouched');
});

test('report renders a non-default calibration', () => {
  const snap = loadProject('reference-project.json');
  snap.meta.calibration = { ...filledBinary(), title: 'IM binär' };
  const txt = docxText(R.buildDocx('risk', bundleFrom(snap)));
  assert.ok(txt.includes('IM binär'));
  assert.ok(txt.includes('Nicht akzeptabel'));
  assert.ok(txt.includes('F1') && txt.includes('S5'));
});
