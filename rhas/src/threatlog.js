// Threat log for RHAS (WP5 level 2): threats with exposure, vulnerability and
// impact, a locally computed security risk (never by the LLM), countermeasures
// with residual risk, and traceability threat -> hazard -> requirement.
// Likelihood = exposure + vulnerability - 1 as publicly described for
// CLC/TS 50701; scale texts and matrix are a RHAS proposal to be calibrated.
// Pure module, testable under Node.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;
const SEC = typeof require !== 'undefined' ? require('./security.js') : window.RHAS_SECURITY;
const clone = (o) => JSON.parse(JSON.stringify(o));
const defaultCalibration = () => clone(M.data().security.riskCalibration);

function likelihood(exposure, vulnerability) {
  const e = Number(exposure), v = Number(vulnerability);
  if (!(e >= 1 && e <= 3 && v >= 1 && v <= 3)) return null;
  return e + v - 1;
}
function riskOf(impact, lh, cal) {
  const c = cal || defaultCalibration();
  if (!impact || !lh) return null;
  return (c.matrix[impact] && c.matrix[impact][String(lh)]) || null;
}
function levelMeta(id, cal) { return ((cal || defaultCalibration()).levels || []).find((l) => l.id === id) || null; }
function levelLabel(id, cal) { const l = levelMeta(id, cal); return l ? l.label : ''; }
function worse(a, b, cal) { const ra = (levelMeta(a, cal) || {}).rank || 0; const rb = (levelMeta(b, cal) || {}).rank || 0; return ra >= rb ? a : b; }

/** Proposed minimum impact from the worst linked safety severity (by position in the safety calibration). Marked as a proposal: TS 50701 Table E.2 defines the mapping but is not public. */
function impactFloor(hazards, safetyCal, cal) {
  const c = cal || defaultCalibration();
  const sev = M.severityIds(safetyCal); // worst first
  const impacts = c.impacts.map((x) => x.id); // worst first
  let best = null;
  for (const h of hazards || []) for (const a of h.accidents || []) {
    const i = sev.indexOf(a.severity); if (i < 0) continue;
    const pos = sev.length > 1 ? Math.round((i / (sev.length - 1)) * (impacts.length - 1)) : 0;
    if (best == null || pos < best) best = pos;
  }
  return best == null ? '' : impacts[best];
}

function makeThreat(fields = {}) {
  return {
    id: '', title: '', description: '', threatClasses: [], actor: '', interfaces: [], functions: [], hazards: [], sourceCause: '',
    cia: { c: false, i: true, a: false },
    exposure: null, exposureRationale: '', vulnerability: null, vulnerabilityRationale: '', impact: '', impactRationale: '',
    likelihood: null, risk: null, residualRisk: null,
    countermeasures: [], status: 'open', owner: '', notes: '',
    createdAt: M.nowIso(), createdBy: '', updatedAt: M.nowIso(), updatedBy: '', ...fields,
  };
}
function makeCountermeasure(fields = {}) {
  return { id: '', text: '', status: 'proposed', residualExposure: null, residualVulnerability: null, requirements: [], rationale: '', ...fields };
}

function recomputeThreat(t, cal) {
  t.likelihood = likelihood(t.exposure, t.vulnerability);
  t.risk = riskOf(t.impact, t.likelihood, cal);
  let residual = null;
  for (const m of (t.countermeasures || []).filter((x) => x.status === 'accepted')) {
    const r = riskOf(t.impact, likelihood(m.residualExposure || t.exposure, m.residualVulnerability || t.vulnerability), cal);
    if (r && (!residual || worse(residual, r, cal) === residual)) residual = r;
  }
  t.residualRisk = residual || t.risk;
  return t;
}

