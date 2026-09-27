// Model bake-off for local operation (Plan B, B4). Runs the identification of the
// built-in Lynx demo against a real model and reports schema validity, duration,
// suggestions and whether the project-specific findings were hit.
//
//   node scripts/bakeoff.js --provider ollama --model qwen3.5:27b [--url http://localhost:11434]
//        [--depth schnell] [--passes source,interface] [--security 1] [--ctx 32768] [--think off] [--split]
//   node scripts/bakeoff.js --provider openai-compat --url http://127.0.0.1:1234 --model <id>
//
// Results: docs/validation/bakeoff-<model>-<date>.json and a Markdown table on stdout.
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const PIPE = require('../src/llm-pipeline.js');
const M = require('../src/model.js');

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const provider = arg('provider', 'ollama');
const model = arg('model', provider === 'ollama' ? 'mistral-small3.2:latest' : '');
const settings = provider === 'ollama'
  ? { ollamaUrl: arg('url', 'http://localhost:11434'), ollamaModel: model, ollamaNumCtx: Number(arg('ctx', 32768)), ollamaThink: arg('think', 'auto'), ollamaKeepAlive: '30m' }
  : { compatUrl: arg('url', 'http://127.0.0.1:1234'), compatModel: model };
const securityLevel = Number(arg('security', 0));

// Project-specific findings of the Lynx demo (input sheet) and the level-1 replay scenario.
const AHA = [
  ['Spurwechsel W 12/13', /W ?12\/13|Spurwechsel|Weiche/i],
  ['Funkabschattung / Repeater', /Repeater|Abschattung|Funkschatten|Brücke/i],
  ['Akku bei Kälte', /Akku|Batterie|Kälte|Temperatur/i],
  ['Lärm / Warnpegel', /Lärm|Schlagschrauber|Pegel|ALADIN|hörbar/i],
  ['ASU / Sektorgrenze', /ASU|Sektor/i],
  ['Lange Warnzeit / Langsamfahrt', /Langsam|Warnzeit|Gewöhnung|60 ?s/i],
];
const AHA_SEC = [['Replay / Einspielen der Ausschaltmeldung', /Replay|wieder(holt|eingespielt)|Ausschaltmeldung.*(gefälscht|eingespielt)|Maskerade/i], ['Funkstörung', /Stör(sender|ung)|Jamming|Blockade/i], ['Manipulierte Parametrierung', /Parametrier|Konfiguration|Projektierungsdaten/i]];

(async () => {
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/demo-project.json'), 'utf8'));
  const pre = await PIPE.preflight(provider, settings);
  if (!pre.ok) { console.error('Preflight fehlgeschlagen:', pre.message); process.exit(2); }
  const profile = { ...demo.meta.projectProfile, security: { ...demo.meta.projectProfile.security, level: securityLevel } };
  const ctx = { profile, sd: demo.meta.systemDefinition, functions: demo.functions, interfaces: demo.meta.interfaces, documents: demo.meta.systemDefinition.documents || [], calibration: M.data().calibration };
  const onlyKinds = String(arg('passes', 'source,interface,function,mode,threat,coeng')).split(',');
  const full = E.planIdentification({ depth: arg('depth', 'schnell'), functions: demo.functions, interfaces: demo.meta.interfaces, modes: M.data().modes, sources: M.data().sources, securityLevel, splitGuidewords: !!arg('split', false) });
  const plan = { ...full, maxGapFills: 0, passes: full.passes.filter((p) => onlyKinds.includes(p.kind)) };
  const existing = demo.hazards.filter((h) => h.review && h.review.decision === 'accepted');
  const got = [];
  const t0 = Date.now();
  process.stderr.write(`${plan.passes.length} Aufrufe mit ${provider}/${model} …\n`);
  const res = await E.runIdentification({ plan, ctx, existingHazards: existing, provider, settings, runState: PIPE.createRunState({ softCapCalls: 1000, hardCapCalls: 1000 }),
    onProgress: (p) => { if (p && p.status === 'running') process.stderr.write(`\r${p.index + 1}/${p.total} `); }, onBatch: async (items) => { got.push(...items); return items; }, onSoftCap: async () => true });
  const secs = Math.round((Date.now() - t0) / 1000);
  const text = got.map((h) => `${h.title} ${h.description} ${(h.causes || []).map((c) => c.text).join(' ')}`).join('\n');
  const hits = (list) => list.map(([k, re]) => ({ finding: k, hit: re.test(text) }));
  const out = { date: new Date().toISOString(), provider, model, settings: { ...settings, compatApiKey: undefined }, modelInfo: pre.info || null, plan: { depth: plan.depth, calls: plan.passes.length, kinds: onlyKinds, securityLevel },
    totals: res.totals, seconds: secs, suggestions: got.length, intentional: got.filter((h) => (h.causes || []).some((c) => c.kind === 'intentional')).length,
    linkedToExisting: got.filter((h) => h.duplicateOf).length, aha: hits(AHA), ahaSecurity: securityLevel >= 1 ? hits(AHA_SEC) : [], sample: got.slice(0, 15).map((h) => h.title) };
  const dir = path.join(__dirname, '../docs/validation'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bakeoff-${String(model).replace(/[^\w.-]+/g, '_')}-${out.date.slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  const ok = res.totals.passes - res.totals.failed;
  console.log(`\n| Modell | Aufrufe ok | Dauer | Vorschläge | Projektbefunde | Security-Befunde |\n|---|---|---|---|---|---|\n| ${model} | ${ok}/${res.totals.passes} | ${Math.floor(secs / 60)} min ${secs % 60} s | ${got.length} | ${out.aha.filter((a) => a.hit).length}/${AHA.length} | ${securityLevel >= 1 ? `${out.ahaSecurity.filter((a) => a.hit).length}/${AHA_SEC.length}` : '–'} |`);
  console.log(`\nErgebnis: ${file}`);
})().catch((e) => { console.error(e); process.exit(1); });
