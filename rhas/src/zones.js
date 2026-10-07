// Zones, conduits and SL-T for RHAS (WP5 level 3, preview). Structure follows
// the publicly described IEC 62443-3-2 ZCR process as applied by CLC/TS 50701;
// SR identifiers/titles from the public IEC 62443-3-3 contents. The SL-T value
// is set by the engineer; the tool only proposes one (never the LLM). Pure.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;
const TL = typeof require !== 'undefined' ? require('./threatlog.js') : window.RHAS_THREATLOG;
const D = () => M.data().security;

const ATTACKER_SL = { casual: 1, simple: 2, sophisticated: 3, extended: 4 };

function makeZone(f = {}) { return { id: '', name: '', description: '', functions: [], interfaces: [], subsystems: [], attributes: { safetyRelated: false, wireless: false, temporary: false, externalNetwork: false, it: false }, partition: {}, slT: null, slTRationale: '', srs: [], srRequirements: {}, notes: '', ...f }; }
function makeConduit(f = {}) { return { id: '', name: '', description: '', zones: ['', ''], interfaces: [], slT: null, slTRationale: '', ...f }; }
const nextId = (list, prefix) => `${prefix}-${String(Math.max(0, ...(list || []).map((x) => Number(String(x.id).replace(/\D/g, '')) || 0)) + 1).padStart(2, '0')}`;

/** Threats that touch a zone (via its interfaces or functions) or a conduit (via its interfaces). */
function threatsFor(item, threats) {
  const ifs = new Set(item.interfaces || []); const fns = new Set(item.functions || []);
  return (threats || []).filter((t) => (t.interfaces || []).some((i) => ifs.has(i)) || (t.functions || []).some((f) => fns.has(f)));
}

/** SL-T proposal (explicit risk evaluation, IEC 62443-3-2 ZCR 5.6): attacker profile SL where an unmitigated threat is medium or high, else SL 1. A proposal only. */
function proposeSlT(item, threats, sd, cal) {
  const ts = threatsFor(item, threats);
  const attacker = ATTACKER_SL[(sd || {}).secAttacker] || 2;
  const rank = (id) => ((TL.levelMeta(id, cal) || {}).rank || 0);
  const worst = ts.reduce((w, t) => Math.max(w, rank(t.risk)), 0);
  const sl = worst >= 2 ? attacker : 1;
  return { sl, basis: ts.length ? `${ts.length} Bedrohung(en), schlechtestes Ausgangsrisiko ${TL.levelLabel(ts.find((t) => rank(t.risk) === worst).risk, cal) || '–'}; Angreiferprofil ${(sd || {}).secAttacker || 'nicht festgelegt (SL 2 angenommen)'}` : 'keine zugeordneten Bedrohungen' };
}

