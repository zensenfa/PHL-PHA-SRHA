// Orchestration engine for the Railway Hazard Analysis Suite: plans and runs
// the identification passes (function / interface / mode / source /
// interaction / critique + gap-fill), the per-hazard analysis, measure and
// requirement proposals, and the system decomposition. Provider-agnostic —
// every call goes through llm-pipeline.runPass (caps, circuit breaker,
// cancel). Nothing here writes to the database: results are handed to the
// caller through callbacks so the UI stays the single place that persists
// and the engineer stays the single place that decides.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;
const S = typeof require !== 'undefined' ? require('./schemas.js') : window.RHAS_SCHEMAS;
const P = typeof require !== 'undefined' ? require('./prompts.js') : window.RHAS_PROMPTS;
const PIPE = typeof require !== 'undefined' ? require('./llm-pipeline.js') : window.RHAS_LLM_PIPELINE;
const OLL = typeof require !== 'undefined' ? require('./ollama.js') : window.RHAS_OLLAMA;
const DD = typeof require !== 'undefined' ? require('./dedup.js') : window.RHAS_DEDUP;

// ------------------------------------------------------ document retrieval ----
const CHUNK = 1200;
const OVERLAP = 150;

function chunkDocuments(documents) {
  const out = [];
  for (const d of documents || []) {
    const text = (d.text || '').replace(/\r/g, '');
    if (!text.trim()) continue;
    for (let i = 0, n = 0; i < text.length; i += CHUNK - OVERLAP, n++) {
      out.push({ doc: d.name || 'Dokument', idx: n, text: text.slice(i, i + CHUNK), tokens: new Set([...DD.tokenize(text.slice(i, i + CHUNK))].filter((t) => t.length >= 4)) });
      if (i + CHUNK >= text.length) break;
    }
  }
  return out;
}

/** Keyword-overlap retrieval: deterministic, no extra LLM call. Returns a formatted excerpt block within `budget` characters, or '' when nothing matches. */
function retrieve(chunks, query, budget = 6000) {
  if (!chunks || !chunks.length) return '';
  const q = new Set([...DD.tokenize(query || '')].filter((t) => t.length >= 4));
  if (!q.size) return chunks.slice(0, Math.max(1, Math.floor(budget / CHUNK))).map(fmtChunk).join('\n\n');
  const scored = chunks.map((c) => { let s = 0; for (const t of q) if (c.tokens.has(t)) s++; return { c, s }; }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.c.idx - b.c.idx);
  const picked = [];
  let used = 0;
  for (const { c } of scored) {
    if (used + c.text.length > budget) continue;
    picked.push(c);
    used += c.text.length;
    if (used >= budget * 0.9) break;
  }
  return picked.map(fmtChunk).join('\n\n');
}
function fmtChunk(c) {
  return `— ${c.doc}, Abschnitt ${c.idx + 1}:\n${c.text.trim()}`;
}

// ------------------------------------------------------------ normalising ----
function mapIds(list, records, fallback = []) {
  if (!Array.isArray(list)) return [...fallback];
  const out = new Set(fallback);
  for (const raw of list) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const hit = (records || []).find((r) => r.id === v || (r.name || '').toLowerCase() === v.toLowerCase() || v.toLowerCase().startsWith((r.id || '~').toLowerCase()));
    if (hit) out.add(hit.id);
  }
  return [...out];
}
const inEnum = (v, list, fallback = '') => (list.includes(v) ? v : fallback);
const str = (v) => (v == null ? '' : String(v).trim());
const strList = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : (str(v) ? [str(v)] : []));

/**
 * Key-alias tolerance for providers WITHOUT schema enforcement.
 *
 * Ollama constrains decoding to the JSON Schema, so the keys always match.
 * Mistral's API offers only json_object mode (valid JSON, no schema), and
 * live testing showed it returning e.g.
 *   causes: [{ type, description, triggeringEvent, enablingConditions }]
 * instead of the specified
 *   causes: [{ text, kind }] + top-level triggeringEvent/enablingConditions.
 * Without this layer every such item is silently dropped and the engineer
 * sees an empty cause list with no indication that content was lost.
 */
