// Project profile for the Railway Hazard Analysis Suite (RHAS), WP2.
// Captured by the setup wizard at project start and changed later only with a
// logged reason. Pure: no DOM, no storage, testable under Node. Every option
// carries its normative anchor so the report can show why it matters.
(function () {
const OPTIONS = {
  role: {
    label: 'Rolle im Projekt', ref: 'EN 50126-1 5.3.2; EN 50126-2 5.6',
    values: { im: 'Infrastrukturbetreiber (Duty Holder)', ru: 'Eisenbahnverkehrsunternehmen (Duty Holder)', integrator: 'Systemintegrator', supplier: 'Produktlieferant' },
  },
  domain: {
    label: 'Domäne', ref: 'EN 50126-1 5.3.3',
    values: { ccs: 'Zugsteuerung, Zugsicherung und Signaltechnik (inkl. Warnsysteme)', rollingStock: 'Fahrzeuge', fixedInstallations: 'Ortsfeste Anlagen (Energieversorgung, Oberleitung)', telecom: 'Telekommunikation', other: 'Sonstiges' },
  },
  systemLevel: {
    label: 'Betrachtungsebene', ref: 'EN 50126-1 6.5.2',
    values: { railwaySystem: 'Eisenbahnsystem', system: 'System', subsystem: 'Teilsystem', equipment: 'Komponente / Gerät' },
  },
  safetyCaseType: {
    label: 'Art des Sicherheitsnachweises', ref: 'EN 50129 7.3',
    values: { genericProduct: 'Generisches Produkt', genericApplication: 'Generische Anwendung', specificApplication: 'Spezifische Anwendung', notApplicable: 'Kein Sicherheitsnachweis nach EN 50129' },
  },
  changeType: {
    label: 'Art des Vorhabens', ref: 'EN 50126-1 6.5.3, 6.5.4',
    values: { new: 'Neuentwicklung', modification: 'Änderung / Erneuerung eines bestehenden Systems', reuse: 'Wiederverwendung oder Anpassung mit früherer Akzeptanz' },
  },
  ramsScope: {
    label: 'RAMS-Umfang', ref: 'EN 50126-1 7.4.2.1',
    values: { safety: 'Sicherheit (S)' },
  },
  thrSource: {
    label: 'Herkunft tolerierbarer Gefährdungsraten', ref: 'EN 50126-2 8.3, 10.2',
    values: { dutyHolder: 'Vom Betreiber vorgegeben', derived: 'Im Projekt abgeleitet', none: 'Keine THR (nur qualitative Bewertung)' },
  },
  silApplicability: {
    label: 'SIL-Anwendbarkeit', ref: 'EN 50126-2 10.2.1, 10.3',
    values: { yes: 'Elektronische sicherheitsrelevante Funktionen (SIL anwendbar)', partly: 'Gemischt (SIL nur für elektronische Anteile)', no: 'Keine elektronischen Sicherheitsfunktionen (CoP)' },
  },
  country: {
    label: 'Land', ref: 'EN 50126-1 7.2.2 e)',
    values: { CH: 'Schweiz', DE: 'Deutschland', AT: 'Österreich', EU: 'Anderer EU-Staat', other: 'Anderes Land' },
  },
  csmRa: {
    label: 'CSM-RA (VO (EU) 402/2013)', ref: 'EN 50126-1 7.2.2 e)',
    values: { yes: 'Anzuwenden', no: 'Nicht anzuwenden', unclear: 'Noch zu klären' },
  },
  dataClassification: {
    label: 'Datenklassifizierung', ref: '',
    values: { public: 'Öffentlich / fiktiv', internal: 'Intern', confidential: 'Vertraulich (nur lokale KI)' },
  },
};
const RAP = { cop: 'Anerkannte Regeln der Technik (CoP)', reference: 'Referenzsystem', ere: 'Explizite Risikoabschätzung' };
const PHASES = { 1: 'Phase 1 Konzept', 2: 'Phase 2 Systemdefinition', 3: 'Phase 3 Risikoanalyse und -bewertung', 4: 'Phase 4 Systemanforderungen' };
const SECURITY_LEVELS = {
  0: 'Stufe 0 – nicht betrachtet (Begründung erforderlich)',
  1: 'Stufe 1 – Security-informierte Sicherheit (in Vorbereitung)',
  2: 'Stufe 2 – Bedrohungsprotokoll und Security-Risiko (in Vorbereitung)',
  3: 'Stufe 3 – Zonen, Conduits und SL-T (in Vorbereitung)',
};
const IMPLEMENTED_SECURITY_LEVELS = [0];
const DEFAULT_CALIBRATION = 'en50126-1-annex-c-default';

function makeProjectProfile(fields = {}) {
  const base = {
    schema: 'rhas-profile/1',
    role: '', domain: '', systemLevel: 'system', superiorSystem: '', safetyCaseType: '', changeType: 'new',
    lifecyclePhases: [1, 2, 3, 4], ramsScope: 'safety',
    calibrationId: DEFAULT_CALIBRATION, permittedRaps: ['cop', 'reference', 'ere'], thrSource: 'dutyHolder',
    silApplicability: 'yes', country: '', infrastructureManager: '', csmRa: 'unclear',
    security: { level: 0, standard: 'ts50701-2023', justification: '' },
    report: { language: 'de', template: 'standard' },
    dataClassification: 'internal',
    confirmedAt: '', confirmedBy: '', origin: 'wizard', changeLog: [],
  };
  return { ...base, ...fields, security: { ...base.security, ...(fields.security || {}) }, report: { ...base.report, ...(fields.report || {}) } };
}

/** Profile for a project loaded from storage; projects created before WP2 get defaults and origin 'migrated'. */
function migrateProfile(stored) {
  if (!stored || typeof stored !== 'object') return makeProjectProfile({ role: 'supplier', domain: 'ccs', safetyCaseType: 'specificApplication', origin: 'migrated' });
  return makeProjectProfile(stored);
}

function validateProjectProfile(p) {
  const f = [];
  const need = (key) => { if (!p[key] || !(OPTIONS[key].values[p[key]])) f.push({ level: 'error', field: key, text: `${OPTIONS[key].label} fehlt (${OPTIONS[key].ref || 'Projektvorgabe'}).` }); };
  ['role', 'domain', 'systemLevel', 'safetyCaseType', 'changeType', 'ramsScope', 'thrSource', 'silApplicability', 'country', 'csmRa', 'dataClassification'].forEach(need);
  if (!Array.isArray(p.lifecyclePhases) || !p.lifecyclePhases.length) f.push({ level: 'error', field: 'lifecyclePhases', text: 'Mindestens eine Lebenszyklusphase wählen (EN 50126-1 6.5.2).' });
  else if (!p.lifecyclePhases.includes(3)) f.push({ level: 'warn', field: 'lifecyclePhases', text: 'Phase 3 (Risikoanalyse und -bewertung) ist nicht im Umfang; die Werkzeugschwerpunkte liegen in Phase 3 und 4.' });
  if (!Array.isArray(p.permittedRaps) || !p.permittedRaps.length) f.push({ level: 'error', field: 'permittedRaps', text: 'Mindestens ein Risikoakzeptanzprinzip zulassen (EN 50126-1 7.4.2.1; EN 50126-2 8.3).' });
  if (!p.calibrationId) f.push({ level: 'error', field: 'calibrationId', text: 'Kalibrierung fehlt (EN 50126-1 Anhang C.1: vom Betreiber festzulegen).' });
  if (p.systemLevel && p.systemLevel !== 'railwaySystem' && !String(p.superiorSystem || '').trim()) f.push({ level: 'warn', field: 'superiorSystem', text: 'Übergeordnetes System angeben, aus dem Anforderungen stammen (EN 50126-1 6.5.2).' });
  const sec = p.security || {};
  if (!IMPLEMENTED_SECURITY_LEVELS.includes(Number(sec.level))) f.push({ level: 'error', field: 'security.level', text: `Security-${SECURITY_LEVELS[sec.level] || 'Stufe'} ist noch nicht verfügbar.` });
  if (Number(sec.level) === 0 && !String(sec.justification || '').trim()) f.push({ level: 'error', field: 'security.justification', text: 'Begründung erforderlich, warum vorsätzliche Handlungen nicht betrachtet werden (EN 50126-1 7.4.2.1 d) schließt vorsätzlichen Missbrauch aus; EN 50129 6.4).' });
  if (p.domain === 'rollingStock' && p.safetyCaseType && p.safetyCaseType !== 'notApplicable') f.push({ level: 'info', field: 'safetyCaseType', text: 'Fahrzeuge: prüfen, ob der Sicherheitsnachweis nach EN 50129 oder nach einem anderen Rahmen geführt wird.' });
  return { ok: !f.some((x) => x.level === 'error'), findings: f };
}

const FIELDS = ['role', 'domain', 'systemLevel', 'superiorSystem', 'safetyCaseType', 'changeType', 'lifecyclePhases', 'ramsScope', 'calibrationId', 'permittedRaps', 'thrSource', 'silApplicability', 'country', 'infrastructureManager', 'csmRa', 'security.level', 'security.standard', 'security.justification', 'report.language', 'report.template', 'dataClassification'];
const get = (p, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), p);
const show = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));

