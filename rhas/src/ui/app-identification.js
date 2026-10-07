// Stage 2: Gefährdungsidentifikation — run configuration with consent gate,
// the triage table, manual entry, bulk actions, keyboard triage and the
// coverage evidence panel.
(function () {
const A = window.RHAS_APP, M = window.RHAS_MODEL, DATA = window.RHAS_DATA, E = window.RHAS_ENGINE, DB = window.RHAS_DB;
let focusIdx = -1;
let cachedRows = [];

// ---------------------------------------------------------- run config ----
function scopedSources() { const sel = A.state.identConfig.sources; return DATA.sources.filter((s) => !sel || sel.includes(s.id)); }
function scopedModes() { return DATA.modes.filter((m) => (A.state.sd.modes || []).includes(m.id)); }
function currentPlan() { return E.planIdentification({ splitGuidewords: A.settings.splitGuidewords === 'on', securityLevel: window.RHAS_SECURITY.level(A.state.projectProfile), depth: A.state.identConfig.depth, overrides: A.state.identConfig.overrides, functions: A.state.functions, interfaces: A.state.interfaces, modes: scopedModes(), sources: scopedSources() }); }
/**
 * Seconds per call for the run estimate. A cloud model is roughly an order of
 * magnitude faster than a local one, so an estimate taken from a run with a
 * DIFFERENT provider/model would be badly wrong right after switching. Prefer
 * the newest run on the current provider+model, fall back to the same
 * provider, then to a per-provider default rather than to a foreign measurement.
 */
function secondsPerCall() {
  const { provider, settings } = A.provider();
  const model = provider === 'mistral-api' ? settings.mistralModel : settings.ollamaModel;
  const rate = (r) => Math.max(5, (new Date(r.finishedAt) - new Date(r.startedAt)) / 1000 / r.calls);
  const runs = A.state.runs.filter((r) => r.mode === 'identification' && r.calls > 0 && r.finishedAt && r.startedAt);
  const sameModel = runs.filter((r) => r.provider === provider && r.model === model);
  if (sameModel.length) return { value: rate(sameModel[sameModel.length - 1]), basis: 'gemessen' };
  const sameProvider = runs.filter((r) => r.provider === provider);
  if (sameProvider.length) return { value: rate(sameProvider[sameProvider.length - 1]), basis: 'geschätzt aus anderem Modell' };
  return { value: provider === 'mistral-api' ? 25 : 120, basis: 'Erfahrungswert' };
}
function fmtDuration(sec) { if (sec < 90) return `${Math.round(sec)} s`; if (sec < 5400) return `${Math.round(sec / 60)} min`; return `${(sec / 3600).toFixed(1)} h`; }

function renderRunPanel() {
  const cfg = A.state.identConfig;
  A.el('depth-cards').innerHTML = Object.entries(E.DEPTHS).map(([k, d]) => `<div class="depth-card${cfg.depth === k ? ' on' : ''}" data-depth="${k}"><b>${d.label}</b><small>${A.esc(d.description)}</small></div>`).join('');
  A.el('depth-cards').querySelectorAll('.depth-card').forEach((c) => { c.onclick = async () => { cfg.depth = c.dataset.depth; cfg.overrides = {}; await DB.setMeta(A.state.pdb, 'identConfig', cfg); renderRunPanel(); }; });
  const passes = { function: `Funktionen × Leitworte (${A.state.functions.length})`, interface: `Schnittstellen (${A.state.interfaces.length})`, mode: `Betriebsarten (${scopedModes().length})`, source: `Gefährdungsquellen (${scopedSources().length})`, interaction: 'Interaktionsanalyse (1)', critique: 'Kritik + Lückenfüllung (1 + bis zu 6)', iterate: `Zweite Iteration je Funktion (${A.state.functions.length})` };
  const eff = { ...E.DEPTHS[cfg.depth].passes, ...cfg.overrides };
  A.el('pass-toggles').innerHTML = Object.entries(passes).map(([k, label]) => `<label><input type="checkbox" data-pass="${k}"${eff[k] ? ' checked' : ''}/> ${label}</label>`).join('');
  A.el('pass-toggles').querySelectorAll('input').forEach((c) => { c.onchange = async () => { cfg.overrides[c.dataset.pass] = c.checked; await DB.setMeta(A.state.pdb, 'identConfig', cfg); renderRunPanel(); }; });
  A.el('source-scope').innerHTML = DATA.sources.map((s) => `<span class="chip${!cfg.sources || cfg.sources.includes(s.id) ? ' on' : ''}" data-src="${s.id}" title="${A.esc(s.description)}">${s.code} ${A.esc(s.title)}</span>`).join('');
  A.el('source-scope').querySelectorAll('.chip').forEach((ch) => { ch.onclick = async () => { const cur = new Set(cfg.sources || DATA.sources.map((s) => s.id)); if (cur.has(ch.dataset.src)) cur.delete(ch.dataset.src); else cur.add(ch.dataset.src); cfg.sources = [...cur]; await DB.setMeta(A.state.pdb, 'identConfig', cfg); renderRunPanel(); }; });
  const plan = currentPlan();
  const spc = secondsPerCall();
  A.el('run-estimate').textContent = `≈ ${plan.estimatedCalls} KI-Aufrufe · geschätzt ${fmtDuration(plan.estimatedCalls * spc.value)} (${Math.round(spc.value)} s/Aufruf, ${spc.basis})`;
  const gate = M.validateSystemDefinition(A.state.sd, A.state.functions);
  const g = A.el('run-gate');
  if (!gate.ok) { g.classList.remove('hidden'); g.innerHTML = `<b>Durchlauf gesperrt — Systemdefinition unvollständig (EN 50126-1 7.3.2.1):</b><ul>${gate.findings.filter((f) => f.level === 'error').slice(0, 8).map((f) => `<li class="error">${A.esc(f.text)}</li>`).join('')}</ul>`; A.el('btn-run-arm').disabled = true; }
  else { g.classList.add('hidden'); A.el('btn-run-arm').disabled = !plan.passes.length; }
}

async function startRun() {
  const plan = currentPlan();
  const pre = await A.checkProvider();
  if (!pre.ok) { A.toast(`KI-Anbieter nicht erreichbar: ${pre.error || pre.message || ''}`, 'err'); return; }
  const abort = new AbortController();
  if (!A.aiAllowed()) return;
  const runState = A.runState();
  A.state.run = { abort, runState };
  const prog = A.el('run-progress'), log = A.el('run-log');
  prog.classList.remove('hidden'); A.el('btn-run-cancel').classList.remove('hidden'); A.el('btn-run-arm').classList.add('hidden');
  log.textContent = '';
  const t0 = Date.now();
  const setProg = (i, total, txt) => { prog.querySelector('.bar').style.width = `${Math.round(((i) / Math.max(1, total)) * 100)}%`; prog.querySelector('.txt').textContent = txt; };
  try {
    const result = await E.runIdentification({
      plan, ctx: A.ctx(), existingHazards: A.state.hazards, ...A.provider(), runState, signal: abort.signal,
      onProgress: (p) => { const el = `${Math.round((Date.now() - t0) / 1000)} s`; if (p.status === 'running') setProg(p.index, p.total, `${p.index + 1}/${p.total} ${p.pass.label} … (${el})`); else { setProg(p.index + 1, p.total, `${p.index + 1}/${p.total} ${p.pass.label}: ${p.status === 'failed' ? 'Fehler' : `${p.proposed != null ? p.proposed + ' Vorschläge' : p.gaps != null ? p.gaps + ' Lückenbereiche' : 'fertig'}`}`); log.textContent += `${p.pass.label}: ${p.status === 'failed' ? `FEHLER ${p.error}` : `${p.proposed != null ? p.proposed + ' Vorschläge' : p.gaps != null ? p.gaps + ' Lückenbereiche' : 'ok'}`}\n`; log.scrollTop = log.scrollHeight; } },
      onBatch: async (hz) => { const recs = await A.createHazards(hz); renderTable(); A.refresh(); return recs; },
      onSoftCap: async (rs) => new Promise((resolve) => { const b = A.el('btn-run-confirm'); b.textContent = `Weiche Obergrenze erreicht (${rs.tracker.calls} Aufrufe) — weiter?`; b.classList.remove('hidden'); const prev = b.onclick; b.onclick = () => { b.classList.add('hidden'); b.onclick = prev; resolve(true); }; setTimeout(() => { if (b.onclick !== prev) { b.classList.add('hidden'); b.onclick = prev; resolve(false); } }, 120000); }), /* PATCH-4 */
    });
    await A.addRun(result);
    const msg = result.cancelled ? `Abgebrochen — ${result.totals.proposed} Vorschläge bleiben erhalten` : result.stoppedBy ? `Gestoppt (${result.stoppedBy === 'breaker' ? 'wiederholte Fehler' : 'Obergrenze'}) — ${result.totals.proposed} Vorschläge` : `Fertig: ${result.totals.proposed} Vorschläge aus ${result.totals.passes} Durchläufen`;
    setProg(1, 1, msg); A.toast(msg, result.cancelled || result.stoppedBy ? 'err' : '');
  } catch (e) { A.toast(`Durchlauf fehlgeschlagen: ${e.message}`, 'err'); log.textContent += `FEHLER ${e.message}\n`; }
  A.state.run = null;
  A.el('btn-run-cancel').classList.add('hidden'); A.el('btn-run-arm').classList.remove('hidden');
  renderRunPanel(); renderTable(); renderCoverage(); A.refresh();
}

// ---------------------------------------------------------------- table ----
function filteredRows() {
  const q = A.el('hz-search').value.trim().toLowerCase();
  const st = A.el('hz-f-status').value, src = A.el('hz-f-source').value, fn = A.el('hz-f-function').value, me = A.el('hz-f-method').value, dup = A.el('hz-f-dup').checked;
  return A.state.hazards.filter((h) => (!st || (h.review && h.review.decision) === st) && (!src || h.sourceCategory === src) && (!fn || (h.functions || []).includes(fn)) && (!me || h.method === me) && (!dup || h.duplicateOf) && (!q || `${h.id} ${h.title} ${h.description} ${(h.causes || []).map((c) => c.text).join(' ')}`.toLowerCase().includes(q))).sort((a, b) => a.id.localeCompare(b.id));
}

function renderFilters() {
  const keep = (id, html) => { const s = A.el(id); const v = s.value; s.innerHTML = html; s.value = v; };
  keep('hz-f-source', '<option value="">Alle Quellen</option>' + DATA.sources.map((s) => `<option value="${s.id}">${s.code} ${A.esc(s.title)}</option>`).join(''));
  keep('hz-f-function', '<option value="">Alle Funktionen</option>' + A.state.functions.map((f) => `<option value="${f.id}">${f.id} ${A.esc(f.name)}</option>`).join(''));
  keep('hz-f-method', '<option value="">Alle Methoden</option>' + Object.entries(M.LABELS.method).map(([k, v]) => `<option value="${k}">${A.esc(v)}</option>`).join(''));
}

function hint(h) {
  const parts = [];
  if (h.duplicateOf) parts.push(A.pill('dup', `≈ ${h.duplicateOf}`));
  if (h.previouslyRejected) parts.push(A.pill('rejected', `✕ ${h.previouslyRejected}`));
  if (h.mergedCount > 1) parts.push(A.pill('merge', `⊕ ${h.mergedCount}`));
  const ids = (h.guidewords || []).length ? h.guidewords : (h.guideword ? [h.guideword] : []);
  const labels = ids.map((id) => (DATA.guidewords.find((g) => g.id === id) || {}).label).filter(Boolean);
  // A consolidated hazard covers several deviations — show the first and count the rest.
  const gw = labels.length ? (labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0]) : '';
  return { hints: parts.join(' '), gw, gwTitle: labels.join(', ') };
}

function renderTable() {
  cachedRows = filteredRows();
  const tb = A.el('tbl-hazards').querySelector('tbody');
  tb.innerHTML = cachedRows.map((h, i) => { const { hints, gw, gwTitle } = hint(h); return `<tr data-id="${h.id}" data-i="${i}" class="${i === focusIdx ? 'focus' : ''}${A.state.drawer && A.state.drawer.id === h.id ? ' sel' : ''}"><td class="id">${h.id}</td><td><span class="title">${A.esc(h.title)}</span><span class="desc" title="${A.esc(h.description)}">${A.esc(h.description)}</span></td><td>${A.esc(h.sourceCategory ? `${A.sourceById(h.sourceCategory)?.code || h.sourceCategory}` : '–')}</td><td class="mono">${A.esc((h.functions || []).concat(h.interfaces || []).join(', ') || '–')}</td><td title="${A.esc(gwTitle)}">${A.esc(gw)}</td><td>${A.esc(M.label('method', h.method))}</td><td>${hints}</td><td>${A.pill(h.review.decision, M.label('review', h.review.decision))}</td><td class="actions">${h.review.decision !== 'accepted' ? '<button class="btn icon" data-act="accept" title="Übernehmen (A)">✓</button>' : ''}${h.review.decision !== 'rejected' ? '<button class="btn icon" data-act="reject" title="Verwerfen (R)">✗</button>' : ''}</td></tr>`; }).join('') || `<tr><td colspan="9" class="hint">${A.state.hazards.length ? 'Keine Treffer für diesen Filter.' : 'Noch keine Gefährdungen. Durchlauf konfigurieren und starten, oder manuell erfassen.'}</td></tr>`;
  A.el('hz-count').textContent = `${cachedRows.length} von ${A.state.hazards.length}`;
  tb.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = (e) => { if (e.target.closest('button')) return; focusIdx = Number(tr.dataset.i); openHazard(tr.dataset.id); }; });
  tb.querySelectorAll('button[data-act]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const id = e.target.closest('tr').dataset.id; if (b.dataset.act === 'accept') accept(id); else reject(id); }; });
}

