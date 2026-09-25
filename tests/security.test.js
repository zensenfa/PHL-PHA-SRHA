'use strict';
// WP5 levels 0/1: security-informed safety.
const test = require('node:test');
const assert = require('node:assert/strict');
const { M, R, loadProject, bundleFrom, docxText } = require('./helpers.js');
const E = require('../src/engine.js');
const PIPE = require('../src/llm-pipeline.js');
const P = require('../src/prompts.js');
const S = require('../src/schemas.js');
const SEC = require('../src/security.js');
const PROFILE = require('../src/profile.js');

const snap = loadProject('reference-project.json');
const lvl1 = () => ({ ...snap.meta.projectProfile, security: { level: 1, standard: 'ts50701-2023', justification: '' } });

test('level 1 is selectable and needs no level-0 justification', () => {
  const v = PROFILE.validateProjectProfile(lvl1());
  assert.equal(v.ok, true, JSON.stringify(v.findings));
  assert.equal(PROFILE.validateProjectProfile({ ...lvl1(), security: { level: 3 } }).ok, false);
});

test('level 1 plans one threat pass per interface plus the safety/security interaction check', () => {
  const base = { depth: 'schnell', functions: snap.functions, interfaces: snap.meta.interfaces, modes: [], sources: [] };
  const p0 = E.planIdentification({ ...base, securityLevel: 0 });
  const p1 = E.planIdentification({ ...base, securityLevel: 1 });
  assert.equal(p0.passes.filter((p) => p.kind === 'threat' || p.kind === 'coeng').length, 0);
  assert.equal(p1.passes.filter((p) => p.kind === 'threat').length, snap.meta.interfaces.length);
  assert.equal(p1.passes.filter((p) => p.kind === 'coeng').length, 1);
});

test('threat prompt: EN 50159 threats, existing hazards, security context, no THR/SIL', () => {
  const it = snap.meta.interfaces[0];
  const { systemPrompt, userPrompt } = P.buildThreatPrompt({ profile: lvl1(), sd: { ...snap.meta.systemDefinition, secTransmission: '3' }, functions: snap.functions, interfaces: snap.meta.interfaces, modes: [], docs: '' }, it, snap.hazards.slice(0, 2), []);
  for (const t of ['repetition', 'masquerade', 'jamming', 'maliciousConfiguration', '7.4.2.1 d)', 'EN 50129 6.4', 'existingHazardId']) assert.ok(systemPrompt.includes(t), t);
  assert.ok(userPrompt.includes('H-0001: Keine oder zu kurze Warnung'));
  assert.ok(userPrompt.includes('Kategorie 3'));
});

