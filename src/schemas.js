// JSON Schemas for structured LLM output. Ollama enforces them by constrained
// decoding (format field); Mistral API only guarantees valid JSON, so the
// normaliser in engine.js re-validates every enum. Enums for record ids
// (functions, interfaces) are injected per call by withEnums() so a small
// local model can only link to things that exist.
(function () {
const SEVERITIES = ['catastrophic', 'critical', 'marginal', 'insignificant'];
const FREQUENCIES = ['frequent', 'probable', 'occasional', 'rare', 'improbable', 'highlyImprobable'];
const AFFECTED = ['passengers', 'staff', 'maintenance', 'third', 'environment', 'property'];
const CAUSE_KINDS = ['systematic', 'random', 'human', 'external'];
const SOURCE_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'];
const GUIDEWORDS = ['loss', 'unintended', 'early', 'late', 'partial', 'wrongValue', 'falseSafe', 'stuck', 'degradedResponse', ''];
const MODES = ['normal', 'degraded', 'transition', 'maintenance', 'emergency', 'commissioning', 'decommissioning'];

const str = (min = 0) => (min ? { type: 'string', minLength: min } : { type: 'string' });
const arr = (items, min = 0) => (min ? { type: 'array', minItems: min, items } : { type: 'array', items });

const DECOMPOSITION_SCHEMA = {
  type: 'object',
  properties: {
    subsystems: arr({ type: 'object', properties: { name: str(2), description: str() }, required: ['name'] }),
    functions: arr({
      type: 'object',
      properties: {
        name: str(3), description: str(10), subsystem: str(), kind: { type: 'string', enum: ['electronic', 'mechanical', 'mixed', 'procedural'] },
        inputs: str(), outputs: str(), safeState: str(), safetyRelevant: { type: 'boolean' }, rationale: str(),
        modes: arr({ type: 'string', enum: MODES }),
      },
      required: ['name', 'description', 'kind', 'safetyRelevant', 'safeState'],
    }, 1),
    interfaces: arr({ type: 'object', properties: { name: str(3), description: str(), partner: str(), type: { type: 'string', enum: ['physical', 'functional', 'human', 'externalSystem', 'organisation'] } }, required: ['name', 'type'] }),
    assumptions: arr(str(5)),
    openQuestions: arr(str(5)),
  },
  required: ['functions', 'interfaces'],
};

const HAZARD_ITEM = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 8, maxLength: 140 },
    description: str(20),
    guideword: { type: 'string', enum: GUIDEWORDS },
    // Several guideword deviations may consolidate into one boundary-level
    // hazard; all of them are recorded so the coverage evidence stays honest.
    guidewords: { type: 'array', items: { type: 'string', enum: GUIDEWORDS.filter(Boolean) } },
    sourceCategory: { type: 'string', enum: SOURCE_IDS },
    functions: arr({ type: 'string' }),
    interfaces: arr({ type: 'string' }),
    modes: arr({ type: 'string', enum: MODES }),
    causes: arr({ type: 'object', properties: { text: str(5), kind: { type: 'string', enum: CAUSE_KINDS } }, required: ['text', 'kind'] }, 1),
    triggeringEvent: str(5),
    enablingConditions: arr(str(3)),
    consequence: str(10),
    affected: arr({ type: 'string', enum: AFFECTED }),
    reasoning: { type: 'object', properties: { whyIdentified: str(20), sourcesUsed: str(), decisionRationale: str(20) }, required: ['whyIdentified', 'decisionRationale'] },
  },
  required: ['title', 'description', 'sourceCategory', 'causes', 'triggeringEvent', 'consequence', 'reasoning'],
};

const HAZARD_LIST_SCHEMA = { type: 'object', properties: { hazards: arr(HAZARD_ITEM) }, required: ['hazards'] };

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    assessment: str(20),
    gapAreas: arr({ type: 'object', properties: { title: str(5), why: str(20), sourceCategory: { type: 'string', enum: SOURCE_IDS }, relatedFunctions: arr({ type: 'string' }) }, required: ['title', 'why', 'sourceCategory'] }),
  },
  required: ['assessment', 'gapAreas'],
};

