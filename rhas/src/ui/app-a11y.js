// Accessibility layer: semantics and keyboard behaviour that the stage templates do not set themselves.
// It only adds attributes and listeners (no content), so it can run over any re-rendered markup.
(function () {
const A = window.RHAS_APP;

const ICON_LABELS = { '✎': 'Bearbeiten', '🗑': 'Löschen', '✓': 'Übernehmen', '✗': 'Verwerfen', '✕': 'Schließen', '×': 'Entfernen', '+': 'Hinzufügen' };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

let idSeq = 0;
/** Add semantics to everything under root. Idempotent. */
function decorate(root) {
  // Clickable table rows are reachable and operable by keyboard.
  root.querySelectorAll('tr[data-id]').forEach((tr) => {
    if (!tr.hasAttribute('tabindex')) tr.setAttribute('tabindex', '0');
  });
  // Tab strips: tablist / tab / tabpanel with aria-selected.
  root.querySelectorAll('.tabs').forEach((strip) => {
    strip.setAttribute('role', 'tablist');
    const scope = strip.parentElement;
    strip.querySelectorAll('.tab').forEach((tab) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', tab.classList.contains('active') ? 'true' : 'false');
      const pane = scope && scope.querySelector(`.tab-pane[data-pane="${tab.dataset.tab}"]`);
      if (pane) { pane.setAttribute('role', 'tabpanel'); if (pane.id) tab.setAttribute('aria-controls', pane.id); }
    });
  });
  // <div class="f"><label>Text</label><input|select|textarea></div>: link the label to its single control.
  root.querySelectorAll('label:not([for])').forEach((lab) => {
    if (lab.querySelector('input, select, textarea') || !lab.parentElement) return;
    const ctl = lab.parentElement.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
    if (ctl.length !== 1 || ctl[0].closest('label')) return;
    if (!ctl[0].id) ctl[0].id = `a11y-${++idSeq}`;
    lab.setAttribute('for', ctl[0].id);
  });
  // Controls that still have no name (cells of editable tables, filters): derive one from the column header and row,
  // or from the first option of a select.
  root.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach((c) => {
    if (c.hasAttribute('aria-label') || c.hasAttribute('aria-labelledby') || c.title || c.closest('label') || (c.id && root.querySelector(`label[for="${c.id}"]`))) return;
    const td = c.closest('td');
    let name = '';
    if (td) {
      const table = td.closest('table'), th = table && table.tHead && table.tHead.rows[0] && table.tHead.rows[0].cells[td.cellIndex];
      const row = td.parentElement, first = row && row.cells[0] && row.cells[0].textContent.trim().slice(0, 40);
      name = [th && th.textContent.trim(), first && first !== (th && th.textContent.trim()) ? first : ''].filter(Boolean).join(' – ');
    }
    if (!name && c.tagName === 'SELECT' && c.options.length) name = c.options[0].text.trim();
    if (!name) name = (c.dataset && Object.values(c.dataset)[0]) || c.name || c.id || '';
    if (name) c.setAttribute('aria-label', name);
  });
  // Empty table header cells (action columns) get a name.
  root.querySelectorAll('th').forEach((th) => { if (!th.textContent.trim()) { const sp = document.createElement('span'); sp.className = 'sr-only'; sp.textContent = 'Aktionen'; th.appendChild(sp); } });
  // Icon-only buttons get an accessible name.
  root.querySelectorAll('button').forEach((b) => {
    if (b.hasAttribute('aria-label')) return;
    const txt = b.textContent.trim();
    if (b.title) { if (!txt || txt.length <= 2) b.setAttribute('aria-label', b.title); return; }
    if (txt && txt.length <= 2 && ICON_LABELS[txt]) b.setAttribute('aria-label', ICON_LABELS[txt]);
  });
  // Inputs without a label: fall back to the placeholder as accessible name.
  root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((i) => {
    if (i.hasAttribute('aria-label') || i.hasAttribute('aria-labelledby') || i.closest('label') || (i.id && root.querySelector(`label[for="${i.id}"]`))) return;
    i.setAttribute('aria-label', i.getAttribute('placeholder'));
  });
  // The current stage is announced as current.
  root.querySelectorAll('.rail-btn').forEach((b) => { if (b.classList.contains('active')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  // Pills and the provider dot are not colour-only for assistive technology.
  root.querySelectorAll('.dot').forEach((d) => { d.setAttribute('aria-hidden', 'true'); });
}

// Dialogs: roles, focus into the dialog on open, focus back to the opener on close, focus trap for modals.
const DIALOGS = [
  { id: 'drawer', label: 'drawer-title', modal: false },
  { id: 'settings-panel', name: 'KI-Anbieter', modal: true },
  { id: 'help-panel', name: 'Arbeitsweise', modal: true },
];
const openers = new Map();
function setupDialog(d) {
  const el = A.el(d.id); if (!el) return;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', d.modal ? 'true' : 'false');
  if (d.label) el.setAttribute('aria-labelledby', d.label); else el.setAttribute('aria-label', d.name);
  const card = d.modal ? el.querySelector('.modal-card') : el;
  new MutationObserver(() => {
    const open = !el.classList.contains('hidden');
    if (open && !openers.has(d.id)) {
      openers.set(d.id, document.activeElement);
      requestAnimationFrame(() => {
        decorate(el);
        const first = [...card.querySelectorAll(FOCUSABLE)].filter(visible)[0];
        if (!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
        (first && d.modal ? first : card).focus({ preventScroll: true });
      });
    } else if (!open && openers.has(d.id)) {
      const back = openers.get(d.id); openers.delete(d.id);
      if (back && document.contains(back) && visible(back)) back.focus({ preventScroll: true });
    }
  }).observe(el, { attributes: true, attributeFilter: ['class'] });
  if (d.modal) el.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = [...card.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

function bindA11y() {
  const toast = A.el('toast'); if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-atomic', 'true'); }
  DIALOGS.forEach(setupDialog);
  const rail = A.el('rail-nav'); if (rail) rail.setAttribute('aria-label', 'Arbeitsablauf');
  // Keyboard activation of rows (Enter / Space) when the row itself has focus.
  document.addEventListener('keydown', (e) => {
    const tr = e.target && e.target.matches && e.target.matches('tr[data-id][tabindex]') ? e.target : null;
    if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); }
  });
  // Re-decorate whatever the stages render; attribute changes do not retrigger the observer.
  let queued = false;
  const run = () => { queued = false; decorate(document.body); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true });
  // Tabs and stages switch by CSS class, which the observer above does not see.
  document.addEventListener('click', () => { if (!queued) { queued = true; requestAnimationFrame(run); } });
  decorate(document.body);
}
A.bindA11y = bindA11y; A.decorateA11y = decorate;
})();