const TEXT_KEYS = ['text', 'description', 'beschreibung', 'statement', 'cause', 'ursache', 'measure', 'massnahme', 'maßnahme', 'barrier', 'barriere', 'condition', 'requirement', 'anforderung', 'scenario', 'szenario', 'accident', 'unfall', 'title'];
function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of keys) { const v = obj[k]; if (v != null && typeof v !== 'object' && String(v).trim() !== '') return String(v).trim(); }
  return '';
}
/** Text of a list item that may be a plain string or an object under any of the usual keys. */
function itemText(raw) { return typeof raw === 'string' ? str(raw) : pick(raw, TEXT_KEYS); }
/** PATCH-3: lists/objects (e.g. Mistral returning inputs as [{name,...}]) flattened to readable text instead of "[object Object]". */
function flatText(v) { const one = (x) => (x && typeof x === 'object' ? (itemText(x) || pick(x, ['name', 'signal', 'label', 'bezeichnung']) || Object.values(x).filter((y) => y != null && typeof y !== 'object').join(' ')) : str(x)); return Array.isArray(v) ? v.map(one).filter(Boolean).join('; ') : one(v); }
/** First candidate key whose value is a valid member of `list` — tolerates a provider swapping e.g. `type` and `hierarchy`. */
function enumFrom(obj, keys, list, fallback = '') {
  if (typeof obj === 'string') return inEnum(str(obj), list, fallback);
  for (const k of keys) { const v = inEnum(str(obj && obj[k]), list, ''); if (v) return v; }
  return fallback;
}
/** Some providers nest per-cause trigger/conditions instead of stating them once at the top level; recover them rather than lose them. */
function hoist(raw, key) {
  const top = raw && raw[key];
  if (Array.isArray(top) ? top.length : str(top)) return top;
  const nested = (Array.isArray(raw && raw.causes) ? raw.causes : []).map((c) => (c && typeof c === 'object' ? c[key] : null)).filter((v) => (Array.isArray(v) ? v.length : str(v)));
  if (!nested.length) return top;
  return Array.isArray(nested[0]) ? [...new Set(nested.flat().map(str).filter(Boolean))] : str(nested[0]);
}
function normalizeCauses(raw) {
  return (Array.isArray(raw) ? raw : []).map((c) => ({ text: itemText(c), kind: enumFrom(c, ['kind', 'type', 'art', 'kategorie', 'category'], S.CAUSE_KINDS, 'systematic') })).filter((c) => c.text);
}

const GW_WORDS = S.GUIDEWORDS.filter(Boolean);
/** Titles like "Zugannäherung nicht erkannt (F-0001, loss)" → strip the parenthetical and recover the guideword the model misplaced. */
function cleanTitle(title, guideword) {
  let t = str(title);
  let gw = guideword;
  const m = /\(([^()]*)\)\s*$/.exec(t);
  if (m && /\b(F-\d+|IF-\d+|loss|unintended|early|late|partial|wrongValue|falseSafe|stuck|degradedResponse)\b/i.test(m[1])) {
    if (!gw) { const w = GW_WORDS.find((g) => new RegExp(`\\b${g}\\b`, 'i').test(m[1])); if (w) gw = w; }
    t = t.slice(0, m.index).trim();
  }
  return { title: t.replace(/\s+/g, ' ').slice(0, 140), guideword: gw };
}

