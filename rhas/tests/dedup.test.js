'use strict';
// Word-set similarity used by the engine to merge near-duplicate suggestions and flag repeats.
const test = require('node:test');
const assert = require('node:assert/strict');
const DD = require('../src/dedup.js');

test('tokenize lower-cases, strips punctuation and drops words of two letters or fewer', () => {
  assert.deepEqual([...DD.tokenize('Personal im Gefahrenbereich, KEINE Warnung!')].sort(), ['gefahrenbereich', 'keine', 'personal', 'warnung']);
  assert.equal(DD.tokenize('').size, 0);
  assert.equal(DD.tokenize(null).size, 0);
});

test('jaccard is 1 for identical sets, 0 for disjoint or empty, symmetric otherwise', () => {
  const a = DD.tokenize('Warnung bei Zugfahrt fehlt'), b = DD.tokenize('Warnung bei Zugfahrt zu spät'), c = DD.tokenize('Brand im Tunnel');
  assert.equal(DD.jaccard(a, a), 1);
  assert.equal(DD.jaccard(a, c), 0);
  assert.equal(DD.jaccard(new Set(), a), 0);
  assert.equal(DD.jaccard(a, b), DD.jaccard(b, a));
  assert.ok(DD.jaccard(a, b) > 0.4 && DD.jaccard(a, b) < 1);
});
