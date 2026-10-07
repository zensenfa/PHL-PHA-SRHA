// Text similarity for the Railway Hazard Analysis Suite (RHAS): word-set tokenizer and Jaccard overlap.
// Used by the engine (engine.js dedupBatch / document retrieval) to merge near-duplicate suggestions and to
// flag, never auto-suppress, suggestions that look like an existing hazard. Pure: no DOM, no storage.
(function () {
function normalizeForDedup(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?„"“”'’`´\-–—()[\]/]/g, '')
    .trim();
}

function tokenize(text) {
  const norm = normalizeForDedup(text);
  return norm ? new Set(norm.split(/\s+/).filter((w) => w.length > 2)) : new Set();
}

// Iterate the smaller set for a small constant-factor win, mirrors the ported original.
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let intersect = 0;
  for (const w of small) if (large.has(w)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

const api = { normalizeForDedup, tokenize, jaccard };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RHAS_DEDUP = api;
}
})();
