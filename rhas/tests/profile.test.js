'use strict';
// WP2: project profile captured at project start, validated, change-logged.
const test = require('node:test');
const assert = require('node:assert/strict');
const { R, loadProject, bundleFrom, docxText } = require('./helpers.js');
const P = require('../src/profile.js');
const Prompts = require('../src/prompts.js');

const valid = () => P.makeProjectProfile({ role: 'supplier', domain: 'ccs', safetyCaseType: 'specificApplication', country: 'CH', superiorSystem: 'Baustelle', security: { level: 0, justification: 'Demo' } });

test('a new profile is incomplete until the wizard is filled', () => {
  const v = P.validateProjectProfile(P.makeProjectProfile());
  assert.equal(v.ok, false);
  for (const f of ['role', 'domain', 'safetyCaseType', 'country', 'security.justification']) assert.ok(v.findings.some((x) => x.field === f && x.level === 'error'), f);
});

test('security level 0 requires a justification (EN 50126-1 7.4.2.1 d))', () => {
  const p = valid(); p.security.justification = '';
  assert.ok(P.validateProjectProfile(p).findings.some((f) => f.field === 'security.justification'));
});

test('security levels not yet implemented cannot be selected', () => {
  const p = valid(); p.security.level = 4;
  assert.equal(P.validateProjectProfile(p).ok, false);
});

test('first confirmation needs no reason; later changes need one and are logged', () => {
  const draft = valid();
  const confirmed = P.applyProfileChange(P.makeProjectProfile(), draft, { by: 'FS', at: '2026-09-24T10:00:00Z' });
  assert.equal(confirmed.confirmedAt, '2026-09-24T10:00:00Z');
  assert.equal(confirmed.changeLog.length, 1);
  const changed = { ...confirmed, dataClassification: 'confidential' };
  assert.throws(() => P.applyProfileChange(confirmed, changed, { by: 'FS' }), /Begründung/);
  const after = P.applyProfileChange(confirmed, changed, { by: 'FS', reason: 'Kundendaten', at: '2026-09-25T10:00:00Z' });
  assert.equal(after.confirmedAt, '2026-09-24T10:00:00Z', 'confirmation date kept');
  assert.deepEqual(after.changeLog[1].changes, [{ field: 'dataClassification', from: 'internal', to: 'confidential' }]);
  assert.equal(P.applyProfileChange(after, { ...after }, { by: 'FS' }), after, 'no change, no log entry');
});

test('invalid profiles are not accepted', () => {
  assert.throws(() => P.applyProfileChange(P.makeProjectProfile(), P.makeProjectProfile(), {}), /fehlt/);
});

test('projects without a profile are migrated with defaults and marked', () => {
  const p = P.migrateProfile(undefined);
  assert.equal(p.origin, 'migrated');
  assert.equal(p.confirmedAt, '');
  assert.equal(p.domain, 'ccs');
});

test('confidential projects may only use the local model', () => {
  const p = { ...valid(), dataClassification: 'confidential' };
  assert.equal(P.aiProviderAllowed(p, 'mistral-api').ok, false);
  assert.equal(P.aiProviderAllowed(p, 'ollama').ok, true);
  assert.equal(P.aiProviderAllowed({ ...p, dataClassification: 'public' }, 'mistral-api').ok, true);
});

test('the pipeline refuses a blocked call before contacting any provider', async () => {
  const PIPE = require('../src/llm-pipeline.js');
  await assert.rejects(() => PIPE.callLlm({ provider: 'mistral-api', settings: { blockedReason: 'vertraulich' }, systemPrompt: '', userPrompt: '' }), /vertraulich/);
});

test('prompts carry the project profile', () => {
  const ctx = { profile: valid(), sd: {}, functions: [], interfaces: [], modes: [], docs: '' };
  const { userPrompt } = Prompts.buildSourcePrompt(ctx, { id: 'a', code: 'GQ-a', title: 'Normalbetrieb', description: '' }, []);
  assert.match(userPrompt, /PROJEKTPROFIL: Rolle Produktlieferant; Domäne Zugsteuerung/);
});

test('reports show the profile, its change log and the security statement', () => {
  const txt = docxText(R.buildDocx('full', bundleFrom(loadProject('reference-project.json'))));
  for (const s of ['Projektprofil', 'Produktlieferant', 'Spezifische Anwendung', 'Änderungen des Projektprofils', 'Erstbestätigung', 'EN 50126-1 7.4.2.1 d) schließt vorsätzlichen Missbrauch']) assert.ok(txt.includes(s), s);
});
