// Ids of deleted records must not be handed out again (links in requirements, CCAs and reports would re-point).
const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global.window || {};
const DB = require('../src/db.js');

test('next id is max(existing ids, persistent counter) + 1', () => {
  const recs = [{ id: 'H-0001' }, { id: 'H-0002' }];
  assert.equal(DB.nextNumber('H', recs, undefined), 3);
  assert.equal(DB.nextNumber('H', [], 5), 6, 'after deleting H-0005 the number is not reused');
  assert.equal(DB.nextNumber('H', recs, 1), 3, 'counter below the highest id is ignored');
});
