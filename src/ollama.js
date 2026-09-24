// Local-only Ollama client (build plan §1.3: copied from RHL's ollama.js —
// transport/streaming/stall-detection/cancel/error-mapping only; RHL's own
// prompt builders are NOT copied, since RMG's prompts are genuinely new and
// live in prompts.js, built for the Exhaustive/Massiv orchestrators).
(function () {
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'mistral-nemo:12b';
const STALE_MS = 120000; // no new token for 2 minutes => treat the connection as dead
// Before the first token arrives, Ollama may still be loading the model into
// memory (a cold 12B load on CPU can exceed 2 minutes), so the first-token
// window must be generous — the /api/tags preflight does NOT warm the model.
const FIRST_TOKEN_STALE_MS = 360000;

/** Deterministic, non-cryptographic hash for prompt-cache-keying / traceability —
 * not a security control, so a fast synchronous string hash (djb2) is preferable
 * to async Web Crypto here. */
function promptHash(text) {
  let hash = 5381;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 33) ^ s.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

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
async function callOllama({ systemPrompt, userPrompt, model, ollamaUrl, temperature = 0.3, onToken, signal: externalSignal, schema }) {
  const url = (ollamaUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, '') + '/api/chat';
  const ctrl = new AbortController();
  let userCancelled = false;
  if (externalSignal) {
    if (externalSignal.aborted) { userCancelled = true; ctrl.abort(); }
    // {once:true}: a Massiv run reuses ONE run-level AbortController across
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
    options: { temperature, num_ctx: 32768 },
  };

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
          if (obj.done) {
            streamDone = true;
            break;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    if (!content) throw new Error('Ollama returned an empty response. Check that the model is loaded.');
    return { content, tokenCount };
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

const api = { DEFAULT_OLLAMA_URL, DEFAULT_MODEL, promptHash, extractAndParseJSON, callOllama };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RMG_OLLAMA = api;
}
})();