function normalizeHazardItem(raw, { pass, runId, modelName, functions, interfaces }) {
  const cleaned = cleanTitle(raw.title, inEnum(str(raw.guideword), GW_WORDS, ''));
  // A consolidated hazard covers several deviations; keep them all, and keep
  // the primary one consistent with the list.
  const gwList = [...new Set(strList(raw.guidewords).filter((g) => GW_WORDS.includes(g)).concat(cleaned.guideword ? [cleaned.guideword] : []))];
  const guideword = cleaned.guideword || gwList[0] || '';
  const consequence = str(raw.consequence);
  const affected = strList(raw.affected).filter((a) => S.AFFECTED.includes(a));
  return M.makeHazard({
    title: cleaned.title || str(raw.description).split(/[.!?]/)[0].slice(0, 120),
    description: str(raw.description),
    level: 'boundary',
    sourceCategory: inEnum(str(raw.sourceCategory), S.SOURCE_IDS, pass.kind === 'source' ? pass.unit : (pass.kind === 'interface' ? 'e' : 'f')),
    method: pass.kind === 'function' && guideword ? 'guideword' : pass.kind,
    guideword, guidewords: gwList,
    functions: mapIds(raw.functions, functions, pass.kind === 'function' ? [pass.unit] : []),
    interfaces: mapIds(raw.interfaces, interfaces, pass.kind === 'interface' ? [pass.unit] : []),
    modes: [...new Set([...strList(raw.modes).filter((m) => S.MODES.includes(m)), ...(pass.kind === 'mode' ? [pass.unit] : [])])],
    causes: normalizeCauses(raw.causes),
    triggeringEvent: str(hoist(raw, 'triggeringEvent')),
    enablingConditions: strList(hoist(raw, 'enablingConditions')),
    accidents: consequence ? [M.makeAccident({ id: 'A1', description: consequence, affected })] : [],
    reasoning: { whyIdentified: str(raw.reasoning && raw.reasoning.whyIdentified), sourcesUsed: str(raw.reasoning && raw.reasoning.sourcesUsed), decisionRationale: str(raw.reasoning && raw.reasoning.decisionRationale) },
    provenance: { runId, pass: pass.label, passKind: pass.kind, unit: pass.unit, model: modelName },
    review: { decision: 'pending', by: '', at: '', rationale: '' },
  });
}

