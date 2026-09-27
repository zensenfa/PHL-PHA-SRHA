// OpenAI-compatible local server client (RHAS, Plan B): LM Studio, llama-server
// (llama.cpp), vLLM. Streams /v1/chat/completions (SSE) and requests
// structured output via response_format json_schema; falls back to json_object
// if the server rejects the schema form. Intended for local or on-premise use.
(function () {
const DEFAULT_URL = 'http://127.0.0.1:1234';
const STALE_MS = 180000;

async function post(url, body, apiKey, signal) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(body), signal });
}

async function callOpenAiCompat({ baseUrl, model, apiKey, systemPrompt, userPrompt, schema, signal: externalSignal, onToken, temperature = 0.3 }) {
  const url = (baseUrl || DEFAULT_URL).replace(/\/$/, '') + '/v1/chat/completions';
  const ctrl = new AbortController(); let userCancelled = false;
  if (externalSignal) { if (externalSignal.aborted) { userCancelled = true; ctrl.abort(); } else externalSignal.addEventListener('abort', () => { userCancelled = true; ctrl.abort(); }, { once: true }); }
  const base = { model: model || 'local-model', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature, stream: true };
  const forms = schema ? [{ type: 'json_schema', json_schema: { name: 'rhas_output', strict: false, schema } }, { type: 'json_object', schema }] : [{ type: 'json_object' }];
  let timer = null; const reset = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), STALE_MS); };
  try {
    let resp = null; let lastErr = '';
    for (const rf of forms) {
      reset();
      resp = await post(url, { ...base, response_format: rf }, apiKey, ctrl.signal);
      if (resp.ok) break;
      lastErr = `${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`;
      if (resp.status !== 400 && resp.status !== 422) break;
    }
    if (!resp || !resp.ok) throw new Error(`Lokaler Server antwortete mit Fehler ${lastErr}`);
    const reader = resp.body.getReader(); const dec = new TextDecoder();
    let buf = ''; let content = ''; let tokenCount = 0; let done = false;
    while (!done) {
      const r = await reader.read(); if (r.done) break; reset();
      buf += dec.decode(r.value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const t = line.trim(); if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim(); if (payload === '[DONE]') { done = true; break; }
        let obj; try { obj = JSON.parse(payload); } catch { continue; }
        const delta = obj.choices && obj.choices[0] && (obj.choices[0].delta || obj.choices[0].message);
        const piece = delta && (delta.content || '');
        if (piece) { content += piece; tokenCount++; if (onToken) onToken({ content, tokenCount }); }
      }
    }
    reader.cancel().catch(() => {});
    if (!content) throw new Error('Lokaler Server lieferte eine leere Antwort.');
    return { content, tokenCount };
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(userCancelled ? 'Generation was cancelled.' : 'Lokaler Server antwortet nicht mehr (Zeitüberschreitung).');
    if (e instanceof TypeError) throw new Error(`Lokaler Server unter ${url} nicht erreichbar.`);
    throw e;
  } finally { if (timer) clearTimeout(timer); }
}

async function preflightOpenAiCompat(baseUrl, model, apiKey) {
  const base = (baseUrl || DEFAULT_URL).replace(/\/$/, '');
  let r;
  try { r = await fetch(`${base}/v1/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} }); } catch { return { ok: false, reason: 'unreachable', message: `Lokaler Server unter ${base} nicht erreichbar.` }; }
  if (!r.ok) return { ok: false, reason: 'error', message: `Lokaler Server antwortete mit Status ${r.status}.` };
  let d; try { d = await r.json(); } catch { return { ok: false, reason: 'error', message: 'Modellliste nicht lesbar.' }; }
  const models = (d.data || []).map((m) => m.id);
  if (model && models.length && !models.includes(model)) return { ok: false, reason: 'model-missing', message: `Modell "${model}" nicht geladen. Verfügbar: ${models.slice(0, 5).join(', ')}`, models };
  return { ok: true, models };
}

const api = { DEFAULT_URL, callOpenAiCompat, preflightOpenAiCompat };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.RHAS_OPENAI_COMPAT = api;
})();
