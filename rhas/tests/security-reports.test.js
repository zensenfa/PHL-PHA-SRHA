'use strict';
// Golden regression tests for the security sections of the reports (Word, Excel, print) on the built-in Lynx
// demo at security levels 1, 2 and 3. The level 0 baseline lives in reports.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { R, bundleFrom, docxText, xlsxText, matchGolden } = require('./helpers.js');

const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/demo-project.json'), 'utf8'));
const at = (level) => {
  const s = structuredClone(demo);
  s.meta.projectProfile.security = { level, standard: 'ts50701-2023', justification: '' };
  return bundleFrom(s);
};

for (const level of [1, 2, 3]) {
  const b = at(level);
  test(`level ${level}: DOCX full is deterministic and matches golden text`, (t) => {
    const a = R.buildDocx('full', b), c = R.buildDocx('full', b);
    assert.deepEqual(Buffer.from(a), Buffer.from(c), 'same input must give identical bytes');
    const txt = docxText(a);
    assert.ok(!/\[object Object\]|undefined|NaN/.test(txt), 'no rendering artefacts');
    matchGolden(t, `lvl${level}-docx-full.txt`, txt);
  });
  test(`level ${level}: XLSX workbook matches golden content`, (t) => {
    const x = xlsxText(R.buildXlsx(b));
    assert.ok(!/\[object Object\]|undefined|NaN/.test(x), 'no rendering artefacts');
    matchGolden(t, `lvl${level}-xlsx.txt`, x);
  });
}

test('level 3: print view matches golden HTML and contains no unescaped markup from data', (t) => {
  const html = R.buildPrintHtml('full', at(3));
  assert.ok(!/\[object Object\]|undefined|NaN/.test(html));
  matchGolden(t, 'lvl3-print-full.html', html);
});

test('hostile text in security records is escaped in print and DOCX output', () => {
  const s = structuredClone(demo);
  s.meta.projectProfile.security = { level: 3, standard: 'ts50701-2023', justification: '' };
  const evil = '<img src=x onerror=alert(1)> & "q"';
  s.meta.zones[0].name = evil; s.meta.threats[0].title = evil; s.meta.conduits[0].name = evil;
  const b = bundleFrom(s);
  const html = R.buildPrintHtml('full', b);
  assert.ok(!html.includes('<img src=x'), 'no raw tag in print view');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;'));
  const docx = Buffer.from(R.buildDocx('full', b)).toString('latin1');
  assert.ok(!docx.includes('<img src=x'), 'no raw tag in DOCX XML');
});