async function accept(id, rationale = '') {
  const h = A.state.hazards.find((x) => x.id === id); if (!h) return;
  h.review = { decision: 'accepted', by: A.author(), at: M.nowIso(), rationale };
  await A.saveHazard(h); renderTable(); A.refresh();
  if (A.state.drawer && A.state.drawer.id === id) openHazard(id);
}
/** WP5: fold a suggestion (typically an attack path) into the existing hazard it leads to; keep the evidence, reject the duplicate. */
async function mergeIntoExisting(id) {
  const h = A.state.hazards.find((x) => x.id === id); const target = h && A.state.hazards.find((x) => x.id === h.duplicateOf);
  if (!h || !target) return;
  E.mergeInto(target, h);
  target.threats = [...new Set([...(target.threats || []), ...(h.threats || [])])];
  delete target.mergedCount; delete target.mergedTitles;
  await A.saveHazard(target);
  await reject(id, `Zusammengeführt in ${target.id}: Ursachen und Bedrohungen übernommen.`);
  A.toast(`Ursachen in ${target.id} übernommen`);
}
async function reject(id, rationale = '') {
  const h = A.state.hazards.find((x) => x.id === id); if (!h) return;
  h.review = { decision: 'rejected', by: A.author(), at: M.nowIso(), rationale };
  await A.saveHazard(h); renderTable(); A.refresh();
  if (A.state.drawer && A.state.drawer.id === id) openHazard(id);
}

