// Bootstrap: bind core + stages, restore the last project, check the provider.
(function () {
const A = window.RHAS_APP;
async function main() {
  A.bindCore();
  for (const s of Object.values(A.stages)) if (s.bind) s.bind();
  await A.loadProjects();
  const last = localStorage.getItem('rhas_last_project');
  if (last && A.state.projects.some((p) => p.projectId === last)) await A.openProject(last);
  else A.refresh();
  const prof = A.state.projectProfile;
  A.show(A.state.project && prof && !prof.confirmedAt && prof.origin !== 'migrated' ? 'profile' : 'definition');
  A.checkProvider();
}
window.addEventListener('DOMContentLoaded', () => { main().catch((e) => { console.error(e); const t = document.getElementById('toast'); if (t) { t.textContent = `Startfehler: ${e.message}`; t.className = 'toast err'; } }); });
})();

