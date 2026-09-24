'use strict';
// Behaviour the customer demo relies on (input sheet 02_Eingabedaten, sections 6-7).
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, loadProject } = require('./helpers.js');

const snap = loadProject('reference-project.json');
const H = Object.fromEntries(snap.hazards.map((h) => [h.id, h]));
const F = Object.fromEntries(snap.functions.map((f) => [f.id, f]));

test('lead hazard A: Undesirable, residual Tolerable despite a rejected better measure', () => {
  const h = M.recomputeHazardRisk(structuredClone(H['H-0001']));
  assert.equal(h.riskClass, 'Undesirable');
  assert.equal(h.residualRiskClass, 'Tolerable');
});

test('lead hazard B: Tolerable', () => {
  assert.equal(M.recomputeHazardRisk(structuredClone(H['H-0002'])).riskClass, 'Tolerable');
});

test('stage 4 demo: F-0004 at 1.5e-8 passes the OR-sum against THR 5e-8', () => {
  const r = M.checkHazardAllocation(H['H-0002'], snap.functions, snap.ccas);
  assert.equal(r.mode, 'or');
  assert.equal(r.findings.filter((f) => f.level === 'error').length, 0);
});

test('stage 4 demo: F-0004 at 3e-8 raises the OR-sum error', () => {
  const fns = snap.functions.map((f) => (f.id === 'F-0004' ? { ...f, tffr: 3e-8 } : f));
  const r = M.checkHazardAllocation(H['H-0002'], fns, snap.ccas);
  assert.ok(r.findings.some((f) => f.level === 'error' && f.text.includes('ODER')));
});

test('stage 4 demo: F-0011 at 1e-5 needs confirmation, F-0012 is SIL not applicable', () => {
  assert.equal(M.functionIntegrity(F['F-0011']).boundary, true);
  assert.equal(M.functionIntegrity(F['F-0012']).integrity, 'notApplicable');
});

test('CCA F-0004/F-0006 is dependent, so no AND credit', () => {
  assert.equal(snap.ccas[0].outcome, 'dependent');
});

test('stage 1 of the demo project is complete (25 fields, gate to stage 2 open)', () => {
  const v = M.validateSystemDefinition(snap.meta.systemDefinition, snap.functions);
  assert.equal(v.ok, true, JSON.stringify(v.findings));
  assert.equal(v.filled, 25);
  assert.equal(v.total, 25);
});
