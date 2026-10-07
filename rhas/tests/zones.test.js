'use strict';
// WP5 level 3 (preview): zones, conduits, SL-T, IEC 62443-3-3 SR mapping, case skeleton.
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, R, loadProject, bundleFrom, docxText, xlsxText } = require('./helpers.js');
const Z = require('../src/zones.js');
const TL = require('../src/threatlog.js');

const snap = loadProject('reference-project.json');
const fns = snap.functions; const ifs = snap.meta.interfaces;

test('SR catalogue: 7 FRs, 51 SRs, identifiers and titles only', () => {
  const cat = M.data().security.srCatalogue;
  assert.equal(cat.foundational.length, 7);
  assert.equal(cat.foundational.reduce((n, f) => n + f.srs.length, 0), 51);
  assert.equal(Z.srTitle('SR 1.6'), 'Wireless access management');
  assert.equal(Z.srTitle('SR 7.8'), 'Control system component inventory');
  assert.ok(cat.foundational.every((f) => f.srs.every((s) => Object.keys(s).sort().join() === 'id,title')), 'no requirement text stored');
});

test('SL-T proposal: attacker profile where medium/high threats touch the zone, else SL 1', () => {
  const threats = [TL.recomputeThreat(TL.makeThreat({ interfaces: [ifs[0].id], exposure: 3, vulnerability: 3, impact: 'A' }))];
  assert.equal(Z.proposeSlT({ interfaces: [ifs[0].id] }, threats, { secAttacker: 'sophisticated' }).sl, 3);
  assert.equal(Z.proposeSlT({ interfaces: [ifs[0].id] }, threats, {}).sl, 2, 'no attacker profile -> SL 2 assumed');
  assert.equal(Z.proposeSlT({ interfaces: [ifs[1].id] }, threats, { secAttacker: 'extended' }).sl, 1);
});

test('partition check: unassigned assets, mixed safety zones, missing SL-T, bad conduits', () => {
  const zones = [Z.makeZone({ id: 'Z-01', functions: fns.map((f) => f.id), interfaces: ifs.slice(1).map((i) => i.id) })];
  const conduits = [Z.makeConduit({ id: 'C-01', zones: ['Z-01', 'Z-01'], interfaces: [ifs[0].id] })];
  const v = Z.check({ zones, conduits, functions: fns, interfaces: ifs });
  const txt = v.findings.map((f) => f.text).join(' | ');
  assert.equal(v.ok, false);
  for (const s of ['SL-T fehlt', 'zwei verschiedene Zonen', 'keine Systemanforderungen', 'Partitionierungsnachweis offen']) assert.ok(txt.includes(s), s);
  if (fns.some((f) => f.safetyRelated === false)) assert.ok(txt.includes('ZCR 3.3'));
  const z2 = Z.makeZone({ id: 'Z-02', slT: 2 });
  const ok = Z.check({ zones: [{ ...zones[0], slT: 3, slTRationale: 'Funk', srs: ['SR 1.6'] }, { ...z2, slTRationale: 'x', srs: ['SR 3.1'] }], conduits: [{ ...conduits[0], zones: ['Z-01', 'Z-02'], slT: 2 }], functions: fns, interfaces: ifs });
  assert.ok(ok.findings.some((f) => /unter dem SL-T einer verbundenen Zone/.test(f.text)));
});

test('cybersecurity case skeleton reports what exists and what is open', () => {
  const rows = Z.caseSkeleton({ sd: snap.meta.systemDefinition, zones: [], conduits: [], threats: [], profile: snap.meta.projectProfile, requirements: snap.requirements });
  const st = Object.fromEntries(rows.map((r) => [r.ref, r.status]));
  assert.equal(st['ZCR 6.2'], 'vorhanden');
  assert.equal(st['ZCR 6.3'], 'offen');
  assert.equal(st['ZCR 6.8'], 'offen');
  assert.equal(st['ZCR 6.9'], 'vorhanden');
});

test('level 3 report: zones, conduits, SR per zone, findings, case skeleton; XLSX sheets', () => {
  const s = structuredClone(snap);
  s.meta.projectProfile.security = { level: 3, standard: 'ts50701-2023', justification: '' };
  s.meta.systemDefinition.secAttacker = 'sophisticated';
  s.meta.zones = [Z.makeZone({ id: 'Z-01', name: 'Warnkette (sicherheitsrelevant)', attributes: { safetyRelated: true, wireless: true }, functions: ['F-0001', 'F-0002'], interfaces: [], slT: 3, slTRationale: 'Lizenzfreier Funk, Angreifer mit Bahnkenntnissen', srs: ['SR 1.6', 'SR 3.1'], srRequirements: { 'SR 3.1': 'R-0001' } }), Z.makeZone({ id: 'Z-02', name: 'Parametrierung', attributes: { temporary: true }, slT: 2, slTRationale: 'temporär' })];
  s.meta.conduits = [Z.makeConduit({ id: 'C-01', name: 'Parametrierzugang', zones: ['Z-02', 'Z-01'], slT: 3, slTRationale: 'wie Z-01' })];
  const b = bundleFrom(s);
  const txt = docxText(R.buildDocx('full', b));
  for (const t of ['Zonen, Conduits und Ziel-Security-Level (Security-Stufe 3, Vorschau)', 'Warnkette (sicherheitsrelevant)', 'SR 3.1\n | Communication integrity\n | R-0001', 'Parametrierzugang', 'Prüfbefunde der Partitionierung', 'Cybersecurity-Nachweis: Gliederung und Stand', 'ersetzt keinen Cybersecurity-Nachweis']) assert.ok(txt.includes(t), t);
  const x = xlsxText(R.buildXlsx(b));
  for (const sh of ['## Zonen', '## Conduits', '## SR je Zone']) assert.ok(x.includes(sh), sh);
});
