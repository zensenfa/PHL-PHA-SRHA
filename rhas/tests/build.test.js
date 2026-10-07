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

// ---- escaping and manifest guards (run against a throw-away copy of the source tree) ----
const os = require('os');
function copyTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhas-build-'));
  for (const p of ['build.py', 'build-manifest.json', 'src', 'vendor']) fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  return dir;
}
function build(dir) {
  try { execFileSync('python3', [path.join(dir, 'build.py'), '--out', 'dist/out.html'], { stdio: 'pipe' }); return { ok: true }; }
  catch (e) { return { ok: false, err: String(e.stderr || e.message) }; }
}

test('a literal </script> or <!-- in the embedded data cannot break the page', () => {
  const dir = copyTree();
  try {
    assert.ok(build(dir).ok);
    const clean = fs.readFileSync(path.join(dir, 'dist/out.html'), 'utf8');
    const f = path.join(dir, 'src/data/guidewords.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    j.guidewords[0].description = 'x </script><script>alert(1)</script> <!-- y';
    fs.writeFileSync(f, JSON.stringify(j));
    assert.ok(build(dir).ok);
    const html = fs.readFileSync(path.join(dir, 'dist/out.html'), 'utf8');
    const count = (h, re) => h.match(re).length;
    assert.equal(count(html, /<\/script/gi), count(clean, /<\/script/gi), 'no extra closing tag from data');
    assert.equal(count(html, /<script/gi), count(clean, /<script/gi), 'no extra opening tag from data');
    assert.ok(!html.includes('alert(1)</script>'));
    const data = html.match(/window\.RHAS_DATA = (\{[\s\S]*?\});\r\nwindow\.RHAS_VERSION/)[1];
    assert.ok(JSON.parse(data).guidewords[0].description.includes('</script>'), 'value round-trips unchanged');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the build fails on </script in an app module and on modules missing from the manifest', () => {
  const dir = copyTree();
  try {
    const m = path.join(dir, 'src/dedup.js');
    const orig = fs.readFileSync(m);
    fs.writeFileSync(m, Buffer.concat([Buffer.from('// </script>\r\n'), orig]));
    const r = build(dir);
    assert.ok(!r.ok && /dedup\.js/.test(r.err), 'module with </script is rejected');
    fs.writeFileSync(m, orig);
    fs.writeFileSync(path.join(dir, 'src/unlisted.js'), Buffer.from('// x\r\n'));
    const r2 = build(dir);
    assert.ok(!r2.ok && /unlisted\.js/.test(r2.err), 'unlisted module is reported, not silently dropped');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Content-Security-Policy: every inline script is allowed by hash, nothing is allowed by keyword', () => {
  const crypto = require('crypto');
  execFileSync('python3', [path.join(ROOT, 'build.py'), '--out', 'dist/test-build.html']);
  const html = fs.readFileSync(OUT, 'utf8');
  fs.unlinkSync(OUT);
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(meta, 'policy present');
  const policy = Object.fromEntries(meta[1].split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v]; }));
  assert.deepEqual(policy['default-src'], ["'none'"]);
  const scriptSrc = policy['script-src'];
  assert.ok(!scriptSrc.includes("'unsafe-inline'") && !scriptSrc.includes("'unsafe-eval'"), 'no unsafe keywords for scripts');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length > 25);
  for (const s of scripts) {
    const h = `'sha256-${crypto.createHash('sha256').update(s.replace(/\r\n?/g, '\n')).digest('base64')}'`;
    assert.ok(scriptSrc.includes(h), `hash for script starting ${JSON.stringify(s.slice(0, 40))}`);
  }
  assert.equal(scriptSrc.filter((x) => x.startsWith("'sha256-")).length, scripts.length, 'no stale hashes');
  assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(html.slice(0, html.indexOf('<script>'))), 'no inline event handlers in the page markup');
});
