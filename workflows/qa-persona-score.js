// ~/qa-kit/workflows/qa-persona-score.js
// Persona-scored functional QA. `args` is the resolved QAConfig (+ runId/date/env minted by the adapter).
export const meta = {
  name: 'qa-persona-score',
  description: 'Drive each persona through key flows, LLM-judge rubric dimensions (0-5), emit scored functional findings',
  phases: [
    { title: 'Score', detail: 'one scorer per persona — run flows + judge each rubric dimension' },
  ],
}

const cfg = typeof args === 'string' ? JSON.parse(args) : args
if (!cfg || !cfg.personas || !cfg.rubrics?.persona) {
  throw new Error('qa-persona-score: args must be a QAConfig with personas + rubrics.persona')
}
const ROOT = cfg.repoRoot
const BASE = (cfg.envs?.staging || Object.values(cfg.envs || {})[0])?.baseUrl
const DIMS = cfg.rubrics.persona.dimensions
const FLOWS = cfg.rubrics.persona.flows && cfg.rubrics.persona.flows.length
  ? cfg.rubrics.persona.flows
  : ['view the people/contacts list', 'open a contact and log a note/interaction', 'view a report or dashboard']

const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    persona: { type: 'string' },
    dimensions: { type: 'array', items: { type: 'object', properties: {
      key: { type: 'string' }, score: { type: 'number' }, max: { type: 'number' }, notes: { type: 'string' },
    }, required: ['key', 'score', 'max', 'notes'] } },
  },
  required: ['persona', 'dimensions'],
}

phase('Score')
const results = await parallel(cfg.personas.matrix.map((role) => () => {
  const personaId = (cfg.personas.roleMap && cfg.personas.roleMap[role]) || role
  return agent(
    `You are a QA judge scoring a real persona's experience of an app at ${BASE} (repo ${ROOT}). Persona role: "${role}" (login persona id "${personaId}" via ${cfg.personas.loginAs || 'loginAs'} from ${cfg.personas.source || 'the e2e personas module'}). Use the Playwright MCP browser tools: log in as this persona, then attempt each flow: ${JSON.stringify(FLOWS)}. As you go, judge EACH rubric dimension on a 0-${(DIMS[0] && DIMS[0].max) || 5} scale (higher = better): ${JSON.stringify(DIMS.map((d) => d.key))}. For each dimension return key, score, max (use the dimension's max or ${(DIMS[0] && DIMS[0].max) || 5}), and a one-sentence justification grounded in what you actually observed (cite the flow/screen). Be honest — low scores for real friction. Return per schema.`,
    { label: `score:${role}`, phase: 'Score', agentType: 'Explore', schema: SCORE_SCHEMA },
  )
}))

return { personas: results.filter(Boolean), dimensions: DIMS, passThreshold: cfg.rubrics.persona.passThreshold }