function check({ zones, conduits, functions, interfaces }) {
  const f = [];
  const zf = new Map(); (zones || []).forEach((z) => (z.functions || []).forEach((id) => zf.set(id, (zf.get(id) || []).concat(z.id))));
  for (const fn of functions || []) { const zs = zf.get(fn.id) || []; if (!zs.length) f.push({ level: 'warn', text: `Funktion ${fn.id} keiner Zone zugeordnet.` }); if (zs.length > 1) f.push({ level: 'warn', text: `Funktion ${fn.id} in mehreren Zonen (${zs.join(', ')}).` }); }
  const assigned = new Set([...(zones || []).flatMap((z) => z.interfaces || []), ...(conduits || []).flatMap((c) => c.interfaces || [])]);
  for (const it of interfaces || []) if (!assigned.has(it.id)) f.push({ level: 'warn', text: `Schnittstelle ${it.id} weder Zone noch Conduit zugeordnet.` });
  const fnSafe = new Map((functions || []).map((x) => [x.id, x.safetyRelated === true]));
  for (const z of zones || []) {
    const kinds = new Set((z.functions || []).map((id) => fnSafe.get(id)));
    if (kinds.has(true) && kinds.has(false)) f.push({ level: 'warn', text: `${z.id}: sicherheitsrelevante und nicht sicherheitsrelevante Funktionen gemischt (IEC 62443-3-2 ZCR 3.3).` });
    if (!z.slT) f.push({ level: 'error', text: `${z.id}: SL-T fehlt (IEC 62443-3-2 ZCR 5.6).` });
    else if (!String(z.slTRationale || '').trim()) f.push({ level: 'error', text: `${z.id}: Begründung des SL-T fehlt.` });
    const open = (D().partitionRules || []).filter((r) => !(z.partition && z.partition[r.id]));
    if (open.length) f.push({ level: 'info', text: `${z.id}: Partitionierungsnachweis offen für ${open.map((r) => r.ref.replace('IEC 62443-3-2 ', '')).join(', ')}.` });
    if (!(z.srs || []).length) f.push({ level: 'warn', text: `${z.id}: keine Systemanforderungen (IEC 62443-3-3) zugeordnet.` });
  }
  const zSl = new Map((zones || []).map((z) => [z.id, Number(z.slT) || 0]));
  for (const c of conduits || []) {
    const [a, b] = c.zones || [];
    if (!a || !b || a === b) f.push({ level: 'error', text: `${c.id}: Conduit muss zwei verschiedene Zonen verbinden.` });
    if (!c.slT) f.push({ level: 'error', text: `${c.id}: SL-T fehlt.` });
    else if (Number(c.slT) < Math.max(zSl.get(a) || 0, zSl.get(b) || 0)) f.push({ level: 'warn', text: `${c.id}: SL-T ${c.slT} unter dem SL-T einer verbundenen Zone; Begründung prüfen.` });
  }
  return { ok: !f.some((x) => x.level === 'error'), findings: f };
}

/** Cybersecurity case skeleton (IEC 62443-3-2 ZCR 6; TS 50701 clause 9): what exists, what is open. */
function caseSkeleton({ sd, zones, conduits, threats, securityCalibration, profile, requirements }) {
  const s = sd || {};
  const has = (v) => (Array.isArray(v) ? v.length > 0 : !!String(v || '').trim());
  const rows = [
    ['Beschreibung des betrachteten Systems (SuC)', 'ZCR 6.2', has(s.description) && has(s.boundary)],
    ['Zonen- und Conduit-Darstellung', 'ZCR 6.3', has(zones) && has(conduits)],
    ['Eigenschaften der Zonen und Conduits (SL-T, Assets)', 'ZCR 6.4', has(zones) && zones.every((z) => z.slT)],
    ['Annahmen zur Betriebsumgebung', 'ZCR 6.5', has(s.secAccess) && has(s.assumptions)],
    ['Bedrohungsumgebung', 'ZCR 6.6', has(threats) && has(s.secAttacker)],
    ['Organisatorische Security-Richtlinien', 'ZCR 6.7', false],
    ['Tolerierbares Risiko (Security-Risikomatrix, freigegeben)', 'ZCR 6.8', !!(securityCalibration && securityCalibration.approvedBy)],
    ['Regulatorische Anforderungen', 'ZCR 6.9', has(profile && profile.country)],
    ['Security-bezogene Anforderungen und Anwendungsbedingungen', 'TS 50701 Abschnitt 8', (requirements || []).some((r) => r.securityRelated)],
    ['Verifikation, Validierung und Übergabe', 'TS 50701 Abschnitt 9', false],
  ];
  return rows.map(([item, ref, ok]) => ({ item, ref, status: ok ? 'vorhanden' : 'offen' }));
}

function srTitle(id) { for (const fr of D().srCatalogue.foundational) for (const sr of fr.srs) if (sr.id === id) return sr.title; return ''; }

const api = { ATTACKER_SL, makeZone, makeConduit, nextId, threatsFor, proposeSlT, check, caseSkeleton, srTitle };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RHAS_ZONES = api;
})();
