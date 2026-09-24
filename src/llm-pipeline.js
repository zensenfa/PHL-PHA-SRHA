// LLM resilience primitives for RHAS: callLlm, preflights, circuit breaker,
// budget tracker, soft/hard caps and runPass. Provider-agnostic; the
// orchestration of identification passes lives in engine.js.
(function () {
const OLLAMA = typeof require !== 'undefined' ? require('./ollama.js') : window.RHAS_OLLAMA;
const MISTRAL = typeof require !== 'undefined' ? require('./mistral.js') : window.RHAS_MISTRAL;

// Configurable defaults, not requirements: stamped into the run log so a
// reviewer sees what was actually used. To be recalibrated on measured
// railway identification runs (Standard depth = 45 calls).
const DEFAULT_CAPS = {
  softCapElapsedMin: 90,
  softCapCalls: 80,
  hardCapElapsedMin: 240,
  hardCapCalls: 300,
};

const CIRCUIT_BREAKER_THRESHOLD = 3;

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function createBudgetTracker() {
  return {
    startTime: null,
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    start(now) {
      this.startTime = now;
      this.calls = 0;
      this.inputTokens = 0;
      this.outputTokens = 0;
    },
    recordCall(inputEstimate, outputEstimate) {
      this.calls++;
      this.inputTokens += inputEstimate || 0;
      this.outputTokens += outputEstimate || 0;
    },
    elapsedMs(now) {
      return this.startTime == null ? 0 : now - this.startTime;
    },
  };
}

/** Pure decision given tracker state + cap thresholds + the current time. Caller owns the UI (dialog on 'soft', clean stop on 'hard'). */
/**
 * Soft-cap re-triggering is governed ENTIRELY by comparing against
 * `capState`'s current threshold values — there is deliberately no separate
 * "already acknowledged, never ask again" guard. `acknowledgeSoftCap` doubles
 * those threshold values, which is what naturally suppresses an immediate
 * re-prompt (the tracker's current elapsed/calls sit below the new, higher
 * threshold right after acknowledging) — but once the run genuinely grows
 * past the DOUBLED threshold too, this must return 'soft' again so the
 * engineer gets asked again, not silently run unbounded for the rest of the
 * run. (An earlier version gated this on `capState.softCapAcknowledged`,
 * which — since nothing ever reset that flag back to false — permanently
 * disabled the 'soft' return for the rest of the run after the first
 * acknowledgment, making the threshold-doubling below have no effect at all.)
 */
function checkCaps(tracker, capState, nowMs) {
  const elapsedMin = tracker.elapsedMs(nowMs) / 60000;
  if (elapsedMin >= capState.hardCapElapsedMin || tracker.calls >= capState.hardCapCalls) return 'hard';
  if (elapsedMin >= capState.softCapElapsedMin || tracker.calls >= capState.softCapCalls) {
    return 'soft';
  }
  return 'ok';
}

/** Call after the user acknowledges a soft cap: doubles the soft thresholds (which is what actually suppresses an immediate re-prompt — see checkCaps' comment) and marks it acknowledged, for any caller that wants to know whether a run has ever hit a soft cap before. */
function acknowledgeSoftCap(capState) {
  return { ...capState, softCapAcknowledged: true, softCapElapsedMin: capState.softCapElapsedMin * 2, softCapCalls: capState.softCapCalls * 2 };
}

function createCircuitBreaker(threshold) {
  let consecutive = 0;
  let lastError = null;
  return {
    recordSuccess() {
      consecutive = 0;
      lastError = null;
    },
    recordFailure(err) {
      consecutive++;
      lastError = err && err.message ? err.message : String(err || '');
    },
    tripped() {
      return consecutive >= (threshold || CIRCUIT_BREAKER_THRESHOLD);
    },
    getConsecutive() {
      return consecutive;
    },
    getLastError() {
      return lastError;
    },
  };
}

function createRunState(capOverrides) {
  return {
    tracker: createBudgetTracker(),
    breaker: createCircuitBreaker(CIRCUIT_BREAKER_THRESHOLD),
    caps: { ...DEFAULT_CAPS, ...capOverrides, softCapAcknowledged: false },
    failedPasses: [],
  };
}

/** One seam for both providers — everything downstream (runPass, the identification orchestration in engine.js) is provider-agnostic. */
async function callLlm({ provider, settings, systemPrompt, userPrompt, schema, signal, onToken }) {
  if (provider === 'mistral-api') {
    return MISTRAL.callMistral({ systemPrompt, userPrompt, apiKey: settings.mistralApiKey, model: settings.mistralModel, signal, schema, onToken });
  }
  return OLLAMA.callOllama({ systemPrompt, userPrompt, ollamaUrl: settings.ollamaUrl, model: settings.ollamaModel, signal, schema, onToken });
}

/**
 * Ollama preflight: GET /api/tags (cheap, no generation) and confirm the
 * requested model is actually pulled. Surfaces "Ollama not running" or
 * "model not pulled" before a run starts, not after the first pass fails —
 * especially important for a run that might otherwise run for hours.
 */
async function preflightOllama(ollamaUrl, model) {
  const base = (ollamaUrl || OLLAMA.DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  const wanted = model || OLLAMA.DEFAULT_MODEL;
  let resp;
  try {
    resp = await fetch(`${base}/api/tags`);
  } catch {
    return { ok: false, reason: 'unreachable', message: `Ollama unter ${base} nicht erreichbar. Läuft Ollama?` };
  }
  if (!resp.ok) {
    return { ok: false, reason: 'error', message: `Ollama antwortete mit Status ${resp.status}.` };
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, reason: 'error', message: 'Ollama-Antwort konnte nicht gelesen werden (ungültiges JSON).' };
  }
  const models = (data.models || []).map((m) => m.name);
  // Ollama accepts untagged names ("llama3" resolves to "llama3:latest"), so
  // the availability check must too — an exact match against the tag list
  // would block runs for perfectly valid model names.
  const matchesWanted = (name) => {
    if (name === wanted) return true;
    if (!wanted.includes(':') && name === `${wanted}:latest`) return true;
    if (!name.includes(':') && wanted === `${name}:latest`) return true;
    return false;
  };
  if (models.length && !models.some(matchesWanted)) {
    const preview = models.slice(0, 5).join(', ') + (models.length > 5 ? ', …' : '');
    return { ok: false, reason: 'model-missing', message: `Modell "${wanted}" ist lokal nicht verfügbar. Vorhandene Modelle: ${preview}` };
  }
  return { ok: true };
}

/**
 * Mistral preflight: GET /v1/models — lists available models without
 * spending any completion tokens. Confirms both key validity (401 on a bad
 * key) and model availability.
 */
async function preflightMistral(apiKey, model) {
  if (!apiKey) return { ok: false, reason: 'no-key', message: 'Kein Mistral-API-Schlüssel konfiguriert.' };
  const wanted = model || MISTRAL.DEFAULT_MISTRAL_MODEL;
  let resp;
  try {
    resp = await fetch('https://api.mistral.ai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch {
    return { ok: false, reason: 'unreachable', message: 'Mistral API nicht erreichbar (Netzwerkfehler).' };
  }
  if (resp.status === 401) return { ok: false, reason: 'unauthorized', message: 'Mistral-API-Schlüssel ungültig (401 Unauthorized).' };
  if (!resp.ok) return { ok: false, reason: 'error', message: `Mistral API antwortete mit Status ${resp.status}.` };
  let data;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, reason: 'error', message: 'Mistral-Antwort konnte nicht gelesen werden (ungültiges JSON).' };
  }
  const models = (data.data || []).map((m) => m.id);
  if (models.length && !models.includes(wanted)) {
    return { ok: false, reason: 'model-missing', message: `Modell "${wanted}" wurde in der Mistral-Modellliste nicht gefunden.` };
  }
  return { ok: true };
}

async function preflight(provider, settings) {
  if (provider === 'mistral-api') return preflightMistral(settings.mistralApiKey, settings.mistralModel);
  return preflightOllama(settings.ollamaUrl, settings.ollamaModel);
}

/**
 * Run one named pass. Never throws on a call failure — records it on the
 * breaker + run state and returns { ok: false }, so a multi-pass caller
 * (the identification run) can continue with sibling passes (partial salvage).
 * DOES throw if the breaker was already tripped before this call, since
 * that means the whole run must stop, not just this pass.
 */
async function runPass({ runState, passName, provider, settings, systemPrompt, userPrompt, schema, signal, onToken }) {
  if (runState.breaker.tripped()) {
    throw new Error(
      `Circuit Breaker ausgelöst nach ${runState.breaker.getConsecutive()} aufeinanderfolgenden Fehlern: ${runState.breaker.getLastError()}`
    );
  }
  try {
    const result = await callLlm({ provider, settings, systemPrompt, userPrompt, schema, signal, onToken });
    runState.breaker.recordSuccess();
    runState.tracker.recordCall(estimateTokens(systemPrompt + userPrompt), estimateTokens(result.content));
    return { ok: true, content: result.content };
  } catch (err) {
    runState.breaker.recordFailure(err);
    runState.failedPasses.push({ pass: passName, reason: err.message });
    // A failed call still spent a real network round-trip and (for a stall
    // or a mid-stream error) real tokens — leaving it uncounted let a run
    // that alternates fail/success make far more billed calls than
    // hardCapCalls nominally permits, since neither the call cap nor the
    // circuit breaker's 3-consecutive-failure threshold would ever catch it.
    // Output tokens are unknowable on failure (no completed response), so
    // this undercounts rather than guesses — better than zero, not perfect.
    runState.tracker.recordCall(estimateTokens(systemPrompt + userPrompt), 0);
    return { ok: false, error: err };
  }
}

const api = {
  DEFAULT_CAPS,
  CIRCUIT_BREAKER_THRESHOLD,
  estimateTokens,
  createBudgetTracker,
  checkCaps,
  acknowledgeSoftCap,
  createCircuitBreaker,
  createRunState,
  callLlm,
  preflightOllama,
  preflightMistral,
  preflight,
  runPass,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RHAS_LLM_PIPELINE = api;
}
})();


