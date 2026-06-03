// ~/qa-kit/workflows/qa-tenancy.js
// Cross-tenant IDOR audit (generate-and-filter + adversarial verify).
// `args` is the resolved QAConfig object (the run-adapter loads qa.config.ts and passes it).
export const meta = {
  name: 'qa-tenancy',
  description: 'Cross-tenant IDOR audit: generate id-taking sites, filter by access rubric, adversarially confirm, rank',
  phases: [
    { title: 'Generate', detail: 'enumerate every action/route taking a tenant-scoped id' },
    { title: 'Filter', detail: 'static authorization triage (cross-tenant-reviewer)' },
    { title: 'Confirm', detail: 'adversarially confirm each survivor or refute it' },
    { title: 'Synthesize', detail: 'dedupe, rank, emit report with repro + fix' },
  ],
}

// `args` is the resolved QAConfig. Some runtimes deliver it as a JSON string
// rather than an object — tolerate both, and fail loud if it's unusable.
const cfg = typeof args === 'string' ? JSON.parse(args) : args
if (!cfg || !cfg.tenancy || !cfg.tenancy.key) {
  throw new Error('qa-tenancy: args must be a resolved QAConfig with tenancy.key (got: ' + typeof args + ')')
}
const ROOT = cfg.repoRoot
const TKEY = cfg.tenancy.key
const HELPER = cfg.tenancy.accessHelper
const ACTIONS_GLOB = cfg.surface?.actions ?? 'app/**/actions.ts'
const ROUTES_GLOB = cfg.surface?.apiRoutes ?? 'app/api/**/route.ts'
const PUBLIC = (cfg.surface?.publicRoutes ?? []).join(', ') || '(none declared)'
const BYPASS = (cfg.tenancy.bypassRoles ?? []).join(', ') || 'admin/global-bypass roles'

const CANDIDATES_SCHEMA = {
  type: 'object',
  properties: {
    candidates: { type: 'array', items: { type: 'object', properties: {
      site: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
      idParam: { type: 'string' },
      surface: { type: 'string', enum: ['server-action', 'api-route', 'export-route', 'public-route'] },
    }, required: ['site', 'file', 'idParam', 'surface'] } },
  },
  required: ['candidates'],
}
const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    suspects: { type: 'array', items: { type: 'object', properties: {
      site: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
      idParam: { type: 'string' }, missingGuard: { type: 'string' }, excludedReason: { type: 'string' },
    }, required: ['site', 'file'] } },
  },
  required: ['suspects'],
}
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    site: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
    exploitable: { type: 'boolean' },
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    reasoning: { type: 'string' }, twoTenantRepro: { type: 'string' }, suggestedFix: { type: 'string' },
  },
  required: ['site', 'exploitable', 'severity', 'reasoning', 'twoTenantRepro', 'suggestedFix'],
}
const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    confirmed: { type: 'array', items: { type: 'object', properties: {
      site: { type: 'string' }, file: { type: 'string' }, severity: { type: 'string' },
      repro: { type: 'string' }, fix: { type: 'string' },
    }, required: ['site', 'severity', 'fix'] } },
    refuted: { type: 'array', items: { type: 'string' } },
    newGrepSignatures: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'confirmed'],
}

phase('Generate')
const gen = await parallel([
  () => agent(
    `Read-only, repo root ${ROOT}. Enumerate every SERVER ACTION in ${ACTIONS_GLOB} that accepts a tenant-scoped id — the tenant key is "${TKEY}", plus any resource id (e.g. contactId/groupId/reportId/etc.) that resolves to a ${TKEY}-scoped row. For each: function name, file, line, the param (idParam), surface='server-action'. Bias toward over-capture. Return per schema.`,
    { label: 'gen:actions', phase: 'Generate', agentType: 'Explore', schema: CANDIDATES_SCHEMA },
  ),
  () => agent(
    `Read-only, repo root ${ROOT}. Enumerate every API ROUTE under ${ROUTES_GLOB} that accepts a tenant-scoped id (tenant key "${TKEY}", or any resource id resolving to a ${TKEY}-scoped row) from URL params, query string, or body, and uses it in a service/db call. Include GET feeds and exports. For each: route (site), file, line, idParam, surface ('api-route' | 'export-route' | 'public-route'). Over-capture. Return per schema.`,
    { label: 'gen:routes', phase: 'Generate', agentType: 'Explore', schema: CANDIDATES_SCHEMA },
  ),
])
const candidates = gen.filter(Boolean).flatMap((g) => g.candidates || [])
log(`Generate: ${candidates.length} candidate ${TKEY}-taking sites`)