// ------------------------------------------------------------------ dedup ----
const keyText = (h) => `${h.title || ''} ${h.description || ''}`;
function sim(a, b) {
  return DD.jaccard(DD.tokenize(a), DD.tokenize(b));
}
/** Within-batch merge (drop later near-duplicates, count them) and flag against existing hazards (never drops). */
/** Union of two lists, keeping the first occurrence of each key (order preserved). */
function unionBy(a, b, keyOf) {
  const out = []; const seen = new Set();
  for (const x of [...(a || []), ...(b || [])]) { const k = keyOf(x); if (k && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}
/**
 * Fold a near-duplicate suggestion into the one kept (WP0 fix): the kept item
 * stays the base, but causes, guidewords, functions, interfaces, modes and
 * enabling conditions of the duplicate are unioned in, and empty fields are
 * filled, so no cause or coverage evidence is lost by the merge.
 */
function mergeInto(base, dup) {
  const low = (s) => String(s || '').trim().toLowerCase();
  base.causes = unionBy(base.causes, dup.causes, (c) => low(c && c.text));
  base.guidewords = unionBy(base.guidewords, dup.guidewords, low);
  if (!base.guideword && dup.guideword) base.guideword = dup.guideword;
  base.functions = unionBy(base.functions, dup.functions, String);
  base.interfaces = unionBy(base.interfaces, dup.interfaces, String);
  base.modes = unionBy(base.modes, dup.modes, String);
  base.enablingConditions = unionBy(base.enablingConditions, dup.enablingConditions, low);
  if (!base.triggeringEvent && dup.triggeringEvent) base.triggeringEvent = dup.triggeringEvent;
  if (!(base.accidents || []).length && (dup.accidents || []).length) base.accidents = dup.accidents;
  const r = base.reasoning || (base.reasoning = {});
  const dr = dup.reasoning || {};
  if (dr.sourcesUsed && !String(r.sourcesUsed || '').includes(dr.sourcesUsed)) r.sourcesUsed = [r.sourcesUsed, dr.sourcesUsed].filter(Boolean).join(' | ');
  base.mergedCount = (base.mergedCount || 1) + (dup.mergedCount || 1);
  base.mergedTitles = unionBy(base.mergedTitles, [dup.title, ...(dup.mergedTitles || [])], low);
  return base;
}
/**
 * Within-batch merge of near-duplicates (nothing is dropped: see mergeInto),
 * then flag, never suppress: duplicateOf = similar open/accepted hazard,
 * previouslyRejected = similar hazard the engineer already rejected.
 */
function dedupBatch(items, existing, threshold = 0.6) {
  const kept = [];
  let merged = 0;
  for (const h of items) {
    const dupIdx = kept.findIndex((k) => sim(keyText(k), keyText(h)) >= threshold);
    if (dupIdx >= 0) { mergeInto(kept[dupIdx], h); merged++; continue; }
    kept.push(h);
  }
  for (const h of kept) {
    let best = null; let bestSim = 0; let rej = null; let rejSim = 0;
    for (const e of existing || []) {
      const s = sim(keyText(e), keyText(h));
      if (s < threshold) continue;
      if (e.review && e.review.decision === 'rejected') { if (s > rejSim) { rej = e; rejSim = s; } }
      else if (s > bestSim) { best = e; bestSim = s; }
    }
    h.duplicateOf = best ? best.id : '';
    h.previouslyRejected = rej ? rej.id : '';
  }
  return { kept, dropped: merged, merged };
}

// --------------------------------------------------------------- planning ----
const DEPTHS = {
  schnell: { label: 'Schnell', passes: { function: true, source: true, interface: false, mode: false, interaction: false, critique: false, iterate: false }, description: 'Ein Durchlauf je Funktion (Leitworte) und je Gefährdungsquelle a)–n).' },
  standard: { label: 'Standard', passes: { function: true, source: true, interface: true, mode: true, interaction: false, critique: false, iterate: false }, description: 'Zusätzlich ein Durchlauf je Schnittstelle und je Betriebsart.' },
  gruendlich: { label: 'Gründlich', passes: { function: true, source: true, interface: true, mode: true, interaction: true, critique: true, iterate: false }, description: 'Zusätzlich Interaktionsanalyse sowie Kritikphase mit gezielter Lückenfüllung.' },
  maximal: { label: 'Maximal', passes: { function: true, source: true, interface: true, mode: true, interaction: true, critique: true, iterate: true }, description: 'Wie Gründlich, plus zweite Iteration je Funktion gegen die dann vorliegende Liste.' },
};

function planIdentification({ depth = 'standard', overrides = {}, functions = [], interfaces = [], modes = [], sources = [], maxGapFills = 6 }) {
  const cfg = { ...DEPTHS[depth].passes, ...overrides };
  const passes = [];
  if (cfg.function) for (const f of functions) passes.push({ kind: 'function', unit: f.id, label: `Funktion ${f.id} ${f.name}` });
  if (cfg.interface) for (const i of interfaces) passes.push({ kind: 'interface', unit: i.id, label: `Schnittstelle ${i.id} ${i.name}` });
  if (cfg.mode) for (const m of modes) passes.push({ kind: 'mode', unit: m.id, label: `Betriebsart ${m.label}` });
  if (cfg.source) for (const s of sources) passes.push({ kind: 'source', unit: s.id, label: `Gefährdungsquelle ${s.code} ${s.title}` });
  if (cfg.interaction) passes.push({ kind: 'interaction', unit: '*', label: 'Interaktionsanalyse' });
  if (cfg.critique) passes.push({ kind: 'critique', unit: '*', label: 'Kritikphase' });
  if (cfg.iterate && cfg.function) for (const f of functions) passes.push({ kind: 'function', unit: f.id, label: `Funktion ${f.id} ${f.name} (2. Iteration)`, iteration: 2 });
  const estimatedCalls = passes.length + (cfg.critique ? maxGapFills : 0);
  return { depth, passes, estimatedCalls, maxGapFills, config: cfg };
}

// ------------------------------------------------------------------- runs ----
async function checkCapsOrStop(runState, onSoftCap) {
  const verdict = PIPE.checkCaps(runState.tracker, runState.caps, Date.now());
  if (verdict === 'hard') return 'stop';
  if (verdict === 'soft') {
    const go = onSoftCap ? await onSoftCap(runState) : false;
    if (!go) return 'stop';
    runState.caps = PIPE.acknowledgeSoftCap(runState.caps);
  }
  return 'ok';
}

function parse(content) {
  const obj = OLL.extractAndParseJSON(content);
  if (!obj || typeof obj !== 'object') throw new Error('Antwort ist kein JSON-Objekt');
  return obj;
}

/**
 * Runs an identification plan. ctx = { sd, functions, interfaces, modes, documents, calibration }.
 * Callbacks: onProgress({ index, total, pass, status }), onBatch(hazards, pass) — MUST persist and may return the stored records —,
 * onSoftCap(runState) -> Promise<boolean>, onCheckpoint(state).
 */
async function runIdentification({ plan, ctx, existingHazards, provider, settings, runState, signal, onProgress, onBatch, onSoftCap, onCheckpoint }) {
  const runId = 'run_' + Date.now().toString(36);
  const modelName = provider === 'mistral-api' ? settings.mistralModel : settings.ollamaModel;
  const chunks = chunkDocuments(ctx.documents);
  const data = M.data();
  const sources = data.sources;
  const guidewords = data.guidewords;
  const modes = data.modes;
  const known = [...(existingHazards || [])];
  const titles = () => known.filter((h) => !h.review || h.review.decision !== 'rejected').map((h) => h.title);
  // WP0 fix: rejected hazards are passed to the model so it stops re-proposing them.
  const rejectedTitles = () => known.filter((h) => h.review && h.review.decision === 'rejected')
    .map((h) => (h.review.rationale ? `${h.title} (Grund: ${String(h.review.rationale).slice(0, 140)})` : h.title));
  const passes = [...plan.passes];
  const results = [];
  const enums = { functionIds: ctx.functions.map((f) => f.id), interfaceIds: ctx.interfaces.map((i) => i.id) };
  const hazardSchema = S.withEnums(S.HAZARD_LIST_SCHEMA, enums);
  const functionSchema = S.withEnums(S.HAZARD_LIST_SCHEMA, { ...enums, guidewordRequired: true });
  let cancelled = false;
  let stoppedBy = '';
  runState.tracker.start(Date.now());

  for (let i = 0; i < passes.length; i++) {
    const pass = passes[i];
    if (signal && signal.aborted) { cancelled = true; break; }
    const cap = await checkCapsOrStop(runState, onSoftCap);
    if (cap === 'stop') { stoppedBy = 'cap'; break; }
    if (onProgress) onProgress({ index: i, total: passes.length, pass, status: 'running' });
    const started = Date.now();
    let prompt; let schema = hazardSchema; let query = '';
    const c = { ...ctx, modes, rejectedTitles: rejectedTitles() };
    if (pass.kind === 'function') { const f = ctx.functions.find((x) => x.id === pass.unit); query = `${f.name} ${f.description} ${f.inputs} ${f.outputs}`; prompt = P.buildFunctionPrompt({ ...c, docs: retrieve(chunks, query) }, f, guidewords, titles()); schema = functionSchema; }
    else if (pass.kind === 'interface') { const it = ctx.interfaces.find((x) => x.id === pass.unit); query = `${it.name} ${it.description} ${it.partner}`; prompt = P.buildInterfacePrompt({ ...c, docs: retrieve(chunks, query) }, it, titles()); }
    else if (pass.kind === 'mode') { const m = modes.find((x) => x.id === pass.unit); query = `${m.label} ${m.description}`; prompt = P.buildModePrompt({ ...c, docs: retrieve(chunks, query) }, m, titles()); }
    else if (pass.kind === 'source') { const s = sources.find((x) => x.id === pass.unit); query = `${s.title} ${s.description}`; prompt = P.buildSourcePrompt({ ...c, docs: retrieve(chunks, query) }, s, titles()); }
    else if (pass.kind === 'interaction') { prompt = P.buildInteractionPrompt({ ...c, docs: retrieve(chunks, ctx.sd.description, 4000) }, titles()); }
    else if (pass.kind === 'gapfill') { query = `${pass.gap.title} ${pass.gap.why}`; prompt = P.buildGapFillPrompt({ ...c, docs: retrieve(chunks, query) }, pass.gap, titles()); }
    else if (pass.kind === 'critique') {
      const cov = M.coverage({ hazards: known, functions: ctx.functions, interfaces: ctx.interfaces, sources, guidewords, modes, runs: [] });
      prompt = P.buildCritiquePrompt(c, { titles: titles(), bySource: cov.bySource, byFunction: cov.byFunction, byMode: cov.byMode });
      schema = S.withEnums(S.CRITIQUE_SCHEMA, enums);
    }
    const res = await PIPE.runPass({ runState, passName: pass.label, provider, settings, systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, schema, signal });
    const durationMs = Date.now() - started;
    if (!res.ok) {
      results.push({ ...pass, ok: false, error: res.error && res.error.message, durationMs, proposed: 0 });
      if (onProgress) onProgress({ index: i, total: passes.length, pass, status: 'failed', error: res.error && res.error.message });
      if (signal && signal.aborted) { cancelled = true; break; }
      if (runState.breaker.tripped()) { stoppedBy = 'breaker'; break; }
      continue;
    }
    let parsed;
    try { parsed = parse(res.content); } catch (e) { results.push({ ...pass, ok: false, error: `JSON: ${e.message}`, durationMs, proposed: 0 }); continue; }
    if (pass.kind === 'critique') {
      const gaps = (parsed.gapAreas || []).slice(0, plan.maxGapFills);
      for (const g of gaps) passes.splice(i + 1 + gaps.indexOf(g), 0, { kind: 'gapfill', unit: g.title, label: `Lückenfüllung: ${g.title}`, gap: { title: str(g.title), why: str(g.why), sourceCategory: inEnum(str(g.sourceCategory), S.SOURCE_IDS, 'f'), relatedFunctions: mapIds(g.relatedFunctions, ctx.functions) } });
      results.push({ ...pass, ok: true, durationMs, proposed: 0, assessment: str(parsed.assessment), gapAreas: gaps.map((g) => ({ title: str(g.title), why: str(g.why), sourceCategory: str(g.sourceCategory) })) });
      if (onProgress) onProgress({ index: i, total: passes.length, pass, status: 'done', gaps: gaps.length });
      continue;
    }
    const items = (parsed.hazards || []).map((raw) => normalizeHazardItem(raw, { pass, runId, modelName, functions: ctx.functions, interfaces: ctx.interfaces })).filter((h) => h.description && h.title);
    const { kept, dropped } = dedupBatch(items, known);
    const stored = onBatch ? (await onBatch(kept, pass)) || kept : kept;
    known.push(...stored);
    results.push({ ...pass, ok: true, durationMs, proposed: kept.length, merged: dropped, duplicatesFlagged: kept.filter((h) => h.duplicateOf).length });
    if (onProgress) onProgress({ index: i, total: passes.length, pass, status: 'done', proposed: kept.length });
    if (onCheckpoint) await onCheckpoint({ runId, index: i, results });
  }
  return {
    runId, mode: 'identification', depth: plan.depth, model: modelName, provider, startedAt: new Date(runState.tracker.startTime).toISOString(), finishedAt: new Date().toISOString(),
    calls: runState.tracker.calls, inputTokens: runState.tracker.inputTokens, outputTokens: runState.tracker.outputTokens,
    passes: results, cancelled, stoppedBy, failedPasses: runState.failedPasses.slice(),
    totals: { proposed: results.reduce((n, r) => n + (r.proposed || 0), 0), passes: results.length, failed: results.filter((r) => !r.ok).length },
  };
}

// ------------------------------------------------------- single-shot calls ----
async function single({ prompt, schema, provider, settings, runState, signal, passName }) {
  const res = await PIPE.runPass({ runState, passName, provider, settings, systemPrompt: prompt.systemPrompt, userPrompt: prompt.userPrompt, schema, signal });
  if (!res.ok) throw res.error || new Error('KI-Aufruf fehlgeschlagen');
  return parse(res.content);
}

async function runDecomposition({ ctx, provider, settings, runState, signal }) {
  const chunks = chunkDocuments(ctx.documents);
  const docs = retrieve(chunks, `${ctx.sd.description} ${ctx.sd.includedFunctions} ${ctx.sd.boundary}`, 9000);
  const raw = await single({ prompt: P.buildDecompositionPrompt({ ...ctx, modes: M.data().modes, docs }), schema: S.DECOMPOSITION_SCHEMA, provider, settings, runState, signal, passName: 'Systemzerlegung' });
  const subsystems = (raw.subsystems || []).map((s) => ({ name: str(s.name), description: str(s.description) })).filter((s) => s.name);
  const functions = (raw.functions || []).map((f) => M.makeFunction({ name: str(f.name), description: str(f.description), subsystem: str(f.subsystem), kind: inEnum(str(f.kind), ['electronic', 'mechanical', 'mixed', 'procedural'], 'electronic'), inputs: flatText(f.inputs), outputs: flatText(f.outputs), /* PATCH-3 */ safeState: str(f.safeState), safetyRelated: typeof f.safetyRelevant === 'boolean' ? f.safetyRelevant : null, safetyRelatedRationale: str(f.rationale), modes: strList(f.modes).filter((m) => S.MODES.includes(m)), source: 'ai' })).filter((f) => f.name);
  const interfaces = (raw.interfaces || []).map((i) => ({ name: str(i.name), description: str(i.description), partner: str(i.partner), type: inEnum(str(i.type), ['physical', 'functional', 'human', 'externalSystem', 'organisation'], 'functional') })).filter((i) => i.name);
  return { subsystems, functions, interfaces, assumptions: strList(raw.assumptions), openQuestions: strList(raw.openQuestions) };
}

function normalizeAnalysis(raw) {
  const accidents = (Array.isArray(raw.accidents) ? raw.accidents : []).map((a, i) => M.makeAccident({
    id: `A${i + 1}`, description: itemText(a),
    affected: strList(a && a.affected).filter((x) => S.AFFECTED.includes(x)),
    severity: enumFrom(a, ['severity', 'schadensausmass', 'severityCategory'], S.SEVERITIES, ''),
    severityRationale: str(pick(a, ['severityRationale', 'severityJustification', 'begruendungSchadensausmass'])),
    frequency: enumFrom(a, ['frequency', 'haeufigkeit', 'frequencyCategory'], S.FREQUENCIES, ''),
    frequencyRationale: str(pick(a, ['frequencyRationale', 'frequencyJustification', 'begruendungHaeufigkeit'])),
  })).filter((a) => a.description);
  const rap = raw.suggestedRap || raw.rap || {};
  return {
    causes: normalizeCauses(raw.causes),
    triggeringEvent: str(hoist(raw, 'triggeringEvent')), enablingConditions: strList(hoist(raw, 'enablingConditions')), railwayHazard: str(pick(raw, ['railwayHazard', 'systemHazard', 'eisenbahnGefaehrdung'])),
    accidents,
    existingBarriers: (Array.isArray(raw.existingBarriers) ? raw.existingBarriers : []).map((b) => ({ text: itemText(b), type: enumFrom(b, ['type', 'art', 'kind', 'wirkung'], ['frequency', 'severity'], 'frequency'), effectiveness: str(pick(b, ['effectiveness', 'wirksamkeit'])), becomesSrac: !!(b && (b.outsideSystem === true || b.outside === true || b.external === true)) })).filter((b) => b.text),
    suggestedRap: { principle: enumFrom(rap, ['principle', 'rap', 'prinzip'], ['cop', 'reference', 'ere'], 'ere'), reference: str(pick(rap, ['reference', 'referenz', 'standard'])), justification: str(pick(rap, ['justification', 'begruendung', 'rationale'])) },
    broadlyAcceptableCandidate: raw.broadlyAcceptableCandidate === true, broadlyAcceptableRationale: str(raw.broadlyAcceptableRationale),
    assumptions: strList(raw.assumptions),
    invalid: accidents.filter((a) => !a.severity || !a.frequency).length,
  };
}

async function runRiskAnalysis({ hazard, ctx, provider, settings, runState, signal }) {
  const chunks = chunkDocuments(ctx.documents);
  const docs = retrieve(chunks, `${hazard.title} ${hazard.description} ${hazard.triggeringEvent}`, 4000);
  const raw = await single({ prompt: P.buildRiskAnalysisPrompt({ ...ctx, modes: M.data().modes, docs }, hazard, ctx.calibration), schema: S.RISK_ANALYSIS_SCHEMA, provider, settings, runState, signal, passName: `Risikoanalyse ${hazard.id}` });
  return normalizeAnalysis(raw);
}

async function runMeasures({ hazard, ctx, provider, settings, runState, signal }) {
  const chunks = chunkDocuments(ctx.documents);
  const docs = retrieve(chunks, `${hazard.title} ${hazard.description}`, 3000);
  const raw = await single({ prompt: P.buildMeasuresPrompt({ ...ctx, modes: M.data().modes, docs }, hazard, ctx.calibration), schema: S.MEASURES_SCHEMA, provider, settings, runState, signal, passName: `Maßnahmen ${hazard.id}` });
  const TYPES = ['elimination', 'frequencyReduction', 'propagationReduction', 'severityMitigation'];
  const HIER = ['safeFunction', 'additionalSafety', 'safetyInformation', ...Object.keys(M.LEGACY_HIERARCHY)];
  return (Array.isArray(raw.measures) ? raw.measures : []).map((m) => M.makeMeasure({
    text: itemText(m),
    type: enumFrom(m, ['type', 'wirkung', 'measureType', 'hierarchy'], TYPES, 'frequencyReduction'),
    hierarchy: M.normalizeHierarchy(enumFrom(m, ['hierarchy', 'hierarchie', 'control', 'type'], HIER, 'additionalSafety')),
    residualSeverity: enumFrom(m, ['residualSeverity', 'restSchadensausmass'], S.SEVERITIES, ''),
    residualFrequency: enumFrom(m, ['residualFrequency', 'restHaeufigkeit'], S.FREQUENCIES, ''),
    rationale: str(pick(m, ['rationale', 'begruendung', 'justification'])),
    // Outside the system boundary => candidate for a safety-related application condition.
    becomesSrac: m && (m.insideSystem === false || m.outsideSystem === true || m.external === true),
    status: 'proposed',
  })).filter((m) => m.text);
}

async function runRequirements({ hazard, ctx, provider, settings, runState, signal }) {
  const chunks = chunkDocuments(ctx.documents);
  const docs = retrieve(chunks, `${hazard.title} ${(hazard.measures || []).map((m) => m.text).join(' ')}`, 3000);
  const raw = await single({ prompt: P.buildRequirementsPrompt({ ...ctx, modes: M.data().modes, docs }, hazard, ctx.calibration), schema: S.withEnums(S.REQUIREMENTS_SCHEMA, { functionIds: ctx.functions.map((f) => f.id) }), provider, settings, runState, signal, passName: `Anforderungen ${hazard.id}` });
  const active = (hazard.measures || []).filter((m) => m.status !== 'rejected');
  return (Array.isArray(raw.requirements) ? raw.requirements : []).map((r) => {
    const category = enumFrom(r, ['category', 'kategorie', 'type', 'art'], ['functional', 'technical', 'contextual', 'srac'], 'functional');
    const text = str(pick(r, ['text', 'requirement', 'anforderung', 'statement', 'beschreibung', 'description']));
    const fnIds = mapIds(r.functions, ctx.functions, category === 'functional' ? hazard.functions || [] : []);
    // A functional safety requirement must state the safe state (EN 50126-2 9.3.2).
    // When the model omits it, inherit the safe state already declared on the
    // linked function instead of leaving a gap: it is the same state, and the
    // engineer still sees and confirms it in the requirement.
    let safeState = str(pick(r, ['safeState', 'sichererZustand']));
    if (!safeState && category === 'functional') {
      const f = ctx.functions.find((x) => fnIds.includes(x.id) && str(x.safeState));
      if (f) safeState = f.safeState;
    }
    return M.makeRequirement({
      title: str(pick(r, ['title', 'titel'])).slice(0, 120) || text.slice(0, 80), text, category,
      hazards: [hazard.id], functions: fnIds,
      measures: (Array.isArray(r.measureIndexes) ? r.measureIndexes : []).map((i) => active[i] && active[i].id).filter(Boolean),
      safeState, timeToSafeState: str(pick(r, ['timeToSafeState', 'zeitBisSichererZustand'])), detection: str(pick(r, ['detection', 'fehlererkennung'])),
      verificationMethod: enumFrom(r, ['verificationMethod', 'verification', 'verifikation'], ['test', 'analysis', 'inspection', 'demonstration', 'review'], 'test'),
      verificationNote: str(pick(r, ['verificationNote', 'verificationHint', 'verifikationshinweis'])),
      rationale: str(pick(r, ['rationale', 'begruendung', 'justification'])), status: 'draft', source: 'ai',
      srac: { receiver: str(pick(r, ['sracReceiver', 'receiver', 'empfaenger'])), origin: `Gefährdung ${hazard.id}`, verification: str(pick(r, ['verificationNote', 'verificationHint'])) },
    });
  }).filter((r) => r.text);
}

const api = { DEPTHS, chunkDocuments, retrieve, planIdentification, runIdentification, runDecomposition, runRiskAnalysis, runMeasures, runRequirements, normalizeHazardItem, normalizeAnalysis, dedupBatch, mergeInto, mapIds };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.RHAS_ENGINE = api;
})();