function diffProfile(prev, next) {
  return FIELDS.filter((k) => show(get(prev, k)) !== show(get(next, k))).map((k) => ({ field: k, from: show(get(prev, k)), to: show(get(next, k)) }));
}

/** Confirm (first time) or change a profile. After confirmation every change needs a reason and is logged. */
function applyProfileChange(prev, next, { by = '', reason = '', at = new Date().toISOString() } = {}) {
  const v = validateProjectProfile(next);
  if (!v.ok) { const e = new Error(v.findings.filter((x) => x.level === 'error').map((x) => x.text).join(' ')); e.findings = v.findings; throw e; }
  const changes = diffProfile(prev, next);
  if (!prev.confirmedAt) return { ...next, confirmedAt: at, confirmedBy: by, changeLog: [...(prev.changeLog || []), { at, by, reason: reason || 'Erstbestätigung', changes }] };
  if (!changes.length) return prev;
  if (!String(reason).trim()) throw new Error('Änderungen am bestätigten Projektprofil brauchen eine Begründung.');
  return { ...next, confirmedAt: prev.confirmedAt, confirmedBy: prev.confirmedBy, changeLog: [...(prev.changeLog || []), { at, by, reason, changes }] };
}

function label(key, value) {
  if (key === 'permittedRaps') return (value || []).map((r) => RAP[r] || r).join('; ');
  if (key === 'lifecyclePhases') return (value || []).map((n) => PHASES[n] || n).join('; ');
  if (key === 'security.level') return SECURITY_LEVELS[value] || String(value);
  const o = OPTIONS[key];
  return o ? (o.values[value] || value || '') : show(value);
}