phase('Filter')
// Fan out the static triage: no single reviewer agent triages the whole candidate
// set (a large batch overwhelms one agent and silently returns nothing). Chunk the
// candidates and run one reviewer per chunk in parallel, then aggregate suspects.
const CHUNK = 15
const chunks = []
for (let i = 0; i < candidates.length; i += CHUNK) chunks.push(candidates.slice(i, i + CHUNK))
const triages = await parallel(chunks.map((chunk, ci) => () =>
  agent(
    `You are the cross-tenant authorization reviewer. Repo root ${ROOT}. Tenant key: "${TKEY}". Canonical access guard: "${HELPER}". Candidate sites (batch ${ci + 1}/${chunks.length}):\n${JSON.stringify(chunk, null, 2)}\n\nFor EACH, read the actual code and decide if it enforces tenancy via ONE of: (a) pre-load the resource then verify its ${TKEY} matches the actor's active tenant (or calls ${HELPER}), (b) a ${TKEY}-scoped service helper that filters by the actor's tenant, or (c) a scope helper for nested hierarchies. If it passes one, filter it OUT. If it satisfies NONE, it is a SUSPECT — record site/file/line/idParam/missingGuard. Exclusions (set excludedReason): routes gated only to ${BYPASS}; actions keyed solely on the caller's own userId; and declared public routes (${PUBLIC}). Return per schema.`,
    { label: `filter:${ci + 1}/${chunks.length}`, phase: 'Filter', agentType: 'cross-tenant-reviewer', schema: TRIAGE_SCHEMA },
  )
))
const suspects = triages.filter(Boolean).flatMap((t) => t.suspects || []).filter((s) => !s.excludedReason)
log(`Filter: ${suspects.length} suspects survived static triage (of ${candidates.length}, across ${chunks.length} chunks)`)
if (candidates.length > 0 && suspects.length === 0) {
  log(`Filter WARNING: ${candidates.length} candidates but 0 suspects — possible reviewer over-exclusion or a failed chunk; treating as no confirmed findings.`)
}

phase('Confirm')
const verdicts = await parallel(suspects.map((s) => () =>
  agent(
    `Adversarially confirm or refute this suspected cross-tenant IDOR in ${ROOT}. Default to skepticism. Suspect: "${s.site}" at ${s.file}:${s.line || '?'} (param ${s.idParam}, missing: ${s.missingGuard || 'unknown'}). Read the full function AND everything it calls to decide if an actor from tenant A can reach tenant B's data via the "${TKEY}" param. If exploitable, give exact severity, a concrete two-tenant repro (which persona from [${cfg.personas.matrix.join(', ')}] via ${cfg.personas.loginAs || 'loginAs'}, which foreign ${TKEY}, the call, expected-vs-vulnerable response), and a suggestedFix as file:line + the ${HELPER} call to add. If NOT exploitable, set exploitable=false and explain what stops it. Return per schema.`,
    { label: `confirm:${(s.site || 'site').slice(0, 22)}`, phase: 'Confirm', agentType: 'Explore', schema: VERDICT_SCHEMA },
  )
))
const live = verdicts.filter(Boolean).filter((v) => v.exploitable)
log(`Confirm: ${live.length}/${verdicts.filter(Boolean).length} suspects confirmed exploitable`)

phase('Synthesize')
const refutedSites = verdicts.filter(Boolean).filter((v) => !v.exploitable).map((v) => v.site)
let report
if (live.length === 0) {
  // Nothing survived adversarial verification — DO NOT invoke a synth agent (an
  // unconstrained agent given an empty set will freelance unverified findings,
  // bypassing the adversarial gate). Report the verified-empty result directly.
  report = {
    summary: `No cross-tenant findings confirmed by adversarial verification (${candidates.length} candidates → ${suspects.length} suspects → 0 confirmed exploitable).`,
    confirmed: [],
    refuted: refutedSites,
    newGrepSignatures: [],
  }
} else {
  report = await agent(
    `Format and rank ONLY the confirmed verdicts below into a report. Do NOT investigate the repository, do NOT add, infer, or "find" any new findings — your sole input is this verified list; anything not in it must not appear in "confirmed". Tenant key "${TKEY}". Confirmed-exploitable (the ONLY allowed sources):\n${JSON.stringify(live, null, 2)}\nAlready-refuted sites (for the refuted list):\n${JSON.stringify(refutedSites, null, 2)}\n\nDedupe same-root-cause entries, rank confirmed critical->low by severity x blast radius. For each confirmed: site, file, severity, two-tenant repro, fix (carry these through from the verdict — do not invent). List the refuted sites. Propose newGrepSignatures derived only from the confirmed findings. Return per schema.`,
    { label: 'synth:report', phase: 'Synthesize', schema: REPORT_SCHEMA },
  )
}

return { candidateCount: candidates.length, suspects, verdicts, report }