// --------------------------------------------------------------- drawer ----
function openHazard(id) {
  const h = A.state.hazards.find((x) => x.id === id); if (!h) return;
  A.state.drawer = { kind: 'hazard', id };
  document.querySelectorAll('#tbl-hazards tr').forEach((r) => r.classList.toggle('sel', r.dataset.id === id));
  const idx = cachedRows.findIndex((x) => x.id === id);
  const nav = `<button class="btn small" id="hz-prev"${idx <= 0 ? ' disabled' : ''}>↑</button> <span class="mono">${idx + 1}/${cachedRows.length}</span> <button class="btn small" id="hz-next"${idx >= cachedRows.length - 1 ? ' disabled' : ''}>↓</button>`;
  const r = h.reasoning || {};
  const dupTitle = h.duplicateOf ? A.hzTitle(h.duplicateOf) : '';
  A.openDrawer(`${h.id} · ${M.label('review', h.review.decision)}`, `
${h.duplicateOf ? `<div class="warn">Möglicherweise Duplikat von <b>${A.esc(dupTitle)}</b>. <button class="btn link" id="hz-goto-dup">öffnen</button>${h.review.decision === 'pending' ? ` <button class="btn small" id="hz-merge-dup" title="Ursachen, Bedrohungen, Funktionen und Schnittstellen in die bestehende Gefährdung übernehmen und diesen Vorschlag verwerfen">Ursachen in ${A.esc(h.duplicateOf)} übernehmen</button>` : ''}</div>` : ''}
${(h.threats || []).length ? `<div class="hint">Bedrohungen: ${A.esc(h.threats.map((t) => window.RHAS_SECURITY.threatLabel(t)).join(', '))}</div>` : ''}
${h.previouslyRejected ? `<div class="warn">Ähnelt der bereits verworfenen Gefährdung <b>${A.esc(A.hzTitle(h.previouslyRejected))}</b> (${A.esc(h.previouslyRejected)}).</div>` : ''}
${(h.mergedTitles || []).length ? `<div class="hint">Zusammengeführt aus ${h.mergedCount} Vorschlägen: ${A.esc(h.mergedTitles.join(' · '))}</div>` : ''}
<div class="f"><label>Titel</label><input id="hz-title" value="${A.esc(h.title)}" /></div>
<div class="f"><label>Beschreibung (Zustand an der Systemgrenze)</label><textarea id="hz-desc" rows="3">${A.esc(h.description)}</textarea></div>
<div class="f"><label>Gefährdungsquelle (7.4.2.1)</label><select id="hz-source">${A.opts(Object.fromEntries(DATA.sources.map((s) => [s.id, `${s.code} ${s.title}`])), h.sourceCategory, '–')}</select></div>
<div class="f"><label>Leitwort</label><select id="hz-gw">${A.opts(Object.fromEntries(DATA.guidewords.map((g) => [g.id, g.label])), h.guideword, '–')}</select></div>
<div class="f"><label>Beitragende Funktionen</label><div>${A.state.functions.map((f) => `<label class="chk"><input type="checkbox" data-fn="${f.id}"${(h.functions || []).includes(f.id) ? ' checked' : ''}/> ${f.id} ${A.esc(f.name)}</label>`).join('<br>') || '<span class="hint">keine Funktionen definiert</span>'}</div></div>
<div class="f"><label>Schnittstellen</label><div>${A.state.interfaces.map((i) => `<label class="chk"><input type="checkbox" data-if="${i.id}"${(h.interfaces || []).includes(i.id) ? ' checked' : ''}/> ${i.id} ${A.esc(i.name)}</label>`).join('<br>') || '<span class="hint">keine</span>'}</div></div>
<div class="f"><label>Betriebsarten</label><div>${DATA.modes.map((m) => `<label class="chk"><input type="checkbox" data-mode="${m.id}"${(h.modes || []).includes(m.id) ? ' checked' : ''}/> ${A.esc(m.label)}</label>`).join(' ')}</div></div>
<div class="f"><label>Ursachen (eine je Zeile, optional „| systematic/random/human/external/intentional“)</label><textarea id="hz-causes" rows="3">${A.esc((h.causes || []).map((c) => `${c.text} | ${c.kind}`).join('\n'))}</textarea></div>
<div class="f"><label>Auslösendes Ereignis</label><input id="hz-trigger" value="${A.esc(h.triggeringEvent)}" /></div>
<div class="f"><label>Bedingungen (eine je Zeile)</label><textarea id="hz-cond" rows="2">${A.esc((h.enablingConditions || []).join('\n'))}</textarea></div>
<div class="f"><label>Vorläufige Auswirkung</label><textarea id="hz-cons" rows="2">${A.esc(h.accidents && h.accidents[0] ? h.accidents[0].description : '')}</textarea></div>
${r.whyIdentified ? `<div class="reason"><b>Warum identifiziert:</b> ${A.esc(r.whyIdentified)}${r.sourcesUsed ? `<br><b>Quelle:</b> ${A.esc(r.sourcesUsed)}` : ''}<br><b>Prüfhilfe:</b> ${A.esc(r.decisionRationale)}</div>` : ''}
<div class="f"><label>Entscheidungsbegründung</label><textarea id="hz-review-rat" rows="2">${A.esc(h.review.rationale || '')}</textarea></div>
<div class="audit">Herkunft: ${A.esc(M.label('method', h.method))}${h.provenance && h.provenance.pass ? ` · ${A.esc(h.provenance.pass)} · ${A.esc(h.provenance.model || '')}` : ''} · angelegt ${A.fmtDate(h.createdAt)}${h.review.by ? ` · ${M.label('review', h.review.decision)} von ${A.esc(h.review.by)} am ${A.fmtDate(h.review.at)}` : ''}</div>
<div class="sticky-actions"><button id="hz-save" class="btn">Speichern</button><button id="hz-accept" class="btn primary">Übernehmen (A)</button><button id="hz-reject" class="btn danger">Verwerfen (R)</button>${h.review.decision === 'accepted' ? `<button id="hz-to-analysis" class="btn">→ Risikoanalyse</button>` : ''}<button id="hz-delete" class="btn danger">Löschen</button></div>`, { nav });
  const collect = () => ({ ...h, title: A.el('hz-title').value.trim(), description: A.el('hz-desc').value.trim(), sourceCategory: A.el('hz-source').value, guideword: A.el('hz-gw').value, functions: [...document.querySelectorAll('#drawer-body [data-fn]:checked')].map((c) => c.dataset.fn), interfaces: [...document.querySelectorAll('#drawer-body [data-if]:checked')].map((c) => c.dataset.if), modes: [...document.querySelectorAll('#drawer-body [data-mode]:checked')].map((c) => c.dataset.mode), causes: A.el('hz-causes').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [text, kind] = l.split('|').map((x) => x.trim()); return { text, kind: Object.keys(M.LABELS.causeKind).includes(kind) ? kind : 'systematic' }; }), triggeringEvent: A.el('hz-trigger').value.trim(), enablingConditions: A.el('hz-cond').value.split('\n').map((l) => l.trim()).filter(Boolean), accidents: (() => { const acc = h.accidents && h.accidents.length ? h.accidents.map((a) => ({ ...a })) : [M.makeAccident({ id: 'A1' })]; acc[0].description = A.el('hz-cons').value.trim(); return acc; })(), review: { ...h.review, rationale: A.el('hz-review-rat').value.trim() } });
  const save = async () => { const rec = collect(); if (!rec.title) { A.toast('Titel fehlt', 'err'); return null; } Object.assign(h, rec); await A.saveHazard(h); renderTable(); return h; };
  A.el('hz-save').onclick = async () => { if (await save()) A.toast('Gespeichert'); };
  A.el('hz-accept').onclick = async () => { if (await save()) accept(id, A.el('hz-review-rat').value.trim()); };
  A.el('hz-reject').onclick = async () => { if (await save()) reject(id, A.el('hz-review-rat').value.trim()); };
  A.el('hz-delete').onclick = (e) => { if (e.target.dataset.armed) { A.deleteHazard(id).then(() => { A.closeDrawer(); renderTable(); A.refresh(); }); return; } e.target.dataset.armed = '1'; e.target.textContent = 'Wirklich löschen?'; };
  if (A.el('hz-to-analysis')) A.el('hz-to-analysis').onclick = () => { A.show('analysis'); A.stages.analysis.open(id); };
  if (A.el('hz-goto-dup')) A.el('hz-goto-dup').onclick = () => { A.el('hz-f-status').value = ''; renderTable(); openHazard(h.duplicateOf); };
  if (A.el('hz-merge-dup')) A.el('hz-merge-dup').onclick = () => mergeIntoExisting(id);
  A.el('hz-prev').onclick = () => { if (idx > 0) { focusIdx = idx - 1; openHazard(cachedRows[idx - 1].id); } };
  A.el('hz-next').onclick = () => { if (idx < cachedRows.length - 1) { focusIdx = idx + 1; openHazard(cachedRows[idx + 1].id); } };
}