/** Rows [label, value, normative anchor] for the report. */
function summaryRows(p) {
  const row = (key, value, lab, ref) => [lab || (OPTIONS[key] && OPTIONS[key].label) || key, value, ref != null ? ref : (OPTIONS[key] && OPTIONS[key].ref) || ''];
  return [
    row('role', label('role', p.role)),
    row('domain', label('domain', p.domain)),
    row('systemLevel', `${label('systemLevel', p.systemLevel)}${p.superiorSystem ? ` (übergeordnet: ${p.superiorSystem})` : ''}`),
    row('safetyCaseType', label('safetyCaseType', p.safetyCaseType)),
    row('changeType', label('changeType', p.changeType)),
    row('lifecyclePhases', label('lifecyclePhases', p.lifecyclePhases), 'Lebenszyklusumfang', 'EN 50126-1 6.5.2'),
    row('ramsScope', label('ramsScope', p.ramsScope)),
    row('permittedRaps', label('permittedRaps', p.permittedRaps), 'Zulässige Risikoakzeptanzprinzipien', 'EN 50126-1 7.4.2.1; EN 50126-2 8.3'),
    row('calibrationId', p.calibrationId, 'Kalibrierung', 'EN 50126-1 Anhang C.1'),
    row('thrSource', label('thrSource', p.thrSource)),
    row('silApplicability', label('silApplicability', p.silApplicability)),
    row('country', `${label('country', p.country)}${p.infrastructureManager ? `; Infrastrukturbetreiber: ${p.infrastructureManager}` : ''}`),
    row('csmRa', label('csmRa', p.csmRa)),
    row('security.level', `${label('security.level', p.security.level)}${Number(p.security.level) === 0 && p.security.justification ? ` – Begründung: ${p.security.justification}` : ''}`, 'Security-Tiefe', 'EN 50126-1 5.5, 7.4.2.1 d); EN 50129 6.4'),
    row('dataClassification', label('dataClassification', p.dataClassification)),
  ];
}

/** Short German context line for prompts. */
function promptLine(p) {
  if (!p || !p.role) return '';
  return `PROJEKTPROFIL: Rolle ${label('role', p.role)}; Domäne ${label('domain', p.domain)}; Ebene ${label('systemLevel', p.systemLevel)}; Nachweis ${label('safetyCaseType', p.safetyCaseType)}; ${label('changeType', p.changeType)}; Umfang ${label('ramsScope', p.ramsScope)}.`;
}

/** Confidential projects may only use a local model. */
function aiProviderAllowed(p, provider) {
  if (p && p.dataClassification === 'confidential' && provider !== 'ollama') return { ok: false, reason: 'Projekt ist als vertraulich klassifiziert: nur lokale KI (Ollama) zulässig. Anbieter unter „KI“ umstellen oder Klassifizierung im Projektprofil begründet ändern.' };
  return { ok: true, reason: '' };
}

const api = { OPTIONS, RAP, PHASES, SECURITY_LEVELS, IMPLEMENTED_SECURITY_LEVELS, DEFAULT_CALIBRATION, makeProjectProfile, migrateProfile, validateProjectProfile, diffProfile, applyProfileChange, label, summaryRows, promptLine, aiProviderAllowed };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RHAS_PROFILE = api;
})();