const RISK_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    causes: arr({ type: 'object', properties: { text: str(5), kind: { type: 'string', enum: CAUSE_KINDS } }, required: ['text', 'kind'] }, 1),
    triggeringEvent: str(5),
    enablingConditions: arr(str(3)),
    railwayHazard: str(5),
    accidents: arr({
      type: 'object',
      properties: {
        description: str(10), affected: arr({ type: 'string', enum: AFFECTED }, 1),
        severity: { type: 'string', enum: SEVERITIES }, severityRationale: str(40),
        frequency: { type: 'string', enum: FREQUENCIES }, frequencyRationale: str(40),
      },
      required: ['description', 'affected', 'severity', 'severityRationale', 'frequency', 'frequencyRationale'],
    }, 1),
    existingBarriers: arr({ type: 'object', properties: { text: str(5), type: { type: 'string', enum: ['frequency', 'severity'] }, effectiveness: str(), outsideSystem: { type: 'boolean' } }, required: ['text', 'type'] }),
    suggestedRap: { type: 'object', properties: { principle: { type: 'string', enum: ['cop', 'reference', 'ere'] }, reference: str(), justification: str(20) }, required: ['principle', 'justification'] },
    broadlyAcceptableCandidate: { type: 'boolean' },
    broadlyAcceptableRationale: str(),
    assumptions: arr(str(5)),
  },
  required: ['causes', 'triggeringEvent', 'accidents', 'suggestedRap', 'broadlyAcceptableCandidate'],
};

const MEASURES_SCHEMA = {
  type: 'object',
  properties: {
    measures: arr({
      type: 'object',
      properties: {
        text: str(10),
        type: { type: 'string', enum: ['elimination', 'frequencyReduction', 'propagationReduction', 'severityMitigation'] },
        hierarchy: { type: 'string', enum: ['design', 'protective', 'warning', 'procedural'] },
        residualSeverity: { type: 'string', enum: SEVERITIES }, residualFrequency: { type: 'string', enum: FREQUENCIES },
        rationale: str(40), insideSystem: { type: 'boolean' },
      },
      required: ['text', 'type', 'hierarchy', 'residualSeverity', 'residualFrequency', 'rationale', 'insideSystem'],
    }, 1),
  },
  required: ['measures'],
};

const REQUIREMENTS_SCHEMA = {
  type: 'object',
  properties: {
    requirements: arr({
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 5, maxLength: 120 },
        text: str(20),
        category: { type: 'string', enum: ['functional', 'technical', 'contextual', 'srac'] },
        functions: arr({ type: 'string' }),
        measureIndexes: arr({ type: 'integer' }),
        safeState: str(), timeToSafeState: str(), detection: str(),
        verificationMethod: { type: 'string', enum: ['test', 'analysis', 'inspection', 'demonstration', 'review'] },
        verificationNote: str(),
        rationale: str(20),
        sracReceiver: str(),
      },
      required: ['title', 'text', 'category', 'verificationMethod', 'rationale'],
    }, 1),
  },
  required: ['requirements'],
};

/** Clone a schema and restrict the given id-array properties to the ids that exist in the project. */
function withEnums(schema, { functionIds = [], interfaceIds = [], guidewordRequired = false } = {}) {
  const s = JSON.parse(JSON.stringify(schema));
  const patch = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties) {
      if (guidewordRequired && node.properties.guideword) {
        node.properties.guideword = { type: 'string', enum: GUIDEWORDS.filter(Boolean) };
        node.properties.guidewords = { type: 'array', minItems: 1, items: { type: 'string', enum: GUIDEWORDS.filter(Boolean) } };
        if (Array.isArray(node.required)) for (const k of ['guideword', 'guidewords']) if (!node.required.includes(k)) node.required.push(k);
      }
      if (node.properties.functions && functionIds.length) node.properties.functions = { type: 'array', items: { type: 'string', enum: functionIds } };
      if (node.properties.interfaces && interfaceIds.length) node.properties.interfaces = { type: 'array', items: { type: 'string', enum: interfaceIds } };
      if (node.properties.relatedFunctions && functionIds.length) node.properties.relatedFunctions = { type: 'array', items: { type: 'string', enum: functionIds } };
      for (const v of Object.values(node.properties)) patch(v);
    }
    if (node.items) patch(node.items);
  };
  patch(s);
  return s;
}

const api = { SEVERITIES, FREQUENCIES, AFFECTED, CAUSE_KINDS, SOURCE_IDS, GUIDEWORDS, MODES, DECOMPOSITION_SCHEMA, HAZARD_LIST_SCHEMA, CRITIQUE_SCHEMA, RISK_ANALYSIS_SCHEMA, MEASURES_SCHEMA, REQUIREMENTS_SCHEMA, withEnums };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else window.RHAS_SCHEMAS = api;
})();

