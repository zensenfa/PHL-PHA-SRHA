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

// Target of WP1 (normative cleanup). Marked todo until the MIL-STD-882E
// references are removed; then drop { todo } so it guards against regressions.
test('reports contain no MIL-STD-882E reference', { todo: 'WP1 normative cleanup' }, () => {
  for (const kind of KINDS) assert.ok(!/MIL-STD|882E/.test(docxText(R.buildDocx(kind, b))), kind);
});
