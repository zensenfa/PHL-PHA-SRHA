'use strict';
// The Excel workbook carries the same security tables as the Word report, gated by the same level.
const test = require('node:test');
const assert = require('node:assert/strict');
const { R, loadProject, bundleFrom, xlsxText } = require('./helpers.js');
const TL = require('../src/threatlog.js');
const Z = require('../src/zones.js');

const snap = loadProject('reference-project.json');
const sheets = (x) => [...x.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
const L1 = ['Security-Kontext', 'Security-Gefährdungen', 'Security-Abdeckung', 'Security-Anforderungen'];
const L2 = ['Sec-Auswirkung', 'Sec-Exposition', 'Sec-Verwundbarkeit', 'Sec-Risikomatrix', 'Bedrohungsprotokoll', 'Bedrohungen-Trace'];
const L3 = ['Zonen', 'Conduits', 'SR je Zone', 'Zonen-Befunde', 'Security-Nachweis'];

function atLevel(level) {
  const s = structuredClone(snap);
  s.meta.projectProfile.security = { level, standard: 'ts50701-2023', justification: level === 0 ? 'nicht betrachtet' : '' };
  if (level >= 2) s.meta.threats = [TL.makeThreat({ id: 'T-0001', title: 'Replay', hazards: ['H-0002'], threatClasses: ['repetition'], exposure: 3, vulnerability: 2, impact: 'B' })];
  if (level >= 3) s.meta.zones = [Z.makeZone({ id: 'Z-01', name: 'Warnkette', functions: ['F-0001'], slT: 2, slTRationale: 'x' })];
  return sheets(xlsxText(R.buildXlsx(bundleFrom(s))));
}

test('xlsx security sheets appear per level, like the Word sections', () => {
  const l0 = atLevel(0), l1 = atLevel(1), l2 = atLevel(2), l3 = atLevel(3);
  for (const n of [...L1, ...L2, ...L3]) assert.ok(!l0.includes(n), `level 0 must not contain ${n}`);
  for (const n of L1) assert.ok(l1.includes(n) && l2.includes(n) && l3.includes(n), n);
  for (const n of [...L2.slice(0, 4)]) assert.ok(!l1.includes(n), `level 1 must not contain ${n}`);
  for (const n of L2) assert.ok(l2.includes(n) && l3.includes(n), n);
  for (const n of L3) assert.ok(!l2.includes(n) && l3.includes(n), n);
  assert.ok(l3.every((n) => n.length <= 31), 'sheet names fit Excel limit');
  assert.equal(new Set(l3).size, l3.length, 'sheet names are unique');
});
