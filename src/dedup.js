// Suggestion deduplication (build plan §1.3: copied verbatim from RHL's
// dedup.js, itself ported from the MIL-STD PHL Generator's
// pipeline/normalisation.js). That tool's own forensic finding motivates
// this module's existence: running several independent identification
// passes over the same system re-discovers the same physical hazard through
// different lenses — its Exhaustive mode measured 64% duplicate output
// (413/642) before this kind of merge existed. Proven at n=1000+, exactly
// RMG's Massiv-mode scale.
// Two uses here: (a) merge near-duplicates WITHIN one run's suggestions
// before they reach the tray; (b) flag (never auto-suppress) suggestions
// that look like an existing hazard — the engineer decides, per the
// suggest-only principle carried over from RHL. Pure — no DOM, no storage.
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

function similarity(normA, tokensA, normB, tokensB) {
  if (normA && normA === normB) return 1;
  if (!normA || !normB) return 0;
  return jaccard(tokensA, tokensB);
}

// Most-complete-wins merge base, scored by populated content across the
// review-relevant fields — reasoning fields weighted 2x since they're the
// most expensive to regenerate and the most valuable for the reviewer.
function scoreCompleteness(s) {
  const lenStr = (v) => (typeof v === 'string' ? v.length : 0);
  const lenArr = (v) => (Array.isArray(v) ? v.reduce((acc, x) => acc + (typeof x === 'string' ? x.length : JSON.stringify(x).length), 0) : 0);
  let score = 0;
  score += lenStr(s.consequence);
  score += lenStr(s.hazardousFailure);
  score += lenStr(s.initiatingEvent); // cut-set anchor field — previously unscored, so a base could win on total score while having no initiating event at all
  score += s.operationalMode ? 10 : 0; // short enum-like field — presence matters more than length
  score += lenArr(s.causes);
  score += lenArr(s.affectedAreas);
  score += lenArr(s.enablingConditions);
  if (s.reasoning && typeof s.reasoning === 'object') {
    score += lenStr(s.reasoning.whyIdentified) * 2;
    score += lenStr(s.reasoning.decisionRationale) * 2;
    score += lenStr(s.reasoning.sourcesUsed);
    score += lenArr(s.reasoning.assumptions);
  }
  return score;
}

function unionArrayField(group, field, keyOf) {
  const seen = new Set();
  const out = [];
  for (const s of group) {
    if (!Array.isArray(s[field])) continue;
    for (const item of s[field]) {
      const key = keyOf ? keyOf(item) : typeof item === 'string' ? item : JSON.stringify(item);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
  }
  return out;
}

function mergeSuggestionGroup(group) {
  const sorted = [...group].sort((a, b) => scoreCompleteness(b) - scoreCompleteness(a));
  const base = { ...sorted[0] };
  // The highest-completeness suggestion wins as the base, but "highest
  // OVERALL score" doesn't mean every individual scalar field on it is
  // non-empty — a discarded duplicate can still hold the only populated
  // value for one of these. Fill (never overwrite an existing value) from
  // the next-best candidate that actually has it, so a real value is never
  // silently lost just because its suggestion lost on total score.
  const fillIfEmpty = (field) => {
    if (base[field]) return;
    for (const s of sorted) {
      if (s[field]) { base[field] = s[field]; return; }
    }
  };
  fillIfEmpty('hazardTitle');
  fillIfEmpty('consequence');
  fillIfEmpty('hazardousFailure');
  fillIfEmpty('initiatingEvent');
  fillIfEmpty('operationalMode');
  base.causes = unionArrayField(group, 'causes', (c) => (c && c.text ? c.text.toLowerCase() : JSON.stringify(c)));
  base.affectedAreas = unionArrayField(group, 'affectedAreas');
  base.enablingConditions = unionArrayField(group, 'enablingConditions');
  base._mergedCount = group.length;
  return base;
}

/**
 * Merge near-duplicate suggestions within one batch (Jaccard >= threshold on
 * normalized hazardDescription). Greedy grouping with precomputed token sets
 * (O(n^2) pair comparisons but pure set arithmetic in the hot path) and an
 * event-loop yield every 128 outer iterations so a large batch doesn't
 * freeze the tab — proven approach at n=1000+.
 */
async function deduplicateSuggestions(suggestions, options) {
  const threshold = options && typeof options.threshold === 'number' ? options.threshold : 0.85;
  if (!Array.isArray(suggestions) || suggestions.length < 2) {
    return { merged: suggestions || [], groupsFound: 0, duplicatesRemoved: 0, threshold };
  }

  const n = suggestions.length;
  const norms = new Array(n);
  const tokens = new Array(n);
  for (let i = 0; i < n; i++) {
    norms[i] = normalizeForDedup(suggestions[i].hazardDescription);
    tokens[i] = tokenize(suggestions[i].hazardDescription);
  }

  const assigned = new Set();
  const groups = [];
  for (let i = 0; i < n; i++) {
    if (assigned.has(i)) continue;
    const group = [suggestions[i]];
    assigned.add(i);
    for (let j = i + 1; j < n; j++) {
      if (assigned.has(j)) continue;
      if (similarity(norms[i], tokens[i], norms[j], tokens[j]) >= threshold) {
        group.push(suggestions[j]);
        assigned.add(j);
      }
    }
    groups.push(group);
    if ((i & 127) === 0 && i > 0) await new Promise((r) => setTimeout(r, 0));
  }

  let groupsFound = 0;
  let duplicatesRemoved = 0;
  const merged = [];
  for (const g of groups) {
    if (g.length === 1) {
      merged.push(g[0]);
    } else {
      merged.push(mergeSuggestionGroup(g));
      groupsFound++;
      duplicatesRemoved += g.length - 1;
    }
  }
  return { merged, groupsFound, duplicatesRemoved, threshold };
}

/**
 * Flag (never suppress) suggestions that look like an existing hazard.
 * Returns a new array with `possibleDuplicateOf` set to the best-matching
 * hazard's hid, or null. The engineer decides on accept/reject — consistent
 * with "rejection is evidence too."
 */
function checkAgainstLog(suggestions, existingHazards, options) {
  const threshold = options && typeof options.threshold === 'number' ? options.threshold : 0.85;
  const existingIndex = (existingHazards || []).map((h) => ({
    hid: h.hid,
    norm: normalizeForDedup(h.hazardDescription),
    tokens: tokenize(h.hazardDescription),
  }));

  return (suggestions || []).map((s) => {
    const sNorm = normalizeForDedup(s.hazardDescription);
    const sTokens = tokenize(s.hazardDescription);
    let bestHid = null;
    let bestSim = 0;
    for (const e of existingIndex) {
      const sim = similarity(sNorm, sTokens, e.norm, e.tokens);
      if (sim >= threshold && sim > bestSim) {
        bestSim = sim;
        bestHid = e.hid;
      }
    }
    return { ...s, possibleDuplicateOf: bestHid };
  });
}

const api = { normalizeForDedup, tokenize, jaccard, scoreCompleteness, mergeSuggestionGroup, deduplicateSuggestions, checkAgainstLog };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else {
  window.RMG_DEDUP = api;
}
})();


