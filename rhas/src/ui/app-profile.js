// Stage 0: Projektprofil (WP2 setup wizard). The profile is edited as a draft;
// the first confirmation locks it, later changes need a reason and are logged.
(function () {
const A = window.RHAS_APP, P = window.RHAS_PROFILE, DATA = window.RHAS_DATA, C = window.RHAS_CALIBRATION, M = window.RHAS_MODEL;

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

function packInfo(d) {
  const pack = window.RHAS_DOMAINS.packFor(d);
  if (!pack) return '';
  return `<fieldset><legend>Domänenpaket</legend><div class="f"><label>Paket</label><div>${A.esc(pack.label)} (v${pack.version})<br><span class="hint">${pack.functionTemplates.length} Funktions- und ${pack.interfaceTemplates.length} Schnittstellenvorlagen (Stufe 1), Beispiele für die KI-Formulierung, Checkliste für die Kritikphase</span></div></div>
<div class="f"><label>Domänenspezifische Normen</label><div>${pack.standards.map((x) => `<div><b>${A.esc(x[0])}</b> – ${A.esc(x[1])}</div>`).join('')}</div></div>
<div class="f"><label>Checkliste (empirische Phase, EN 50129 A.4.2.3)</label><ul style="margin:0 0 0 16px;padding:0">${pack.checklist.map((x) => `<li>${A.esc(x)}</li>`).join('')}</ul></div></fieldset>`;
}

function renderForm() {
  const d = draft();
  const cals = [A.calibration()].filter(Boolean);
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
<div class="f"><label>Kalibrierung<span class="ref">EN 50126-1 Anhang C.1</span></label><select data-pf="calibrationId" disabled title="Wird im Abschnitt Kalibrierung geändert">${cals.map((c) => `<option value="${A.esc(c.id)}"${c.id === d.calibrationId ? ' selected' : ''}>${A.esc(c.title)}</option>`).join('')}</select></div>
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
${packInfo(d)}
<fieldset><legend>Bericht und Daten</legend>
<div class="f"><label>Berichtssprache</label><select data-pf="report.language"><option value="de" selected>Deutsch</option><option value="en" disabled>Englisch (in Vorbereitung)</option></select></div>
${select('dataClassification', d.dataClassification)}
</fieldset>`;
  const form = A.el('profile-form');
  form.querySelectorAll('[data-pf]').forEach((el) => { el[el.tagName === 'SELECT' ? 'onchange' : 'oninput'] = () => { const path = el.dataset.pf.split('.'); let o = d; while (path.length > 1) o = o[path.shift()]; o[path[0]] = path[0] === 'level' ? Number(el.value) : el.value; if (el.dataset.pf === 'security.level' || el.dataset.pf === 'domain') renderForm(); renderStatus(); }; });
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


// --------------------------------------------------------- calibration ----
const calDraft = () => { if (!A.state.calDraft || A.state.calDraftFor !== A.state.project.projectId) { A.state.calDraft = clone(A.calibration()); A.state.calDraftFor = A.state.project.projectId; } return A.state.calDraft; };
const esc = (v) => A.esc(v == null ? '' : v);

function renderCalibration() {
  const cur = A.calibration(); const d = calDraft();
  const v = C.validateCalibration(d);
  const changes = C.describeChange(cur, d);
  const imp = C.impact(A.state.hazards, d);
  const opt = (set) => Object.entries(C.SETS[set]).map(([k, x]) => `<option value="${k}">${esc(x.label)}</option>`).join('');
  const cls = d.riskClasses || [];
  const cell = (f, sv) => { const val = (d.matrix[f] || {})[sv] || ''; return `<td class="pill ${esc(val)}" style="display:table-cell;border-radius:0"><select data-cell="${esc(f)}|${esc(sv)}"><option value="">–</option>${cls.map((r) => `<option value="${esc(r.id)}"${r.id === val ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></td>`; };
  A.el('calibration-editor').innerHTML = `
<div class="row"><b>${esc(cur.title)}</b><span class="mono">${esc(cur.id)} v${esc(cur.version)}</span>${cur.approvedBy ? A.pill('accepted', `freigegeben: ${cur.approvedBy} ${A.fmtDate(cur.approvedAt)}`) : A.pill('pending', 'nicht freigegeben')}
<span class="spacer"></span><button id="btn-cal-export" class="btn small" type="button">Exportieren (JSON)</button><button id="btn-cal-import" class="btn small" type="button">Importieren</button></div>
<div class="row"><span class="hint">Neu aus Vorlage:</span><select id="cal-t-f">${opt('frequency')}</select><select id="cal-t-s">${opt('severity')}</select><select id="cal-t-a">${opt('acceptance')}</select><button id="btn-cal-template" class="btn small" type="button">Vorlage laden</button></div>
${v.findings.length ? `<div class="findings${v.ok ? ' ok' : ''}"><ul>${v.findings.map((f) => `<li class="${f.level}">${esc(f.text)}</li>`).join('')}</ul></div>` : ''}
<div class="f"><label>Bezeichnung</label><input data-cal="title" value="${esc(d.title)}" /></div>
<div class="f"><label>Kennung</label><input data-cal="id" value="${esc(d.id)}" /></div>
<div class="lbl">Häufigkeitskategorien (häufigste zuerst)</div>
<table class="grid"><thead><tr><th class="w-s">Kennung</th><th>Bezeichnung</th><th>Beschreibung</th><th>Beispielbereich</th></tr></thead><tbody>${d.frequencies.map((x, i) => `<tr><td class="mono">${esc(x.id)}</td><td><input data-cat="frequencies|${i}|label" value="${esc(x.label)}" /></td><td><input data-cat="frequencies|${i}|definition" value="${esc(x.definition)}" /></td><td><input data-cat="frequencies|${i}|range" value="${esc(x.range)}" /></td></tr>`).join('')}</tbody></table>
<div class="lbl">Schadenskategorien (schwerste zuerst)</div>
<table class="grid"><thead><tr><th class="w-s">Kennung</th><th>Bezeichnung</th><th>Personen / Umwelt</th><th>Betrieb / Sachwerte</th></tr></thead><tbody>${d.severities.map((x, i) => `<tr><td class="mono">${esc(x.id)}</td><td><input data-cat="severities|${i}|label" value="${esc(x.label)}" /></td><td><input data-cat="severities|${i}|persons" value="${esc(x.persons)}" /></td><td><input data-cat="severities|${i}|service" value="${esc(x.service)}" /></td></tr>`).join('')}</tbody></table>
<div class="lbl">Risikoakzeptanzkategorien</div>
<table class="grid"><thead><tr><th class="w-s">Kennung</th><th>Bezeichnung</th><th>Erforderliche Handlung</th><th class="w-a">Rang</th><th class="w-a">Maßnahmen nötig</th><th class="w-a">Muss reduziert werden</th></tr></thead><tbody>${cls.map((x, i) => `<tr><td>${A.pill(x.id, x.id)}</td><td><input data-cat="riskClasses|${i}|label" value="${esc(x.label)}" /></td><td><input data-cat="riskClasses|${i}|action" value="${esc(x.action)}" /></td><td><input class="w-3" data-cat="riskClasses|${i}|rank" value="${esc(x.rank)}" /></td><td><input type="checkbox" data-flag="${i}|needsMeasures"${M.classMeta(x.id, d) && M.classMeta(x.id, d).needsMeasures ? ' checked' : ''}/></td><td><input type="checkbox" data-flag="${i}|mustReduce"${M.classMeta(x.id, d) && M.classMeta(x.id, d).mustReduce ? ' checked' : ''}/></td></tr>`).join('')}</tbody></table>
<div class="lbl">Risikomatrix (Häufigkeit des Unfalls × Schadensausmaß)</div>
<table class="heat"><thead><tr><th>Häufigkeit \\ Schadensausmaß</th>${d.severities.map((x) => `<th>${esc(x.label)}</th>`).join('')}</tr></thead><tbody>${d.frequencies.map((f) => `<tr><th>${esc(f.label)}</th>${d.severities.map((x) => cell(f.id, x.id)).join('')}</tr>`).join('')}</tbody></table>
<div class="panel">
${changes.length ? `<div class="hint">Änderungen: ${esc(changes.join(' · '))}</div>` : '<div class="hint">Keine Änderungen gegenüber der gespeicherten Kalibrierung.</div>'}
${imp.invalid.length ? `<div class="warn">${imp.invalid.length} Gefährdung(en) verwenden Kategorien, die in dieser Kalibrierung nicht existieren (${esc(imp.invalid.map((x) => x.id).join(', '))}); ihre Szenarien müssen neu eingestuft werden.</div>` : ''}
${imp.changed.length ? `<div class="hint">${imp.changed.length} Gefährdung(en) ändern ihre Risikoklasse: ${esc(imp.changed.map((x) => `${x.id} ${x.from} ⇒ ${x.to}`).join('; '))}</div>` : ''}
<div class="f"><label>Begründung</label><textarea id="cal-reason" rows="2" placeholder="Pflicht, sobald das Profil bestätigt ist oder Gefährdungen existieren"></textarea></div>
<div class="row"><button id="btn-cal-apply" class="btn primary" type="button"${v.ok && changes.length ? '' : ' disabled'}>Kalibrierung übernehmen</button><button id="btn-cal-discard" class="btn" type="button"${changes.length ? '' : ' disabled'}>Verwerfen</button>
<span class="spacer"></span><input id="cal-approver" placeholder="Freigabe durch (Betreiber)" /><button id="btn-cal-approve2" class="btn small" type="button"${changes.length ? ' disabled' : ''}>Freigeben</button></div>
</div>`;
  const ed = A.el('calibration-editor');
  ed.querySelectorAll('[data-cal]').forEach((el) => { el.oninput = () => { d[el.dataset.cal] = el.value; }; el.onchange = () => renderCalibration(); });
  ed.querySelectorAll('[data-cat]').forEach((el) => { el.oninput = () => { const [k, i, f] = el.dataset.cat.split('|'); d[k][Number(i)][f] = f === 'rank' ? Number(el.value) : el.value; }; el.onchange = () => renderCalibration(); });
  ed.querySelectorAll('[data-flag]').forEach((el) => { el.onchange = () => { const [i, f] = el.dataset.flag.split('|'); d.riskClasses[Number(i)][f] = el.checked; renderCalibration(); }; });
  ed.querySelectorAll('[data-cell]').forEach((el) => { el.onchange = () => { const [f, sv] = el.dataset.cell.split('|'); d.matrix[f] = d.matrix[f] || {}; d.matrix[f][sv] = el.value; renderCalibration(); }; });
  A.el('btn-cal-template').onclick = () => { A.state.calDraft = C.fromTemplate({ frequency: A.el('cal-t-f').value, severity: A.el('cal-t-s').value, acceptance: A.el('cal-t-a').value }); renderCalibration(); };
  A.el('btn-cal-discard').onclick = () => { A.state.calDraft = clone(A.calibration()); renderCalibration(); };
  A.el('btn-cal-export').onclick = () => A.download(JSON.stringify(A.calibration(), null, 1), `${A.slug(A.calibration().id)}_kalibrierung.json`, 'application/json');
  A.el('btn-cal-import').onclick = () => A.el('import-calibration-file').click();
  A.el('import-calibration-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { A.state.calDraft = JSON.parse(await f.text()); renderCalibration(); A.toast('Kalibrierung geladen – prüfen und übernehmen'); } catch (err) { A.toast(`Import fehlgeschlagen: ${err.message}`, 'err'); } e.target.value = ''; };
  A.el('btn-cal-apply').onclick = () => applyCalibration(clone(d), A.el('cal-reason').value.trim());
  A.el('btn-cal-approve2').onclick = async () => { const by = A.el('cal-approver').value.trim(); if (!by) { A.toast('Name für die Freigabe eintragen', 'err'); return; } await applyCalibration({ ...clone(A.calibration()), approvedBy: by, approvedAt: M.nowIso() }, `Freigabe der Kalibrierung durch ${by}`, true); };
}

async function applyCalibration(next, reason, approvalOnly) {
  const cur = A.calibration(); const prof = A.state.projectProfile;
  const needReason = !approvalOnly && (prof.confirmedAt || A.state.hazards.length);
  if (needReason && !reason) { A.toast('Begründung für die Kalibrierungsänderung erforderlich', 'err'); return; }
  if (!approvalOnly) { next.version = next.id === cur.id ? Number(cur.version || 1) + 1 : 1; next.approvedBy = ''; next.approvedAt = ''; }
  const v = C.validateCalibration(next); if (!v.ok) { A.toast('Kalibrierung unvollständig', 'err'); return; }
  const changes = approvalOnly ? [`Freigabe ${next.approvedBy}`] : C.describeChange(cur, next);
  await A.saveMeta('calibration', next);
  A.calibration();
  for (const h of A.state.hazards) await A.saveHazard(h); // recompute risk classes with the new matrix
  const entry = { at: M.nowIso(), by: A.author(), reason: reason || 'Kalibrierung festgelegt', changes: changes.map((c) => ({ field: 'calibration', from: `${cur.id} v${cur.version}`, to: `${next.id} v${next.version}: ${c}` })) };
  await A.saveMeta('projectProfile', { ...prof, calibrationId: next.id, changeLog: [...(prof.changeLog || []), entry] });
  A.state.profileDraft = clone(A.state.projectProfile);
  A.state.calDraft = clone(next);
  A.toast(approvalOnly ? 'Kalibrierung freigegeben' : `Kalibrierung übernommen (v${next.version}); ${A.state.hazards.length} Gefährdungen neu bewertet`);
  A.refresh();
}

function render() { renderForm(); renderActions(); renderStatus(); renderCalibration(); }

A.applyCalibration = applyCalibration;
A.stages.profile = { render, bind() {} };
})();