function openManual() {
  const h = M.makeHazard({ method: 'manual', source: 'manual' });
  A.state.drawer = { kind: 'new' };
  A.openDrawer('Gefährdung manuell erfassen', `
<div class="f"><label>Titel</label><input id="nh-title" /></div>
<div class="f"><label>Beschreibung (Zustand)</label><textarea id="nh-desc" rows="3"></textarea></div>
<div class="f"><label>Gefährdungsquelle</label><select id="nh-source">${A.opts(Object.fromEntries(DATA.sources.map((s) => [s.id, `${s.code} ${s.title}`])), 'f')}</select></div>
<div class="f"><label>Funktionen</label><div>${A.state.functions.map((f) => `<label class="chk"><input type="checkbox" data-fn="${f.id}"/> ${f.id} ${A.esc(f.name)}</label>`).join('<br>')}</div></div>
<div class="f"><label>Ursachen (eine je Zeile)</label><textarea id="nh-causes" rows="2"></textarea></div>
<div class="f"><label>Auslösendes Ereignis</label><input id="nh-trigger" /></div>
<div class="f"><label>Vorläufige Auswirkung</label><textarea id="nh-cons" rows="2"></textarea></div>
<div class="sticky-actions"><button id="nh-save" class="btn primary">Anlegen und übernehmen</button><button id="nh-cancel" class="btn">Abbrechen</button></div>`);
  A.el('nh-cancel').onclick = A.closeDrawer;
  A.el('nh-save').onclick = async () => {
    const title = A.el('nh-title').value.trim(), desc = A.el('nh-desc').value.trim();
    if (!title || !desc) { A.toast('Titel und Beschreibung sind Pflicht', 'err'); return; }
    Object.assign(h, { title, description: desc, sourceCategory: A.el('nh-source').value, functions: [...document.querySelectorAll('#drawer-body [data-fn]:checked')].map((c) => c.dataset.fn), causes: A.el('nh-causes').value.split('\n').map((l) => l.trim()).filter(Boolean).map((text) => ({ text, kind: 'systematic' })), triggeringEvent: A.el('nh-trigger').value.trim(), accidents: A.el('nh-cons').value.trim() ? [M.makeAccident({ id: 'A1', description: A.el('nh-cons').value.trim() })] : [], review: { decision: 'accepted', by: A.author(), at: M.nowIso(), rationale: 'Manuell erfasst' } });
    const [rec] = await A.createHazards([h]);
    A.closeDrawer(); renderTable(); A.refresh(); A.toast(`${rec.id} angelegt`);
  };
}

