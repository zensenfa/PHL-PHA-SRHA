// Import boundary: ids and id references are rendered into HTML, so hostile values are rejected.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
global.window = global.window || {};
const DB = require('../src/db.js');

test('shipped reference project and demo project pass the id check', () => {
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/reference-project.json'), 'utf8'));
  assert.doesNotThrow(() => DB.assertSafeIds(ref));
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/demo-project.json'), 'utf8'));
  assert.doesNotThrow(() => DB.assertSafeIds(demo));
});

test('hostile record ids and id references are rejected', () => {
  const evil = '<img src=x onerror=alert(1)>';
  assert.throws(() => DB.assertSafeIds({ hazards: [{ id: evil }] }), /Kennung/);
  assert.throws(() => DB.assertSafeIds({ requirements: [{ id: 'SR-0001', hazards: [evil] }] }), /Kennung/);
  assert.throws(() => DB.assertSafeIds({ meta: { threats: [{ id: 'T-0001', functions: ['F-1', '"><script>'] }] } }), /Kennung/);
  assert.doesNotThrow(() => DB.assertSafeIds({ hazards: [{ id: 'H-0001', functions: ['F-0001'], title: 'a < b & "c"' }] }));
});
