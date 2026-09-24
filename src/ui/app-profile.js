// Stage 0: Projektprofil (WP2 setup wizard). The profile is edited as a draft;
// the first confirmation locks it, later changes need a reason and are logged.
(function () {
const A = window.RHAS_APP, P = window.RHAS_PROFILE, DATA = window.RHAS_DATA;

const clone = (o) => JSON.parse(JSON.stringify(o));
const draft = () => { if (!A.state.profileDraft || A.state.profileDraftFor !== A.state.project.projectId) { A.state.profileDraft = clone(A.state.projectProfile); A.state.profileDraftFor = A.state.project.projectId; } return A.state.profileDraft; };

function select(key, value) {
  const o = P.OPTIONS[key];
  return `<div class="f"><label>${A.esc(o.label)}${o.ref ? `<span class="ref">${A.esc(o.ref)}</span>` : ''}</label><select data-pf="${key}"><option value="">– wählen –</option>${Object.entries(o.values).map(([k, v]) => `<option value="${A.esc(k)}"${String(value) === k ? ' selected' : ''}>${A.esc(v)}</option>`).join('')}</select></div>`;
}
function text(key, label, value, ref, area) {
  const inp = area ? `<textarea data-pf="${key}" rows="2">${A.esc(value || '')}</textarea>` : `<input data-pf="${key}" value="${A.esc(value || '')}" />`;
  return `<div class="f"><label>${A.esc(label)}${ref ? `<span class="ref">${A.esc(ref)}</span>` : ''}</label>${inp}</div>`;
}
function checks(key, label, map, selected, ref) {
  const sel = (selected || []).map(String);
  return `<div class="f"><label>${A.esc(label)}${ref ? `<span class="ref">${A.esc(ref)}</span>` : ''}</label><div class="check-list compact">${Object.entries(map).map(([k, v]) => `<label><input type="checkbox" data-pfc="${key}" value="${A.esc(k)}"${sel.includes(String(k)) ? ' checked' : ''}/> ${A.esc(v)}</label>`).join('')}</div></div>`;
}

function renderForm() {
  const d = draft();
  const cals = [DATA.calibration].filter(Boolean);
  const sec = d.security || {};
  A.el('profile-form').innerHTML = `
<fieldset><legend>Rolle und Betrachtungsgegenstand</legend>
${select('role', d.role)}${select('domain', d.domain)}${select('systemLevel', d.systemLevel)}
${text('superiorSystem', 'Übergeordnetes System', d.superiorSystem, 'EN 50126-1 6.5.2')}
${select('safetyCaseType', d.safetyCaseType)}${select('changeType', d.changeType)}
${checks('lifecyclePhases', 'Lebenszyklusumfang', P.PHASES, d.lifecyclePhases, 'EN 50126-1 6.5.2')}
</fieldset>
<fieldset><legend>Risikoakzeptanz und Integrität</legend>
${select('ramsScope', d.ramsScope)}
<div class="f"><label>Kalibrierung<span class="ref">EN 50126-1 Anhang C.1</span></label><select data-pf="calibrationId">${cals.map((c) => `<option value="${A.esc(c.id)}"${c.id === d.calibrationId ? ' selected' : ''}>${A.esc(c.title)}</option>`).join('')}</select></div>
${checks('permittedRaps', 'Zulässige Risikoakzeptanzprinzipien', P.RAP, d.permittedRaps, 'EN 50126-1 7.4.2.1; EN 50126-2 8.3')}
${select('thrSource', d.thrSource)}${select('silApplicability', d.silApplicability)}
</fieldset>
<fieldset><legend>Regulatorischer Rahmen</legend>
${select('country', d.country)}${text('infrastructureManager', 'Infrastrukturbetreiber', d.infrastructureManager, '')}${select('csmRa', d.csmRa)}
</fieldset>
<fieldset><legend>Security</legend>
<div class="f"><label>Security-Tiefe<span class="ref">EN 50126-1 5.5, 7.4.2.1 d); EN 50129 6.4</span></label><select data-pf="security.level">${Object.entries(P.SECURITY_LEVELS).map(([k, v]) => `<option value="${k}"${String(sec.level) === k ? ' selected' : ''}${P.IMPLEMENTED_SECURITY_LEVELS.includes(Number(k)) ? '' : ' disabled'}>${A.esc(v)}</option>`).join('')}</select></div>
${Number(sec.level) === 0 ? text('security.justification', 'Begründung (Stufe 0)', sec.justification, 'EN 50126-1 7.4.2.1 d)', true) : ''}
</fieldset>
<fieldset><legend>Bericht und Daten</legend>
<div class="f"><label>Berichtssprache</label><select data-pf="report.language"><option value="de" selected>Deutsch</option><option value="en" disabled>Englisch (in Vorbereitung)</option></select></div>
${select('dataClassification', d.dataClassification)}
</fieldset>`;
  const form = A.el('profile-form');
  form.querySelectorAll('[data-pf]').forEach((el) => { el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { const path = el.dataset.pf.split('.'); let o = d; while (path.length > 1) o = o[path.shift()]; o[path[0]] = path[0] === 'level' ? Number(el.value) : el.value; if (el.dataset.pf === 'security.level') renderForm(); renderStatus(); }; });
  form.querySelectorAll('[data-pfc]').forEach((el) => { el.onchange = () => { const key = el.dataset.pfc; const vals = [...form.querySelectorAll(`[data-pfc="${key}"]:checked`)].map((x) => (key === 'lifecyclePhases' ? Number(x.value) : x.value)); d[key] = vals; renderStatus(); }; });
}

function renderStatus() {
  const d = draft(); const cur = A.state.projectProfile;
  const v = P.validateProjectProfile(d);
  const changes = P.diffProfile(cur, d);
  const badge = A.el('profile-status');
  badge.className = `badge ${cur.confirmedAt ? 'ok' : 'warn'}`;
  badge.textContent = cur.confirmedAt ? `bestätigt ${A.fmtDate(cur.confirmedAt)}${cur.confirmedBy ? ` · ${cur.confirmedBy}` : ''}` : (cur.origin === 'migrated' ? 'aus älterem Stand übernommen – bitte bestätigen' : 'noch nicht bestätigt');
  const fs = v.findings;
  A.el('profile-findings').innerHTML = fs.length ? `<div class="findings${v.ok ? ' ok' : ''}"><ul>${fs.map((f) => `<li class="${f.level}">${A.esc(f.text)}</li>`).join('')}</ul></div>` : '<div class="findings ok">Profil vollständig.</div>';
  const bc = A.el('btn-profile-confirm'); if (bc) bc.disabled = !v.ok;
  const ba = A.el('btn-profile-apply'); if (ba) { ba.disabled = !(v.ok && changes.length); ba.textContent = `Änderungen übernehmen (${changes.length})`; }
  const br = A.el('btn-profile-reset'); if (br) br.disabled = !changes.length;
  A.el('tbl-profile-log').querySelector('tbody').innerHTML = (cur.changeLog || []).slice().reverse().map((e) => `<tr><td>${A.fmtDate(e.at)}</td><td>${A.esc(e.by || '–')}</td><td>${A.esc(e.reason || '')}</td><td class="mono">${(e.changes || []).map((c) => `${A.esc(c.field)}: ${A.esc(c.from || '–')} → ${A.esc(c.to || '–')}`).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">Noch keine Einträge.</td></tr>';
}

function renderActions() {
  const cur = A.state.projectProfile;
  const act = A.el('profile-actions');
  if (!cur.confirmedAt) {
    act.innerHTML = '<div class="row"><button id="btn-profile-confirm" class="btn primary" type="button" disabled>Profil bestätigen</button><span class="hint">Nach der Bestätigung sind Änderungen nur mit Begründung möglich und werden protokolliert.</span></div>';
  } else {
    act.innerHTML = '<div class="f"><label>Begründung der Änderung</label><textarea id="profile-reason" rows="2" placeholder="Pflicht bei Änderungen"></textarea></div><div class="row"><button id="btn-profile-apply" class="btn primary" type="button" disabled>Änderungen übernehmen (0)</button><button id="btn-profile-reset" class="btn" type="button" disabled>Verwerfen</button></div>';
  }
  const save = async (reason) => {
    const before = A.state.projectProfile;
    try {
      const next = P.applyProfileChange(before, clone(draft()), { by: A.author(), reason });
      await A.saveMeta('projectProfile', next);
      A.state.profileDraft = clone(next);
      A.toast(before.confirmedAt ? 'Projektprofil geändert' : 'Projektprofil bestätigt');
      A.refresh();
    } catch (e) { A.toast(e.message, 'err'); }
  };
  if (A.el('btn-profile-confirm')) A.el('btn-profile-confirm').onclick = () => save('');
  if (A.el('btn-profile-apply')) A.el('btn-profile-apply').onclick = () => save(A.el('profile-reason').value.trim());
  if (A.el('btn-profile-reset')) A.el('btn-profile-reset').onclick = () => { A.state.profileDraft = clone(A.state.projectProfile); render(); };
}

function render() { renderForm(); renderActions(); renderStatus(); }

A.stages.profile = { render, bind() {} };
})();
