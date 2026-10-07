// Stage 5: Berichte & Export — document control, calibration info, DOCX /
// XLSX / print exports, project JSON, checkpoints and the run history.
(function () {
const A = window.RHAS_APP, M = window.RHAS_MODEL, DATA = window.RHAS_DATA, DB = window.RHAS_DB, R = window.RHAS_REPORTS;

const DC_FIELDS = [['docId', 'Dokument-ID'], ['revision', 'Revision'], ['date', 'Datum (JJJJ-MM-TT)'], ['author', 'Ersteller (Designer)'], ['verifier', 'Prüfer (Verifier)'], ['validator', 'Validierer (Validator)'], ['dutyHolder', 'Eisenbahnbetreiber (Duty holder)'], ['supplier', 'Lieferant'], ['purpose', 'Zusatz zum Geltungsbereich (optional)']];

function renderDocControl() {
  const dc = A.state.docControl;
  const form = A.el('doc-control-form');
  form.innerHTML = `<fieldset><legend>Dokumentlenkung (EN 50126-1 6.6; EN 50129 5.3.4 Rollen)</legend>${DC_FIELDS.map(([k, label]) => `<div class="f"><label>${label}</label>${k === 'purpose' ? `<textarea data-dc="${k}" rows="2">${A.esc(dc[k] || '')}</textarea>` : `<input data-dc="${k}" value="${A.esc(dc[k] || '')}" />`}</div>`).join('')}</fieldset>
<p class="hint">Ersteller, Prüfer und Validierer sollen verschiedene Personen sein (EN 50129 5.3.4.2 a), b)); das Werkzeug dokumentiert die Rollen, erzwingt die Unabhängigkeit aber nicht.</p>`;
  form.querySelectorAll('[data-dc]').forEach((inp) => { inp.onchange = async () => { dc[inp.dataset.dc] = inp.value.trim(); if (inp.dataset.dc === 'docId') A.el('doc-id').value = dc.docId; if (inp.dataset.dc === 'revision') A.el('doc-rev').value = dc.revision; if (inp.dataset.dc === 'author') A.el('doc-author').value = dc.author; await DB.setMeta(A.state.pdb, 'docControl', dc); }; });
  const cal = A.calibration();
  A.el('calibration-info').innerHTML = `${A.esc(cal.title)} · Version ${cal.version}${cal.approvedBy ? ` · freigegeben von ${A.esc(cal.approvedBy)}` : ' · <b>nicht projektspezifisch freigegeben</b> (Anhang C ist informativ; Anzahl und Skalierung der Kategorien legt der Betreiber fest, C.1)'}<br>${A.esc(cal.note)}<div class="row"><input id="cal-approved" placeholder="Freigegeben von (Name, Datum)" value="${A.esc(cal.approvedBy || '')}" style="width:280px"/><button id="btn-cal-approve" class="btn small">Freigabe eintragen</button></div>`;
  A.el('btn-cal-approve').onclick = async () => { const by = A.el('cal-approved').value.trim(); if (!by) { A.toast('Name für die Freigabe eintragen', 'err'); return; } await A.applyCalibration({ ...JSON.parse(JSON.stringify(cal)), approvedBy: by, approvedAt: M.nowIso() }, `Freigabe der Kalibrierung durch ${by}`, true); };
}

function bundle() { return R.makeBundle({ zones: A.state.zones, conduits: A.state.conduits, threats: A.state.threats, securityCalibration: A.state.securityCalibration, profile: A.state.projectProfile, project: A.state.project, docControl: A.state.docControl, sd: A.state.sd, functions: A.state.functions, interfaces: A.state.interfaces, subsystems: A.state.subsystems, hazards: A.state.hazards, requirements: A.state.requirements, ccas: A.state.ccas, runs: A.state.runs, calibration: A.calibration(), data: DATA, version: window.RHAS_VERSION }); }
function fileBase(code) { const dc = A.state.docControl; return `${A.slug(dc.docId || code)}_Rev${A.slug(dc.revision || 'A')}_${A.slug(A.state.sd.name || A.state.project.name)}`; }

function renderExports() {
  const cards = [
    { kind: 'hazid', desc: 'Gefährdungsidentifikation (Risikobewertung Teil 1) mit Systemdefinition, Methode, Abdeckungsnachweis, verworfenen Vorschlägen.' },
    { kind: 'risk', desc: 'Risikoanalyse und -bewertung (Risikobewertung Teil 2): Kalibrierung, Szenarien, Bewertung, Maßnahmen, Restrisiko.' },
    { kind: 'hazlog', desc: 'Gefährdungsprotokoll nach EN 50126-1 7.4.2.2 a) bis g) mit exportierten Auflagen.' },
    { kind: 'srs', desc: 'Sicherheitsanforderungen, Funktionen mit TFFR/Integrität, SRAC-Verzeichnis, Nachverfolgbarkeit, CCA.' },
    { kind: 'full', desc: 'Gesamtbericht der Phasen 3 und 4 in einem Dokument.' },
  ];
  A.el('export-grid').innerHTML = cards.map((c) => `<div class="export-card"><b>${A.esc(R.DELIVERABLES[c.kind].code)} – ${A.esc(R.DELIVERABLES[c.kind].title)}</b><span>${A.esc(c.desc)}</span><div class="row"><button class="btn small primary" data-docx="${c.kind}">Word (.docx)</button><button class="btn small" data-print="${c.kind}">Druckansicht / PDF</button></div></div>`).join('') + `<div class="export-card"><b>Excel-Arbeitsmappe</b><span>Alle Artefakte als Tabellenblätter: Systemdefinition, Funktionen, Gefährdungsliste, Risikoanalyse (eine Zeile je Unfallszenario), Maßnahmen, Anforderungen, SRAC, Nachverfolgbarkeit, CCA, Abdeckung, KI-Läufe, Kalibrierung.</span><div class="row"><button id="btn-xlsx" class="btn small primary">Excel (.xlsx)</button></div></div>`;
  A.el('export-grid').querySelectorAll('[data-docx]').forEach((b) => { b.onclick = () => { try { const bytes = R.buildDocx(b.dataset.docx, bundle()); A.download(bytes, `${fileBase(R.DELIVERABLES[b.dataset.docx].code)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); A.toast('Word-Dokument erzeugt'); } catch (e) { A.toast(`Export fehlgeschlagen: ${e.message}`, 'err'); console.error(e); } }; });
  A.el('export-grid').querySelectorAll('[data-print]').forEach((b) => { b.onclick = () => { try { const html = R.buildPrintHtml(b.dataset.print, bundle()); const url = URL.createObjectURL(new Blob([html], { type: 'text/html' })); window.open(url, '_blank'); } catch (e) { A.toast(`Druckansicht fehlgeschlagen: ${e.message}`, 'err'); console.error(e); } }; });
  A.el('btn-xlsx').onclick = () => { try { const bytes = R.buildXlsx(bundle()); A.download(bytes, `${fileBase('SA')}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); A.toast('Excel-Arbeitsmappe erzeugt'); } catch (e) { A.toast(`Export fehlgeschlagen: ${e.message}`, 'err'); console.error(e); } };
}

async function renderCheckpoints() {
  const all = (await DB.listCheckpoints()).filter((c) => c.projectId === A.state.project.projectId);
  const tb = A.el('tbl-checkpoints').querySelector('tbody');
  tb.innerHTML = all.map((c) => `<tr><td>${A.esc(c.name)}${c.engineer ? ` <span class="hint">(${A.esc(c.engineer)})</span>` : ''}</td><td>${A.fmtDate(c.createdAt)}</td><td class="mono">${c.counts.functions} F · ${c.counts.hazards} H · ${c.counts.requirements} SR</td><td class="actions"><button class="btn small" data-restore="${c.checkpointId}">Als neues Projekt wiederherstellen</button><button class="btn icon" data-del="${c.checkpointId}">🗑</button></td></tr>`).join('') || '<tr><td colspan="4" class="hint">Keine Checkpoints.</td></tr>';
  tb.querySelectorAll('[data-restore]').forEach((b) => { b.onclick = async () => { const c = all.find((x) => x.checkpointId === b.dataset.restore); const p = await DB.importSnapshot(c.snap, `${A.state.project.name} (Checkpoint ${A.fmtDate(c.createdAt)})`); await A.loadProjects(); await A.openProject(p.projectId); A.toast('Checkpoint als neues Projekt wiederhergestellt'); }; });
  tb.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async (e) => { if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'Löschen?'; return; } await DB.deleteCheckpoint(b.dataset.del); renderCheckpoints(); }; });
}

function renderRuns() {
  const MODE = { identification: 'Gefährdungsidentifikation', analysis: 'Risikoanalyse', measures: 'Maßnahmen', requirements: 'Anforderungen' };
  const tb = A.el('tbl-runs').querySelector('tbody');
  tb.innerHTML = [...A.state.runs].reverse().map((r) => `<tr><td class="mono">${A.esc(r.runId)}<br><span class="hint">${A.fmtDate(r.startedAt)}</span></td><td>${A.esc(MODE[r.mode] || r.mode)}${r.depth ? ` (${A.esc(window.RHAS_ENGINE.DEPTHS[r.depth].label)})` : ''}</td><td class="mono">${A.esc(r.model)}</td><td class="mono">${r.calls}</td><td>${r.totals ? `${r.totals.proposed} Vorschläge${r.totals.failed ? `, ${r.totals.failed} Fehler` : ''}` : ''}${r.cancelled ? ' · abgebrochen' : ''}${r.stoppedBy ? ` · gestoppt (${A.esc(r.stoppedBy)})` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">Noch keine KI-Läufe.</td></tr>';
}

A.stages.reports = {
  render() { renderDocControl(); renderExports(); renderCheckpoints(); renderRuns(); },
  bind() {
    A.el('btn-export-json').onclick = async () => { const snap = await A.snapshot(); A.download(JSON.stringify(snap, null, 1), `${A.slug(A.state.project.name)}_rhas-projekt.json`, 'application/json'); };
    A.el('btn-import-json').onclick = () => A.el('import-project-file').click();
    A.el('btn-cp-create').onclick = async () => { const name = A.el('cp-name').value.trim() || `Checkpoint ${A.fmtDate(new Date().toISOString())}`; const snap = await A.snapshot(); await DB.createCheckpoint({ name, engineer: A.author(), snap, projectId: A.state.project.projectId }); A.el('cp-name').value = ''; renderCheckpoints(); A.toast('Checkpoint angelegt'); };
  },
};
})();

