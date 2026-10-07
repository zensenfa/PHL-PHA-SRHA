'use strict';
// Shared test helpers: load modules under Node, build report bundles with a
// fixed export time, read DOCX (stored ZIP) and XLSX content as plain text.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// SheetJS is only reachable via window.XLSX inside reports.js. window.RHAS_DATA
// stays undefined, so model.js keeps reading src/data/*.json.
global.window = global.window || {};
global.window.XLSX = require('../vendor/xlsx.full.min.js');

const M = require('../src/model.js');
const R = require('../src/reports.js');

const FIXTURES = path.join(__dirname, 'fixtures');
const GOLDEN = path.join(__dirname, 'golden');
const FIXED_TIME = '2026-09-24T08:00:00.000Z';

function loadProject(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function bundleFrom(snap) {
  const meta = snap.meta || {};
  const b = R.makeBundle({
    zones: meta.zones, conduits: meta.conduits, threats: meta.threats, securityCalibration: meta.securityCalibration, profile: meta.projectProfile, project: snap.project, docControl: meta.docControl || {}, sd: meta.systemDefinition,
    functions: snap.functions || [], interfaces: meta.interfaces || [], subsystems: meta.subsystems || [],
    hazards: snap.hazards || [], requirements: snap.requirements || [], ccas: snap.ccas || [], runs: meta.runs || [],
    calibration: meta.calibration || M.data().calibration, data: M.data(), version: 'test',
  });
  b.exportedAt = FIXED_TIME;
  return b;
}

/** Entries of a ZIP archive (stored or deflated) -> { name: Buffer }. */
function unzip(bytes) {
  const buf = Buffer.from(bytes);
  const out = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const dataStart = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(dataStart, dataStart + csize);
    out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

/** Visible text of word/document.xml, one line per paragraph, tabs between table cells. */
function docxText(bytes) {
  const xml = unzip(bytes)['word/document.xml'].toString('utf8');
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/w:tc>/g, ' | ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '').join('\n') + '\n';
}

/** All sheets of an XLSX as CSV text, each under a "## <sheet>" header. */
function xlsxText(bytes) {
  const X = global.window.XLSX;
  const wb = X.read(Buffer.from(bytes), { type: 'buffer' });
  return wb.SheetNames.map((n) => `## ${n}\n${X.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n') + '\n';
}

/** Compare against tests/golden/<name>; UPDATE_GOLDEN=1 rewrites the file. */
function matchGolden(t, name, actual) {
  const file = path.join(GOLDEN, name);
  if (process.env.UPDATE_GOLDEN !== '1' && !fs.existsSync(file)) throw new Error(`golden file missing: ${name} (run UPDATE_GOLDEN=1 npm test to create it, then review it)`);
  if (process.env.UPDATE_GOLDEN === '1') {
    fs.writeFileSync(file, actual);
    t.diagnostic(`golden written: ${name}`);
    return;
  }
  const expected = fs.readFileSync(file, 'utf8');
  if (expected !== actual) {
    const a = actual.split('\n'), e = expected.split('\n');
    const i = a.findIndex((l, k) => l !== e[k]);
    throw new Error(`${name} differs from golden at line ${i + 1}:\n  expected: ${e[i]}\n  actual:   ${a[i]}\n(run UPDATE_GOLDEN=1 npm test after reviewing an intended change)`);
  }
}

module.exports = { M, R, loadProject, bundleFrom, unzip, docxText, xlsxText, matchGolden, FIXED_TIME };