test('threat pass: link to existing hazard, intentional causes, threat ids filtered, interface set', async () => {
  const it = snap.meta.interfaces[0];
  const answers = {
    threat: { hazards: [
      { title: 'Personal im Gefahrenbereich erhält keine Warnung trotz Zugannäherung auf Gleis 1', description: 'Eingespielte Ausschaltmeldung beendet die Warnung vorzeitig.', sourceCategory: 'e', existingHazardId: 'H-0002', threats: ['repetition', 'bogus'], causes: [{ text: 'Replay einer aufgezeichneten Ausschaltmeldung', kind: 'systematic' }], triggeringEvent: 'Angreifer spielt Meldung ein', consequence: 'Zug erfasst Personal', reasoning: {} },
      { title: 'Warnung bleibt aus wegen gezielter Funkstörung ohne Störungsmeldung', description: 'Störsender unterdrückt Meldungen.', sourceCategory: 'e', threats: ['jamming'], causes: [{ text: 'Störsender', kind: 'intentional' }], triggeringEvent: 'Störsender aktiv', consequence: 'Keine Warnung', reasoning: {} },
    ] },
    coeng: { hazards: [{ title: 'Warnung zu spät wegen Authentisierungslatenz', description: 'Zusätzliche Latenz verkürzt die Vorwarnzeit.', sourceCategory: 'b', functions: ['F-0002'], causes: [{ text: 'Authentisierung verlängert Laufzeit', kind: 'systematic' }], triggeringEvent: 'Zugmeldung', consequence: 'Zu kurze Warnung', reasoning: {} }] },
  };
  const orig = PIPE.runPass;
  const prompts = [];
  PIPE.runPass = async ({ passName, systemPrompt, schema }) => { prompts.push({ passName, systemPrompt, schema }); const kind = passName.startsWith('Security') ? 'threat' : 'coeng'; return { ok: true, content: JSON.stringify(answers[kind]) }; };
  try {
    const plan = { depth: 'test', maxGapFills: 0, passes: [{ kind: 'threat', unit: it.id, label: `Security ${it.id} ${it.name}` }, { kind: 'coeng', unit: '*', label: 'Wechselwirkung Safety ↔ Security' }] };
    const stored = [];
    const res = await E.runIdentification({ plan, ctx: { profile: lvl1(), sd: snap.meta.systemDefinition, functions: snap.functions, interfaces: snap.meta.interfaces, documents: [], calibration: M.data().calibration }, existingHazards: snap.hazards, provider: 'ollama', settings: { ollamaModel: 'stub' }, runState: PIPE.createRunState({}), onBatch: async (items) => { stored.push(...items); return items; } });
    assert.equal(res.totals.failed, 0);
    const [linked, fresh, co] = stored;
    assert.equal(linked.duplicateOf, 'H-0002', 'explicit link to existing hazard');
    assert.equal(linked.causes[0].kind, 'intentional', 'threat-pass cause forced to intentional');
    assert.deepEqual(linked.threats, ['repetition'], 'unknown threat ids dropped');
    assert.ok(linked.interfaces.includes(it.id));
    assert.equal(fresh.method, 'threat');
    assert.equal(co.method, 'coeng');
    assert.ok(prompts[0].schema.properties.hazards.items.properties.existingHazardId.enum.includes('H-0002'));
    assert.ok(!prompts[0].schema.properties.hazards.items.properties.existingHazardId.enum.includes('H-0003'), 'rejected hazard not linkable');
  } finally { PIPE.runPass = orig; }
});

test('deliberate cause without security measure is not controlled; SIL/THR are not credit', () => {
  const h = structuredClone(snap.hazards.find((x) => x.id === 'H-0002'));
  h.causes.push({ text: 'Replay', kind: 'intentional' });
  M.recomputeHazardRisk(h);
  assert.ok(M.hazardCompleteness(h).problems.includes('Vorsätzliche Ursache ohne Security-Maßnahme (EN 50129 6.4)'));
  h.measures.push(M.makeMeasure({ text: 'Nachrichtenauthentisierung', status: 'accepted', securityRelated: true, residualSeverity: 'critical', residualFrequency: 'highlyImprobable' }));
  assert.ok(!M.hazardCompleteness(h).problems.some((p) => p.includes('Security-Maßnahme')));
});

test('level 1 report: security section with context, hazards, coverage, requirements; level 0 unchanged', () => {
  const s1 = structuredClone(snap);
  s1.meta.projectProfile = lvl1();
  s1.meta.systemDefinition.secTransmission = '3';
  const h = s1.hazards.find((x) => x.id === 'H-0002');
  h.causes.push({ text: 'Replay einer aufgezeichneten Ausschaltmeldung', kind: 'intentional' }); h.threats = ['repetition']; h.interfaces = [s1.meta.interfaces[0].id];
  h.measures.push(M.makeMeasure({ id: 'M2', text: 'Nachrichtenauthentisierung mit Sequenznummer', status: 'accepted', securityRelated: true }));
  s1.meta.runs = [{ passes: [{ kind: 'threat', unit: s1.meta.interfaces[0].id, ok: true }] }];
  s1.requirements[1].securityRelated = true;
  const txt = docxText(R.buildDocx('full', bundleFrom(s1)));
  for (const t of ['Security-informierte Sicherheit (EN 50129 6.4; Security-Stufe 1)', 'Kategorie 3 – offen', 'Replay einer aufgezeichneten Ausschaltmeldung', 'Wiederholung', 'Nachrichtenauthentisierung mit Sequenznummer', 'Abdeckung: Bedrohungsanalyse je Schnittstelle', 'Security-bezogene Anforderungen', 'keine Konformitätsaussage']) assert.ok(txt.includes(t), t);
  const t0 = docxText(R.buildDocx('full', bundleFrom(snap)));
  assert.ok(!t0.includes('Security-informierte Sicherheit (EN 50129'));
});
