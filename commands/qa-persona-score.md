---
description: Score each persona's experience across rubric dimensions and write scored functional findings.
---

Run the qa-kit persona scorer:

1. Load `qa.config.ts` (`mod.default.default ?? mod.default`). Confirm `personas.matrix`, `personas.loginAs`, and `rubrics.persona` (dimensions/weights/passThreshold/flows) are set.
2. Compute `date` (YYYY-MM-DD) and `runId` (`qa-persona-<YYYYMMDD-HHmmss>`).
3. Run `Workflow({ name: "qa-persona-score", args: <resolved config + repoRoot> })`. Read the returned `{ personas: [{ persona, dimensions: [{key,score,max,notes}] }], dimensions, passThreshold }`.
4. For EACH (persona, dimension), build a scored Finding with `evalResultToScoredFinding({ app: cfg.app.name, runId, date, dimension: "functional", title: `${persona}: ${dim.key}`, severity: dim.score < (cfg.rubrics.persona.passThreshold ?? 0) ? "high" : "low", value: dim.score, max: dim.max, weight: <weight for dim.key from rubrics>, rubricKey: dim.key, evidence: dim.notes, location: { persona } })` from `qa-kit/core`.
5. `writeFindings(cfg.findings.dir, { date, runId }, allFindings)`. Then for each persona compute `aggregatePersonaScores({ findings: allFindings, rubrics: cfg.rubrics, persona })` and print the composite score + pass/fail.

Do not modify application code.
