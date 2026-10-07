// Local Ollama client (RHAS): transport, streaming, stall detection, cancel
// and error mapping only; prompts are built in prompts.js.
(function () {
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'mistral-nemo:12b';
const STALE_MS = 120000; // no new token for 2 minutes => treat the connection as dead
// Before the first token arrives, Ollama may still be loading the model into
// memory (a cold 12B load on CPU can exceed 2 minutes), so the first-token
// window must be generous — the /api/tags preflight does NOT warm the model.
const FIRST_TOKEN_STALE_MS = 360000;

function extractAndParseJSON(text) {
  if (!text) throw new Error('Empty AI response');
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

/**
 * Stream a chat completion from a local Ollama instance. Streams
 * token-by-token (avoids a multi-minute total-request timeout), with a
 * per-chunk stale timer to detect a genuinely dead connection, and
 * cooperative cancellation via `signal`.
 */
/** Conservative token estimate for German prompts (about 3 characters per token). */
function estimatePromptTokens(...texts) { return Math.ceil(texts.join('').length / 3); }
const OUTPUT_RESERVE = 4096; // tokens kept free for the answer

async function callOllama({ systemPrompt, userPrompt, model, ollamaUrl, temperature = 0.3, onToken, signal: externalSignal, schema, numCtx = 32768, think = 'auto', keepAlive = '30m' }) {
  const url = (ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, '') + '/api/chat';
  // Plan B: Ollama silently drops the start of a prompt that exceeds num_ctx. Refuse instead.
  const estimate = estimatePromptTokens(systemPrompt || '', userPrompt || '');
  if (estimate + OUTPUT_RESERVE > numCtx) throw new Error(`Prompt zu lang für den eingestellten Kontext (geschätzt ${estimate} Token + ${OUTPUT_RESERVE} für die Antwort > num_ctx ${numCtx}). Kontextlänge in den KI-Einstellungen erhöhen oder Dokumente kürzen.`);
  const ctrl = new AbortController();
  let userCancelled = false;
  if (externalSignal) {
    if (externalSignal.aborted) { userCancelled = true; ctrl.abort(); }
    // {once:true}: an identification run reuses ONE run-level AbortController across
    // hundreds of calls — without this, each call's listener (and its
    // closure) stays attached to that shared signal for the run's entire
    // lifetime, accumulating hundreds of dead listeners.
    else externalSignal.addEventListener('abort', () => { userCancelled = true; ctrl.abort(); }, { once: true });
  }

  const body = {
    model: model || DEFAULT_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    stream: true,
    // Ollama 0.5+: a JSON Schema here enforces the structure via constrained
    // decoding. Without a schema, fall back to plain JSON mode.
    format: schema || 'json',
    options: { temperature, num_ctx: numCtx },
    keep_alive: keepAlive,
  };
  // Thinking models: 'auto' leaves the model default; true/false set it explicitly.
  if (think === true || think === false) body.think = think;

  let staleTimer = null;
  let firstChunkSeen = false;
  const resetStale = () => {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => ctrl.abort(), firstChunkSeen ? STALE_MS : FIRST_TOKEN_STALE_MS);
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Ollama API error ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const decoder = new TextDecoder();
    const reader = resp.body.getReader();
    let buf = '';
    let content = '';
    let thinking = '';
    let promptEvalCount = null;
    let tokenCount = 0;
    let streamDone = false;
    resetStale();
    try {
      // `obj.done` (Ollama's own "generation complete" marker inside one NDJSON
      // line) must end the WHOLE read loop, not just the inner per-chunk line
      // loop — otherwise a server/proxy that keeps the connection open past
      // that marker makes this wait for the reader's own done:true, which can
      // spuriously burn the full stale timeout even though a complete, valid
      // response was already accumulated in `content`.
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        firstChunkSeen = true;
        resetStale();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let obj;
          try {
            obj = JSON.parse(line);
          } catch {
            continue;
          }
          if (obj.message && obj.message.content) {
            content += obj.message.content;
            tokenCount++;
            if (onToken) onToken({ content, tokenCount });
          }
          if (obj.message && obj.message.thinking) thinking += obj.message.thinking;
          if (obj.done) {
            if (typeof obj.prompt_eval_count === 'number') promptEvalCount = obj.prompt_eval_count;
            streamDone = true;
            break;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    // Some thinking models put the whole answer into the thinking field.
    if (!content.trim() && thinking.includes('{')) content = thinking.slice(thinking.indexOf('{'));
    if (!content) throw new Error('Ollama returned an empty response. Check that the model is loaded.');
    // Truncation check: far fewer evaluated prompt tokens than estimated, or the context completely filled.
    if (promptEvalCount != null && (promptEvalCount < estimate * 0.5 || promptEvalCount >= numCtx - 8)) {
      throw new Error(`Kontext möglicherweise gekürzt: Ollama hat ${promptEvalCount} Prompt-Token verarbeitet, erwartet etwa ${estimate} (num_ctx ${numCtx}). Kontextlänge prüfen.`);
    }
    return { content, tokenCount, promptEvalCount, estimate };
  } catch (e) {
    if (e.name === 'AbortError') {
      if (userCancelled) throw new Error('Generation was cancelled.');
      throw new Error('Ollama stalled — no new tokens arrived in time. Check that Ollama is running and the model is loaded.');
    }
    // A bare "Failed to fetch" (Chrome) / "NetworkError..." (Firefox) is the
    // browser's generic connection-refused/DNS-failure message — surface
    // something an engineer can actually act on instead.
    if (e instanceof TypeError) {
      throw new Error(`Could not reach Ollama at ${url}. Check that Ollama is running and the URL is correct.`);
    }
    throw e;
  } finally {
    if (staleTimer) clearTimeout(staleTimer);
  }
}

/** Model details from /api/show: context length and capabilities (e.g. 'thinking'). */
async function modelInfo(ollamaUrl, model) {
  const base = (ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  const r = await fetch(`${base}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model || DEFAULT_MODEL }) });
  if (!r.ok) throw new Error(`api/show ${r.status}`);
  const d = await r.json();
  const mi = d.model_info || {};
  const key = Object.keys(mi).find((k) => k.endsWith('.context_length'));
  return { contextLength: key ? Number(mi[key]) : null, capabilities: d.capabilities || [], parameterSize: (d.details || {}).parameter_size || '', quantization: (d.details || {}).quantization_level || '' };
}

const api = { DEFAULT_OLLAMA_URL, DEFAULT_MODEL, OUTPUT_RESERVE, estimatePromptTokens, extractAndParseJSON, callOllama, modelInfo };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RHAS_OLLAMA = api;
}
})();


