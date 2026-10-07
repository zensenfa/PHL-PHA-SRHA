// Mistral Cloud API client (RHAS): an explicit opt-in cloud alternative to the
// local Ollama provider. The API key lives in browser localStorage only, never
// in project meta, IndexedDB or exports, so it cannot end up in a report.
(function () {
const DEFAULT_MISTRAL_MODEL = 'mistral-large-latest';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const STALE_MS = 120000; // no new token for 2 minutes => treat the connection as dead (mirrors ollama.js)

/**
 * Mistral's json_object mode guarantees valid JSON but has no schema
 * enforcement (unlike Ollama's constrained decoding) — the caller's
 * normalizer carries the load of tolerating whatever shape comes back.
 * `schema` is accepted for a uniform call signature with callOllama but
 * intentionally ignored here.
 */
function buildMistralRequestBody({ systemPrompt, userPrompt, model, schema }) {
  void schema;
  return {
    model: model || DEFAULT_MISTRAL_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    stream: true,
  };
}

/**
 * Streamed (SSE) — live-testing found that Mistral's API/gateway enforces a
 * ~60s timeout on BUFFERED (non-streaming) chat completions: a genuinely
 * exhaustive hazard-identification pass can need 7000+ completion tokens,
 * comfortably taking well over 60s to generate, which a non-streaming
 * request never survives (connection reset, no HTTP status at all) even
 * though the exact same request succeeds fine over ~110s when streamed.
 * Streaming keeps the connection visibly active the whole time, avoiding
 * that gateway timeout — the same reason ollama.js already streams.
 * Parses OpenAI-compatible `data: {...}` SSE lines terminated by `data: [DONE]`.
 */
async function callMistral({ systemPrompt, userPrompt, apiKey, model, signal: externalSignal, schema, onToken }) {
  const body = buildMistralRequestBody({ systemPrompt, userPrompt, model, schema });
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

  let staleTimer = null;
  const resetStale = () => {
    if (staleTimer) clearTimeout(staleTimer);
    staleTimer = setTimeout(() => ctrl.abort(), STALE_MS);
  };

  try {
    let resp;
    try {
      resp = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error(userCancelled ? 'Generation was cancelled.' : 'Mistral stalled — no response. Check your connection.');
      throw e;
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Mistral API error ${resp.status}: ${errText.slice(0, 200)}`);
    }
    const decoder = new TextDecoder();
    const reader = resp.body.getReader();
    let buf = '';
    let content = '';
    let tokenCount = 0;
    let completionTokens;
    let streamDone = false;
    resetStale();
    try {
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        resetStale();
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') { streamDone = true; break; }
          let obj;
          try {
            obj = JSON.parse(payload);
          } catch {
            continue;
          }
          const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
          if (delta && delta.content) {
            content += delta.content;
            tokenCount++;
            if (onToken) onToken({ content, tokenCount });
          }
          if (obj.usage) completionTokens = obj.usage.completion_tokens;
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    if (!content) throw new Error('Mistral returned an empty response.');
    return { content, tokenCount: completionTokens !== undefined ? completionTokens : tokenCount };
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(userCancelled ? 'Generation was cancelled.' : 'Mistral stalled — no new tokens for 2 minutes.');
    }
    if (e instanceof TypeError) {
      throw new Error('Could not reach the Mistral API. Check your network connection.');
    }
    throw e;
  } finally {
    if (staleTimer) clearTimeout(staleTimer);
  }
}

const api = { DEFAULT_MISTRAL_MODEL, buildMistralRequestBody, callMistral };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RHAS_MISTRAL = api;
}
})();


