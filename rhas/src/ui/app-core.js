// UI core: shared state, persistence helpers, navigation, drawer, toasts,
// provider settings, project management. Stage modules (app-*.js) register
// themselves on window.RHAS_APP.stages and are rendered through refresh().
// No native dialogs anywhere; every confirmation is an inline arm-then-confirm.
(function () {
const M = window.RHAS_MODEL, DB = window.RHAS_DB, PIPE = window.RHAS_LLM_PIPELINE, DATA = window.RHAS_DATA, PROFILE = window.RHAS_PROFILE;
const A = window.RHAS_APP = {
  stages: {},
  state: {
    projects: [], project: null, pdb: null,
    sd: M.makeSystemDefinition(), functions: [], interfaces: [], subsystems: [], hazards: [], requirements: [], ccas: [], runs: [],
    proposals: { analysis: {}, measures: {}, requirements: {}, decomposition: null },
    docControl: { docId: '', revision: 'A', date: '', author: '', verifier: '', validator: '', dutyHolder: '', supplier: '', purpose: '' },
    identConfig: { depth: 'standard', overrides: {}, sources: null },
    stage: 'definition', drawer: null, run: null,
  },
  settings: null,
};

// ---------------------------------------------------------------- helpers ----
A.el = (id) => document.getElementById(id);
A.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
A.label = M.label;
A.fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
A.today = () => new Date().toISOString().slice(0, 10);
A.opts = (map, selected, empty) => (empty != null ? `<option value="">${A.esc(empty)}</option>` : '') + Object.entries(map).map(([k, v]) => `<option value="${A.esc(k)}"${k === selected ? ' selected' : ''}>${A.esc(v)}</option>`).join('');
A.pill = (cls, text) => `<span class="pill ${A.esc(cls)}">${A.esc(text)}</span>`;
A.riskPill = (rc) => (rc ? A.pill(rc, M.label('riskClass', rc)) : '<span class="pill gray">–</span>');
A.fnName = (id) => { const f = A.state.functions.find((x) => x.id === id); return f ? `${f.id} ${f.name}` : id; };
A.ifName = (id) => { const i = A.state.interfaces.find((x) => x.id === id); return i ? `${i.id} ${i.name}` : id; };
A.hzTitle = (id) => { const h = A.state.hazards.find((x) => x.id === id); return h ? `${h.id} ${h.title}` : id; };
A.author = () => (A.el('doc-author').value || '').trim();
A.sourceById = (id) => DATA.sources.find((s) => s.id === id);
A.sourceLabel = (id) => { const s = A.sourceById(id); return s ? `${s.code} ${s.title}` : (id || '–'); };
A.download = (bytes, filename, mime) => { const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime || 'application/octet-stream' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
A.slug = (s) => String(s || 'projekt').replace(/[^\wäöüÄÖÜß-]+/g, '_').slice(0, 60);

let toastTimer = null;
A.toast = (msg, kind = '') => { const t = A.el('toast'); t.textContent = msg; t.className = `toast ${kind}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), kind === 'err' ? 6000 : 3000); };

/** Arm-then-confirm: first click shows the confirm button with a label, second click runs. */
A.arm = (armBtn, confirmBtn, cancelBtn, label, onConfirm) => {
  armBtn.onclick = () => { confirmBtn.textContent = label(); confirmBtn.classList.remove('hidden'); if (cancelBtn) cancelBtn.classList.remove('hidden'); armBtn.classList.add('hidden'); };
  const reset = () => { confirmBtn.classList.add('hidden'); if (cancelBtn) cancelBtn.classList.add('hidden'); armBtn.classList.remove('hidden'); };
  confirmBtn.onclick = async () => { reset(); await onConfirm(); };
  if (cancelBtn) cancelBtn.onclick = reset;
  return reset;
};

A.tabs = (containerId) => {
  const c = A.el(containerId);
  const section = c.parentElement;
  c.querySelectorAll('.tab').forEach((b) => { b.onclick = () => { c.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b)); section.querySelectorAll(':scope > .tab-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.tab)); }; });
};

// --------------------------------------------------------------- settings ----
const SETTINGS_KEY = 'rhas_settings';
A.loadSettings = () => { try { A.settings = { provider: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'mistral-small3.2:latest', mistralModel: 'mistral-large-latest', mistralApiKey: '', softCapCalls: 80, hardCapCalls: 300, ollamaNumCtx: 32768, ollamaThink: 'auto', ollamaKeepAlive: '30m', compatUrl: 'http://127.0.0.1:1234', compatModel: '', compatApiKey: '', splitGuidewords: 'off', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { A.settings = { provider: 'ollama', ollamaUrl: 'http://localhost:11434', ollamaModel: 'mistral-small3.2:latest', mistralModel: 'mistral-large-latest', mistralApiKey: '', softCapCalls: 80, hardCapCalls: 300, ollamaNumCtx: 32768, ollamaThink: 'auto', ollamaKeepAlive: '30m', compatUrl: 'http://127.0.0.1:1234', compatModel: '', compatApiKey: '', splitGuidewords: 'off' }; } };
A.saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(A.settings));
A.provider = () => { const g = PROFILE.aiProviderAllowed(A.state.projectProfile, A.settings.provider, A.settings); return { provider: A.settings.provider, settings: { ...A.settings, blockedReason: g.ok ? '' : g.reason } }; };
/** WP2: confidential projects may only use a local model; call before starting any AI action. */
A.aiAllowed = () => { const g = PROFILE.aiProviderAllowed(A.state.projectProfile, A.settings.provider, A.settings); if (!g.ok) A.toast(g.reason, 'err'); return g.ok; };
A.runState = () => PIPE.createRunState({ softCapCalls: Number(A.settings.softCapCalls) || 80, hardCapCalls: Number(A.settings.hardCapCalls) || 300 });

A.checkProvider = async () => {
  const dot = A.el('provider-dot'), lab = A.el('provider-label');
  dot.className = 'dot'; lab.textContent = 'KI: prüfe…';
  try {
    const r = await PIPE.preflight(A.settings.provider, A.settings);
    if (r.ok) { dot.classList.add('ok'); lab.textContent = `KI: ${A.settings.provider === 'ollama' ? A.settings.ollamaModel : A.settings.provider === 'openai-compat' ? (A.settings.compatModel || 'lokaler Server') : A.settings.mistralModel}${A.settings.provider === 'mistral-api' ? '' : ' · offline'}`; A.el('btn-provider').title = 'Verbindung OK'; }
    else { dot.classList.add('err'); lab.textContent = 'KI: Fehler'; A.el('btn-provider').title = r.error || r.message || 'Fehler'; }
    if (r.models && A.el('ollama-models')) A.el('ollama-models').innerHTML = r.models.map((m) => `<option value="${A.esc(m)}">`).join('');
    if (r.models && A.el('compat-models')) A.el('compat-models').innerHTML = r.models.map((m) => `<option value="${A.esc(m)}">`).join('');
    if (!r.ok && location.protocol === 'file:' && A.settings.provider !== 'mistral-api') r.message = `${r.message || ''} Hinweis: Aufruf aus file:// wird von Ollama ohne passende OLLAMA_ORIGINS abgelehnt – Anwendung über den Starter (http://127.0.0.1:8765) öffnen.`;
    return r;
  } catch (e) { dot.classList.add('err'); lab.textContent = 'KI: Fehler'; A.el('btn-provider').title = e.message; return { ok: false, error: e.message }; }
};

function bindSettings() {
  const p = A.el('settings-panel');
  const fill = () => { A.el('set-provider').value = A.settings.provider; A.el('set-ollama-url').value = A.settings.ollamaUrl; A.el('set-ollama-model').value = A.settings.ollamaModel; A.el('set-mistral-model').value = A.settings.mistralModel; A.el('set-mistral-key').value = A.settings.mistralApiKey; A.el('set-soft-calls').value = A.settings.softCapCalls; A.el('set-hard-calls').value = A.settings.hardCapCalls; A.el('set-ollama-ctx').value = A.settings.ollamaNumCtx; A.el('set-ollama-think').value = A.settings.ollamaThink; A.el('set-ollama-keep').value = A.settings.ollamaKeepAlive; A.el('set-compat-url').value = A.settings.compatUrl; A.el('set-compat-model').value = A.settings.compatModel; A.el('set-compat-key').value = A.settings.compatApiKey; A.el('set-split-gw').value = A.settings.splitGuidewords; A.el('file-origin-warning').classList.toggle('hidden', !(location.protocol === 'file:' && A.settings.provider !== 'mistral-api')); A.el('cloud-warning').classList.toggle('hidden', A.settings.provider !== 'mistral-api'); };
  const read = () => { A.settings = { ...A.settings, provider: A.el('set-provider').value, ollamaUrl: A.el('set-ollama-url').value.trim(), ollamaModel: A.el('set-ollama-model').value.trim(), mistralModel: A.el('set-mistral-model').value.trim(), mistralApiKey: A.el('set-mistral-key').value.trim(), softCapCalls: Number(A.el('set-soft-calls').value) || 80, hardCapCalls: Number(A.el('set-hard-calls').value) || 300, ollamaNumCtx: Number(A.el('set-ollama-ctx').value) || 32768, ollamaThink: A.el('set-ollama-think').value, ollamaKeepAlive: A.el('set-ollama-keep').value.trim() || '30m', compatUrl: A.el('set-compat-url').value.trim(), compatModel: A.el('set-compat-model').value.trim(), compatApiKey: A.el('set-compat-key').value.trim(), splitGuidewords: A.el('set-split-gw').value }; };
  A.el('btn-provider').onclick = () => { fill(); p.classList.remove('hidden'); };
  A.el('settings-close').onclick = () => p.classList.add('hidden');
  A.el('set-provider').onchange = () => { const v = A.el('set-provider').value; A.el('cloud-warning').classList.toggle('hidden', v !== 'mistral-api'); A.el('file-origin-warning').classList.toggle('hidden', !(location.protocol === 'file:' && v !== 'mistral-api')); };
  A.el('btn-settings-test').onclick = async () => { read(); A.el('settings-status').textContent = 'Prüfe…'; const r = await A.checkProvider(); A.el('settings-status').textContent = r.ok ? `OK${r.info ? ` — Kontext des Modells: ${r.info.contextLength || '?'} Token, Fähigkeiten: ${(r.info.capabilities || []).join(', ') || '–'}${r.info.parameterSize ? `, ${r.info.parameterSize} ${r.info.quantization}` : ''}` : ''}${r.models ? ` — verfügbare Modelle: ${r.models.join(', ')}` : ''}${(r.warnings || []).length ? ` — Hinweise: ${r.warnings.join(' ')}` : ''}` : `Fehler: ${r.error || r.message || 'unbekannt'}`; };
  A.el('btn-settings-save').onclick = async () => { read(); A.saveSettings(); p.classList.add('hidden'); A.toast('Einstellungen gespeichert'); A.checkProvider(); };
}

// ------------------------------------------------------------- persistence ----
A.ctx = () => ({ profile: A.state.projectProfile, sd: A.state.sd, functions: A.state.functions, interfaces: A.state.interfaces, documents: A.state.sd.documents || [], calibration: A.calibration() });
A.secCalibration = () => (A.state && A.state.securityCalibration) || window.RHAS_THREATLOG.defaultCalibration();
A.saveThreats = async () => { await DB.setMeta(A.state.pdb, 'threats', A.state.threats); await DB.touchProject(A.state.project.projectId); };
A.calibration = () => { const c = (A.state && A.state.calibration) || DATA.calibration; M.setCalibration(c); return c; };

A.saveMeta = async (key, value) => { A.state[key === 'systemDefinition' ? 'sd' : key] = value; await DB.setMeta(A.state.pdb, key, value); await DB.touchProject(A.state.project.projectId); };
A.saveSd = async () => { await DB.setMeta(A.state.pdb, 'systemDefinition', A.state.sd); await DB.touchProject(A.state.project.projectId); };
A.saveProposals = async () => DB.setMeta(A.state.pdb, 'proposals', A.state.proposals);

A.saveHazard = async (h) => { M.recomputeHazardRisk(h, A.calibration()); const rec = await DB.put(A.state.pdb, 'hazards', { ...h, updatedAt: M.nowIso(), updatedBy: A.author() }); const i = A.state.hazards.findIndex((x) => x.id === rec.id); if (i >= 0) A.state.hazards[i] = rec; else A.state.hazards.push(rec); return rec; };
A.createHazards = async (list) => { const recs = await DB.createBatch(A.state.pdb, 'hazards', list.map((h) => M.recomputeHazardRisk(h, A.calibration())), A.author()); A.state.hazards.push(...recs); return recs; };
A.deleteHazard = async (id) => { await DB.remove(A.state.pdb, 'hazards', id); A.state.hazards = A.state.hazards.filter((h) => h.id !== id); };
A.saveFunction = async (f) => { const rec = f.id ? await DB.put(A.state.pdb, 'functions', { ...f, updatedAt: M.nowIso() }) : await DB.create(A.state.pdb, 'functions', f, A.author()); const i = A.state.functions.findIndex((x) => x.id === rec.id); if (i >= 0) A.state.functions[i] = rec; else A.state.functions.push(rec); return rec; };
A.createFunctions = async (list) => { const recs = await DB.createBatch(A.state.pdb, 'functions', list, A.author()); A.state.functions.push(...recs); return recs; };
A.deleteFunction = async (id) => { await DB.remove(A.state.pdb, 'functions', id); A.state.functions = A.state.functions.filter((f) => f.id !== id); };
A.saveRequirement = async (r) => { const rec = r.id ? await DB.put(A.state.pdb, 'requirements', { ...r, updatedAt: M.nowIso(), updatedBy: A.author() }) : await DB.create(A.state.pdb, 'requirements', r, A.author()); const i = A.state.requirements.findIndex((x) => x.id === rec.id); if (i >= 0) A.state.requirements[i] = rec; else A.state.requirements.push(rec); return rec; };
A.createRequirements = async (list) => { const recs = await DB.createBatch(A.state.pdb, 'requirements', list, A.author()); A.state.requirements.push(...recs); return recs; };
A.deleteRequirement = async (id) => { await DB.remove(A.state.pdb, 'requirements', id); A.state.requirements = A.state.requirements.filter((r) => r.id !== id); };
A.saveCca = async (c) => { const rec = c.id ? await DB.put(A.state.pdb, 'ccas', c) : await DB.create(A.state.pdb, 'ccas', c, A.author()); const i = A.state.ccas.findIndex((x) => x.id === rec.id); if (i >= 0) A.state.ccas[i] = rec; else A.state.ccas.push(rec); return rec; };
A.deleteCca = async (id) => { await DB.remove(A.state.pdb, 'ccas', id); A.state.ccas = A.state.ccas.filter((c) => c.id !== id); };
A.saveInterfaces = async () => A.saveMeta('interfaces', A.state.interfaces);
A.saveSubsystems = async () => A.saveMeta('subsystems', A.state.subsystems);
A.addRun = async (run) => { A.state.runs.push(run); await DB.setMeta(A.state.pdb, 'runs', A.state.runs); };
A.nextInterfaceId = () => M.nextId('IF', A.state.interfaces);
A.nextMeasureId = (h) => M.nextId('M', h.measures || []);

// ---------------------------------------------------------------- project ----
A.loadProjects = async () => { A.state.projects = await DB.listProjects(); const sel = A.el('project-select'); sel.innerHTML = '<option value="">– Projekt wählen –</option>' + A.state.projects.map((p) => `<option value="${A.esc(p.projectId)}"${A.state.project && A.state.project.projectId === p.projectId ? ' selected' : ''}>${A.esc(p.name)}</option>`).join(''); };

A.openProject = async (projectId) => {
  if (A.state.pdb) { try { A.state.pdb.close(); } catch {} }
  const project = A.state.projects.find((p) => p.projectId === projectId);
  if (!project) { A.state.project = null; A.state.pdb = null; A.refresh(); return; }
  const pdb = await DB.openProject(projectId);
  const s = A.state;
  s.project = project; s.pdb = pdb;
  [s.functions, s.hazards, s.requirements, s.ccas] = await Promise.all(['functions', 'hazards', 'requirements', 'ccas'].map((st) => DB.listAll(pdb, st)));
  s.sd = { ...M.makeSystemDefinition(), ...(await DB.getMeta(pdb, 'systemDefinition', {})) };
  s.interfaces = await DB.getMeta(pdb, 'interfaces', []);
  s.subsystems = await DB.getMeta(pdb, 'subsystems', []);
  s.runs = await DB.getMeta(pdb, 'runs', []);
  s.proposals = { analysis: {}, measures: {}, requirements: {}, decomposition: null, ...(await DB.getMeta(pdb, 'proposals', {})) };
  s.docControl = { docId: '', revision: 'A', date: A.today(), author: '', verifier: '', validator: '', dutyHolder: '', supplier: '', purpose: '', ...(await DB.getMeta(pdb, 'docControl', {})) };
  s.calibration = await DB.getMeta(pdb, 'calibration', null);
  s.projectProfile = PROFILE.migrateProfile(await DB.getMeta(pdb, 'projectProfile', null));
  s.threats = await DB.getMeta(pdb, 'threats', []);
  s.zones = await DB.getMeta(pdb, 'zones', []);
  s.conduits = await DB.getMeta(pdb, 'conduits', []);
  s.securityCalibration = await DB.getMeta(pdb, 'securityCalibration', null);
  A.calibration(); // activate the project calibration for labels and ranks
  s.identConfig = { depth: 'standard', overrides: {}, sources: null, ...(await DB.getMeta(pdb, 'identConfig', {})) };
  localStorage.setItem('rhas_last_project', projectId);
  A.el('doc-id').value = s.docControl.docId; A.el('doc-rev').value = s.docControl.revision; if (!A.el('doc-author').value) A.el('doc-author').value = s.docControl.author || localStorage.getItem('rhas_author') || '';
  A.el('project-select').value = projectId;
  A.refresh();
};

A.createProject = async (name, description) => { const p = await DB.createProject({ name, description }); const npdb = await DB.openProject(p.projectId); await DB.setMeta(npdb, 'projectProfile', PROFILE.makeProjectProfile()); npdb.close(); await A.loadProjects(); await A.openProject(p.projectId); A.show('profile'); return p; };

A.importSnapshotFile = async (file) => { const text = await file.text(); const snap = JSON.parse(text); const p = await DB.importSnapshot(snap); await A.loadProjects(); await A.openProject(p.projectId); A.toast(`Projekt „${p.name}“ importiert`); };

A.snapshot = async () => DB.snapshot(A.state.pdb, A.state.project);

function bindProject() {
  A.el('project-select').onchange = (e) => A.openProject(e.target.value);
  const form = A.el('inline-project-form');
  const showForm = () => { form.classList.remove('hidden'); A.el('new-project-name').focus(); };
  A.el('btn-new-project').onclick = showForm; A.el('empty-new').onclick = showForm;
  A.el('btn-cancel-project').onclick = () => form.classList.add('hidden');
  A.el('btn-create-project').onclick = async () => { try { await A.createProject(A.el('new-project-name').value, A.el('new-project-desc').value); form.classList.add('hidden'); A.el('new-project-name').value = ''; A.el('new-project-desc').value = ''; A.el('new-project-error').textContent = ''; } catch (e) { A.el('new-project-error').textContent = e.message; } };
  A.el('btn-import-project').onclick = () => A.el('import-project-file').click();
  A.el('import-project-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { await A.importSnapshotFile(f); } catch (err) { A.toast(`Import fehlgeschlagen: ${err.message}`, 'err'); } e.target.value = ''; };
  const del = A.el('inline-delete-form');
  A.el('btn-delete-project').onclick = () => { if (!A.state.project) return; A.el('delete-message').textContent = `Projekt „${A.state.project.name}“ mit allen Gefährdungen, Anforderungen und Läufen endgültig löschen?`; del.classList.remove('hidden'); };
  A.el('btn-cancel-delete').onclick = () => del.classList.add('hidden');
  A.el('btn-confirm-delete').onclick = async () => { const id = A.state.project.projectId; try { A.state.pdb.close(); } catch {} await DB.deleteProject(id); A.state.project = null; A.state.pdb = null; del.classList.add('hidden'); await A.loadProjects(); A.refresh(); A.toast('Projekt gelöscht'); };
  A.el('btn-demo-project').onclick = () => A.loadDemo(); A.el('empty-demo').onclick = () => A.loadDemo();
  const docCtl = async () => { if (!A.state.project) return; A.state.docControl.docId = A.el('doc-id').value.trim(); A.state.docControl.revision = A.el('doc-rev').value.trim(); A.state.docControl.author = A.author(); localStorage.setItem('rhas_author', A.author()); await DB.setMeta(A.state.pdb, 'docControl', A.state.docControl); };
  ['doc-id', 'doc-rev', 'doc-author'].forEach((id) => { A.el(id).onchange = docCtl; });
}

A.loadDemo = async () => {
  const demo = DATA.demo;
  if (!demo) { A.toast('Kein Beispielprojekt eingebettet', 'err'); return; }
  const existing = A.state.projects.find((p) => p.name === demo.project.name);
  const name = existing ? `${demo.project.name} (${new Date().toLocaleTimeString('de-DE')})` : demo.project.name;
  const p = await DB.importSnapshot(demo, name);
  await A.loadProjects(); await A.openProject(p.projectId); A.toast('Beispielprojekt geladen');
};

// ------------------------------------------------------------- navigation ----
A.show = (stage) => { A.state.stage = stage; document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', b.dataset.stage === stage)); document.querySelectorAll('.stage').forEach((s) => s.classList.toggle('hidden', s.id !== `stage-${stage}`)); A.closeDrawer(); A.refresh(); };

A.refresh = () => {
  const has = !!A.state.project;
  A.el('empty-state').classList.toggle('hidden', has);
  document.querySelectorAll('.stage').forEach((s) => s.classList.toggle('hidden', !has || s.id !== `stage-${A.state.stage}`));
  if (!has) { A.el('rail-stats').innerHTML = ''; A.el('pct-profile').textContent = ''; A.el('profile-banner').classList.add('hidden'); ['definition', 'identification', 'analysis', 'requirements', 'reports'].forEach((k) => { A.el(`pct-${k}`).textContent = ''; }); return; }
  const st = M.projectStats({ hazards: A.state.hazards, requirements: A.state.requirements, functions: A.state.functions, sd: A.state.sd });
  A.state.stats = st;
  const prof = A.state.projectProfile || {};
  A.el('pct-profile').textContent = prof.confirmedAt ? '✓' : 'offen';
  // WP5: threat log stage only from security level 2.
  const secOn = window.RHAS_SECURITY.level(prof) >= 2;
  A.el('rail-security').classList.toggle('hidden', !secOn);
  if (secOn) { const th = A.state.threats || []; const TL = window.RHAS_THREATLOG; A.el('pct-security').textContent = th.length ? `${th.filter((t) => TL.threatCompleteness(t, A.secCalibration(), A.state.requirements).ok).length}/${th.length}` : ''; }
  if (!secOn && A.state.stage === 'security') A.state.stage = 'analysis';
  const banner = A.el('profile-banner');
  banner.classList.toggle('hidden', !!prof.confirmedAt);
  banner.innerHTML = prof.confirmedAt ? '' : `Projektprofil ${prof.origin === 'migrated' ? 'aus einem älteren Projektstand übernommen' : 'noch nicht bestätigt'} – bitte prüfen und bestätigen. <button class="btn link" type="button" onclick="window.RHAS_APP.show('profile')">zum Projektprofil</button>`;
  A.el('pct-definition').textContent = `${st.stageProgress.definition} %`; A.el('pct-identification').textContent = `${st.stageProgress.identification} %`; A.el('pct-analysis').textContent = `${st.stageProgress.analysis} %`; A.el('pct-requirements').textContent = `${st.stageProgress.requirements} %`; A.el('pct-reports').textContent = '';
  A.el('rail-stats').innerHTML = `<span>Funktionen</span><b>${st.functions.total}</b><span>Gefährdungen offen</span><b>${st.hazards.pending}</b><span>übernommen</span><b>${st.hazards.accepted}</b><span>bewertet</span><b>${st.hazards.evaluated}</b><span>Anforderungen</span><b>${st.requirements.total}</b><span>SRAC</span><b>${st.requirements.byCategory.srac || 0}</b>`;
  const mod = A.stages[A.state.stage];
  if (mod && mod.render) mod.render();
};

// ----------------------------------------------------------------- drawer ----
A.openDrawer = (title, html, { nav = '' } = {}) => { A.el('drawer-title').textContent = title; A.el('drawer-nav').innerHTML = nav; A.el('drawer-body').innerHTML = html; A.el('drawer').classList.remove('hidden'); };
A.closeDrawer = () => { A.el('drawer').classList.add('hidden'); A.state.drawer = null; document.querySelectorAll('tr.sel').forEach((r) => r.classList.remove('sel')); };

// -------------------------------------------------------------- help text ----
A.helpHtml = () => `
<h4>Ablauf</h4><p>1 Systemdefinition (EN 50126-1 7.3.2.1, Anhang D) → 2 Gefährdungsidentifikation an der Systemgrenze (7.4.2.1 a)–n); EN 50126-2 5.2.2) → 3 Risikoanalyse und -bewertung (6.3, 7.4; EN 50126-2 8.2–8.4, Anhang C der Teil 1) → 4 Sicherheitsanforderungen mit TFFR/SIL (7.5.2; EN 50126-2 9–10; EN 50129 5.3.7, 5.3.13, Anhang A) → 5 Berichte.</p>
<h4>Grundsätze</h4><ul><li>Die KI schlägt vor; jede Gefährdung, jede Bewertung, jede Maßnahme und jede Anforderung wird vom Bearbeiter übernommen oder verworfen.</li><li>Risikoklassen werden nur lokal aus der Kalibrierung berechnet (Unfallhäufigkeit × Schadensausmaß). THR wird eingetragen, nie geschätzt. SIL folgt lokal aus der TFFR (Tabelle 2), nur für elektronische Funktionen.</li><li>Jeder Datensatz trägt Herkunft (Lauf, Durchlauf, Modell oder manuell), Bearbeiter und Zeitstempel.</li><li>Alle Daten bleiben im Browser (IndexedDB). Nur der optionale Cloud-Anbieter sendet Inhalte nach außen.</li></ul>
<h4>Tastatur (Tabellen)</h4><p>↑/↓ Zeile wählen · Enter Details · A übernehmen · R verwerfen · Esc schließen.</p>
<h4>Tiefe der Identifikation</h4><ul>${Object.values(window.RHAS_ENGINE.DEPTHS).map((d) => `<li><b>${d.label}</b>: ${d.description}</li>`).join('')}</ul>`;

A.bindCore = () => {
  A.loadSettings(); bindSettings(); bindProject();
  document.querySelectorAll('.rail-btn').forEach((b) => { b.onclick = () => A.show(b.dataset.stage); });
  A.el('drawer-close').onclick = A.closeDrawer;
  A.el('btn-help').onclick = () => { A.el('help-body').innerHTML = A.helpHtml(); A.el('help-panel').classList.remove('hidden'); };
  A.el('help-close').onclick = () => A.el('help-panel').classList.add('hidden');
  A.el('btn-checkpoint').onclick = async () => { if (!A.state.project) return; const snap = await A.snapshot(); await DB.createCheckpoint({ name: `Checkpoint ${A.fmtDate(new Date().toISOString())}`, engineer: A.author(), snap, projectId: A.state.project.projectId }); A.toast('Checkpoint angelegt'); if (A.state.stage === 'reports') A.refresh(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { A.closeDrawer(); A.el('settings-panel').classList.add('hidden'); A.el('help-panel').classList.add('hidden'); } });
};
})();

