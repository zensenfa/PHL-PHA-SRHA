'use strict';
// Unit tests for the normative core (src/model.js). Expected values are typed
// from the standards, NOT read from src/data, so a data edit cannot silently
// change the normative behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const { M } = require('./helpers.js');

// EN 50126-1:2017 Table C.9 (rows: frequency, columns: severity).
const SEV = ['insignificant', 'marginal', 'critical', 'catastrophic'];
const C9 = {
  frequent: ['Undesirable', 'Intolerable', 'Intolerable', 'Intolerable'],
  probable: ['Tolerable', 'Undesirable', 'Intolerable', 'Intolerable'],
  occasional: ['Tolerable', 'Undesirable', 'Undesirable', 'Intolerable'],
  rare: ['Negligible', 'Tolerable', 'Undesirable', 'Undesirable'],
  improbable: ['Negligible', 'Negligible', 'Tolerable', 'Undesirable'],
  highlyImprobable: ['Negligible', 'Negligible', 'Negligible', 'Tolerable'],
};

test('risk class reproduces EN 50126-1 Table C.9 for all 24 cells', () => {
  for (const [f, row] of Object.entries(C9)) row.forEach((rc, i) => assert.equal(M.riskClass(f, SEV[i]), rc, `${f}/${SEV[i]}`));
});

test('risk class rejects unknown categories instead of mapping silently', () => {
  assert.throws(() => M.riskClass('sometimes', 'critical'), RangeError);
  assert.throws(() => M.riskClass('rare', 'fatal'), RangeError);
  assert.equal(M.riskClassOrNull('', 'critical'), null);
});

test('frequency bands follow EN 50126-1 Table C.1 (per hour, 24 h/day)', () => {
  const f = Object.fromEntries(M.data().calibration.frequencies.map((x) => [x.id, x.perHour]));
  assert.deepEqual(f.frequent, { min: 1e-3, max: null });
  assert.deepEqual(f.probable, { min: 1e-4, max: 1e-3 });
  assert.deepEqual(f.occasional, { min: 1e-5, max: 1e-4 });
  assert.deepEqual(f.rare, { min: 1e-7, max: 1e-5 });
  assert.deepEqual(f.improbable, { min: 1e-9, max: 1e-7 });
  assert.deepEqual(f.highlyImprobable, { min: null, max: 1e-9 });
});

test('SIL from TFFR follows EN 50126-2 Table 2 with half-open bands', () => {
  const cases = [
    [9.99e-10, 'belowRange'], [1e-9, 'SIL4'], [9.99e-9, 'SIL4'], [1e-8, 'SIL3'], [5e-8, 'SIL3'],
    [1e-7, 'SIL2'], [1e-6, 'SIL1'], [9.99e-6, 'SIL1'], [2e-5, 'BasicIntegrity'],
  ];
  for (const [v, sil] of cases) assert.equal(M.silFromTffr(v).integrity, sil, String(v));
});

test('TFFR exactly 1e-5 is Basic Integrity and flagged for confirmation', () => {
  const r = M.silFromTffr(1e-5);
  assert.equal(r.integrity, 'BasicIntegrity');
  assert.equal(r.boundary, true);
});

test('SIL is not applied to mechanical/procedural or non-safety functions (EN 50126-2 10.2.1, 10.3)', () => {
  assert.equal(M.functionIntegrity({ kind: 'procedural', safetyRelated: true, tffr: 1e-8 }).integrity, 'notApplicable');
  assert.equal(M.functionIntegrity({ kind: 'mechanical', safetyRelated: true, tffr: 1e-8 }).integrity, 'notApplicable');
  assert.equal(M.functionIntegrity({ kind: 'electronic', safetyRelated: false, tffr: 1e-8 }).integrity, 'notSafetyRelated');
  assert.equal(M.functionIntegrity({ kind: 'mixed', safetyRelated: true, tffr: 1e-8 }).integrity, 'SIL3');
});

test('no "SIL 0" label exists (EN 50129 A.5.1)', () => {
  assert.ok(!Object.values(M.LABELS.integrity).some((l) => /SIL\s*0/.test(l)));
});

test('parseRate accepts common engineering notations', () => {
  for (const s of ['1e-7', '1E-7', '1·10⁻⁷', '1×10^-7', '1e-7/h', ' 1e-7 ']) assert.equal(M.parseRate(s), 1e-7, s);
  assert.equal(M.parseRate('0,0000001'), 1e-7);
  assert.equal(M.parseRate('abc'), null);
});

test('OR-sum check (EN 50129 A.4.3.4 NOTE 1)', () => {
  assert.equal(M.checkOrSum(5e-8, [1e-8, 1e-8, 1e-8, 1.5e-8]).ok, true);
  const bad = M.checkOrSum(5e-8, [1e-8, 1e-8, 1e-8, 3e-8]);
  assert.equal(bad.ok, false);
  assert.ok(Math.abs(bad.sum - 6e-8) < 1e-20);
});

