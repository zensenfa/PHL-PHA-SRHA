// Stage 4: Sicherheitsanforderungen — requirements (functional / technical /
// contextual / SRAC), function-level TFFR → integrity, SRAC register,
// traceability and independence (CCA) records. SIL is derived locally from
// the TFFR; the AI never proposes integrity levels.
(function () {
const A = window.RHAS_APP, M = window.RHAS_MODEL, DATA = window.RHAS_DATA, E = window.RHAS_ENGINE;
let cached = [];
const accepted = () => A.state.hazards.filter((h) => h.review && h.review.decision === 'accepted');

// ---------------------------------------------------------- requirements ----
function filtered() {
  const q = A.el('rq-search').value.trim().toLowerCase(), cat = A.el('rq-f-category').value, st = A.el('rq-f-status').value, hz = A.el('rq-f-hazard').value;
  return A.state.requirements.filter((r) => (!cat || r.category === cat) && (!st || r.status === st) && (!hz || (r.hazards || []).includes(hz)) && (!q || `${r.id} ${r.title} ${r.text}`.toLowerCase().includes(q))).sort((a, b) => a.id.localeCompare(b.id));
}
function renderFilters() {
  const keep = (id, html) => { const s = A.el(id); const v = s.value; s.innerHTML = html; s.value = v; };
  keep('rq-f-category', '<option value="">Alle Kategorien</option>' + A.opts(M.LABELS.reqCategory));
  keep('rq-f-status', '<option value="">Alle Stati</option>' + A.opts(M.LABELS.reqStatus));
  keep('rq-f-hazard', '<option value="">Alle Gefährdungen</option>' + accepted().map((h) => `<option value="${h.id}">${h.id} ${A.esc(h.title)}</option>`).join(''));
}
function renderTable() {
  cached = filtered();
  const tb = A.el('tbl-requirements').querySelector('tbody');
  tb.innerHTML = cached.map((r) => { const c = M.requirementCompleteness(r); return `<tr data-id="${r.id}" class="${A.state.drawer && A.state.drawer.id === r.id ? 'sel' : ''}"><td class="id">${r.id}</td><td><span class="title">${A.esc(r.title || r.text.slice(0, 80))}</span><span class="desc">${A.esc(r.text)}</span></td><td>${A.esc(M.label('reqCategory', r.category))}</td><td class="mono">${A.esc((r.hazards || []).join(', ') || '–')}</td><td class="mono">${A.esc((r.functions || []).join(', ') || '–')}</td><td>${A.esc(M.label('verification', r.verificationMethod))}</td><td>${A.pill(r.status === 'agreed' ? 'accepted' : r.status === 'rejected' ? 'rejected' : 'pending', M.label('reqStatus', r.status))}</td><td>${c.ok ? A.pill('accepted', 'ok') : `<span class="pill dup" title="${A.esc(c.problems.join('\n'))}">${c.problems.length} offen</span>`}</td></tr>`; }).join('') || `<tr><td colspan="8" class="hint">${A.state.requirements.length ? 'Keine Treffer.' : 'Noch keine Anforderungen. „KI: Anforderungen ableiten“ für Gefährdungen mit bestätigten Maßnahmen, oder manuell anlegen.'}</td></tr>`;
  A.el('rq-count').textContent = `${cached.length} von ${A.state.requirements.length}`;
  A.el('cnt-requirements').textContent = A.state.requirements.length;
  A.el('cnt-srac').textContent = A.state.requirements.filter((r) => r.category === 'srac').length;
  tb.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => openRequirement(tr.dataset.id); });
}

