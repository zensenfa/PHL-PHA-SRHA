// Security extension for RHAS (WP5, levels 0 and 1). Level 1 = security-informed
// safety: deliberate causes (excluded from hazard identification by EN 50126-1
// 7.4.2.1 d)) are analysed per interface with EN 50159 transmission threats plus
// DoS, eavesdropping, physical tampering and malicious configuration/software.
// No THR/SIL credit for deliberate causes (EN 50129 6.4, NOTE 2). Pure module.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;
const DATA = () => M.data().security;

const CONTEXT_FIELDS = [
  { key: 'secAttacker', label: 'Angreiferprofil (angenommen)', type: 'select', options: () => DATA().attackerProfiles, ref: 'IEC 62443-3-3 (SL-Definitionen)' },
  { key: 'secTransmission', label: 'Kategorie der Übertragung', type: 'select', options: () => DATA().transmissionCategories, ref: 'EN 50159' },
  { key: 'secAccess', label: 'Physische Zugänglichkeit der Komponenten', type: 'text', ref: 'EN 50129 6.4' },
  { key: 'secMaintenance', label: 'Wartungs-, Diagnose- und Parametrierzugänge', type: 'text', ref: 'IEC 62443-3-2 ZCR 3.4' },
  { key: 'secUpdate', label: 'Software- und Firmware-Aktualisierung', type: 'text', ref: 'EN 50716; IEC 62443-3-3 SR 3.4' },
  { key: 'secKeys', label: 'Schlüssel- und Berechtigungsverwaltung', type: 'text', ref: 'IEC 62443-3-3 FR 1' },
];

function level(profile) { return Number(profile && profile.security && profile.security.level) || 0; }
function threats() { return DATA().threats; }
function threatIds() { return threats().map((t) => t.id); }
function threatLabel(id) { const t = threats().find((x) => x.id === id); return t ? t.label : id; }

function validateContext(sd, lvl) {
  if (lvl < 1) return { ok: true, findings: [] };
  const f = CONTEXT_FIELDS.filter((x) => !String((sd || {})[x.key] || '').trim()).map((x) => ({ level: 'warn', field: x.key, text: `Security-Kontext: ${x.label} fehlt (${x.ref}).` }));
  return { ok: true, findings: f };
}

function contextLines(sd) {
  const s = sd || {};
  const opt = (x) => { const o = x.options ? x.options() : null; return o ? (o[s[x.key]] || s[x.key] || '-') : (s[x.key] || '-'); };
  return CONTEXT_FIELDS.map((x) => `${x.label}: ${opt(x)}`).join('\n');
}

const isIntentional = (c) => c && c.kind === 'intentional';
function hazardSecurity(h) {
  const causes = (h.causes || []).filter(isIntentional);
  const measures = (h.measures || []).filter((m) => m.status !== 'rejected' && m.securityRelated);
  return { intentional: causes.length > 0, causes, measures, threats: h.threats || [] };
}

/** Interfaces that got a threat pass in a successful run (coverage evidence). */
function coverage(interfaces, runs, hazards) {
  const done = new Set();
  for (const r of runs || []) for (const p of r.passes || []) if (p.kind === 'threat' && p.ok) done.add(p.unit);
  return (interfaces || []).map((i) => ({ id: i.id, name: i.name, analysed: done.has(i.id), hazards: (hazards || []).filter((h) => h.review && h.review.decision === 'accepted' && (h.interfaces || []).includes(i.id) && hazardSecurity(h).intentional).length }));
}

const api = { CONTEXT_FIELDS, level, threats, threatIds, threatLabel, validateContext, contextLines, hazardSecurity, coverage };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RHAS_SECURITY = api;
})();
