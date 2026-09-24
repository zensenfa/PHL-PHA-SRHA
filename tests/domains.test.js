'use strict';
// WP4: domain packs – no domain wording hard-coded in prompts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { M, R, loadProject, bundleFrom, docxText } = require('./helpers.js');
const D = require('../src/domains.js');
const P = require('../src/prompts.js');
const PROFILE = require('../src/profile.js');

const ctxFor = (domain) => ({ profile: PROFILE.makeProjectProfile({ role: 'supplier', domain }), sd: {}, functions: [], interfaces: [], modes: [], docs: '' });
const EX_KEYS = ['hazardRight', 'hazardWrong', 'functionName', 'safeState', 'availabilityFollowUp', 'copReference', 'interfacePartners'];

test('every profile domain resolves to a pack; unknown domains fall back to generic', () => {
  assert.equal(D.packFor('ccs').id, 'ccs');
  assert.equal(D.packFor({ domain: 'rollingStock' }).id, 'rollingStock');
  for (const d of ['fixedInstallations', 'telecom', 'other', undefined, 'xyz']) assert.equal(D.packFor(d).id, 'generic', String(d));
  for (const d of Object.keys(PROFILE.OPTIONS.domain.values)) assert.ok(D.packFor(d), d);
});

test('packs are complete and use valid enums', () => {
  const kinds = Object.keys(M.LABELS.functionKind);
  const ifTypes = ['physical', 'functional', 'human', 'externalSystem', 'organisation'];
  for (const p of D.all()) {
    for (const k of EX_KEYS) assert.ok(String(p.examples[k] || '').trim(), `${p.id}.${k}`);
    assert.ok(p.standards.length && p.checklist.length, p.id);
    for (const t of p.functionTemplates) assert.ok(kinds.includes(t.kind), `${p.id}: ${t.name}`);
    for (const t of p.interfaceTemplates) assert.ok(ifTypes.includes(t.type), `${p.id}: ${t.name}`);
    for (const a of p.affectedTypical) assert.ok(M.LABELS.affected[a], `${p.id}: ${a}`);
  }
});

test('prompts contain no hard-coded domain wording (source check)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/prompts.js'), 'utf8');
  for (const w of ['Zugannäherung', 'Personal im Gleis', 'Sperrung wirksam', 'Straßenverkehr', 'Fehlalarm', 'EN 50159']) assert.ok(!src.includes(w), w);
});

test('function and decomposition prompts use the examples of the project domain', () => {
  const rs = P.buildFunctionPrompt(ctxFor('rollingStock'), { id: 'F-0001', name: 'Türen', kind: 'mixed' }, M.data().guidewords, []).systemPrompt;
  assert.ok(rs.includes('Fahrgasttür ist geöffnet oder nicht verriegelt'));
  assert.ok(!rs.includes('Warnung'));
  const ccs = P.buildFunctionPrompt(ctxFor('ccs'), { id: 'F-0001', name: 'X', kind: 'mixed' }, M.data().guidewords, []).systemPrompt;
  assert.ok(ccs.includes('keine wirksame Warnung'));
  const dec = P.buildDecompositionPrompt(ctxFor('rollingStock')).systemPrompt;
  assert.ok(dec.includes('Türen freigeben und verriegeln') && dec.includes('Triebfahrzeugführer'));
});

test('critique prompt carries the domain checklist', () => {
  const u = P.buildCritiquePrompt(ctxFor('rollingStock'), { titles: [], bySource: [], byFunction: [], byMode: [] }).userPrompt;
  assert.ok(u.includes('CHECKLISTE DER DOMÄNE') && u.includes('Öffnen während der Fahrt'));
});

test('reports list the domain standards of the project pack', () => {
  const snap = loadProject('reference-project.json');
  snap.meta.projectProfile = { ...snap.meta.projectProfile, domain: 'rollingStock' };
  const txt = docxText(R.buildDocx('full', bundleFrom(snap)));
  assert.ok(txt.includes('EN 14752') && txt.includes('Domänenpaket Fahrzeuge'));
});

test('the embedded demo is the Lynx project with a confirmed profile and all five stages populated', () => {
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/demo-project.json'), 'utf8'));
  assert.match(demo.project.name, /Lynx/);
  assert.ok(demo.meta.projectProfile.confirmedAt);
  assert.ok(demo.hazards.length >= 2 && demo.requirements.length >= 3 && demo.ccas.length >= 1);
  assert.equal(demo.meta.systemDefinition.documents.length, 5);
});