// ----------------------------------------------------------- bulk actions ----
function bindBulk() {
  const confirm = A.el('btn-bulk-confirm'), cancel = A.el('btn-bulk-cancel');
  let pending = null;
  const arm = (label, fn) => { pending = fn; confirm.textContent = label; confirm.classList.remove('hidden'); cancel.classList.remove('hidden'); };
  cancel.onclick = () => { pending = null; confirm.classList.add('hidden'); cancel.classList.add('hidden'); };
  confirm.onclick = async () => { const fn = pending; cancel.onclick(); if (fn) await fn(); };
  A.el('btn-bulk-accept').onclick = () => { const rows = filteredRows().filter((h) => h.review.decision === 'pending' && !h.duplicateOf); if (!rows.length) { A.toast('Keine offenen Vorschläge ohne Duplikat-Verdacht im Filter'); return; } arm(`${rows.length} übernehmen — bestätigen`, async () => { for (const h of rows) { h.review = { decision: 'accepted', by: A.author(), at: M.nowIso(), rationale: 'Sammelübernahme' }; await A.saveHazard(h); } renderTable(); A.refresh(); A.toast(`${rows.length} übernommen`); }); };
  A.el('btn-bulk-reject-dup').onclick = () => { const rows = filteredRows().filter((h) => h.review.decision === 'pending' && h.duplicateOf); if (!rows.length) { A.toast('Keine markierten Duplikate im Filter'); return; } arm(`${rows.length} Duplikate verwerfen — bestätigen`, async () => { for (const h of rows) { h.review = { decision: 'rejected', by: A.author(), at: M.nowIso(), rationale: `Duplikat von ${h.duplicateOf}` }; await A.saveHazard(h); } renderTable(); A.refresh(); }); };
}

