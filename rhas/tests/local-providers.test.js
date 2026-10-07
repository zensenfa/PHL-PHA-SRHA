'use strict';
// Plan B: local providers against a mock server (no real model needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const O = require('../src/ollama.js');
const C = require('../src/openai-compat.js');
const PIPE = require('../src/llm-pipeline.js');
const PROFILE = require('../src/profile.js');

function server(handler) {
  return new Promise((res) => { const s = http.createServer((req, rsp) => { let body = ''; req.on('data', (d) => { body += d; }); req.on('end', () => handler(req, rsp, body ? JSON.parse(body) : null)); }); s.listen(0, '127.0.0.1', () => res(s)); });
}
const url = (s) => `http://127.0.0.1:${s.address().port}`;
const ndjson = (rsp, lines) => { rsp.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); for (const l of lines) rsp.write(JSON.stringify(l) + '\n'); rsp.end(); };

test('Ollama: num_ctx, keep_alive, think are sent; answer in content is returned', async () => {
  let seen;
  const s = await server((req, rsp, body) => { seen = body; ndjson(rsp, [{ message: { content: '{"a":' } }, { message: { content: '1}' } }, { done: true, prompt_eval_count: 40 }]); });
  try {
    const r = await O.callOllama({ ollamaUrl: url(s), model: 'm', systemPrompt: 'x'.repeat(60), userPrompt: 'y'.repeat(60), numCtx: 16384, think: false, keepAlive: '10m' });
    assert.equal(r.content, '{"a":1}');
    assert.equal(seen.options.num_ctx, 16384); assert.equal(seen.keep_alive, '10m'); assert.equal(seen.think, false);
  } finally { s.close(); }
});

test('Ollama: think "auto" leaves the model default', async () => {
  let seen;
  const s = await server((req, rsp, body) => { seen = body; ndjson(rsp, [{ message: { content: '{}' } }, { done: true, prompt_eval_count: 5 }]); });
  try { await O.callOllama({ ollamaUrl: url(s), model: 'm', systemPrompt: 'a', userPrompt: 'b' }); assert.ok(!('think' in seen)); } finally { s.close(); }
});

test('Ollama: answer only in the thinking field is recovered', async () => {
  const s = await server((req, rsp) => ndjson(rsp, [{ message: { thinking: 'Überlegung ... ' } }, { message: { thinking: '{"hazards":[]}' } }, { done: true, prompt_eval_count: 5 }]));
  try { const r = await O.callOllama({ ollamaUrl: url(s), model: 'm', systemPrompt: 'a', userPrompt: 'b' }); assert.deepEqual(JSON.parse(r.content), { hazards: [] }); } finally { s.close(); }
});

test('Ollama: prompt longer than num_ctx is refused before sending', async () => {
  let called = false;
  const s = await server((req, rsp) => { called = true; ndjson(rsp, []); });
  try {
    await assert.rejects(() => O.callOllama({ ollamaUrl: url(s), model: 'm', systemPrompt: '', userPrompt: 'z'.repeat(3 * 30000), numCtx: 32768 }), /Prompt zu lang/);
    assert.equal(called, false);
  } finally { s.close(); }
});

test('Ollama: silent truncation is detected from prompt_eval_count', async () => {
  const s = await server((req, rsp) => ndjson(rsp, [{ message: { content: '{}' } }, { done: true, prompt_eval_count: 1000 }]));
  try { await assert.rejects(() => O.callOllama({ ollamaUrl: url(s), model: 'm', systemPrompt: '', userPrompt: 'w'.repeat(3 * 12000), numCtx: 32768 }), /möglicherweise gekürzt/); } finally { s.close(); }
});

