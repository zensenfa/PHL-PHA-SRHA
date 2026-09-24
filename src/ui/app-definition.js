// Stage 1: Systemdefinition — the EN 50126-1 7.3.2.1 / Annex D record, plus
// functions, interfaces, subsystems, modes and reference documents. The AI
// decomposition lands as a proposal box; nothing is written until accepted.
(function () {
const A = window.RHAS_APP, M = window.RHAS_MODEL, DATA = window.RHAS_DATA, E = window.RHAS_ENGINE, DOCS = window.RHAS_DOCUMENTS;

const GROUPS = [
  { title: 'Zweck und Mission', keys: ['name', 'type', 'purpose', 'missionProfile', 'description', 'includedFunctions', 'excludedFunctions', 'lifetime'] },
  { title: 'Systemgrenze und Umgebung', keys: ['boundary', 'location', 'physicalEnvironment', 'infrastructureConstraints', 'assumptions'] },
  { title: 'Betrieb und Instandhaltung', keys: ['operatingStrategy', 'operatingConditions', 'personnel', 'humanActivitiesExcludedReason', 'maintenanceStrategy', 'logistics', 'pastExperience'] },
  { title: 'Sicherheitsrahmen', keys: ['existingSafetyMeasures', 'applicableStandards', 'referenceSystems', 'legalFramework', 'deviationsFromReference'] },
];
const SHORT = new Set(['name', 'type', 'lifetime']);

function renderForm() {
  const sd = A.state.sd;
  const form = A.el('def-form');
  form.innerHTML = GROUPS.map((g) => `<fieldset><legend>${g.title}</legend>${g.keys.map((k) => { const f = M.SYSTEM_DEFINITION_FIELDS.find((x) => x.key === k); const val = sd[k] || ''; return `<div class="f${f.norm === 'N' && !val.trim() ? ' missing' : ''}"><label for="sd-${k}">${A.esc(f.label)}<span class="ref">${f.norm === 'N' ? '<span class="norm">N</span> ' : ''}${A.esc(f.ref)}</span></label>${SHORT.has(k) ? `<input id="sd-${k}" data-key="${k}" value="${A.esc(val)}" />` : `<textarea id="sd-${k}" data-key="${k}" rows="${val.length > 160 ? 4 : 2}">${A.esc(val)}</textarea>`}</div>`; }).join('')}</fieldset>`).join('');
  form.querySelectorAll('[data-key]').forEach((inp) => { inp.onchange = async () => { sd[inp.dataset.key] = inp.value; await A.saveSd(); inp.closest('.f').classList.toggle('missing', M.SYSTEM_DEFINITION_FIELDS.find((x) => x.key === inp.dataset.key).norm === 'N' && !inp.value.trim()); renderCompleteness(); A.refresh(); }; });
}

function renderCompleteness() {
  const v = M.validateSystemDefinition(A.state.sd, A.state.functions);
  const b = A.el('def-completeness');
  b.textContent = `${v.filled}/${v.total} Felder · ${v.ok ? 'bereit für Stufe 2' : `${v.findings.filter((f) => f.level === 'error').length} Pflichtangaben offen`}`;
  b.className = `badge ${v.ok ? 'ok' : 'warn'}`;
  return v;
}

function showFindings(v) {
  const box = A.el('def-findings');
  box.classList.remove('hidden');
  box.className = `findings ${v.ok ? 'ok' : ''}`;
  box.innerHTML = v.ok ? 'Normatives Minimum der Systemdefinition (EN 50126-1 7.3.2.1 a)–e)) ist ausgefüllt; Funktionen sind definiert. Die Gefährdungsidentifikation kann beginnen.' : `<b>Vor der Gefährdungsidentifikation zu ergänzen:</b><ul>${v.findings.map((f) => `<li class="${f.level}">${A.esc(f.text)}</li>`).join('')}</ul>`;
}

function renderFunctions() {
  const tb = A.el('tbl-functions').querySelector('tbody');
  tb.innerHTML = A.state.functions.map((f) => `<tr data-id="${f.id}"><td class="id">${f.id}</td><td><span class="title">${A.esc(f.name)}</span><span class="desc" title="${A.esc(f.description)}">${A.esc(f.description)}</span></td><td>${A.esc(M.label('functionKind', f.kind))}</td><td>${f.safetyRelated === true ? A.pill('accepted', 'ja') : f.safetyRelated === false ? A.pill('gray', 'nein') : A.pill('pending', 'offen')}</td><td>${A.esc(f.safeState)}</td><td>${A.esc(f.subsystem)}</td><td class="actions"><button class="btn icon" data-act="edit">✎</button><button class="btn icon" data-act="del">🗑</button></td></tr>`).join('') || '<tr><td colspan="7" class="hint">Noch keine Funktionen. „KI: Zerlegung vorschlagen“ oder „+ Funktion“.</td></tr>';
  A.el('cnt-functions').textContent = A.state.functions.length;
  tb.querySelectorAll('button').forEach((b) => { b.onclick = (e) => { const id = e.target.closest('tr').dataset.id; if (b.dataset.act === 'edit') openFunction(A.state.functions.find((f) => f.id === id)); else armDelete(e.target, async () => { await A.deleteFunction(id); render(); }); }; });
  tb.querySelectorAll('tr[data-id]').forEach((tr) => { tr.ondblclick = () => openFunction(A.state.functions.find((f) => f.id === tr.dataset.id)); });
}

function armDelete(btn, fn) {
  if (btn.dataset.armed) { fn(); return; }
  btn.dataset.armed = '1'; btn.textContent = 'Löschen?'; btn.classList.add('danger');
  setTimeout(() => { btn.dataset.armed = ''; btn.textContent = '🗑'; btn.classList.remove('danger'); }, 2500);
}

function openFunction(f) {
  const fn = f || M.makeFunction();
  const modes = DATA.modes.map((m) => `<label class="chk"><input type="checkbox" data-mode="${m.id}"${(fn.modes || []).includes(m.id) ? ' checked' : ''}/> ${A.esc(m.label)}</label>`).join(' ');
  A.openDrawer(fn.id ? `Funktion ${fn.id}` : 'Neue Funktion', `
<div class="f"><label>Name (Verb + Objekt)</label><input id="fn-name" value="${A.esc(fn.name)}" /></div>
<div class="f"><label>Beschreibung (Eingang → Verarbeitung → Ausgang)</label><textarea id="fn-description" rows="3">${A.esc(fn.description)}</textarea></div>
<div class="f"><label>Teilsystem</label><input id="fn-subsystem" list="subsystem-list" value="${A.esc(fn.subsystem)}" /><datalist id="subsystem-list">${A.state.subsystems.map((s) => `<option value="${A.esc(s.name)}">`).join('')}</datalist></div>
<div class="f"><label>Art</label><select id="fn-kind">${A.opts(M.LABELS.functionKind, fn.kind)}</select></div>
<div class="f"><label>Sicherheitsrelevant (EN 50126-2 9.1)</label><select id="fn-sr">${A.opts({ '': 'offen', true: 'ja', false: 'nein' }, fn.safetyRelated == null ? '' : String(fn.safetyRelated))}</select></div>
<div class="f"><label>Begründung</label><textarea id="fn-sr-rationale" rows="2">${A.esc(fn.safetyRelatedRationale)}</textarea></div>
<div class="f"><label>Sicherer Zustand</label><input id="fn-safe" value="${A.esc(fn.safeState)}" /></div>
<div class="f"><label>Eingänge</label><input id="fn-inputs" value="${A.esc(fn.inputs)}" /></div>
<div class="f"><label>Ausgänge</label><input id="fn-outputs" value="${A.esc(fn.outputs)}" /></div>
<div class="f"><label>Betriebsarten</label><div>${modes}</div></div>
<div class="audit">${fn.id ? `${fn.source === 'ai' ? 'KI-Vorschlag' : 'manuell'} · angelegt ${A.fmtDate(fn.createdAt)}${fn.createdBy ? ` von ${A.esc(fn.createdBy)}` : ''} · geändert ${A.fmtDate(fn.updatedAt)}` : ''}</div>
<div class="sticky-actions"><button id="fn-save" class="btn primary">Speichern</button><button id="fn-cancel" class="btn">Abbrechen</button></div>`);
  A.el('fn-cancel').onclick = A.closeDrawer;
  A.el('fn-save').onclick = async () => {
    const name = A.el('fn-name').value.trim(); if (!name) { A.toast('Name fehlt', 'err'); return; }
    const sr = A.el('fn-sr').value;
    const rec = { ...fn, name, description: A.el('fn-description').value.trim(), subsystem: A.el('fn-subsystem').value.trim(), kind: A.el('fn-kind').value, safetyRelated: sr === '' ? null : sr === 'true', safetyRelatedRationale: A.el('fn-sr-rationale').value.trim(), safeState: A.el('fn-safe').value.trim(), inputs: A.el('fn-inputs').value.trim(), outputs: A.el('fn-outputs').value.trim(), modes: [...document.querySelectorAll('#drawer-body [data-mode]:checked')].map((c) => c.dataset.mode) };
    await A.saveFunction(rec); A.closeDrawer(); render(); A.toast('Funktion gespeichert');
  };
}

function renderInterfaces() {
  const tb = A.el('tbl-interfaces').querySelector('tbody');
  const TYPES = { physical: 'Physisch', functional: 'Funktional', human: 'Mensch', externalSystem: 'Fremdsystem', organisation: 'Organisation' };
  tb.innerHTML = A.state.interfaces.map((i) => `<tr data-id="${i.id}"><td class="id">${i.id}</td><td class="title">${A.esc(i.name)}</td><td>${A.esc(TYPES[i.type] || i.type)}</td><td>${A.esc(i.partner)}</td><td>${A.esc(i.description)}</td><td class="actions"><button class="btn icon" data-act="edit">✎</button><button class="btn icon" data-act="del">🗑</button></td></tr>`).join('') || '<tr><td colspan="6" class="hint">Noch keine Schnittstellen.</td></tr>';
  A.el('cnt-interfaces').textContent = A.state.interfaces.length;
  tb.querySelectorAll('button').forEach((b) => { b.onclick = (e) => { const id = e.target.closest('tr').dataset.id; if (b.dataset.act === 'edit') openInterface(A.state.interfaces.find((x) => x.id === id)); else armDelete(e.target, async () => { A.state.interfaces = A.state.interfaces.filter((x) => x.id !== id); await A.saveInterfaces(); render(); }); }; });
}

function openInterface(i) {
  const it = i || { id: '', name: '', type: 'functional', partner: '', description: '' };
  const TYPES = { physical: 'Physisch', functional: 'Funktional', human: 'Mensch', externalSystem: 'Fremdsystem', organisation: 'Organisation' };
  A.openDrawer(it.id ? `Schnittstelle ${it.id}` : 'Neue Schnittstelle', `
<div class="f"><label>Name</label><input id="if-name" value="${A.esc(it.name)}" /></div>
<div class="f"><label>Typ</label><select id="if-type">${A.opts(TYPES, it.type)}</select></div>
<div class="f"><label>Gegenstelle</label><input id="if-partner" value="${A.esc(it.partner)}" /></div>
<div class="f"><label>Beschreibung (Information, Richtung, Zeitbedingungen)</label><textarea id="if-desc" rows="3">${A.esc(it.description)}</textarea></div>
<div class="sticky-actions"><button id="if-save" class="btn primary">Speichern</button><button id="if-cancel" class="btn">Abbrechen</button></div>`);
  A.el('if-cancel').onclick = A.closeDrawer;
  A.el('if-save').onclick = async () => { const name = A.el('if-name').value.trim(); if (!name) { A.toast('Name fehlt', 'err'); return; } const rec = { ...it, id: it.id || A.nextInterfaceId(), name, type: A.el('if-type').value, partner: A.el('if-partner').value.trim(), description: A.el('if-desc').value.trim() }; const idx = A.state.interfaces.findIndex((x) => x.id === rec.id); if (idx >= 0) A.state.interfaces[idx] = rec; else A.state.interfaces.push(rec); await A.saveInterfaces(); A.closeDrawer(); render(); };
}

function renderSubsystems() {
  const tb = A.el('tbl-subsystems').querySelector('tbody');
  tb.innerHTML = A.state.subsystems.map((s, i) => `<tr data-i="${i}"><td><input value="${A.esc(s.name)}" data-k="name" /></td><td><input value="${A.esc(s.description)}" data-k="description" /></td><td class="actions"><button class="btn icon" data-act="del">🗑</button></td></tr>`).join('') || '<tr><td colspan="3" class="hint">Noch keine Teilsysteme.</td></tr>';
  tb.querySelectorAll('input').forEach((inp) => { inp.onchange = async () => { A.state.subsystems[Number(inp.closest('tr').dataset.i)][inp.dataset.k] = inp.value.trim(); await A.saveSubsystems(); }; });
  tb.querySelectorAll('button').forEach((b) => { b.onclick = (e) => armDelete(e.target, async () => { A.state.subsystems.splice(Number(e.target.closest('tr').dataset.i), 1); await A.saveSubsystems(); renderSubsystems(); }); });
}

function renderModes() {
  const box = A.el('modes-list');
  box.innerHTML = DATA.modes.map((m) => `<label><input type="checkbox" data-mode="${m.id}"${(A.state.sd.modes || []).includes(m.id) ? ' checked' : ''}/><span>${A.esc(m.label)}<small>${A.esc(m.description)}</small></span></label>`).join('');
  box.querySelectorAll('input').forEach((c) => { c.onchange = async () => { A.state.sd.modes = [...box.querySelectorAll('input:checked')].map((x) => x.dataset.mode); await A.saveSd(); }; });
}

function renderDocuments() {
  const docs = A.state.sd.documents || [];
  const tb = A.el('tbl-documents').querySelector('tbody');
  tb.innerHTML = docs.map((d, i) => `<tr data-i="${i}"><td class="title">${A.esc(d.name)}</td><td class="mono">${(d.text || '').length.toLocaleString('de-DE')}</td><td class="hint">${A.esc(d.note || '')}</td><td class="actions"><button class="btn icon" data-act="del">🗑</button></td></tr>`).join('') || '<tr><td colspan="4" class="hint">Keine Dokumente.</td></tr>';
  A.el('cnt-documents').textContent = docs.length;
  tb.querySelectorAll('button').forEach((b) => { b.onclick = (e) => armDelete(e.target, async () => { A.state.sd.documents.splice(Number(e.target.closest('tr').dataset.i), 1); await A.saveSd(); renderDocuments(); }); });
}

async function ingestFiles(files) {
  const status = A.el('doc-status');
  for (const file of files) {
    status.textContent = `Lese ${file.name}…`;
    try {
      const r = await DOCS.ingestFile(file, (page, total) => { status.textContent = `Lese ${file.name}: Seite ${page}/${total}`; });
      const text = r.text || r.extractedText || '';
      if (!text.trim()) { status.textContent = `${file.name}: kein Text extrahierbar (gescanntes PDF?). Text manuell einfügen.`; continue; }
      A.state.sd.documents = A.state.sd.documents || [];
      A.state.sd.documents.push({ name: file.name, text, note: r.note || r.truncationNote || (r.truncated ? 'gekürzt' : ''), addedAt: M.nowIso() });
      await A.saveSd();
      status.textContent = `${file.name}: ${text.length.toLocaleString('de-DE')} Zeichen übernommen.`;
    } catch (e) { status.textContent = `${file.name}: ${e.message}`; }
  }
  renderDocuments();
}

function bindDocuments() {
  const zone = A.el('doc-dropzone'), input = A.el('doc-file-input');
  input.onchange = (e) => { ingestFiles([...e.target.files]); e.target.value = ''; };
  zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('over'); ingestFiles([...e.dataTransfer.files]); };
  A.el('btn-doc-paste').onclick = async () => { const name = A.el('doc-paste-name').value.trim() || 'Eingefügter Text'; const text = A.el('doc-paste-text').value; if (!text.trim()) return; A.state.sd.documents = A.state.sd.documents || []; A.state.sd.documents.push({ name, text, note: 'manuell eingefügt', addedAt: M.nowIso() }); await A.saveSd(); A.el('doc-paste-text').value = ''; renderDocuments(); };
}

// ---- AI decomposition proposal ----
function renderDecomposition() {
  const box = A.el('decompose-box');
  const p = A.state.proposals.decomposition;
  if (!p) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = `<h4>KI-Vorschlag: Systemzerlegung (${p.functions.length} Funktionen, ${p.interfaces.length} Schnittstellen, ${p.subsystems.length} Teilsysteme) — ${A.fmtDate(p.at)}, ${A.esc(p.model)}</h4>
<table class="grid"><thead><tr><th></th><th>Funktion</th><th>Art</th><th>Sich.-rel.</th><th>Sicherer Zustand</th><th>Teilsystem</th></tr></thead><tbody>${p.functions.map((f, i) => `<tr><td><input type="checkbox" data-fn="${i}" checked /></td><td><b>${A.esc(f.name)}</b><span class="desc" title="${A.esc(f.description)}">${A.esc(f.description)}</span></td><td>${A.esc(M.label('functionKind', f.kind))}</td><td>${f.safetyRelated === true ? 'ja' : f.safetyRelated === false ? 'nein' : '?'}</td><td>${A.esc(f.safeState)}</td><td>${A.esc(f.subsystem)}</td></tr>`).join('')}</tbody></table>
<table class="grid"><thead><tr><th></th><th>Schnittstelle</th><th>Typ</th><th>Gegenstelle</th><th>Beschreibung</th></tr></thead><tbody>${p.interfaces.map((x, i) => `<tr><td><input type="checkbox" data-if="${i}" checked /></td><td><b>${A.esc(x.name)}</b></td><td>${A.esc(x.type)}</td><td>${A.esc(x.partner)}</td><td>${A.esc(x.description)}</td></tr>`).join('')}</tbody></table>
${p.assumptions.length ? `<p><b>Annahmen der KI:</b> ${p.assumptions.map(A.esc).join(' · ')}</p>` : ''}${p.openQuestions.length ? `<p><b>Offene Fragen:</b> ${p.openQuestions.map(A.esc).join(' · ')}</p>` : ''}
<div class="row"><button id="dec-accept" class="btn primary">Markierte übernehmen</button><button id="dec-discard" class="btn">Vorschlag verwerfen</button><span class="hint">Übernommene Funktionen erhalten Herkunft „KI-Vorschlag“; Annahmen werden an die Systemdefinition angehängt.</span></div>`;
  A.el('dec-discard').onclick = async () => { A.state.proposals.decomposition = null; await A.saveProposals(); renderDecomposition(); };
  A.el('dec-accept').onclick = async () => {
    const fns = [...box.querySelectorAll('[data-fn]:checked')].map((c) => p.functions[Number(c.dataset.fn)]);
    const ifs = [...box.querySelectorAll('[data-if]:checked')].map((c) => p.interfaces[Number(c.dataset.if)]);
    if (fns.length) await A.createFunctions(fns.map((f) => ({ ...f, source: 'ai' })));
    for (const x of ifs) A.state.interfaces.push({ ...x, id: A.nextInterfaceId() });
    await A.saveInterfaces();
    for (const s of p.subsystems) if (!A.state.subsystems.some((x) => x.name === s.name)) A.state.subsystems.push(s);
    await A.saveSubsystems();
    if (p.assumptions.length) { A.state.sd.assumptions = [A.state.sd.assumptions, ...p.assumptions.map((a) => `KI-Annahme: ${a}`)].filter(Boolean).join('\n'); await A.saveSd(); }
    A.state.proposals.decomposition = null; await A.saveProposals();
    render(); A.toast(`${fns.length} Funktionen, ${ifs.length} Schnittstellen übernommen`);
  };
}

async function decompose() {
  const btn = A.el('btn-decompose');
  if (!A.state.sd.description.trim()) { A.toast('Bitte zuerst eine Systembeschreibung eintragen', 'err'); return; }
  if (!A.aiAllowed()) return;
  btn.disabled = true; btn.textContent = 'KI arbeitet…';
  try {
    const r = await E.runDecomposition({ ctx: A.ctx(), ...A.provider(), runState: A.runState() });
    A.state.proposals.decomposition = { ...r, at: M.nowIso(), model: A.settings.provider === 'ollama' ? A.settings.ollamaModel : A.settings.mistralModel };
    await A.saveProposals(); renderDecomposition();
  } catch (e) { A.toast(`Zerlegung fehlgeschlagen: ${e.message}`, 'err'); }
  btn.disabled = false; btn.textContent = 'KI: Zerlegung vorschlagen';
}

function render() { renderForm(); renderCompleteness(); renderFunctions(); renderInterfaces(); renderSubsystems(); renderModes(); renderDocuments(); renderDecomposition(); A.el('def-findings').classList.add('hidden'); }

A.stages.definition = {
  render,
  bind() {
    A.tabs('def-tabs'); bindDocuments();
    A.el('btn-def-check').onclick = () => showFindings(renderCompleteness());
    A.el('btn-decompose').onclick = decompose;
    A.el('btn-add-function').onclick = () => openFunction(null);
    A.el('btn-add-interface').onclick = () => openInterface(null);
    A.el('btn-add-subsystem').onclick = async () => { A.state.subsystems.push({ name: 'Neues Teilsystem', description: '' }); await A.saveSubsystems(); renderSubsystems(); };
  },
};
})();