function threatCompleteness(t, cal, requirements) {
  const p = [];
  if (!t.title) p.push('Titel fehlt');
  if (!(t.hazards || []).length) p.push('Keine verknüpfte Gefährdung (Sicherheitsbezug fehlt)');
  if (!t.exposure || !String(t.exposureRationale || '').trim()) p.push('Exposition mit Begründung fehlt');
  if (!t.vulnerability || !String(t.vulnerabilityRationale || '').trim()) p.push('Verwundbarkeit mit Begründung fehlt');
  if (!t.impact || !String(t.impactRationale || '').trim()) p.push('Auswirkung mit Begründung fehlt');
  const must = (id) => !!(levelMeta(id, cal) || {}).mustReduce;
  if (t.risk && must(t.risk) && (!t.residualRisk || must(t.residualRisk))) p.push('Hohes Security-Risiko ohne wirksame Gegenmaßnahme');
  const reqIds = new Set((requirements || []).map((r) => r.id));
  for (const m of (t.countermeasures || []).filter((x) => x.status === 'accepted')) if (!(m.requirements || []).some((id) => reqIds.has(id))) p.push(`Gegenmaßnahme ${m.id || ''} ohne Anforderung`.replace('  ', ' '));
  return { ok: p.length === 0, evaluated: !!t.risk, problems: p };
}

function validateCalibration(cal) {
  const f = [];
  for (const i of cal.impacts || []) for (let l = 1; l <= 5; l++) { const v = cal.matrix[i.id] && cal.matrix[i.id][String(l)]; if (!v) f.push({ level: 'error', text: `Zelle ${i.id}/${l} ohne Stufe` }); else if (!levelMeta(v, cal)) f.push({ level: 'error', text: `Zelle ${i.id}/${l}: unbekannte Stufe ${v}` }); }
  if (!cal.approvedBy) f.push({ level: 'warn', text: 'Security-Risikomatrix nicht freigegeben (Festlegung durch den Betreiber).' });
  return { ok: !f.some((x) => x.level === 'error'), findings: f };
}

/** One threat per deliberate cause of an accepted hazard that is not yet in the log (deterministic, no AI). */
function deriveFromHazards(hazards, threats, safetyCal, cal) {
  const have = new Set((threats || []).map((t) => `${(t.hazards || [])[0]}|${String(t.sourceCause || '').toLowerCase()}`));
  const out = [];
  for (const h of (hazards || []).filter((x) => x.review && x.review.decision === 'accepted')) {
    for (const c of (h.causes || []).filter((x) => x.kind === 'intentional')) {
      const key = `${h.id}|${c.text.toLowerCase()}`;
      if (have.has(key)) continue;
      have.add(key);
      out.push(makeThreat({ title: c.text, description: `Vorsätzliche Ursache der Gefährdung ${h.id} „${h.title}“.`, sourceCause: c.text, hazards: [h.id], interfaces: [...(h.interfaces || [])], functions: [...(h.functions || [])], threatClasses: [...(h.threats || [])], impact: impactFloor([h], safetyCal, cal), impactRationale: '' }));
    }
  }
  return out;
}

function nextThreatId(threats) {
  const n = Math.max(0, ...(threats || []).map((t) => Number(String(t.id).replace(/\D/g, '')) || 0));
  return `T-${String(n + 1).padStart(4, '0')}`;
}

/** Threat -> hazard -> requirement rows for the traceability table. */
function traceRows(threats, hazards, requirements) {
  const rows = [];
  for (const t of threats || []) {
    const reqs = new Set((t.countermeasures || []).flatMap((m) => m.requirements || []));
    for (const r of requirements || []) if (r.securityRelated && (r.hazards || []).some((h) => (t.hazards || []).includes(h))) reqs.add(r.id);
    rows.push({ threat: t.id, hazards: t.hazards || [], requirements: [...reqs] });
  }
  return rows;
}

const api = { defaultCalibration, likelihood, riskOf, levelMeta, levelLabel, impactFloor, makeThreat, makeCountermeasure, recomputeThreat, threatCompleteness, validateCalibration, deriveFromHazards, nextThreatId, traceRows };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RHAS_THREATLOG = api;
})();
