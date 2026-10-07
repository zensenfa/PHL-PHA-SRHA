'use strict';
// Golden regression tests for DOCX, XLSX and print output of the reference
// project. Review diffs, then accept intended changes with UPDATE_GOLDEN=1.
const test = require('node:test');
const assert = require('node:assert/strict');
const { R, loadProject, bundleFrom, docxText, xlsxText, matchGolden } = require('./helpers.js');

const b = bundleFrom(loadProject('reference-project.json'));
const KINDS = Object.keys(R.DELIVERABLES); // phl, pha, srs, full

for (const kind of KINDS) {
  test(`DOCX ${kind}: deterministic and matches golden text`, (t) => {
    const a = R.buildDocx(kind, b), c = R.buildDocx(kind, b);
    assert.deepEqual(Buffer.from(a), Buffer.from(c), 'same input must give identical bytes');
    matchGolden(t, `docx-${kind}.txt`, docxText(a));
  });
}

test('XLSX workbook matches golden content', (t) => {
  matchGolden(t, 'xlsx.txt', xlsxText(R.buildXlsx(b)));
});

test('print view matches golden HTML', (t) => {
  matchGolden(t, 'print-full.html', R.buildPrintHtml('full', b));
});

test('no "[object Object]" in any output (PATCH-1, PATCH-3)', () => {
  for (const kind of KINDS) assert.ok(!docxText(R.buildDocx(kind, b)).includes('[object Object]'), kind);
  assert.ok(!xlsxText(R.buildXlsx(b)).includes('[object Object]'));
});

test('lead hazard titles appear in the hazard list (PATCH-1)', () => {
  const txt = docxText(R.buildDocx('full', b));
  assert.ok(txt.includes('Keine oder zu kurze Warnung bei Zugfahrt über Spurwechsel W 12/13'));
  assert.ok(txt.includes('Personal im Gefahrenbereich erhält keine Warnung trotz Zugannäherung auf Gleis 1'));
});

// WP1: the tool is based on the railway standards only.
test('reports contain no MIL-STD-882E reference or task deliverable names', () => {
  for (const kind of KINDS) {
    const txt = docxText(R.buildDocx(kind, b));
    assert.ok(!/MIL-STD|882E|Task 20[123]|\bPHL\b|\bPHA\b|SRHA/.test(txt), kind);
  }
  assert.ok(!/MIL-STD|882E|\bPHL\b|\bPHA\b/.test(xlsxText(R.buildXlsx(b))));
});

test('deliverables map to EN 50126-1 phase 3/4 outputs; legacy keys still work', () => {
  assert.deepEqual(KINDS, ['hazid', 'risk', 'hazlog', 'srs', 'full']);
  assert.match(R.DELIVERABLES.hazlog.purpose, /7\.4\.2\.2/);
  assert.match(R.DELIVERABLES.srs.purpose, /7\.5\.3/);
  assert.equal(docxText(R.buildDocx('phl', b)), docxText(R.buildDocx('hazid', b)));
  assert.equal(docxText(R.buildDocx('pha', b)), docxText(R.buildDocx('risk', b)));
});

test('hazard log covers EN 50126-1 7.4.2.2 b) to g) and exports the SRAC', () => {
  const txt = docxText(R.buildDocx('hazlog', b));
  for (const col of ['Verantwortlich (b)', 'Beitragende Funktionen (b)', 'Folgen / Häufigkeit (c)', 'Risiko → Rest (d)', 'RAP / RAC (e)', 'Maßnahmen (f)', 'Exportierte Auflagen (g)']) assert.ok(txt.includes(col), col);
  assert.ok(txt.includes('R-0002 → Infrastrukturbetreiberin'), 'SRAC of lead hazard A exported with receiver');
  assert.ok(!txt.includes('M4'), 'rejected measure not listed');
});

test('every report states the RAMS scope (safety only)', () => {
  for (const kind of KINDS) assert.ok(docxText(R.buildDocx(kind, b)).includes('Sicherheitsteil (S) des RAMS-Prozesses'), kind);
});