function openRequirement(id) {
  const r = id ? A.state.requirements.find((x) => x.id === id) : M.makeRequirement({ status: 'draft', source: 'manual' });
  if (!r) return;
  A.state.drawer = { kind: 'requirement', id: r.id || null };
  document.querySelectorAll('#tbl-requirements tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.id === r.id));
  const c = M.requirementCompleteness(r);
  const measureOpts = accepted().flatMap((h) => (h.measures || []).filter((m) => m.status !== 'rejected').map((m) => ({ id: m.id, label: `${h.id}/${m.id} ${m.text.slice(0, 70)}` })));
  A.openDrawer(r.id ? `${r.id} · ${M.label('reqCategory', r.category)}` : 'Neue Anforderung', `
${c.ok ? '<div class="findings ok">Vollständig.</div>' : `<div class="findings"><b>Offen:</b> ${c.problems.map(A.esc).join(' · ')}</div>`}
<div class="f"><label>Titel</label><input id="rq-title" value="${A.esc(r.title)}" /></div>
<div class="f"><label>Anforderung („muss“ / „darf nicht“, eine Forderung, messbar)</label><textarea id="rq-text" rows="3">${A.esc(r.text)}</textarea></div>
<div class="f"><label>Kategorie</label><select id="rq-cat">${A.opts(M.LABELS.reqCategory, r.category)}</select></div>
<div class="f"><label class="chk"><input type="checkbox" id="rq-sec"${r.securityRelated ? ' checked' : ''}/> Security-bezogen (beherrscht vorsätzliche Ursachen, EN 50129 6.4)</label></div>
<div class="f"><label>Gefährdungen</label><div>${accepted().map((h) => `<label class="chk"><input type="checkbox" data-hz="${h.id}"${(r.hazards || []).includes(h.id) ? ' checked' : ''}/> ${h.id} ${A.esc(h.title)}</label>`).join('<br>') || '<span class="hint">keine übernommenen Gefährdungen</span>'}</div></div>
<div class="f"><label>Funktionen</label><div>${A.state.functions.map((f) => `<label class="chk"><input type="checkbox" data-fn="${f.id}"${(r.functions || []).includes(f.id) ? ' checked' : ''}/> ${f.id} ${A.esc(f.name)}</label>`).join('<br>') || '<span class="hint">keine Funktionen</span>'}</div></div>
<div class="f"><label>Umgesetzte Maßnahmen</label><div>${measureOpts.map((m) => `<label class="chk"><input type="checkbox" data-ms="${m.id}"${(r.measures || []).includes(m.id) ? ' checked' : ''}/> ${A.esc(m.label)}</label>`).join('<br>') || '<span class="hint">keine bestätigten Maßnahmen</span>'}</div></div>
<div class="f"><label>Sicherer Zustand</label><input id="rq-safe" value="${A.esc(r.safeState)}" /></div>
<div class="f"><label>Max. Zeit bis sicherer Zustand</label><input id="rq-tts" value="${A.esc(r.timeToSafeState)}" /></div>
<div class="f"><label>Fehlererkennung</label><input id="rq-det" value="${A.esc(r.detection)}" /></div>
<div class="f"><label>Zuordnung (Teilsystem / Komponente)</label><input id="rq-alloc" value="${A.esc(r.allocation)}" /></div>
<div class="f"><label>Verifikationsmethode</label><select id="rq-ver">${A.opts(M.LABELS.verification, r.verificationMethod)}</select></div>
<div class="f"><label>Verifikationshinweis</label><input id="rq-vernote" value="${A.esc(r.verificationNote)}" /></div>
<div class="f"><label>Begründung</label><textarea id="rq-rat" rows="2">${A.esc(r.rationale)}</textarea></div>
<h4>SRAC-Felder (EN 50129 5.3.13 Tabelle 1)</h4>
<div class="f"><label>Empfänger</label><input id="rq-srac-recv" value="${A.esc(r.srac && r.srac.receiver || '')}" placeholder="Betreiber, Instandhalter, Projektierung, Integrator" /></div>
<div class="f"><label>Herkunft</label><input id="rq-srac-orig" value="${A.esc(r.srac && r.srac.origin || '')}" /></div>
<div class="f"><label>Nachweis der Einhaltung</label><input id="rq-srac-ver" value="${A.esc(r.srac && r.srac.verification || '')}" /></div>
<div class="f"><label>Status</label><select id="rq-status">${A.opts(M.LABELS.reqStatus, r.status)}</select></div>
<div class="audit">${r.id ? `${r.source === 'ai' ? 'KI-Vorschlag' : 'manuell'} · angelegt ${A.fmtDate(r.createdAt)}${r.createdBy ? ` von ${A.esc(r.createdBy)}` : ''} · geändert ${A.fmtDate(r.updatedAt)}` : ''}</div>
<div class="sticky-actions"><button id="rq-save" class="btn primary">Speichern</button>${r.id ? '<button id="rq-delete" class="btn danger">Löschen</button>' : ''}<button id="rq-cancel" class="btn">Schließen</button></div>`);
  A.el('rq-cancel').onclick = A.closeDrawer;
  A.el('rq-save').onclick = async () => {
    const text = A.el('rq-text').value.trim(); if (!text) { A.toast('Anforderungstext fehlt', 'err'); return; }
    const rec = { ...r, title: A.el('rq-title').value.trim() || text.slice(0, 80), text, category: A.el('rq-cat').value, securityRelated: A.el('rq-sec').checked, hazards: [...document.querySelectorAll('#drawer-body [data-hz]:checked')].map((c) => c.dataset.hz), functions: [...document.querySelectorAll('#drawer-body [data-fn]:checked')].map((c) => c.dataset.fn), measures: [...document.querySelectorAll('#drawer-body [data-ms]:checked')].map((c) => c.dataset.ms), safeState: A.el('rq-safe').value.trim(), timeToSafeState: A.el('rq-tts').value.trim(), detection: A.el('rq-det').value.trim(), allocation: A.el('rq-alloc').value.trim(), verificationMethod: A.el('rq-ver').value, verificationNote: A.el('rq-vernote').value.trim(), rationale: A.el('rq-rat').value.trim(), status: A.el('rq-status').value, srac: { receiver: A.el('rq-srac-recv').value.trim(), origin: A.el('rq-srac-orig').value.trim(), verification: A.el('rq-srac-ver').value.trim() } };
    const saved = await A.saveRequirement(rec); render(); openRequirement(saved.id); A.toast('Gespeichert');
  };
  if (A.el('rq-delete')) A.el('rq-delete').onclick = (e) => { if (e.target.dataset.armed) { A.deleteRequirement(r.id).then(() => { A.closeDrawer(); render(); }); return; } e.target.dataset.armed = '1'; e.target.textContent = 'Wirklich löschen?'; };
}

// -------------------------------------------------------- AI derivation ----
function candidates() { return accepted().filter((h) => (h.measures || []).some((m) => m.status === 'accepted') && !A.state.proposals.requirements[h.id] && !A.state.requirements.some((r) => (r.hazards || []).includes(h.id))); }

async function runBatch(list) {
  if (A.state.run) { A.toast('Es läuft bereits ein KI-Lauf', 'err'); return; }
  const pre = await A.checkProvider(); if (!pre.ok) { A.toast(`KI-Anbieter nicht erreichbar: ${pre.error || pre.message || ''}`, 'err'); return; }
  if (!A.aiAllowed()) return;
  const abort = new AbortController(); const runState = A.runState(); runState.tracker.start(Date.now()); A.state.run = { abort, runState };
  const prog = A.el('rq-progress'); prog.classList.remove('hidden'); A.el('btn-rq-cancel').classList.remove('hidden');
  const modelName = A.settings.provider === 'ollama' ? A.settings.ollamaModel : A.settings.mistralModel;
  let done = 0, failed = 0; const t0 = Date.now();
  for (const h of list) {
    if (abort.signal.aborted) break;
    prog.querySelector('.bar').style.width = `${Math.round((done / list.length) * 100)}%`; prog.querySelector('.txt').textContent = `${done + 1}/${list.length} ${h.id} … (${Math.round((Date.now() - t0) / 1000)} s)`;
    try { const r = await E.runRequirements({ hazard: h, ctx: A.ctx(), ...A.provider(), runState, signal: abort.signal }); A.state.proposals.requirements[h.id] = { requirements: r, at: M.nowIso(), model: modelName }; await A.saveProposals(); done++; }
    catch (e) { failed++; if (runState.breaker.tripped()) { A.toast(`Abbruch: ${e.message}`, 'err'); break; } }
    renderProposals();
  }
  await A.addRun({ runId: 'run_' + Date.now().toString(36), mode: 'requirements', model: modelName, provider: A.settings.provider, startedAt: new Date(t0).toISOString(), finishedAt: M.nowIso(), calls: runState.tracker.calls, inputTokens: runState.tracker.inputTokens, outputTokens: runState.tracker.outputTokens, passes: [], cancelled: abort.signal.aborted, totals: { proposed: done, passes: list.length, failed } });
  A.state.run = null; prog.classList.add('hidden'); A.el('btn-rq-cancel').classList.add('hidden');
  A.toast(`${done} Vorschlagssätze erzeugt${failed ? `, ${failed} fehlgeschlagen` : ''}`); render();
}

function renderProposals() {
  let box = A.el('rq-proposals');
  if (!box) { box = document.createElement('div'); box.id = 'rq-proposals'; A.el('rq-tabs').insertAdjacentElement('beforebegin', box); }
  const entries = Object.entries(A.state.proposals.requirements || {});
  if (!entries.length) { box.innerHTML = ''; return; }
  box.innerHTML = entries.map(([hid, p]) => `<div class="proposal" data-hid="${hid}"><h4>KI-Vorschlag Anforderungen für ${A.esc(A.hzTitle(hid))} (${A.fmtDate(p.at)}, ${A.esc(p.model)})</h4>${p.requirements.map((r, i) => `<div class="sub-list"><label class="chk"><input type="checkbox" data-pr="${i}" checked/> <b>${A.esc(r.title)}</b> · ${A.esc(M.label('reqCategory', r.category))}${r.srac.receiver ? ` → ${A.esc(r.srac.receiver)}` : ''}</label><div>${A.esc(r.text)}</div><small>${r.functions.length ? `Funktionen: ${A.esc(r.functions.join(', '))} · ` : ''}${r.safeState ? `Sicherer Zustand: ${A.esc(r.safeState)} · ` : ''}${r.timeToSafeState ? `Zeit: ${A.esc(r.timeToSafeState)} · ` : ''}Verifikation: ${A.esc(M.label('verification', r.verificationMethod))}${r.verificationNote ? ` (${A.esc(r.verificationNote)})` : ''}<br>${A.esc(r.rationale)}</small></div>`).join('')}<div class="row"><button class="btn primary" data-apply="${hid}">Markierte übernehmen (Entwurf)</button><button class="btn" data-discard="${hid}">Verwerfen</button></div></div>`).join('');
  box.querySelectorAll('[data-apply]').forEach((b) => { b.onclick = async () => { const hid = b.dataset.apply; const p = A.state.proposals.requirements[hid]; const card = b.closest('[data-hid]'); const picked = [...card.querySelectorAll('[data-pr]:checked')].map((c) => p.requirements[Number(c.dataset.pr)]); if (picked.length) await A.createRequirements(picked); delete A.state.proposals.requirements[hid]; await A.saveProposals(); render(); A.toast(`${picked.length} Anforderungen als Entwurf angelegt`); }; });
  box.querySelectorAll('[data-discard]').forEach((b) => { b.onclick = async () => { delete A.state.proposals.requirements[b.dataset.discard]; await A.saveProposals(); render(); }; });
}

// ---------------------------------------------------- functions & SIL ----
function renderFunctionsSil() {
  const tb = A.el('tbl-fn-sil').querySelector('tbody');
  const hz = accepted();
  tb.innerHTML = A.state.functions.map((f) => {
    const integ = M.functionIntegrity(f);
    const related = hz.filter((h) => (h.functions || []).includes(h.id ? f.id : ''));
    const notes = [];
    if (integ.note) notes.push(integ.note);
    if (integ.boundary) notes.push('TFFR liegt exakt auf der Basisintegritäts-Schwelle 10⁻⁵/h — Einstufung bitte bestätigen (EN 50126-2 10.2.7).');
    for (const h of hz.filter((x) => (x.functions || []).includes(f.id))) { const chk = M.checkHazardAllocation(h, A.state.functions, A.state.ccas); for (const fnd of chk.findings) notes.push(`${h.id}: ${fnd.text}`); if (chk.mode === 'and') notes.push(`${h.id}: UND-Anrechnung über ${chk.cca} (TFFR-Aufteilung zulässig; SIL nicht aufteilbar).`); }
    const thrs = hz.filter((x) => (x.functions || []).includes(f.id) && x.thr && x.thr.valuePerHour != null).map((x) => `${x.id}: THR ${M.formatRate(Number(x.thr.valuePerHour))}`);
    return `<tr data-id="${f.id}"><td class="id">${f.id}</td><td><span class="title">${A.esc(f.name)}</span></td><td>${A.esc(M.label('functionKind', f.kind))}</td><td>${f.safetyRelated === true ? 'ja' : f.safetyRelated === false ? 'nein' : '?'}</td><td><input class="mono" data-tffr="${f.id}" value="${f.tffr != null ? A.esc(String(f.tffr)) : ''}" placeholder="z. B. 1e-7" style="width:110px"${f.kind === 'mechanical' || f.kind === 'procedural' || f.safetyRelated === false ? ' disabled' : ''} /></td><td>${A.pill(integ.integrity === 'undetermined' ? 'gray' : integ.integrity === 'belowRange' ? 'dup' : 'accepted', M.label('integrity', integ.integrity))}</td><td class="mono">${hz.filter((x) => (x.functions || []).includes(f.id)).map((x) => x.id).join(', ') || '–'}${thrs.length ? `<br><span class="hint">${thrs.map(A.esc).join('; ')}</span>` : ''}</td><td class="hint">${[...new Set(notes)].map(A.esc).join('<br>') || '–'}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="hint">Keine Funktionen (Stufe 1).</td></tr>';
  tb.querySelectorAll('[data-tffr]').forEach((inp) => { inp.onchange = async () => { const f = A.state.functions.find((x) => x.id === inp.dataset.tffr); const v = inp.value.trim(); const n = v ? M.parseRate(v) : null; if (v && n == null) { A.toast('TFFR nicht lesbar (z. B. 1e-7)', 'err'); return; } f.tffr = n; await A.saveFunction(f); renderFunctionsSil(); A.refresh(); }; });
}

// ------------------------------------------------------------------ SRAC ----
function renderSrac() {
  const tb = A.el('tbl-srac').querySelector('tbody');
  const sracs = A.state.requirements.filter((r) => r.category === 'srac');
  const cands = accepted().flatMap((h) => [...(h.existingBarriers || []).filter((b) => b.becomesSrac).map((b) => ({ h, text: b.text, kind: 'Barriere außerhalb der Systemgrenze' })), ...(h.measures || []).filter((m) => m.status === 'accepted' && m.becomesSrac).map((m) => ({ h, text: m.text, kind: `Maßnahme ${m.id} außerhalb der Systemgrenze` }))]).filter((c) => !sracs.some((s) => (s.hazards || []).includes(c.h.id) && s.text.includes(c.text.slice(0, 30))));
  tb.innerHTML = sracs.map((r) => `<tr data-id="${r.id}"><td class="id">${r.id}</td><td><span class="title">${A.esc(r.title)}</span><span class="desc">${A.esc(r.text)}</span></td><td>${A.esc(r.srac && r.srac.receiver || '')}</td><td class="mono">${A.esc((r.hazards || []).join(', '))}</td><td>${A.esc(r.srac && r.srac.origin || '')}</td><td>${A.esc(r.srac && r.srac.verification || M.label('verification', r.verificationMethod))}</td><td>${A.pill(r.status === 'agreed' ? 'accepted' : 'pending', M.label('reqStatus', r.status))}</td></tr>`).join('') + cands.map((c) => `<tr class="cand"><td class="id">–</td><td><span class="title">Kandidat: ${A.esc(c.text)}</span><span class="desc">${A.esc(c.kind)} bei ${A.esc(c.h.id)}</span></td><td colspan="4" class="hint">Noch nicht als SRAC formuliert.</td><td><button class="btn small" data-mk-srac="${c.h.id}" data-text="${A.esc(c.text)}">SRAC anlegen</button></td></tr>`).join('') || '<tr><td colspan="7" class="hint">Keine SRAC und keine Kandidaten.</td></tr>';
  tb.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => openRequirement(tr.dataset.id); });
  tb.querySelectorAll('[data-mk-srac]').forEach((b) => { b.onclick = async () => { const rec = await A.saveRequirement(M.makeRequirement({ category: 'srac', title: b.dataset.text.slice(0, 80), text: `Der Empfänger muss sicherstellen: ${b.dataset.text}`, hazards: [b.dataset.mkSrac], verificationMethod: 'inspection', srac: { receiver: '', origin: `Gefährdung ${b.dataset.mkSrac}`, verification: '' }, source: 'manual' })); render(); openRequirement(rec.id); }; });
}

// ------------------------------------------------------------- trace ----
function renderTrace() {
  const tr = M.traceability({ hazards: A.state.hazards, requirements: A.state.requirements, functions: A.state.functions });
  const box = A.el('trace-view');
  box.innerHTML = `<div class="kpis"><div class="kpi"><b>${tr.hazardRows.length}</b><span>übernommene Gefährdungen</span></div><div class="kpi"><b>${tr.hazardsWithoutRequirement.length}</b><span>ohne Anforderung (nicht w. akz.)</span></div><div class="kpi"><b>${tr.orphanRequirements.length}</b><span>Anforderungen ohne Gefährdung</span></div><div class="kpi"><b>${tr.hazardRows.reduce((n, r) => n + r.measuresWithoutRequirement.length, 0)}</b><span>Maßnahmen ohne Anforderung</span></div></div>
<div class="table-wrap"><table class="grid"><thead><tr><th class="w-id">Gefährdung</th><th>Titel</th><th class="w-m">Risiko → Rest</th><th class="w-m">Funktionen</th><th>Maßnahmen</th><th>Anforderungen</th></tr></thead><tbody>${tr.hazardRows.map((row) => `<tr><td class="id">${row.hazard.id}</td><td>${A.esc(row.hazard.title)}</td><td>${A.riskPill(row.hazard.riskClass)} → ${A.riskPill(row.hazard.residualRiskClass)}</td><td class="mono">${row.functions.map((f) => `${f.id} <span class="hint">${A.esc(M.label('integrity', M.functionIntegrity(f).integrity))}</span>`).join('<br>') || '–'}</td><td>${(row.hazard.measures || []).filter((m) => m.status !== 'rejected').map((m) => `<span class="mono">${m.id}</span> ${A.esc(m.text.slice(0, 60))}${row.measuresWithoutRequirement.includes(m) ? ' <span class="pill dup">ohne Anf.</span>' : ''}`).join('<br>') || '–'}</td><td>${row.requirements.map((r) => `<span class="mono">${r.id}</span> ${A.esc(r.title.slice(0, 60))} <span class="pill gray">${A.esc(M.label('reqCategory', r.category).split(' ')[0])}</span>`).join('<br>') || (row.hazard.broadlyAcceptable && row.hazard.broadlyAcceptable.decision === true ? '<span class="hint">weitgehend akzeptabel — keine Anforderung nötig</span>' : '<span class="pill dup">keine</span>')}</td></tr>`).join('')}</tbody></table></div>
${tr.orphanRequirements.length ? `<p class="hint">Anforderungen ohne Gefährdungsbezug: ${tr.orphanRequirements.map((r) => r.id).join(', ')}</p>` : ''}`;
}

// -------------------------------------------------------------------- CCA ----
function renderCca() {
  const tb = A.el('tbl-cca').querySelector('tbody');
  tb.innerHTML = A.state.ccas.map((c) => `<tr data-id="${c.id}"><td class="id">${c.id}</td><td class="mono">${A.esc((c.functions || []).join(', '))}</td><td>${c.randomIndependence ? 'ja' : 'nein'}</td><td>${c.systematicIndependence ? 'ja' : 'nein'}</td><td>${A.pill(c.outcome === 'independent' ? 'accepted' : 'dup', c.outcome === 'independent' ? 'unabhängig' : 'abhängig')}</td><td>${A.esc(c.evidenceRef)}${c.assumptions && c.assumptions.length ? `<br><span class="hint">${c.assumptions.map(A.esc).join('; ')}</span>` : ''}</td><td class="actions"><button class="btn icon" data-edit="${c.id}">✎</button><button class="btn icon" data-del="${c.id}">🗑</button></td></tr>`).join('') || '<tr><td colspan="7" class="hint">Keine CCA-Nachweise. Ohne Nachweis gilt für mehrere Funktionen je Gefährdung die ODER-Summe.</td></tr>';
  tb.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openCca(A.state.ccas.find((c) => c.id === b.dataset.edit)); });
  tb.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { await A.deleteCca(b.dataset.del); render(); }; });
}
function openCca(c) {
  const rec = c || M.makeCca();
  A.openDrawer(rec.id ? `${rec.id}` : 'Neuer CCA-Nachweis', `
<p class="hint">EN 50126-2 10.2.2 / 11.4, EN 50129 A.4.3.4–A.4.3.6: Jede Funktion muss die Gefährdung allein verhindern können; keine gemeinsamen zufälligen UND systematischen Ursachen; Diversität; keine Abhängigkeit von den Ausgängen der anderen; Fehlererkennung und sicherer Zustand innerhalb der zulässigen Zeit.</p>
<div class="f"><label>Funktionen (≥ 2)</label><div>${A.state.functions.map((f) => `<label class="chk"><input type="checkbox" data-fn="${f.id}"${(rec.functions || []).includes(f.id) ? ' checked' : ''}/> ${f.id} ${A.esc(f.name)}</label>`).join('<br>')}</div></div>
<div class="f"><label>Unabhängig von gemeinsamen zufälligen Ursachen</label><select id="cca-rand">${A.opts({ false: 'nein / nicht nachgewiesen', true: 'ja, nachgewiesen' }, String(!!rec.randomIndependence))}</select></div>
<div class="f"><label>Unabhängig von gemeinsamen systematischen Ursachen</label><select id="cca-sys">${A.opts({ false: 'nein / nicht nachgewiesen', true: 'ja, nachgewiesen' }, String(!!rec.systematicIndependence))}</select></div>
<div class="f"><label>Nachweisdokument / Referenz</label><input id="cca-ev" value="${A.esc(rec.evidenceRef)}" /></div>
<div class="f"><label>Annahmen (eine je Zeile → werden SRAC-Kandidaten)</label><textarea id="cca-ass" rows="3">${A.esc((rec.assumptions || []).join('\n'))}</textarea></div>
<div class="f"><label>Anmerkungen</label><textarea id="cca-notes" rows="2">${A.esc(rec.notes)}</textarea></div>
<div class="sticky-actions"><button id="cca-save" class="btn primary">Speichern</button><button id="cca-cancel" class="btn">Abbrechen</button></div>`);
  A.el('cca-cancel').onclick = A.closeDrawer;
  A.el('cca-save').onclick = async () => { const fns = [...document.querySelectorAll('#drawer-body [data-fn]:checked')].map((x) => x.dataset.fn); if (fns.length < 2) { A.toast('Mindestens zwei Funktionen', 'err'); return; } const rand = A.el('cca-rand').value === 'true', sys = A.el('cca-sys').value === 'true'; await A.saveCca({ ...rec, functions: fns, randomIndependence: rand, systematicIndependence: sys, outcome: rand && sys ? 'independent' : 'dependent', evidenceRef: A.el('cca-ev').value.trim(), assumptions: A.el('cca-ass').value.split('\n').map((l) => l.trim()).filter(Boolean), notes: A.el('cca-notes').value.trim() }); A.closeDrawer(); render(); };
}

function render() { renderFilters(); renderTable(); renderProposals(); renderFunctionsSil(); renderSrac(); renderTrace(); renderCca(); const c = candidates().length; A.el('btn-rq-batch').textContent = `KI: Anforderungen ableiten (${c})`; A.el('btn-rq-batch').disabled = !c; }

A.stages.requirements = {
  render, open: openRequirement,
  bind() {
    A.tabs('rq-tabs');
    ['rq-search', 'rq-f-category', 'rq-f-status', 'rq-f-hazard'].forEach((id) => { A.el(id).oninput = renderTable; A.el(id).onchange = renderTable; });
    A.el('btn-add-requirement').onclick = () => openRequirement(null);
    A.el('btn-add-cca').onclick = () => openCca(null);
    const confirm = A.el('btn-rq-confirm');
    A.el('btn-rq-batch').onclick = () => { const c = candidates(); confirm.textContent = `Bestätigen: ${c.length} KI-Aufrufe`; confirm.classList.remove('hidden'); confirm.onclick = () => { confirm.classList.add('hidden'); runBatch(c); }; };
    A.el('btn-rq-cancel').onclick = () => { if (A.state.run) A.state.run.abort.abort(); };
  },
};
})();

