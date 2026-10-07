// Domain packs for RHAS (WP4): examples, templates and checklists per railway
// domain, so no domain wording is hard-coded in prompts or UI. Pure data access,
// testable under Node. Packs are working aids, not standard text.
(function () {
const M = typeof require !== 'undefined' ? require('./model.js') : window.RHAS_MODEL;
function all() { return (M.data().domains && M.data().domains.packs) || []; }
/** Pack for a profile domain id; unknown or unset domains fall back to the generic pack. */
function packFor(domainOrProfile) {
  const d = domainOrProfile && typeof domainOrProfile === 'object' ? domainOrProfile.domain : domainOrProfile;
  const packs = all();
  return packs.find((p) => (p.appliesTo || []).includes(d)) || packs.find((p) => p.id === 'generic') || null;
}
const api = { all, packFor };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RHAS_DOMAINS = api;
})();
