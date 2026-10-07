// IndexedDB storage layer for the Railway Hazard Analysis Suite (RHAS).
// One registry DB (projects + checkpoints) and one DB per project with the
// stores functions / hazards / requirements / ccas / meta. DB-per-project
// isolation is kept from the previous tool so a key bug can never leak
// records across projects. All writes stamp updatedAt; ids are computed
// inside the write transaction so two concurrent creates cannot collide.
(function () {
const REGISTRY_DB = 'rhas_registry';
const PROJECT_PREFIX = 'rhas_p_';
const STORES = {
  functions: { keyPath: 'id', indexes: ['subsystem', 'safetyRelated'] },
  hazards: { keyPath: 'id', indexes: ['status', 'sourceCategory', 'riskClass'] },
  requirements: { keyPath: 'id', indexes: ['category', 'status'] },
  ccas: { keyPath: 'id' },
  meta: { keyPath: 'key' },
};
const ID_PREFIX = { functions: 'F', hazards: 'H', requirements: 'SR', ccas: 'CCA' };

const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Transaktion abgebrochen')); });

function openRegistry() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(REGISTRY_DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'projectId' });
      if (!db.objectStoreNames.contains('checkpoints')) db.createObjectStore('checkpoints', { keyPath: 'checkpointId' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openProject(projectId) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(PROJECT_PREFIX + projectId, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [name, spec] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const s = db.createObjectStore(name, { keyPath: spec.keyPath });
        for (const idx of spec.indexes || []) s.createIndex(idx, idx);
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// --- registry ---------------------------------------------------------------
async function listProjects() {
  const db = await openRegistry();
  const all = await req(db.transaction('projects').objectStore('projects').getAll());
  db.close();
  return all.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function createProject({ name, description = '' }) {
  if (!name || !name.trim()) throw new Error('Projektname fehlt');
  const db = await openRegistry();
  const now = new Date().toISOString();
  const project = { projectId: 'p_' + rnd(), name: name.trim(), description, createdAt: now, updatedAt: now };
  const tx = db.transaction('projects', 'readwrite');
  tx.objectStore('projects').put(project);
  await done(tx);
  db.close();
  return project;
}

async function touchProject(projectId, patch = {}) {
  const db = await openRegistry();
  const tx = db.transaction('projects', 'readwrite');
  const store = tx.objectStore('projects');
  const p = await req(store.get(projectId));
  if (p) store.put({ ...p, ...patch, updatedAt: new Date().toISOString() });
  await done(tx);
  db.close();
}

async function deleteProject(projectId) {
  const db = await openRegistry();
  const tx = db.transaction('projects', 'readwrite');
  tx.objectStore('projects').delete(projectId);
  await done(tx);
  db.close();
  await new Promise((resolve) => { const r = indexedDB.deleteDatabase(PROJECT_PREFIX + projectId); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}

// --- generic record CRUD ----------------------------------------------------
async function listAll(pdb, store) {
  return req(pdb.transaction(store).objectStore(store).getAll());
}

async function get(pdb, store, id) {
  return req(pdb.transaction(store).objectStore(store).get(id));
}

/** Create one record; the id is computed inside the write transaction (sequential prefix-NNNN). */
async function create(pdb, store, record, by = '') {
  const tx = pdb.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  const all = await req(s.getAll());
  const id = nextSequential(ID_PREFIX[store], all);
  const now = new Date().toISOString();
  const rec = { ...record, id, createdAt: record.createdAt || now, createdBy: record.createdBy || by, updatedAt: now, updatedBy: by };
  s.put(rec);
  await done(tx);
  return rec;
}

/** Create many records in one transaction with consecutive ids; returns the stored records. */
async function createBatch(pdb, store, records, by = '') {
  const tx = pdb.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  const all = await req(s.getAll());
  let n = maxSequential(ID_PREFIX[store], all);
  const now = new Date().toISOString();
  const out = [];
  for (const r of records) {
    n++;
    const rec = { ...r, id: `${ID_PREFIX[store]}-${String(n).padStart(4, '0')}`, createdAt: r.createdAt || now, createdBy: r.createdBy || by, updatedAt: now, updatedBy: by };
    s.put(rec);
    out.push(rec);
  }
  await done(tx);
  return out;
}

async function update(pdb, store, id, changes, by = '') {
  const tx = pdb.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  const cur = await req(s.get(id));
  if (!cur) throw new Error(`${store}/${id} nicht gefunden`);
  const rec = { ...cur, ...changes, id, updatedAt: new Date().toISOString(), updatedBy: by };
  s.put(rec);
  await done(tx);
  return rec;
}

async function put(pdb, store, record) {
  const tx = pdb.transaction(store, 'readwrite');
  tx.objectStore(store).put(record);
  await done(tx);
  return record;
}

async function putBatch(pdb, store, records) {
  const tx = pdb.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  for (const r of records) s.put(r);
  await done(tx);
}

async function remove(pdb, store, id) {
  const tx = pdb.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await done(tx);
}

async function clearStore(pdb, store) {
  const tx = pdb.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await done(tx);
}

function maxSequential(prefix, records) {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  return records.reduce((max, r) => { const m = re.exec(r.id || ''); return m ? Math.max(max, parseInt(m[1], 10)) : max; }, 0);
}
function nextSequential(prefix, records) {
  return `${prefix}-${String(maxSequential(prefix, records) + 1).padStart(4, '0')}`;
}

// --- meta -------------------------------------------------------------------
async function getMeta(pdb, key, fallback = null) {
  const r = await req(pdb.transaction('meta').objectStore('meta').get(key));
  return r ? r.value : fallback;
}
async function setMeta(pdb, key, value) {
  const tx = pdb.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key, value });
  await done(tx);
}

// --- whole-project snapshot (export / checkpoint / import) ------------------
const SCHEMA = 'rhas-project/1.0';

async function snapshot(pdb, project) {
  const [functions, hazards, requirements, ccas] = await Promise.all(['functions', 'hazards', 'requirements', 'ccas'].map((s) => listAll(pdb, s)));
  const metaAll = await listAll(pdb, 'meta');
  const meta = Object.fromEntries(metaAll.map((m) => [m.key, m.value]));
  return { schemaVersion: SCHEMA, exportedAt: new Date().toISOString(), project: { name: project.name, description: project.description || '' }, meta, functions, hazards, requirements, ccas };
}

/** Always creates a NEW project (never merges into an existing one). */
// Record ids and id references are rendered into HTML by the UI; accept only plain identifier characters.
const SAFE_ID = /^[A-Za-z0-9_.:/ -]{1,64}$/;
const REF_KEYS = new Set(['hazards', 'functions', 'interfaces', 'modes', 'measures', 'requirements', 'threats', 'zones', 'conduits', 'srs', 'causes', 'subsystems']);
function assertSafeIds(node, trail = 'snapshot') {
  if (Array.isArray(node)) { node.forEach((v, i) => assertSafeIds(v, `${trail}[${i}]`)); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === 'id' && v != null && !(typeof v === 'string' && SAFE_ID.test(v))) throw new Error(`Ungültige Kennung in ${trail}.id`);
    if (REF_KEYS.has(k) && Array.isArray(v) && v.some((x) => typeof x === 'string' && !SAFE_ID.test(x))) throw new Error(`Ungültige Kennung in ${trail}.${k}`);
    assertSafeIds(v, `${trail}.${k}`);
  }
}
async function importSnapshot(snap, nameOverride) {
  if (!snap || snap.schemaVersion !== SCHEMA) throw new Error(`Nicht unterstütztes Format: ${snap && snap.schemaVersion}`);
  assertSafeIds(snap);
  const project = await createProject({ name: nameOverride || snap.project.name, description: snap.project.description || '' });
  const pdb = await openProject(project.projectId);
  for (const store of ['functions', 'hazards', 'requirements', 'ccas']) {
    if (Array.isArray(snap[store]) && snap[store].length) await putBatch(pdb, store, snap[store]);
  }
  for (const [key, value] of Object.entries(snap.meta || {})) await setMeta(pdb, key, value);
  pdb.close();
  return project;
}

// --- checkpoints (registry level) ------------------------------------------
async function createCheckpoint({ name, engineer, snap, projectId }) {
  const db = await openRegistry();
  const cp = { checkpointId: 'cp_' + rnd(), name, engineer: engineer || '', projectId, createdAt: new Date().toISOString(), counts: { hazards: (snap.hazards || []).length, requirements: (snap.requirements || []).length, functions: (snap.functions || []).length }, snap };
  const tx = db.transaction('checkpoints', 'readwrite');
  tx.objectStore('checkpoints').put(cp);
  await done(tx);
  db.close();
  return cp;
}
async function listCheckpoints() {
  const db = await openRegistry();
  const all = await req(db.transaction('checkpoints').objectStore('checkpoints').getAll());
  db.close();
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
async function deleteCheckpoint(checkpointId) {
  const db = await openRegistry();
  const tx = db.transaction('checkpoints', 'readwrite');
  tx.objectStore('checkpoints').delete(checkpointId);
  await done(tx);
  db.close();
}

const api = { SCHEMA, STORES, openProject, listProjects, createProject, touchProject, deleteProject, listAll, get, create, createBatch, update, put, putBatch, remove, clearStore, getMeta, setMeta, snapshot, importSnapshot, assertSafeIds, createCheckpoint, listCheckpoints, deleteCheckpoint, nextSequential };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.RHAS_DB = api;
})();