test('AND credit only with a CCA record proving random and systematic independence', () => {
  const fns = [{ id: 'F1', tffr: 4e-8, kind: 'electronic' }, { id: 'F2', tffr: 4e-8, kind: 'electronic' }];
  const h = { id: 'H', thr: { valuePerHour: 5e-8 }, functions: ['F1', 'F2'] };
  assert.equal(M.checkHazardAllocation(h, fns, []).mode, 'or');
  const partial = [{ id: 'C', functions: ['F1', 'F2'], outcome: 'independent', randomIndependence: true, systematicIndependence: false }];
  assert.equal(M.checkHazardAllocation(h, fns, partial).mode, 'or');
  const full = [{ id: 'C', functions: ['F1', 'F2'], outcome: 'independent', randomIndependence: true, systematicIndependence: true }];
  assert.equal(M.checkHazardAllocation(h, fns, full).mode, 'and');
});

test('THR on a hazard without function is an error (EN 50129 A.4.3.2)', () => {
  const r = M.checkHazardAllocation({ id: 'H', thr: { valuePerHour: 1e-7 }, functions: [] }, [], []);
  assert.equal(r.findings[0].level, 'error');
});

test('rejected measures neither lower the residual risk nor count as control (PATCH-2)', () => {
  const h = M.makeHazard({
    accidents: [M.makeAccident({ severity: 'critical', frequency: 'occasional' })],
    broadlyAcceptable: { decision: false }, rap: { principle: 'cop', reference: 'x' },
    measures: [
      M.makeMeasure({ residualSeverity: 'insignificant', residualFrequency: 'highlyImprobable', status: 'rejected' }),
      M.makeMeasure({ residualSeverity: 'critical', residualFrequency: 'rare', status: 'accepted' }),
    ],
  });
  M.recomputeHazardRisk(h);
  assert.equal(h.riskClass, 'Undesirable');
  assert.equal(h.residualRiskClass, 'Undesirable');
  h.measures[1].status = 'rejected';
  M.recomputeHazardRisk(h);
  assert.equal(h.residualRiskClass, 'Undesirable', 'falls back to the initial risk');
  assert.ok(M.hazardCompleteness(h).problems.some((p) => p.includes('Keine Maßnahme')));
});

test('hazard risk class is the worst accident scenario (EN 50126-2 8.2.2 many-to-many model)', () => {
  const h = M.makeHazard({ accidents: [
    M.makeAccident({ severity: 'marginal', frequency: 'rare' }),
    M.makeAccident({ severity: 'catastrophic', frequency: 'improbable' }),
  ] });
  M.recomputeHazardRisk(h);
  assert.equal(h.riskClass, 'Undesirable');
});

test('hazard sources are EN 50126-1 7.4.2.1 a) to n) in order', () => {
  assert.deepEqual(M.data().sources.map((s) => s.id), 'abcdefghijklmn'.split(''));
});

test('measure hierarchy follows EN 50126-1 5.9.2 a) to c); legacy values are migrated', () => {
  assert.deepEqual(Object.keys(M.LABELS.hierarchy), ['safeFunction', 'additionalSafety', 'safetyInformation']);
  const map = { design: 'safeFunction', protective: 'additionalSafety', warning: 'additionalSafety', procedural: 'safetyInformation' };
  for (const [legacy, now] of Object.entries(map)) {
    assert.equal(M.normalizeHierarchy(legacy), now);
    assert.equal(M.label('hierarchy', legacy), M.LABELS.hierarchy[now]);
  }
  const h = M.makeHazard({ measures: [M.makeMeasure({ hierarchy: 'procedural' })] });
  M.recomputeHazardRisk(h);
  assert.equal(h.measures[0].hierarchy, 'safetyInformation');
  assert.equal(M.makeMeasure().hierarchy, 'additionalSafety');
});

test('assumptions field cites EN 50126-1 7.3.2.1 d), not 6.5.2 (K1)', () => {
  const f = M.SYSTEM_DEFINITION_FIELDS.find((x) => x.key === 'assumptions');
  assert.equal(f.ref, '7.3.2.1 d)');
});

test('cause kinds: schema, labels and editors agree (no silent re-classification on save)', () => {
  const S = require('../src/schemas.js');
  const fs = require('fs'); const path = require('path');
  assert.deepEqual([...S.CAUSE_KINDS].sort(), Object.keys(M.LABELS.causeKind).sort());
  for (const f of ['ui/app-analysis.js', 'ui/app-identification.js']) {
    const src = fs.readFileSync(path.join(__dirname, '../src', f), 'utf8');
    assert.ok(!/\['systematic', 'random', 'human', 'external'\]/.test(src), `${f}: hard-coded cause kind list`);
  }
});
