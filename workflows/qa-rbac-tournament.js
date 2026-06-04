// ~/qa-kit/workflows/qa-rbac-tournament.js
// RBAC tournament: drive adjacent role pairs through high-risk screens, judge
// rendered fields against the oracle + the strict-subset invariant. `args` = QAConfig.
export const meta = {
  name: 'qa-rbac-tournament',
  description: 'Head-to-head role pairs per screen; rendered fields must be a strict subset down the role lattice (judged vs the oracle)',
  phases: [
    { title: 'Observe', detail: 'load each high-risk screen as each role; snapshot rendered fields/actions' },
    { title: 'Judge', detail: 'compare adjacent role pairs vs oracle + subset invariant; emit rbac findings' },
  ],
}

const cfg = typeof args === 'string' ? JSON.parse(args) : args
if (!cfg || !cfg.rbac || !cfg.personas) throw new Error('qa-rbac-tournament: args must be a QAConfig with rbac + personas')
const ROOT = cfg.repoRoot
const BASE = (cfg.envs?.staging || Object.values(cfg.envs || {})[0])?.baseUrl
const HIER = cfg.rbac.roles ?? cfg.personas.matrix
const ROLE_TO_PERSONA = cfg.personas.roleMap ?? {}
// Adjacent (narrower, broader) role pairs down the lattice.
const PAIRS = HIER.slice(0, -1).map((r, i) => [r, HIER[i + 1]])
const SCREENS = (cfg.rbac.screens && cfg.rbac.screens.length)
  ? cfg.rbac.screens
  : ['/people (open a contact detail)', '/insights/stories', '/insights/reports', '/settings/custom-fields']

const OBS_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' }, screen: { type: 'string' },
    visibleFields: { type: 'array', items: { type: 'string' } },
    editableFields: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['role', 'screen', 'visibleFields'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      screen: { type: 'string' }, narrowerRole: { type: 'string' }, field: { type: 'string' },
      kind: { type: 'string', enum: ['visible', 'editable', 'action'] },
      severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
      evidence: { type: 'string' }, isSubsetViolation: { type: 'boolean' },
    }, required: ['screen', 'narrowerRole', 'field', 'kind', 'severity', 'evidence'] } },
  },
  required: ['findings'],
}

phase('Observe')
// One observation per (role, screen) — fan out across the matrix.
const cells = HIER.flatMap((role) => SCREENS.map((screen) => ({ role, screen })))
const obs = await parallel(cells.map((c) => () =>
  agent(
    `Read-only RBAC observation against ${BASE} (repo ${ROOT}). Log in as the persona for role "${c.role}" (persona id "${(ROLE_TO_PERSONA[c.role] || c.role)}" via ${cfg.personas.loginAs || 'loginAs'} from ${cfg.personas.source || 'the e2e personas module'}) using the Playwright MCP browser tools. Navigate to: ${c.screen}. Snapshot exactly which contact/data FIELDS are rendered/visible and which are editable (form inputs enabled), and which role-gated ACTIONS are present (e.g. submit report, create/See story). Return the rendered field names as they map to the data model where possible. Return per schema.`,
    { label: `obs:${c.role}:${c.screen.slice(0, 16)}`, phase: 'Observe', agentType: 'Explore', schema: OBS_SCHEMA },
  )
))
const observations = obs.filter(Boolean)
log(`Observe: ${observations.length} (role×screen) observations`)

phase('Judge')
// One judge per adjacent role pair: the narrower role's rendered set must be a
// strict subset of the broader's, AND must match the oracle (lib/rbac.ts).
const verdicts = await parallel(PAIRS.map(([narrower, broader]) => () =>
  agent(
    `You are an RBAC tournament judge. The role lattice requires the NARROWER role to see/edit a STRICT SUBSET of the BROADER role. Narrower="${narrower}", broader="${broader}". Oracle: the app's getVisibleContactFields/getEditableContactFields (${cfg.rbac.fieldVisibility}) define the intended per-role sets; sensitive fields (isDonor, smsConsent/emailConsent, source, ethnicity, internationalStudent) must NOT reach narrower roles. Observations (rendered fields per role×screen):\n${JSON.stringify(observations.filter((o) => o.role === narrower || o.role === broader), null, 2)}\n\nFor each screen, flag a finding when the narrower role RENDERS a field/action the broader role does not, OR renders a field the oracle says is hidden for it. ALSO specifically check these known anomalies: (a) can "${narrower}" CREATE content (e.g. a staff_only story) it then cannot READ? (write→visibility violation); (b) is a role-gated action (e.g. submit report) available to a narrower role but NOT to "${broader}" (non-monotonic gate)? Set severity by field sensitivity. Return per schema.`,
    { label: `judge:${narrower}-vs-${broader}`, phase: 'Judge', agentType: 'Explore', schema: VERDICT_SCHEMA },
  )
))

return { observations, verdicts: verdicts.filter(Boolean), pairs: PAIRS, screens: SCREENS }