// ---------------------------------------------------------------- coverage ----
function renderCoverage() {
  const p = A.el('coverage-panel');
  if (p.classList.contains('hidden')) return;
  const cov = M.coverage({ hazards: A.state.hazards, functions: A.state.functions, interfaces: A.state.interfaces, sources: DATA.sources, guidewords: DATA.guidewords, modes: scopedModes(), runs: A.state.runs });
  const t = (rows, cols) => `<table class="grid"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
  const flag = (x) => (x.searched ? A.pill('accepted', 'durchsucht') : A.pill('gray', 'nicht durchsucht'));
  p.innerHTML = `<div class="kpis"><div class="kpi"><b>${cov.totals.proposed}</b><span>vorgeschlagen</span></div><div class="kpi"><b>${cov.totals.accepted}</b><span>übernommen</span></div><div class="kpi"><b>${cov.totals.rejected}</b><span>verworfen</span></div><div class="kpi"><b>${A.state.runs.filter((r) => r.mode === 'identification').length}</b><span>Läufe</span></div></div>
<div class="cov-grid">
<div><div class="lbl">Gefährdungsquellen EN 50126-1 7.4.2.1</div>${t(cov.bySource.map((s) => `<tr><td class="mono">${s.code}</td><td>${A.esc(s.title)}</td><td class="mono">${s.proposed} / ${s.accepted}</td><td>${flag(s)}</td></tr>`), ['Quelle', '', 'vorg./übern.', 'Durchlauf'])}</div>
<div><div class="lbl">Funktionen</div>${t(cov.byFunction.map((f) => `<tr><td class="mono">${f.id}</td><td>${A.esc(f.name)}</td><td class="mono">${f.proposed} / ${f.accepted}</td><td>${flag(f)}</td></tr>`), ['ID', 'Funktion', 'vorg./übern.', 'Durchlauf'])}</div>
<div><div class="lbl">Schnittstellen</div>${t(cov.byInterface.map((i) => `<tr><td class="mono">${i.id}</td><td>${A.esc(i.name)}</td><td class="mono">${i.proposed} / ${i.accepted}</td><td>${flag(i)}</td></tr>`), ['ID', 'Schnittstelle', 'vorg./übern.', 'Durchlauf'])}</div>
<div><div class="lbl">Leitworte</div>${t(cov.byGuideword.map((g) => `<tr><td>${A.esc(g.label)}</td><td class="mono">${g.proposed} / ${g.accepted}</td></tr>`), ['Leitwort', 'vorg./übern.'])}</div>
<div><div class="lbl">Betriebsarten</div>${t(cov.byMode.map((m) => `<tr><td>${A.esc(m.label)}</td><td class="mono">${m.proposed} / ${m.accepted}</td><td>${flag(m)}</td></tr>`), ['Betriebsart', 'vorg./übern.', 'Durchlauf'])}</div>
<div><div class="lbl">Methoden</div>${t(cov.byMethod.map((m) => `<tr><td>${A.esc(m.label)}</td><td class="mono">${m.proposed} / ${m.accepted}</td></tr>`), ['Methode', 'vorg./übern.'])}</div>
</div>`;
}

function keyboard(e) {
  if (A.state.stage !== 'identification' || !A.state.project) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag)) return;
  if (!cachedRows.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(cachedRows.length - 1, focusIdx + 1); renderTable(); if (A.state.drawer) openHazard(cachedRows[focusIdx].id); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx = Math.max(0, focusIdx - 1); renderTable(); if (A.state.drawer) openHazard(cachedRows[focusIdx].id); }
  else if (e.key === 'Enter' && focusIdx >= 0) { openHazard(cachedRows[focusIdx].id); }
  else if ((e.key === 'a' || e.key === 'A') && focusIdx >= 0) { accept(cachedRows[focusIdx].id); }
  else if ((e.key === 'r' || e.key === 'R') && focusIdx >= 0) { reject(cachedRows[focusIdx].id); }
}

A.stages.identification = {
  render() { renderFilters(); renderRunPanel(); renderTable(); renderCoverage(); },
  open: openHazard,
  bind() {
    A.el('btn-toggle-run').onclick = () => { A.el('run-panel').classList.toggle('hidden'); renderRunPanel(); };
    A.el('btn-toggle-coverage').onclick = () => { A.el('coverage-panel').classList.toggle('hidden'); renderCoverage(); };
    A.el('btn-add-hazard').onclick = openManual;
    A.arm(A.el('btn-run-arm'), A.el('btn-run-confirm'), null, () => `Bestätigen: ${currentPlan().estimatedCalls} KI-Aufrufe starten`, startRun);
    A.el('btn-run-cancel').onclick = () => { if (A.state.run) A.state.run.abort.abort(); };
    ['hz-search', 'hz-f-status', 'hz-f-source', 'hz-f-function', 'hz-f-method', 'hz-f-dup'].forEach((id) => { A.el(id).oninput = () => { focusIdx = -1; renderTable(); }; A.el(id).onchange = () => { focusIdx = -1; renderTable(); }; });
    bindBulk();
    document.addEventListener('keydown', keyboard);
  },
};
})();

