// Stage 3: Risikoanalyse & -bewertung — per accepted hazard: causes, accident
// scenarios with frequency × severity, locally computed risk class, broadly
// acceptable decision, RAP + RAC, existing barriers, measures with residual
// risk, THR. AI proposals land in the drawer as pending boxes and are only
// applied on explicit confirmation.
(function () {
const A = window.RHAS_APP, M = window.RHAS_MODEL, DATA = window.RHAS_DATA, E = window.RHAS_ENGINE;
let cached = [];

const accepted = () => A.state.hazards.filter((h) => h.review && h.review.decision === 'accepted');
const CAL = () => A.calibration();

function stageOf(h) { const c = M.hazardCompleteness(h); return c.controlled ? 'controlled' : c.evaluated ? 'evaluated' : c.analysed ? 'analysed' : 'identified'; }

function filtered() {
  const q = A.el('an-search').value.trim().toLowerCase(), st = A.el('an-f-stage').value, rc = A.el('an-f-class').value, src = A.el('an-f-source').value;
  return accepted().filter((h) => {
    if (src && h.sourceCategory !== src) return false;
    if (rc && h.riskClass !== rc) return false;
    if (st === 'incomplete') { if (M.hazardCompleteness(h).controlled) return false; }
    else if (st === 'proposal') { if (!A.state.proposals.analysis[h.id] && !A.state.proposals.measures[h.id]) return false; }
    else if (st && stageOf(h) !== st) return false;
    return !q || `${h.id} ${h.title} ${h.description}`.toLowerCase().includes(q);
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function renderFilters() {
  const keep = (id, html) => { const s = A.el(id); const v = s.value; s.innerHTML = html; s.value = v; };
  keep('an-f-class', '<option value="">Alle Risikoklassen</option>' + M.riskClassIds().map((c) => `<option value="${c}">${M.label('riskClass', c)}</option>`).join(''));
  keep('an-f-source', '<option value="">Alle Quellen</option>' + DATA.sources.map((s) => `<option value="${s.id}">${s.code} ${A.esc(s.title)}</option>`).join(''));
}

function worst(h, key) { const ranked = key === 'severity' ? M.severityIds() : M.frequencyIds(); let best = ''; for (const a of h.accidents || []) { if (a[key] && (best === '' || ranked.indexOf(a[key]) < ranked.indexOf(best))) best = a[key]; } return best; }

function renderTable() {
  cached = filtered();
  const tb = A.el('tbl-analysis').querySelector('tbody');
  const P = A.state.proposals;
  tb.innerHTML = cached.map((h) => { const c = M.hazardCompleteness(h); const stg = stageOf(h); const prop = (P.analysis[h.id] ? A.pill('proposal', 'KI-Analyse') : '') + (P.measures[h.id] ? ' ' + A.pill('proposal', 'KI-Maßn.') : ''); return `<tr data-id="${h.id}" class="${A.state.drawer && A.state.drawer.id === h.id ? 'sel' : ''}"><td class="id">${h.id}</td><td><span class="title">${A.esc(h.title)}</span><span class="desc">${A.esc(h.description)}</span></td><td class="mono">${(h.causes || []).length}</td><td class="mono">${(h.accidents || []).filter((a) => a.severity).length}/${(h.accidents || []).length}</td><td>${A.esc(M.label('severity', worst(h, 'severity')) || '–')}</td><td>${A.esc(M.label('frequency', worst(h, 'frequency')) || '–')}</td><td>${A.riskPill(h.riskClass)}</td><td>${h.broadlyAcceptable && h.broadlyAcceptable.decision === true ? A.pill('accepted', 'w. akz.') : h.rap && h.rap.principle ? A.pill('gray', h.rap.principle.toUpperCase()) : '–'}</td><td class="mono">${(h.measures || []).filter((m) => m.status !== 'rejected').length}</td><td>${A.riskPill(h.residualRiskClass)}</td><td>${A.pill(stg === 'controlled' ? 'accepted' : stg === 'identified' ? 'pending' : 'gray', M.label('hazardStatus', stg))} ${prop}${c.problems.length && stg !== 'controlled' ? `<span class="hint" title="${A.esc(c.problems.join('\n'))}"> ⚠</span>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="11" class="hint">${accepted().length ? 'Keine Treffer.' : 'Noch keine übernommenen Gefährdungen. In Stufe 2 Vorschläge übernehmen oder manuell erfassen.'}</td></tr>`;
  A.el('an-count').textContent = `${cached.length} von ${accepted().length}`;
  tb.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => open(tr.dataset.id); });
}

// ---------------------------------------------------------- risk summary ----
function renderSummary() {
  const p = A.el('risk-summary'); if (p.classList.contains('hidden')) return;
  const st = A.state.stats || M.projectStats({ hazards: A.state.hazards, requirements: A.state.requirements, functions: A.state.functions, sd: A.state.sd });
  const cal = CAL();
  const heat = `<table class="heat"><thead><tr><th>Häufigkeit \\ Schadensausmaß</th>${cal.severities.map((s) => `<th>${A.esc(s.label)}</th>`).join('')}</tr></thead><tbody>${cal.frequencies.map((f) => `<tr><th>${A.esc(f.label)}</th>${cal.severities.map((s) => { const rc = cal.matrix[f.id][s.id]; const n = st.heat[f.id][s.id]; return `<td class="pill ${rc}" style="display:table-cell;border-radius:0;opacity:${n ? 1 : .45}">${n || ''}</td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
  p.innerHTML = `<div class="kpis">${M.riskClassIds().map((c) => `<div class="kpi"><b>${st.byClass[c]}</b><span>${M.label('riskClass', c)} (Ausgangsrisiko)</span></div>`).join('')}<div class="kpi"><b>${st.hazards.broadlyAcceptable}</b><span>weitgehend akzeptabel</span></div>${M.riskClassIds().map((c) => `<div class="kpi"><b>${st.residualByClass[c]}</b><span>${M.label('riskClass', c)} (Restrisiko)</span></div>`).join('')}</div>
<div class="cov-grid"><div><div class="lbl">Unfallszenarien je Häufigkeit × Schadensausmaß (Kalibrierung ${A.esc(cal.id)} v${cal.version})</div>${heat}</div>
<div><div class="lbl">Risikoakzeptanzkategorien (Projektkalibrierung, EN 50126-1 Anhang C)</div><table class="grid">${cal.riskClasses.map((r) => `<tr><td>${A.riskPill(r.id)}</td><td>${A.esc(r.action)}</td></tr>`).join('')}</table></div></div>`;
}

// --------------------------------------------------------------- drawer ----
function open(id) {
  const h = A.state.hazards.find((x) => x.id === id); if (!h) return;
  A.state.drawer = { kind: 'analysis', id };
  document.querySelectorAll('#tbl-analysis tr').forEach((r) => r.classList.toggle('sel', r.dataset.id === id));
  const idx = cached.findIndex((x) => x.id === id);
  const nav = `<button class="btn small" id="an-prev"${idx <= 0 ? ' disabled' : ''}>↑</button> <span class="mono">${idx + 1}/${cached.length}</span> <button class="btn small" id="an-next"${idx >= cached.length - 1 ? ' disabled' : ''}>↓</button>`;
  const cal = CAL();
  const comp = M.hazardCompleteness(h);
  const sevOpts = (v) => A.opts(Object.fromEntries(cal.severities.map((s) => [s.id, s.label])), v, '–');
  const freqOpts = (v) => A.opts(Object.fromEntries(cal.frequencies.map((f) => [f.id, f.label])), v, '–');
  const accRow = (a, i) => `<div class="sub-list" data-acc="${i}"><div class="row"><b>Szenario ${i + 1}</b><span class="spacer"></span>${A.riskPill(a.riskClass)}<button class="btn icon" data-del-acc="${i}">🗑</button></div><textarea data-a="description" rows="2" placeholder="Unfallszenario">${A.esc(a.description)}</textarea><div class="row">Betroffene: ${Object.entries(M.LABELS.affected).map(([k, v]) => `<label class="chk"><input type="checkbox" data-aff="${k}"${(a.affected || []).includes(k) ? ' checked' : ''}/> ${v}</label>`).join(' ')}</div><div class="row"><label class="fld"><span>Schadensausmaß</span><select data-a="severity">${sevOpts(a.severity)}</select></label><label class="fld"><span>Häufigkeit</span><select data-a="frequency">${freqOpts(a.frequency)}</select></label></div><textarea data-a="severityRationale" rows="2" placeholder="Begründung Schadensausmaß (≥ 2 Sätze)">${A.esc(a.severityRationale)}</textarea><textarea data-a="frequencyRationale" rows="2" placeholder="Begründung Häufigkeit (Exposition, je Einzelinstanz)">${A.esc(a.frequencyRationale)}</textarea></div>`;
  const barRow = (b, i) => `<div class="row" data-bar="${i}"><input data-b="text" value="${A.esc(b.text)}" style="flex:2" placeholder="Barriere" /><select data-b="type">${A.opts(M.LABELS.barrierType, b.type)}</select><input data-b="effectiveness" value="${A.esc(b.effectiveness || '')}" placeholder="Wirksamkeit" /><label class="chk"><input type="checkbox" data-b="becomesSrac"${b.becomesSrac ? ' checked' : ''}/> außerhalb → SRAC</label><button class="btn icon" data-del-bar="${i}">🗑</button></div>`;
  const measRow = (m, i) => `<div class="sub-list" data-meas="${i}"><div class="row"><b>${A.esc(m.id || `M${i + 1}`)}</b>${A.pill(m.status === 'accepted' ? 'accepted' : m.status === 'rejected' ? 'rejected' : 'pending', m.status === 'accepted' ? 'bestätigt' : m.status === 'rejected' ? 'verworfen' : 'vorgeschlagen')}<span class="spacer"></span><span class="riskline">Restrisiko ${A.riskPill(m.residualRiskClass)}</span><button class="btn icon" data-m-acc="${i}" title="bestätigen">✓</button><button class="btn icon" data-m-rej="${i}" title="verwerfen">✗</button><button class="btn icon" data-del-meas="${i}">🗑</button></div><textarea data-m="text" rows="2">${A.esc(m.text)}</textarea><div class="row"><select data-m="type">${A.opts(M.LABELS.measureType, m.type)}</select><select data-m="hierarchy">${A.opts(M.LABELS.hierarchy, m.hierarchy)}</select></div><div class="row"><label class="fld"><span>Rest-Schadensausmaß</span><select data-m="residualSeverity">${sevOpts(m.residualSeverity)}</select></label><label class="fld"><span>Rest-Häufigkeit</span><select data-m="residualFrequency">${freqOpts(m.residualFrequency)}</select></label><label class="chk"><input type="checkbox" data-m="becomesSrac"${m.becomesSrac ? ' checked' : ''}/> außerhalb der Systemgrenze</label><label class="chk" title="Beherrscht vorsätzliche Ursachen (EN 50129 6.4)"><input type="checkbox" data-m="securityRelated"${m.securityRelated ? ' checked' : ''}/> Security-Maßnahme</label></div><textarea data-m="rationale" rows="2" placeholder="Wirkmechanismus und Begründung des Restrisikos">${A.esc(m.rationale)}</textarea></div>`;
  const ba = h.broadlyAcceptable || {}; const rap = h.rap || {}; const thr = h.thr || {};
  const PA = A.state.proposals.analysis[h.id], PM = A.state.proposals.measures[h.id];
  A.openDrawer(`${h.id} · ${M.label('hazardStatus', stageOf(h))}`, `
${comp.problems.length ? `<div class="findings"><b>Offen:</b> ${comp.problems.map(A.esc).join(' · ')}</div>` : '<div class="findings ok">Analyse, Bewertung und Beherrschung vollständig dokumentiert.</div>'}
<div class="kv"><b>Titel</b><span>${A.esc(h.title)}</span><b>Beschreibung</b><span>${A.esc(h.description)}</span><b>Quelle / Funktionen</b><span>${A.esc(A.sourceLabel(h.sourceCategory))} · ${(h.functions || []).map(A.fnName).map(A.esc).join(', ') || '–'}</span></div>
${PA ? renderAnalysisProposal(h, PA) : ''}
<div class="row" style="margin-top:8px"><button id="an-ai-one" class="btn"${A.state.run ? ' disabled' : ''}>KI: Risikoanalyse für ${h.id}</button><button id="ms-ai-one" class="btn"${A.state.run ? ' disabled' : ''}>KI: Maßnahmen für ${h.id}</button></div>
<h4>Ursachen und Auslöser (7.4.2.1 Schritt 2)</h4>
<div class="f"><label>Ursachen (eine je Zeile, „| systematic/random/human/external/intentional“)</label><textarea id="an-causes" rows="3">${A.esc((h.causes || []).map((c) => `${c.text} | ${c.kind}`).join('\n'))}</textarea></div>
<div class="f"><label>Auslösendes Ereignis</label><input id="an-trigger" value="${A.esc(h.triggeringEvent)}" /></div>
<div class="f"><label>Bedingungen (eine je Zeile)</label><textarea id="an-cond" rows="2">${A.esc((h.enablingConditions || []).join('\n'))}</textarea></div>
<div class="f"><label>Gefährdung auf Ebene Eisenbahnsystem</label><input id="an-railway" value="${A.esc(h.railwayHazard || '')}" /></div>
<h4>Unfallszenarien und Risiko (Kalibrierung ${A.esc(cal.id)})</h4>
<div id="an-accidents">${(h.accidents || []).map(accRow).join('')}</div>
<button id="an-add-acc" class="btn small">+ Szenario</button>
<div class="riskline" style="margin-top:6px"><b>Risikoklasse (schlechtestes Szenario):</b> <span id="an-risk">${A.riskPill(h.riskClass)}</span></div>
<h4>Bewertung (6.3, EN 50126-2 8.3)</h4>
<div class="f"><label>Weitgehend akzeptabel?</label><select id="an-ba">${A.opts({ '': 'nicht entschieden', false: 'Nein — Risikoakzeptanzprinzip anwenden', true: 'Ja — keine weitere Maßnahme vernünftig' }, ba.decision == null ? '' : String(ba.decision))}</select></div>
<div class="f"><label>Begründung</label><textarea id="an-ba-just" rows="2">${A.esc(ba.justification || '')}</textarea></div>
<div class="f"><label>Begründung der Abweichung (nur wenn die Risikoklasse Maßnahmen erfordert)</label><textarea id="an-ba-override" rows="2">${A.esc(ba.overrideReason || '')}</textarea></div>
<div class="f"><label>Risikoakzeptanzprinzip</label><select id="an-rap">${A.opts(M.LABELS.rap, rap.principle, '–')}</select></div>
<div class="f"><label>Referenz (Regelwerk / Referenzsystem)</label><input id="an-rap-ref" value="${A.esc(rap.reference || '')}" /></div>
<div class="f"><label>Risikoakzeptanzkriterium (bei ERE)</label><select id="an-rac">${A.opts(M.LABELS.rac, rap.rac, '–')}</select></div>
<div class="f"><label>Begründung der Prinzipwahl</label><textarea id="an-rap-just" rows="2">${A.esc(rap.justification || '')}</textarea></div>
<div class="f"><label>THR [1/h] (Eingabe, nie geschätzt)</label><input id="an-thr" value="${thr.valuePerHour != null ? A.esc(String(thr.valuePerHour)) : ''}" placeholder="z. B. 1e-8" /></div>
<div class="f"><label>Herkunft der THR</label><select id="an-thr-origin">${A.opts(M.LABELS.thrOrigin, thr.origin, '–')}</select></div>
<div class="f"><label>Begründung / Ableitung</label><textarea id="an-thr-just" rows="2">${A.esc(thr.justification || '')}</textarea></div>
<h4>Bestehende Barrieren (7.4.2.1 Schritt 3)</h4>
<div id="an-barriers">${(h.existingBarriers || []).map(barRow).join('')}</div>
<button id="an-add-bar" class="btn small">+ Barriere</button>
<h4>Maßnahmen und Restrisiko (7.4.2.1 Schritte 4–5, 5.9.2)</h4>
${PM ? renderMeasuresProposal(h, PM) : ''}
<div id="an-measures">${(h.measures || []).map(measRow).join('')}</div>
<button id="an-add-meas" class="btn small">+ Maßnahme</button>
<div class="riskline"><b>Restrisiko:</b> <span id="an-residual">${A.riskPill(h.residualRiskClass)}</span></div>
<div class="f"><label>Verantwortliche Stelle</label><input id="an-owner" value="${A.esc(h.responsibleEntity || '')}" /></div>
<div class="audit">${A.esc(M.label('method', h.method))} · geändert ${A.fmtDate(h.updatedAt)}${h.updatedBy ? ` von ${A.esc(h.updatedBy)}` : ''}</div>
<div class="sticky-actions"><button id="an-save" class="btn primary">Speichern</button><button id="an-to-req" class="btn">→ Anforderungen</button></div>`, { nav });

  const body = A.el('drawer-body');
  const collect = () => {
    const accidents = [...body.querySelectorAll('[data-acc]')].map((box, i) => { const prev = (h.accidents || [])[i] || M.makeAccident({ id: `A${i + 1}` }); const a = { ...prev, id: prev.id || `A${i + 1}` }; box.querySelectorAll('[data-a]').forEach((el) => { a[el.dataset.a] = el.value.trim(); }); a.affected = [...box.querySelectorAll('[data-aff]:checked')].map((c) => c.dataset.aff); return a; });
    const existingBarriers = [...body.querySelectorAll('[data-bar]')].map((row) => { const b = {}; row.querySelectorAll('[data-b]').forEach((el) => { b[el.dataset.b] = el.type === 'checkbox' ? el.checked : el.value.trim(); }); return b; }).filter((b) => b.text);
    const measures = [...body.querySelectorAll('[data-meas]')].map((box, i) => { const prev = (h.measures || [])[i] || M.makeMeasure(); const m = { ...prev }; box.querySelectorAll('[data-m]').forEach((el) => { m[el.dataset.m] = el.type === 'checkbox' ? el.checked : el.value.trim(); }); return m; }).filter((m) => m.text);
    const baV = A.el('an-ba').value;
    const thrV = M.parseRate(A.el('an-thr').value);
    return { ...h, causes: A.el('an-causes').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [text, kind] = l.split('|').map((x) => x.trim()); return { text, kind: Object.keys(M.LABELS.causeKind).includes(kind) ? kind : 'systematic' }; }), triggeringEvent: A.el('an-trigger').value.trim(), enablingConditions: A.el('an-cond').value.split('\n').map((l) => l.trim()).filter(Boolean), railwayHazard: A.el('an-railway').value.trim(), accidents, existingBarriers, measures, broadlyAcceptable: { decision: baV === '' ? null : baV === 'true', justification: A.el('an-ba-just').value.trim(), overrideReason: A.el('an-ba-override').value.trim(), by: A.author(), at: M.nowIso() }, rap: { principle: A.el('an-rap').value, reference: A.el('an-rap-ref').value.trim(), rac: A.el('an-rac').value, justification: A.el('an-rap-just').value.trim() }, thr: { valuePerHour: thrV, origin: A.el('an-thr-origin').value, justification: A.el('an-thr-just').value.trim() }, responsibleEntity: A.el('an-owner').value.trim() };
  };
  const live = () => { const tmp = M.recomputeHazardRisk(collect(), cal); A.el('an-risk').innerHTML = A.riskPill(tmp.riskClass); A.el('an-residual').innerHTML = A.riskPill(tmp.residualRiskClass); body.querySelectorAll('[data-acc]').forEach((box, i) => { const pill = box.querySelector('.pill'); if (pill && tmp.accidents[i]) pill.outerHTML = A.riskPill(tmp.accidents[i].riskClass); }); body.querySelectorAll('[data-meas]').forEach((box, i) => { const line = box.querySelector('.riskline'); if (line && tmp.measures[i]) line.innerHTML = `Restrisiko ${A.riskPill(tmp.measures[i].residualRiskClass)}`; }); };
  body.querySelectorAll('select[data-a], select[data-m]').forEach((s) => { s.onchange = live; });
  const save = async () => { const rec = collect(); if (A.el('an-thr').value.trim() && rec.thr.valuePerHour == null) { A.toast('THR nicht lesbar (z. B. 1e-8)', 'err'); return null; } Object.assign(h, rec); if (stageOf(h) !== 'identified' && h.status === 'identified') h.status = stageOf(h); await A.saveHazard(h); renderTable(); A.refresh(); return h; };
  A.el('an-save').onclick = async () => { if (await save()) { A.toast('Gespeichert'); open(id); } };
  A.el('an-to-req').onclick = async () => { await save(); A.show('requirements'); };
  A.el('an-add-acc').onclick = async () => { await save(); h.accidents = [...(h.accidents || []), M.makeAccident({ id: `A${(h.accidents || []).length + 1}` })]; await A.saveHazard(h); open(id); };
  A.el('an-add-bar').onclick = async () => { await save(); h.existingBarriers = [...(h.existingBarriers || []), { text: 'Neue Barriere', type: 'frequency', effectiveness: '', becomesSrac: false }]; await A.saveHazard(h); open(id); };
  A.el('an-add-meas').onclick = async () => { await save(); h.measures = [...(h.measures || []), M.makeMeasure({ id: A.nextMeasureId(h), text: 'Neue Maßnahme', status: 'accepted' })]; await A.saveHazard(h); open(id); };
  body.querySelectorAll('[data-del-acc]').forEach((b) => { b.onclick = async () => { await save(); h.accidents.splice(Number(b.dataset.delAcc), 1); await A.saveHazard(h); open(id); }; });
  body.querySelectorAll('[data-del-bar]').forEach((b) => { b.onclick = async () => { await save(); h.existingBarriers.splice(Number(b.dataset.delBar), 1); await A.saveHazard(h); open(id); }; });
  body.querySelectorAll('[data-del-meas]').forEach((b) => { b.onclick = async () => { await save(); h.measures.splice(Number(b.dataset.delMeas), 1); await A.saveHazard(h); open(id); }; });
  body.querySelectorAll('[data-m-acc]').forEach((b) => { b.onclick = async () => { await save(); h.measures[Number(b.dataset.mAcc)].status = 'accepted'; await A.saveHazard(h); open(id); }; });
  body.querySelectorAll('[data-m-rej]').forEach((b) => { b.onclick = async () => { await save(); h.measures[Number(b.dataset.mRej)].status = 'rejected'; await A.saveHazard(h); open(id); }; });
  A.el('an-ai-one').onclick = () => runBatch([h], 'analysis');
  A.el('ms-ai-one').onclick = () => runBatch([h], 'measures');
  A.el('an-prev').onclick = () => idx > 0 && open(cached[idx - 1].id);
  A.el('an-next').onclick = () => idx < cached.length - 1 && open(cached[idx + 1].id);
  bindProposalButtons(h);
}

// ------------------------------------------------------------- proposals ----
function renderAnalysisProposal(h, p) {
  return `<div class="proposal"><h4>KI-Vorschlag Risikoanalyse (${A.fmtDate(p.at)}, ${A.esc(p.model)})${p.invalid ? ` — ${p.invalid} Szenario/Szenarien ohne gültige Kategorie (bitte setzen)` : ''}</h4>
<div class="kv"><b>Ursachen</b><span>${p.causes.map((c) => `${A.esc(c.text)} (${M.label('causeKind', c.kind)})`).join('; ')}</span><b>Auslöser</b><span>${A.esc(p.triggeringEvent)}</span><b>Bedingungen</b><span>${p.enablingConditions.map(A.esc).join('; ') || '–'}</span><b>Eisenbahn-Gefährdung</b><span>${A.esc(p.railwayHazard) || '–'}</span></div>
${p.accidents.map((a, i) => `<div class="sub-list"><b>Szenario ${i + 1}:</b> ${A.esc(a.description)} — ${A.esc(M.label('severity', a.severity) || '?')} / ${A.esc(M.label('frequency', a.frequency) || '?')} → ${A.riskPill(M.riskClassOrNull(a.frequency, a.severity, CAL()))}<br><small><b>Schadensausmaß:</b> ${A.esc(a.severityRationale)}<br><b>Häufigkeit:</b> ${A.esc(a.frequencyRationale)}</small></div>`).join('')}
${p.existingBarriers.length ? `<div><b>Barrieren:</b> ${p.existingBarriers.map((b) => `${A.esc(b.text)} (${M.label('barrierType', b.type)}${b.becomesSrac ? ', außerhalb' : ''})`).join('; ')}</div>` : ''}
<div><b>Vorgeschlagenes Prinzip:</b> ${M.label('rap', p.suggestedRap.principle)}${p.suggestedRap.reference ? ` — ${A.esc(p.suggestedRap.reference)}` : ''}: ${A.esc(p.suggestedRap.justification)}</div>
${p.broadlyAcceptableCandidate ? `<div><b>Kandidat „weitgehend akzeptabel“:</b> ${A.esc(p.broadlyAcceptableRationale)}</div>` : ''}
${p.assumptions.length ? `<div><b>Annahmen:</b> ${p.assumptions.map(A.esc).join(' · ')}</div>` : ''}
<div class="row"><button class="btn primary" data-apply-an="${h.id}">Übernehmen (in Felder eintragen)</button><button class="btn" data-discard-an="${h.id}">Verwerfen</button><span class="hint">Übernehmen ersetzt Ursachen, Auslöser, Szenarien und Barrieren; Bewertung und THR bleiben Ihre Entscheidung.</span></div></div>`;
}
function renderMeasuresProposal(h, p) {
  return `<div class="proposal"><h4>KI-Vorschlag Maßnahmen (${A.fmtDate(p.at)}, ${A.esc(p.model)})</h4>${p.measures.map((m, i) => `<div class="sub-list"><label class="chk"><input type="checkbox" data-pm="${i}" checked/> <b>${A.esc(M.label('hierarchy', m.hierarchy))}</b> · ${A.esc(M.label('measureType', m.type))}${m.becomesSrac ? ' · außerhalb der Systemgrenze' : ''}</label><div>${A.esc(m.text)}</div><small>Rest: ${A.esc(M.label('severity', m.residualSeverity) || '?')} / ${A.esc(M.label('frequency', m.residualFrequency) || '?')} → ${A.riskPill(M.riskClassOrNull(m.residualFrequency, m.residualSeverity, CAL()))}<br>${A.esc(m.rationale)}</small></div>`).join('')}<div class="row"><button class="btn primary" data-apply-ms="${h.id}">Markierte als Maßnahmen übernehmen</button><button class="btn" data-discard-ms="${h.id}">Verwerfen</button></div></div>`;
}
function bindProposalButtons(h) {
  const body = A.el('drawer-body');
  const ap = body.querySelector('[data-apply-an]'); if (ap) ap.onclick = async () => { const p = A.state.proposals.analysis[h.id]; Object.assign(h, { causes: p.causes, triggeringEvent: p.triggeringEvent, enablingConditions: p.enablingConditions, railwayHazard: p.railwayHazard, accidents: p.accidents.map((a, i) => ({ ...a, id: `A${i + 1}` })), existingBarriers: p.existingBarriers }); if (!h.rap.principle) h.rap = { ...h.rap, principle: p.suggestedRap.principle, reference: p.suggestedRap.reference, justification: p.suggestedRap.justification }; delete A.state.proposals.analysis[h.id]; await A.saveProposals(); await A.saveHazard(h); renderTable(); open(h.id); A.toast('Analyse übernommen — bitte Bewertung prüfen'); };
  const da = body.querySelector('[data-discard-an]'); if (da) da.onclick = async () => { delete A.state.proposals.analysis[h.id]; await A.saveProposals(); open(h.id); };
  const am = body.querySelector('[data-apply-ms]'); if (am) am.onclick = async () => { const p = A.state.proposals.measures[h.id]; const picked = [...body.querySelectorAll('[data-pm]:checked')].map((c) => p.measures[Number(c.dataset.pm)]); h.measures = [...(h.measures || [])]; for (const m of picked) h.measures.push({ ...m, id: A.nextMeasureId(h), status: 'accepted' }); delete A.state.proposals.measures[h.id]; await A.saveProposals(); await A.saveHazard(h); renderTable(); open(h.id); A.toast(`${picked.length} Maßnahmen übernommen`); };
  const dm = body.querySelector('[data-discard-ms]'); if (dm) dm.onclick = async () => { delete A.state.proposals.measures[h.id]; await A.saveProposals(); open(h.id); };
}

// ----------------------------------------------------------------- batch ----
async function runBatch(list, kind) {
  if (A.state.run) { A.toast('Es läuft bereits ein KI-Lauf', 'err'); return; }
  const pre = await A.checkProvider(); if (!pre.ok) { A.toast(`KI-Anbieter nicht erreichbar: ${pre.error || pre.message || ''}`, 'err'); return; }
  if (!A.aiAllowed()) return;
  const abort = new AbortController(); const runState = A.runState(); runState.tracker.start(Date.now());
  A.state.run = { abort, runState };
  const prog = A.el('an-progress'); prog.classList.remove('hidden'); A.el('btn-an-cancel').classList.remove('hidden');
  const modelName = A.modelName();
  let done = 0, failed = 0; const t0 = Date.now();
  for (const h of list) {
    if (abort.signal.aborted) break;
    prog.querySelector('.bar').style.width = `${Math.round((done / list.length) * 100)}%`; prog.querySelector('.txt').textContent = `${done + 1}/${list.length} ${h.id} ${kind === 'analysis' ? 'Risikoanalyse' : 'Maßnahmen'} … (${Math.round((Date.now() - t0) / 1000)} s)`;
    try {
      if (kind === 'analysis') { const r = await E.runRiskAnalysis({ hazard: h, ctx: A.ctx(), ...A.provider(), runState, signal: abort.signal }); A.state.proposals.analysis[h.id] = { ...r, at: M.nowIso(), model: modelName }; }
      else { const r = await E.runMeasures({ hazard: h, ctx: A.ctx(), ...A.provider(), runState, signal: abort.signal }); A.state.proposals.measures[h.id] = { measures: r, at: M.nowIso(), model: modelName }; }
      await A.saveProposals(); done++;
    } catch (e) { failed++; if (runState.breaker.tripped()) { A.toast(`Abbruch nach wiederholten Fehlern: ${e.message}`, 'err'); break; } }
    renderTable(); if (A.state.drawer && A.state.drawer.id === h.id) open(h.id);
  }
  await A.addRun({ runId: 'run_' + Date.now().toString(36), mode: kind, model: modelName, provider: A.settings.provider, startedAt: new Date(t0).toISOString(), finishedAt: M.nowIso(), calls: runState.tracker.calls, inputTokens: runState.tracker.inputTokens, outputTokens: runState.tracker.outputTokens, passes: [], cancelled: abort.signal.aborted, totals: { proposed: done, passes: list.length, failed } });
  A.state.run = null; prog.classList.add('hidden'); A.el('btn-an-cancel').classList.add('hidden');
  A.toast(`${done} Vorschläge erzeugt${failed ? `, ${failed} fehlgeschlagen` : ''}`); renderTable(); A.refresh();
}

function candidates(kind) {
  return accepted().filter((h) => { const c = M.hazardCompleteness(h); if (kind === 'analysis') return !c.analysed && !A.state.proposals.analysis[h.id]; return c.analysed && !(h.measures || []).length && !A.state.proposals.measures[h.id] && !(h.broadlyAcceptable && h.broadlyAcceptable.decision === true); });
}

A.stages.analysis = {
  render() { renderFilters(); renderTable(); renderSummary(); const ca = candidates('analysis').length, cm = candidates('measures').length; A.el('btn-an-batch').textContent = `KI: Risikoanalyse (${ca})`; A.el('btn-ms-batch').textContent = `KI: Maßnahmen (${cm})`; A.el('btn-an-batch').disabled = !ca; A.el('btn-ms-batch').disabled = !cm; },
  open,
  bind() {
    ['an-search', 'an-f-stage', 'an-f-class', 'an-f-source'].forEach((id) => { A.el(id).oninput = renderTable; A.el(id).onchange = renderTable; });
    A.el('btn-toggle-risk-summary').onclick = () => { A.el('risk-summary').classList.toggle('hidden'); renderSummary(); };
    const confirm = A.el('btn-an-confirm'); let pending = null;
    const arm = (label, fn) => { pending = fn; confirm.textContent = label; confirm.classList.remove('hidden'); };
    confirm.onclick = async () => { confirm.classList.add('hidden'); const fn = pending; pending = null; if (fn) await fn(); };
    A.el('btn-an-batch').onclick = () => { const c = candidates('analysis'); arm(`Bestätigen: ${c.length} KI-Aufrufe (Risikoanalyse)`, () => runBatch(c, 'analysis')); };
    A.el('btn-ms-batch').onclick = () => { const c = candidates('measures'); arm(`Bestätigen: ${c.length} KI-Aufrufe (Maßnahmen)`, () => runBatch(c, 'measures')); };
    A.el('btn-an-cancel').onclick = () => { if (A.state.run) A.state.run.abort.abort(); };
  },
};
})();