test('Ollama preflight reports context length, capabilities and warnings', async () => {
  const s = await server((req, rsp) => {
    rsp.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url === '/api/tags') rsp.end(JSON.stringify({ models: [{ name: 'qwen3.5:27b' }] }));
    else rsp.end(JSON.stringify({ model_info: { 'qwen35.context_length': 16384 }, capabilities: ['completion', 'thinking'], details: { parameter_size: '27B', quantization_level: 'Q4_K_M' } }));
  });
  try {
    const r = await PIPE.preflight('ollama', { ollamaUrl: url(s), ollamaModel: 'qwen3.5:27b', ollamaNumCtx: 32768 });
    assert.equal(r.ok, true); assert.equal(r.info.contextLength, 16384);
    assert.ok(r.warnings.some((w) => /nur 16384/.test(w))); assert.ok(r.warnings.some((w) => /Denkmodus/.test(w)));
  } finally { s.close(); }
});

test('OpenAI-compatible server: SSE streaming, json_schema with fallback to json_object', async () => {
  const forms = [];
  const s = await server((req, rsp, body) => {
    forms.push(body.response_format.type);
    if (body.response_format.type === 'json_schema') { rsp.writeHead(400); rsp.end('unsupported'); return; }
    rsp.writeHead(200, { 'Content-Type': 'text/event-stream' });
    rsp.write('data: {"choices":[{"delta":{"content":"{\\"ok\\":"}}]}\n\n');
    rsp.write('data: {"choices":[{"delta":{"content":"true}"}}]}\n\n');
    rsp.write('data: [DONE]\n\n'); rsp.end();
  });
  try {
    const r = await C.callOpenAiCompat({ baseUrl: url(s), model: 'm', systemPrompt: 'a', userPrompt: 'b', schema: { type: 'object' } });
    assert.deepEqual(JSON.parse(r.content), { ok: true });
    assert.deepEqual(forms, ['json_schema', 'json_object']);
  } finally { s.close(); }
});

test('pipeline dispatches to the OpenAI-compatible provider', async () => {
  const s = await server((req, rsp) => { rsp.writeHead(200, { 'Content-Type': 'text/event-stream' }); rsp.write('data: {"choices":[{"delta":{"content":"{}"}}]}\n\ndata: [DONE]\n\n'); rsp.end(); });
  try { const r = await PIPE.callLlm({ provider: 'openai-compat', settings: { compatUrl: url(s), compatModel: 'm' }, systemPrompt: 'a', userPrompt: 'b' }); assert.equal(r.content, '{}'); } finally { s.close(); }
});

test('confidential projects: local or private-network servers allowed, cloud or public hosts blocked', () => {
  const p = { dataClassification: 'confidential' };
  assert.equal(PROFILE.aiProviderAllowed(p, 'ollama', {}).ok, true);
  assert.equal(PROFILE.aiProviderAllowed(p, 'ollama', { ollamaUrl: 'http://192.168.1.20:11434' }).ok, true);
  assert.equal(PROFILE.aiProviderAllowed(p, 'openai-compat', { compatUrl: 'http://127.0.0.1:1234' }).ok, true);
  assert.equal(PROFILE.aiProviderAllowed(p, 'openai-compat', { compatUrl: 'https://api.example.com' }).ok, false);
  assert.equal(PROFILE.aiProviderAllowed(p, 'ollama', { ollamaUrl: 'http://ollama.example.com:11434' }).ok, false);
  assert.equal(PROFILE.aiProviderAllowed(p, 'mistral-api', {}).ok, false);
});

test('guideword split plans two function passes per function', () => {
  const E = require('../src/engine.js');
  const fns = [{ id: 'F-0001', name: 'A' }, { id: 'F-0002', name: 'B' }];
  const one = E.planIdentification({ depth: 'schnell', functions: fns, interfaces: [], modes: [], sources: [] }).passes.filter((p) => p.kind === 'function').length;
  const two = E.planIdentification({ depth: 'schnell', functions: fns, interfaces: [], modes: [], sources: [], splitGuidewords: true }).passes.filter((p) => p.kind === 'function').length;
  assert.ok(one > 0);
  assert.equal(two, one * 2);
});
