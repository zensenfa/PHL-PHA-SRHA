'use strict';
// The build must reproduce a single self-contained HTML whose scripts all parse.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'test-build.html');

test('build.py produces a file whose inline scripts all compile', () => {
  execFileSync('python3', [path.join(ROOT, 'build.py'), '--out', 'dist/test-build.html']);
  const html = fs.readFileSync(OUT, 'utf8');
  const scripts = [...html.matchAll(/<script>\r\n([\s\S]*?)\r\n<\/script>/g)].map((m) => m[1]);
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'build-manifest.json'), 'utf8'));
  assert.equal(scripts.length, 3 + man.modules.length, 'vendor + app modules');
  scripts.forEach((s, i) => assert.doesNotThrow(() => new vm.Script(s, { filename: `script-${i}` })));
  assert.ok(html.includes('window.RHAS_DATA = {'));
  fs.unlinkSync(OUT);
});

test('no external resources are referenced (air-gap deployable)', () => {
  execFileSync('python3', [path.join(ROOT, 'build.py'), '--out', 'dist/test-build.html']);
  const html = fs.readFileSync(OUT, 'utf8');
  assert.ok(!/<script[^>]+src=/i.test(html), 'no external script src');
  assert.ok(!/<link[^>]+href=["']https?:/i.test(html), 'no external stylesheet');
  fs.unlinkSync(OUT);
});
