// Stage 3b: Bedrohungsprotokoll (WP5 security level 2). Threats are rated by
// the engineer (exposure, vulnerability, impact with rationale); likelihood and
// risk are computed locally from the security risk matrix.
(function () {
const A = window.RHAS_APP, M = window.RHAS_MODEL, TL = window.RHAS_THREATLOG, SEC = window.RHAS_SECURITY;
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (v) => A.esc(v == null ? '' : v);
const secPill = (id) => (id ? `<span class="pill ${id === 'secHigh' ? 'Intolerable' : id === 'secMedium' ? 'Undesirable' : 'Negligible'}">${esc(TL.levelLabel(id, A.secCalibration()))}</span>` : '<span class="pill gray">–</span>');

function render() {
  const cal = A.secCalibration();
  const th = A.state.threats || [];
  th.forEach((t) => TL.recomputeThreat(t, cal));
  const comp = th.map((t) => TL.threatCompleteness(t, cal, A.state.requirements));
  A.el('threat-kpis').innerHTML = `<div class="kpis"><div class="kpi"><b>${th.length}</b><span>Bedrohungen</span></div><div class="kpi"><b>${comp.filter((c) => c.evaluated).length}</b><span>bewertet</span></div><div class="kpi"><b>${th.filter((t) => t.risk === 'secHigh').length}</b><span>hohes Risiko</span></div><div class="kpi"><b>${th.filter((t) => t.residualRisk === 'secHigh').length}</b><span>hohes Restrisiko</span></div><div class="kpi"><b>${comp.filter((c) => c.ok).length}</b><span>vollständig</span></div></div>`;
  A.el('tbl-threats').querySelector('tbody').innerHTML = th.map((t, i) => `<tr data-i="${i}" class="clickable"><td class="id">${esc(t.id)}</td><td><span class="title">${esc(t.title)}</span>${comp[i].ok ? '' : `<span class="desc">${esc(comp[i].problems[0])}</span>`}</td><td>${esc((t.threatClasses || []).map((c) => SEC.threatLabel(c)).join(', '))}</td><td class="mono">${esc((t.hazards || []).join(', '))}</td><td class="mono">${esc(t.exposure || '–')} / ${esc(t.vulnerability || '–')} / ${esc(t.likelihood || '–')}</td><td>${esc(t.impact || '–')}</td><td>${secPill(t.risk)} → ${secPill(t.residualRisk)}</td><td>${esc({ open: 'offen', treated: 'behandelt', accepted: 'akzeptiert', transferred: 'übertragen' }[t.status] || t.status)}</td></tr>`).join('') || '<tr><td colspan="8" class="hint">Noch keine Bedrohungen. „Aus Gefährdungen ableiten“ übernimmt jede vorsätzliche Ursache akzeptierter Gefährdungen.</td></tr>';
  A.el('tbl-threats').querySelectorAll('tr[data-i]').forEach((tr) => { tr.onclick = () => openThreat(Number(tr.dataset.i)); });
  renderMatrix();
  renderZones();
}

function renderMatrix() {
  const cal = A.secCalibration();
  const v = TL.validateCalibration(cal);
  const cnt = (imp, l) => (A.state.threats || []).filter((t) => t.impact === imp && t.likelihood === l).length;
  A.el('sec-matrix').innerHTML = `<div class="row"><b>${esc(cal.title)}</b><span class="mono">v${esc(cal.version)}</span>${cal.approvedBy ? A.pill('accepted', `freigegeben: ${cal.approvedBy}`) : A.pill('pending', 'nicht freigegeben')}</div>
<div class="hint">${esc(cal.source)} ${esc(cal.likelihoodFormula)}</div>
${v.findings.length ? `<div class="findings${v.ok ? ' ok' : ''}"><ul>${v.findings.map((f) => `<li class="${f.level}">${esc(f.text)}</li>`).join('')}</ul></div>` : ''}
<table class="heat"><thead><tr><th>Auswirkung \\ Wahrscheinlichkeit</th>${[1, 2, 3, 4, 5].map((l) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${cal.impacts.map((imp) => `<tr><th title="${esc(imp.description)}">${esc(imp.label)}</th>${[1, 2, 3, 4, 5].map((l) => { const lv = cal.matrix[imp.id][String(l)]; return `<td class="pill ${lv === 'secHigh' ? 'Intolerable' : lv === 'secMedium' ? 'Undesirable' : 'Negligible'}" style="display:table-cell;border-radius:0"><select data-sc="${imp.id}|${l}">${cal.levels.map((x) => `<option value="${x.id}"${x.id === lv ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>${cnt(imp.id, l) ? ` <b>${cnt(imp.id, l)}</b>` : ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
<div class="row"><input id="sec-cal-reason" placeholder="Begründung bei Änderung der Matrix" style="flex:2" /><input id="sec-cal-approver" placeholder="Freigabe durch (Betreiber)" /><button id="btn-sec-cal-approve" class="btn small" type="button">Freigeben</button></div>`;
  A.el('sec-matrix').querySelectorAll('[data-sc]').forEach((el) => { el.onchange = async () => {
    const reason = A.el('sec-cal-reason').value.trim();
    if (!reason) { A.toast('Begründung für die Matrixänderung erforderlich', 'err'); renderMatrix(); return; }
    const [imp, l] = el.dataset.sc.split('|');
    const next = clone(cal); const from = next.matrix[imp][l]; next.matrix[imp][l] = el.value; next.version = Number(cal.version || 1) + 1; next.approvedBy = ''; next.approvedAt = '';
    await saveSecCal(next, reason, `Security-Matrix ${imp}/${l}: ${from} → ${el.value}`);
  }; });
  A.el('btn-sec-cal-approve').onclick = async () => { const by = A.el('sec-cal-approver').value.trim(); if (!by) { A.toast('Name für die Freigabe eintragen', 'err'); return; } await saveSecCal({ ...clone(cal), approvedBy: by, approvedAt: M.nowIso() }, `Freigabe der Security-Risikomatrix durch ${by}`, `Freigabe ${by}`); };
}

async function saveSecCal(next, reason, change) {
  const prev = A.secCalibration();
  await A.saveMeta('securityCalibration', next);
  const prof = A.state.projectProfile;
  await A.saveMeta('projectProfile', { ...prof, changeLog: [...(prof.changeLog || []), { at: M.nowIso(), by: A.author(), reason, changes: [{ field: 'securityCalibration', from: `${prev.id} v${prev.version}`, to: `${next.id} v${next.version}: ${change}` }] }] });
  A.state.profileDraft = clone(A.state.projectProfile);
  (A.state.threats || []).forEach((t) => TL.recomputeThreat(t, next));
  await A.saveThreats();
  A.toast('Security-Risikomatrix gespeichert'); render(); A.refresh();
}

function openThreat(i) {
  const cal = A.secCalibration();
  const t = A.state.threats[i];
  const acc = A.state.hazards.filter((h) => h.review && h.review.decision === 'accepted');
  const secReqs = A.state.requirements.filter((r) => r.status !== 'rejected');
  const floor = TL.impactFloor(acc.filter((h) => (t.hazards || []).includes(h.id)), A.calibration(), cal);
  const opts = (list, v) => `<option value="">–</option>${list.map((x) => `<option value="${esc(x.id)}"${String(x.id) === String(v) ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}`;
  const cmRow = (m, k) => `<div class="sub-list" data-cm="${k}"><div class="row"><b>${esc(m.id || `G${k + 1}`)}</b><select data-c="status">${[['proposed', 'vorgeschlagen'], ['accepted', 'bestätigt'], ['rejected', 'verworfen']].map(([v, l]) => `<option value="${v}"${m.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select><span class="spacer"></span><button class="btn icon" data-cm-del="${k}">🗑</button></div>
<textarea data-c="text" rows="2" placeholder="Gegenmaßnahme">${esc(m.text)}</textarea>
<div class="row"><label class="fld"><span>Rest-Exposition</span><select data-c="residualExposure">${opts(cal.exposure, m.residualExposure)}</select></label><label class="fld"><span>Rest-Verwundbarkeit</span><select data-c="residualVulnerability">${opts(cal.vulnerability, m.residualVulnerability)}</select></label></div>
<div class="f"><label>Umsetzende Anforderungen</label><div class="check-list compact">${secReqs.map((r) => `<label><input type="checkbox" data-c-req="${esc(r.id)}"${(m.requirements || []).includes(r.id) ? ' checked' : ''}/> ${esc(r.id)} ${esc(r.title || r.text.slice(0, 60))}${r.securityRelated ? ' <span class="hint">(Security)</span>' : ''}</label>`).join('') || '<span class="hint">Noch keine Anforderungen (Stufe 4).</span>'}</div></div></div>`;
  A.openDrawer(`${t.id} · Bedrohung`, `
<div class="f"><label>Titel</label><input id="th-title" value="${esc(t.title)}" /></div>
<div class="f"><label>Beschreibung</label><textarea id="th-desc" rows="2">${esc(t.description)}</textarea></div>
<div class="f"><label>Bedrohungsklassen</label><div class="check-list compact">${SEC.threats().map((x) => `<label title="${esc(x.ref)}"><input type="checkbox" data-th-cls="${x.id}"${(t.threatClasses || []).includes(x.id) ? ' checked' : ''}/> ${esc(x.label)}</label>`).join('')}</div></div>
<div class="f"><label>Verknüpfte Gefährdungen (Sicherheitsbezug)</label><div class="check-list compact">${acc.map((h) => `<label><input type="checkbox" data-th-hz="${h.id}"${(t.hazards || []).includes(h.id) ? ' checked' : ''}/> ${h.id} ${esc(h.title)}</label>`).join('')}</div></div>
<div class="f"><label>Betroffene Schutzziele</label><div class="row">${[['c', 'Vertraulichkeit'], ['i', 'Integrität'], ['a', 'Verfügbarkeit']].map(([k, l]) => `<label class="chk"><input type="checkbox" data-th-cia="${k}"${t.cia && t.cia[k] ? ' checked' : ''}/> ${l}</label>`).join('')}</div></div>
<div class="row"><label class="fld"><span>Exposition</span><select id="th-exp">${opts(cal.exposure, t.exposure)}</select></label><label class="fld"><span>Verwundbarkeit</span><select id="th-vul">${opts(cal.vulnerability, t.vulnerability)}</select></label><label class="fld"><span>Auswirkung${floor ? ` (Vorschlag aus Sicherheitsfolge: mind. ${floor})` : ''}</span><select id="th-imp">${opts(cal.impacts, t.impact)}</select></label></div>
<div class="f"><label>Begründung Exposition</label><textarea id="th-exp-r" rows="2">${esc(t.exposureRationale)}</textarea></div>
<div class="f"><label>Begründung Verwundbarkeit</label><textarea id="th-vul-r" rows="2">${esc(t.vulnerabilityRationale)}</textarea></div>
<div class="f"><label>Begründung Auswirkung</label><textarea id="th-imp-r" rows="2">${esc(t.impactRationale)}</textarea></div>
<div class="riskline"><b>Security-Risiko:</b> <span id="th-risk">${secPill(t.risk)}</span> · Wahrscheinlichkeit <span id="th-lh">${esc(t.likelihood || '–')}</span> · <b>Restrisiko:</b> <span id="th-res">${secPill(t.residualRisk)}</span></div>
<h4>Gegenmaßnahmen</h4><div id="th-cms">${(t.countermeasures || []).map(cmRow).join('')}</div><button id="th-add-cm" class="btn small" type="button">+ Gegenmaßnahme</button>
<div class="row"><label class="fld"><span>Status</span><select id="th-status">${[['open', 'offen'], ['treated', 'behandelt'], ['accepted', 'akzeptiert'], ['transferred', 'übertragen (SRAC)']].map(([v, l]) => `<option value="${v}"${t.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label><label class="fld"><span>Verantwortlich</span><input id="th-owner" value="${esc(t.owner)}" /></label></div>
${t.sourceCause ? `<div class="audit">Abgeleitet aus vorsätzlicher Ursache: ${esc(t.sourceCause)}</div>` : ''}
<div class="sticky-actions"><button id="th-save" class="btn primary">Speichern</button><button id="th-del" class="btn danger">Löschen</button></div>`);
  const body = A.el('drawer-body');
  const collect = () => {
    const n = clone(t);
    Object.assign(n, { title: A.el('th-title').value.trim(), description: A.el('th-desc').value.trim(), exposure: Number(A.el('th-exp').value) || null, vulnerability: Number(A.el('th-vul').value) || null, impact: A.el('th-imp').value, exposureRationale: A.el('th-exp-r').value.trim(), vulnerabilityRationale: A.el('th-vul-r').value.trim(), impactRationale: A.el('th-imp-r').value.trim(), status: A.el('th-status').value, owner: A.el('th-owner').value.trim() });
    n.threatClasses = [...body.querySelectorAll('[data-th-cls]:checked')].map((x) => x.dataset.thCls);
    n.hazards = [...body.querySelectorAll('[data-th-hz]:checked')].map((x) => x.dataset.thHz);
    n.cia = { c: false, i: false, a: false }; body.querySelectorAll('[data-th-cia]').forEach((x) => { n.cia[x.dataset.thCia] = x.checked; });
    n.countermeasures = [...body.querySelectorAll('[data-cm]')].map((box, k) => { const m = { ...(t.countermeasures[k] || TL.makeCountermeasure()), id: (t.countermeasures[k] && t.countermeasures[k].id) || `G${k + 1}` }; box.querySelectorAll('[data-c]').forEach((el) => { m[el.dataset.c] = el.dataset.c.startsWith('residual') ? (Number(el.value) || null) : el.value; }); m.requirements = [...box.querySelectorAll('[data-c-req]:checked')].map((x) => x.dataset.cReq); return m; });
    n.updatedAt = M.nowIso(); n.updatedBy = A.author();
    return TL.recomputeThreat(n, cal);
  };
  const live = () => { const n = collect(); A.el('th-risk').innerHTML = secPill(n.risk); A.el('th-res').innerHTML = secPill(n.residualRisk); A.el('th-lh').textContent = n.likelihood || '–'; };
  body.querySelectorAll('select').forEach((s) => { s.addEventListener('change', live); });
  const save = async () => { A.state.threats[i] = collect(); await A.saveThreats(); render(); A.refresh(); };
  A.el('th-save').onclick = async () => { await save(); A.toast('Bedrohung gespeichert'); openThreat(i); };
  A.el('th-add-cm').onclick = async () => { await save(); A.state.threats[i].countermeasures.push(TL.makeCountermeasure({ id: `G${A.state.threats[i].countermeasures.length + 1}` })); await A.saveThreats(); openThreat(i); };
  body.querySelectorAll('[data-cm-del]').forEach((b) => { b.onclick = async () => { await save(); A.state.threats[i].countermeasures.splice(Number(b.dataset.cmDel), 1); await A.saveThreats(); openThreat(i); }; });
  A.el('th-del').onclick = async (e) => { if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Wirklich löschen?'; return; } A.state.threats.splice(i, 1); await A.saveThreats(); A.closeDrawer(); render(); A.refresh(); };
}


// ------------------------------------------------------ level 3 (preview) ----
const Z = window.RHAS_ZONES;
const saveZones = async () => { await A.saveMeta('zones', A.state.zones); await A.saveMeta('conduits', A.state.conduits); };
function renderZones() {
  const on = SEC.level(A.state.projectProfile) >= 3;
  A.el('zones-section').classList.toggle('hidden', !on);
  if (!on) return;
  A.state.zones = A.state.zones || []; A.state.conduits = A.state.conduits || [];
  const cal = A.secCalibration(); const sd = A.state.sd;
  const v = Z.check({ zones: A.state.zones, conduits: A.state.conduits, functions: A.state.functions, interfaces: A.state.interfaces });
  A.el('zone-findings').innerHTML = v.findings.length ? `<div class="findings${v.ok ? ' ok' : ''}"><ul>${v.findings.map((f) => `<li class="${f.level}">${esc(f.text)}</li>`).join('')}</ul></div>` : '<div class="findings ok">Partitionierung ohne Befund.</div>';
  A.el('tbl-zones').querySelector('tbody').innerHTML = A.state.zones.map((z, i) => { const p = Z.proposeSlT(z, A.state.threats, sd, cal); return `<tr class="clickable" data-z="${i}"><td class="id">${esc(z.id)}</td><td>${esc(z.name)}</td><td class="mono">${esc((z.functions || []).join(', '))}</td><td class="mono">${esc((z.interfaces || []).join(', '))}</td><td>${z.slT ? `SL ${esc(z.slT)}` : '–'} <span class="hint">(${p.sl})</span></td><td>${(z.srs || []).length}</td></tr>`; }).join('') || '<tr><td colspan="6" class="hint">Noch keine Zonen.</td></tr>';
  A.el('tbl-conduits').querySelector('tbody').innerHTML = A.state.conduits.map((c, i) => { const p = Z.proposeSlT(c, A.state.threats, sd, cal); return `<tr class="clickable" data-c="${i}"><td class="id">${esc(c.id)}</td><td>${esc(c.name)}</td><td class="mono">${esc((c.zones || []).join(' ↔ '))}</td><td class="mono">${esc((c.interfaces || []).join(', '))}</td><td>${c.slT ? `SL ${esc(c.slT)}` : '–'} <span class="hint">(${p.sl})</span></td></tr>`; }).join('') || '<tr><td colspan="5" class="hint">Noch keine Conduits.</td></tr>';
  A.el('tbl-zones').querySelectorAll('tr[data-z]').forEach((tr) => { tr.onclick = () => openZone(Number(tr.dataset.z)); });
  A.el('tbl-conduits').querySelectorAll('tr[data-c]').forEach((tr) => { tr.onclick = () => openConduit(Number(tr.dataset.c)); });
  A.el('tbl-case').querySelector('tbody').innerHTML = Z.caseSkeleton({ sd, zones: A.state.zones, conduits: A.state.conduits, threats: A.state.threats, securityCalibration: A.state.securityCalibration, profile: A.state.projectProfile, requirements: A.state.requirements }).map((r) => `<tr><td>${esc(r.item)}</td><td>${esc(r.ref)}</td><td>${A.pill(r.status === 'vorhanden' ? 'accepted' : 'pending', r.status)}</td></tr>`).join('');
}
const slOpts = (v) => `<option value="">–</option>${Object.entries(M.data().security.securityLevels).map(([k, l]) => `<option value="${k}"${String(v) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;
const pickList = (attr, items, sel, label) => `<div class="check-list compact">${items.map((x) => `<label><input type="checkbox" data-${attr}="${esc(x.id)}"${(sel || []).includes(x.id) ? ' checked' : ''}/> ${esc(x.id)} ${esc(label(x))}</label>`).join('') || '<span class="hint">–</span>'}</div>`;
function openZone(i) {
  const z = A.state.zones[i]; const p = Z.proposeSlT(z, A.state.threats, A.state.sd, A.secCalibration());
  const rules = M.data().security.partitionRules; const cat = M.data().security.srCatalogue;
  const reqs = A.state.requirements.filter((r) => r.status !== 'rejected');
  A.openDrawer(`${z.id} · Zone`, `
<div class="f"><label>Name</label><input id="z-name" value="${esc(z.name)}" /></div>
<div class="f"><label>Beschreibung</label><textarea id="z-desc" rows="2">${esc(z.description)}</textarea></div>
<div class="row">${[['safetyRelated', 'sicherheitsrelevant'], ['wireless', 'drahtlos'], ['temporary', 'temporär verbunden'], ['externalNetwork', 'über externes Netz'], ['it', 'IT/Geschäftsassets']].map(([k, l]) => `<label class="chk"><input type="checkbox" data-zattr="${k}"${z.attributes && z.attributes[k] ? ' checked' : ''}/> ${l}</label>`).join('')}</div>
<div class="f"><label>Funktionen</label>${pickList('zfn', A.state.functions, z.functions, (x) => x.name)}</div>
<div class="f"><label>Schnittstellen innerhalb der Zone</label>${pickList('zif', A.state.interfaces, z.interfaces, (x) => x.name)}</div>
<div class="f"><label>Partitionierungsnachweis (IEC 62443-3-2 ZCR 3)</label><div class="check-list compact">${rules.map((r) => `<label title="${esc(r.ref)}"><input type="checkbox" data-zpart="${r.id}"${z.partition && z.partition[r.id] ? ' checked' : ''}/> ${esc(r.id)} ${esc(r.text)} – geprüft</label>`).join('')}</div></div>
<div class="row"><label class="fld"><span>SL-T (Vorschlag: SL ${p.sl})</span><select id="z-sl">${slOpts(z.slT)}</select></label></div>
<div class="hint">Vorschlagsbasis: ${esc(p.basis)}</div>
<div class="f"><label>Begründung SL-T (explizite Risikobewertung)</label><textarea id="z-slr" rows="2">${esc(z.slTRationale)}</textarea></div>
<div class="f"><label>Systemanforderungen IEC 62443-3-3 (Kennung und Titel; Anforderungstext aus der Norm)</label>${cat.foundational.map((fr) => `<details${fr.srs.some((x) => (z.srs || []).includes(x.id)) ? ' open' : ''}><summary>${esc(fr.id)} ${esc(fr.label)} (${fr.srs.filter((x) => (z.srs || []).includes(x.id)).length}/${fr.srs.length})</summary><div class="check-list compact">${fr.srs.map((x) => `<label><input type="checkbox" data-zsr="${esc(x.id)}"${(z.srs || []).includes(x.id) ? ' checked' : ''}/> ${esc(x.id)} ${esc(x.title)}${(z.srs || []).includes(x.id) ? ` <select data-zsrreq="${esc(x.id)}"><option value="">– Anforderung –</option>${reqs.map((r) => `<option value="${esc(r.id)}"${(z.srRequirements || {})[x.id] === r.id ? ' selected' : ''}>${esc(r.id)}</option>`).join('')}</select>` : ''}</label>`).join('')}</div></details>`).join('')}<div class="hint">${esc(cat.source)}</div></div>
<div class="sticky-actions"><button id="z-save" class="btn primary">Speichern</button><button id="z-del" class="btn danger">Löschen</button></div>`);
  const b = A.el('drawer-body');
  A.el('z-save').onclick = async () => {
    Object.assign(z, { name: A.el('z-name').value.trim(), description: A.el('z-desc').value.trim(), slT: Number(A.el('z-sl').value) || null, slTRationale: A.el('z-slr').value.trim() });
    z.attributes = {}; b.querySelectorAll('[data-zattr]').forEach((x) => { z.attributes[x.dataset.zattr] = x.checked; });
    z.functions = [...b.querySelectorAll('[data-zfn]:checked')].map((x) => x.dataset.zfn);
    z.interfaces = [...b.querySelectorAll('[data-zif]:checked')].map((x) => x.dataset.zif);
    z.partition = {}; b.querySelectorAll('[data-zpart]').forEach((x) => { z.partition[x.dataset.zpart] = x.checked; });
    z.srs = [...b.querySelectorAll('[data-zsr]:checked')].map((x) => x.dataset.zsr);
    const map = { ...(z.srRequirements || {}) }; b.querySelectorAll('[data-zsrreq]').forEach((x) => { map[x.dataset.zsrreq] = x.value; });
    z.srRequirements = Object.fromEntries(Object.entries(map).filter(([k, v]) => z.srs.includes(k) && v));
    await saveZones(); A.toast('Zone gespeichert'); renderZones(); openZone(i);
  };
  A.el('z-del').onclick = async (e) => { if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Wirklich löschen?'; return; } A.state.zones.splice(i, 1); await saveZones(); A.closeDrawer(); renderZones(); };
}
function openConduit(i) {
  const c = A.state.conduits[i]; const p = Z.proposeSlT(c, A.state.threats, A.state.sd, A.secCalibration());
  const zopt = (v) => `<option value="">–</option>${A.state.zones.map((z) => `<option value="${esc(z.id)}"${z.id === v ? ' selected' : ''}>${esc(z.id)} ${esc(z.name)}</option>`).join('')}`;
  A.openDrawer(`${c.id} · Conduit`, `
<div class="f"><label>Name</label><input id="c-name" value="${esc(c.name)}" /></div>
<div class="row"><label class="fld"><span>Zone A</span><select id="c-za">${zopt(c.zones[0])}</select></label><label class="fld"><span>Zone B</span><select id="c-zb">${zopt(c.zones[1])}</select></label></div>
<div class="f"><label>Schnittstellen im Conduit</label>${pickList('cif', A.state.interfaces, c.interfaces, (x) => x.name)}</div>
<div class="row"><label class="fld"><span>SL-T (Vorschlag: SL ${p.sl})</span><select id="c-sl">${slOpts(c.slT)}</select></label></div>
<div class="hint">Vorschlagsbasis: ${esc(p.basis)}</div>
<div class="f"><label>Begründung SL-T</label><textarea id="c-slr" rows="2">${esc(c.slTRationale)}</textarea></div>
<div class="sticky-actions"><button id="c-save" class="btn primary">Speichern</button><button id="c-del" class="btn danger">Löschen</button></div>`);
  const b = A.el('drawer-body');
  A.el('c-save').onclick = async () => { Object.assign(c, { name: A.el('c-name').value.trim(), zones: [A.el('c-za').value, A.el('c-zb').value], slT: Number(A.el('c-sl').value) || null, slTRationale: A.el('c-slr').value.trim(), interfaces: [...b.querySelectorAll('[data-cif]:checked')].map((x) => x.dataset.cif) }); await saveZones(); A.toast('Conduit gespeichert'); renderZones(); openConduit(i); };
  A.el('c-del').onclick = async (e) => { if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Wirklich löschen?'; return; } A.state.conduits.splice(i, 1); await saveZones(); A.closeDrawer(); renderZones(); };
}

function bind() {
  A.el('btn-zone-add').onclick = async () => { A.state.zones = A.state.zones || []; A.state.zones.push(Z.makeZone({ id: Z.nextId(A.state.zones, 'Z'), name: 'Neue Zone' })); await saveZones(); renderZones(); openZone(A.state.zones.length - 1); };
  A.el('btn-conduit-add').onclick = async () => { A.state.conduits = A.state.conduits || []; A.state.conduits.push(Z.makeConduit({ id: Z.nextId(A.state.conduits, 'C'), name: 'Neuer Conduit' })); await saveZones(); renderZones(); openConduit(A.state.conduits.length - 1); };
  A.el('btn-threat-add').onclick = async () => { A.state.threats = A.state.threats || []; A.state.threats.push(TL.makeThreat({ id: TL.nextThreatId(A.state.threats), title: 'Neue Bedrohung', createdBy: A.author() })); await A.saveThreats(); render(); openThreat(A.state.threats.length - 1); };
  A.el('btn-threat-derive').onclick = async () => {
    A.state.threats = A.state.threats || [];
    const add = TL.deriveFromHazards(A.state.hazards, A.state.threats, A.calibration(), A.secCalibration());
    for (const t of add) { t.id = TL.nextThreatId(A.state.threats); t.createdBy = A.author(); A.state.threats.push(t); }
    await A.saveThreats(); render(); A.refresh();
    A.toast(add.length ? `${add.length} Bedrohung(en) aus vorsätzlichen Ursachen abgeleitet` : 'Keine neuen vorsätzlichen Ursachen in akzeptierten Gefährdungen');
  };
}

A.stages.security = { render, bind };
})();
